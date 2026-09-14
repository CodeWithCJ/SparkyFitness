/**
 * Liftosaur Measurements Synchronization Service.
 * Ingests body measurements from Liftosaur (/api/v1/measurements/:key) into SparkyFitness,
 * and exports SparkyFitness check-in and custom measurements to Liftosaur.
 */
import axios, { AxiosError } from 'axios';
import { log } from '../../config/logging.js';
import measurementService from '../../services/measurementService.js';
import measurementRepository from '../../models/measurementRepository.js';
import { localDateTimeToUtc, instantToDay } from '@workspace/shared';
import {
  LiftosaurApiEnvelope,
  LiftosaurMeasurementResponseData,
} from './liftosaurTypes.js';
import { getValidatedLiftosaurBaseUrl } from './liftosaurWorkoutExportService.js';

const LB_TO_KG = 0.45359237;
const IN_TO_CM = 2.54;

const LIFTOSAUR_SOURCE = 'Liftosaur';

/** Supported Liftosaur measurement keys and their mapping in SparkyFitness */
interface MeasurementKeyDef {
  key: string;
  category: 'check_in' | 'custom';
  field: string;
  unit: 'kg' | '%' | 'cm';
  customCategoryName?: string;
}

const SUPPORTED_KEYS: MeasurementKeyDef[] = [
  { key: 'weight', category: 'check_in', field: 'weight', unit: 'kg' },
  {
    key: 'bodyfat',
    category: 'check_in',
    field: 'body_fat_percentage',
    unit: '%',
  },
  { key: 'neck', category: 'check_in', field: 'neck', unit: 'cm' },
  { key: 'waist', category: 'check_in', field: 'waist', unit: 'cm' },
  { key: 'hips', category: 'check_in', field: 'hips', unit: 'cm' },
  {
    key: 'chest',
    category: 'custom',
    field: 'Chest',
    unit: 'cm',
    customCategoryName: 'Chest',
  },
  {
    key: 'shoulders',
    category: 'custom',
    field: 'Shoulders',
    unit: 'cm',
    customCategoryName: 'Shoulders',
  },
  {
    key: 'biceps_right',
    category: 'custom',
    field: 'Biceps',
    unit: 'cm',
    customCategoryName: 'Biceps',
  },
  {
    key: 'calves_right',
    category: 'custom',
    field: 'Calves',
    unit: 'cm',
    customCategoryName: 'Calves',
  },
  {
    key: 'thigh_right',
    category: 'custom',
    field: 'Thighs',
    unit: 'cm',
    customCategoryName: 'Thighs',
  },
  {
    key: 'forearm_right',
    category: 'custom',
    field: 'Forearms',
    unit: 'cm',
    customCategoryName: 'Forearms',
  },
];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Parse a Liftosaur measurement value string (e.g. "82.5kg", "180lb", "18%", "37cm", "14.5in").
 */
export function parseLiftosaurValue(
  valStr: string,
  targetUnit: 'kg' | '%' | 'cm'
): number | null {
  if (!valStr || typeof valStr !== 'string') return null;
  const trimmed = valStr.trim();

  // Percentage: e.g. "18.5%" or "18"
  if (targetUnit === '%') {
    const match = trimmed.match(/^([\d.]+)\s*%?$/);
    if (match && match[1]) {
      const num = parseFloat(match[1]);
      return isNaN(num) ? null : Math.round(num * 100) / 100;
    }
    return null;
  }

  // Weight: e.g. "82.5kg", "180lb", or "82.5"
  if (targetUnit === 'kg') {
    const match = trimmed.match(/^([\d.]+)\s*(kg|lb)?$/i);
    if (match && match[1]) {
      const num = parseFloat(match[1]);
      if (isNaN(num)) return null;
      const unit = (match[2] || 'kg').toLowerCase();
      const kg = unit === 'lb' ? num * LB_TO_KG : num;
      return Math.round(kg * 100) / 100;
    }
    return null;
  }

  // Length: e.g. "37cm", "14.5in", or "37"
  if (targetUnit === 'cm') {
    const match = trimmed.match(/^([\d.]+)\s*(cm|in)?$/i);
    if (match && match[1]) {
      const num = parseFloat(match[1]);
      if (isNaN(num)) return null;
      const unit = (match[2] || 'cm').toLowerCase();
      const cm = unit === 'in' ? num * IN_TO_CM : num;
      return Math.round(cm * 100) / 100;
    }
    return null;
  }

  return null;
}

/**
 * Fetch one page of a measurement key from Liftosaur API.
 */
async function getMeasurementPage(
  apiKey: string,
  key: string,
  cursor?: number
): Promise<LiftosaurMeasurementResponseData> {
  const response = await axios.get<
    LiftosaurApiEnvelope<LiftosaurMeasurementResponseData>
  >(
    `${getValidatedLiftosaurBaseUrl()}/api/v1/measurements/${encodeURIComponent(key)}`,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
      params: {
        limit: 200,
        ...(cursor !== undefined ? { cursor } : {}),
      },
      timeout: 10000,
    }
  );
  return (
    response.data?.data ?? { key, category: '', values: [], hasMore: false }
  );
}

/**
 * Ingest measurements from Liftosaur into SparkyFitness.
 */
export async function importMeasurementsFromLiftosaur(
  userId: string,
  createdByUserId: string,
  apiKey: string,
  tz: string,
  cutoffMs: number
): Promise<number> {
  const healthDataToProcess: Array<{
    type: string;
    value: number;
    date: string;
    source: string;
    dataType: string;
    measurementType: string;
  }> = [];

  for (const def of SUPPORTED_KEYS) {
    try {
      let hasMore = true;
      let cursor: number | undefined;

      while (hasMore) {
        const page = await getMeasurementPage(apiKey, def.key, cursor);
        const values = page.values || [];

        if (values.length === 0) {
          hasMore = false;
          break;
        }

        let withinWindow = false;
        for (const item of values) {
          const itemMs = Number(item.timestamp);
          if (isNaN(itemMs)) continue;

          if (itemMs >= cutoffMs) {
            withinWindow = true;
            const parsed = parseLiftosaurValue(item.value, def.unit);
            if (parsed !== null && parsed > 0) {
              const dateStr = instantToDay(new Date(itemMs), tz);
              healthDataToProcess.push({
                type: def.field,
                value: parsed,
                date: dateStr,
                source: LIFTOSAUR_SOURCE,
                dataType: 'numeric',
                measurementType: def.unit,
              });
            }
          }
        }

        hasMore = Boolean(page.hasMore) && withinWindow;
        cursor = page.nextCursor;
      }
    } catch (err: unknown) {
      const axiosErr = err as AxiosError;
      // If a key doesn't exist or is empty on Liftosaur, skip without failing the whole sync
      if (
        axiosErr?.response?.status === 400 ||
        axiosErr?.response?.status === 404
      ) {
        continue;
      }
      log(
        'warn',
        `[liftosaurMeasurements] Error importing key ${def.key}: ${errorMessage(err)}`
      );
    }
  }

  if (healthDataToProcess.length > 0) {
    await measurementService.processHealthData(
      healthDataToProcess,
      userId,
      createdByUserId
    );
  }

  return healthDataToProcess.length;
}

/**
 * Send or update a measurement in Liftosaur.
 */
async function sendMeasurementToLiftosaur(
  apiKey: string,
  key: string,
  value: string,
  timestampMs: number
): Promise<boolean> {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  try {
    await axios.post(
      `${getValidatedLiftosaurBaseUrl()}/api/v1/measurements/${encodeURIComponent(key)}`,
      { value, timestamp: timestampMs },
      { headers, timeout: 10000 }
    );
    return true;
  } catch (err) {
    const axiosErr = err as AxiosError;
    if (axiosErr?.response?.status === 409) {
      // Measurement already exists at timestamp; update it
      try {
        await axios.put(
          `${getValidatedLiftosaurBaseUrl()}/api/v1/measurements/${encodeURIComponent(key)}/${timestampMs}`,
          { value },
          { headers, timeout: 10000 }
        );
        return true;
      } catch (putErr) {
        log(
          'warn',
          `[liftosaurMeasurements] Failed to PUT measurement ${key} at ${timestampMs}: ${errorMessage(putErr)}`
        );
        return false;
      }
    }
    log(
      'warn',
      `[liftosaurMeasurements] Failed to POST measurement ${key}: ${errorMessage(err)}`
    );
    return false;
  }
}

/**
 * Export SparkyFitness measurements to Liftosaur.
 */
export async function exportMeasurementsToLiftosaur(
  userId: string,
  apiKey: string,
  tz: string,
  startDate?: string | null,
  endDate?: string | null
): Promise<number> {
  let exportedCount = 0;

  // 1. Export Check-In Measurements (weight, body_fat_percentage, neck, waist, hips)
  try {
    const checkIns =
      (await measurementService.getCheckInMeasurementsByDateRange(
        userId,
        userId,
        startDate || null,
        endDate || null
      )) as Array<{
        entry_date: string | Date;
        weight?: number | null;
        body_fat_percentage?: number | null;
        neck?: number | null;
        waist?: number | null;
        hips?: number | null;
      }>;

    for (const row of checkIns) {
      const dayStr =
        row.entry_date instanceof Date
          ? instantToDay(row.entry_date, tz)
          : String(row.entry_date).slice(0, 10);

      const timestampMs = new Date(
        localDateTimeToUtc(`${dayStr}T12:00:00`, tz)
      ).getTime();
      if (isNaN(timestampMs)) continue;

      if (row.weight && Number(row.weight) > 0) {
        const ok = await sendMeasurementToLiftosaur(
          apiKey,
          'weight',
          `${Math.round(Number(row.weight) * 100) / 100}kg`,
          timestampMs
        );
        if (ok) exportedCount += 1;
      }

      if (row.body_fat_percentage && Number(row.body_fat_percentage) > 0) {
        const ok = await sendMeasurementToLiftosaur(
          apiKey,
          'bodyfat',
          `${Math.round(Number(row.body_fat_percentage) * 100) / 100}%`,
          timestampMs
        );
        if (ok) exportedCount += 1;
      }

      if (row.neck && Number(row.neck) > 0) {
        const ok = await sendMeasurementToLiftosaur(
          apiKey,
          'neck',
          `${Math.round(Number(row.neck) * 100) / 100}cm`,
          timestampMs
        );
        if (ok) exportedCount += 1;
      }

      if (row.waist && Number(row.waist) > 0) {
        const ok = await sendMeasurementToLiftosaur(
          apiKey,
          'waist',
          `${Math.round(Number(row.waist) * 100) / 100}cm`,
          timestampMs
        );
        if (ok) exportedCount += 1;
      }

      if (row.hips && Number(row.hips) > 0) {
        const ok = await sendMeasurementToLiftosaur(
          apiKey,
          'hips',
          `${Math.round(Number(row.hips) * 100) / 100}cm`,
          timestampMs
        );
        if (ok) exportedCount += 1;
      }
    }
  } catch (err) {
    log(
      'error',
      `[liftosaurMeasurements] Error exporting check-ins: ${errorMessage(err)}`
    );
  }

  // 2. Export Custom Measurements for circumferences (Chest, Shoulders, Biceps, etc.)
  try {
    const categories = (await measurementRepository.getCustomCategories(
      userId
    )) as Array<{
      id: string;
      name: string;
    }>;

    const customKeyMap: Record<string, string> = {
      chest: 'chest',
      shoulders: 'shoulders',
      biceps: 'biceps_right',
      calves: 'calves_right',
      thighs: 'thigh_right',
      forearms: 'forearm_right',
    };

    for (const cat of categories) {
      const lowerName = cat.name.toLowerCase().trim();
      const liftosaurKey = customKeyMap[lowerName];
      if (!liftosaurKey) continue;

      const entries =
        (await measurementService.getCustomMeasurementsByDateRange(
          userId,
          userId,
          cat.id,
          startDate || null,
          endDate || null
        )) as Array<{
          date: string | Date;
          value: string | number;
          source?: string | null;
        }>;

      for (const entry of entries) {
        if (entry.source && entry.source.toLowerCase() === 'liftosaur')
          continue;

        const dayStr =
          entry.date instanceof Date
            ? instantToDay(entry.date, tz)
            : String(entry.date).slice(0, 10);
        const timestampMs = new Date(
          localDateTimeToUtc(`${dayStr}T12:00:00`, tz)
        ).getTime();
        const numVal = parseFloat(String(entry.value));
        if (isNaN(timestampMs) || isNaN(numVal) || numVal <= 0) continue;

        const ok = await sendMeasurementToLiftosaur(
          apiKey,
          liftosaurKey,
          `${Math.round(numVal * 100) / 100}cm`,
          timestampMs
        );
        if (ok) exportedCount += 1;
      }
    }
  } catch (err) {
    log(
      'error',
      `[liftosaurMeasurements] Error exporting custom measurements: ${errorMessage(err)}`
    );
  }

  return exportedCount;
}

export default {
  importMeasurementsFromLiftosaur,
  exportMeasurementsToLiftosaur,
  parseLiftosaurValue,
};
