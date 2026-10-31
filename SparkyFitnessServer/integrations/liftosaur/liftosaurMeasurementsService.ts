/**
 * Liftosaur Measurements Synchronization Service.
 * Ingests body measurements from Liftosaur (/api/v1/measurements/:key) into SparkyFitness.
 */
import axios, { AxiosError } from 'axios';
import { log } from '../../config/logging.js';
import measurementService from '../../services/measurementService.js';
import { instantToDay } from '@workspace/shared';
import {
  LiftosaurMeasurementResponseData,
  getValidatedLiftosaurBaseUrl,
} from './liftosaurTypes.js';

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
 * Parses numeric value and normalizes units into metric (kg, %, cm).
 * Liftosaur measurement values are strings like "82.5kg", "180lb", "18%", "37cm", "15in".
 */
export function parseLiftosaurValue(
  valStr: string,
  targetUnit: 'kg' | '%' | 'cm'
): number | null {
  if (!valStr || typeof valStr !== 'string') return null;
  const trimmed = valStr.trim().toLowerCase();

  // Extract numeric part and unit part
  const match = trimmed.match(/^([\d.]+)\s*([a-z%]*)$/);
  if (!match) return null;

  const num = parseFloat(match[1]!);
  if (isNaN(num)) return null;

  const unit = match[2] || targetUnit;

  if (targetUnit === 'kg') {
    if (unit === 'lb' || unit === 'lbs') {
      return Math.round(num * LB_TO_KG * 100) / 100;
    }
    return num;
  }

  if (targetUnit === 'cm') {
    if (unit === 'in' || unit === 'inch' || unit === 'inches') {
      return Math.round(num * IN_TO_CM * 100) / 100;
    }
    return num;
  }

  return num; // '%'
}

/**
 * Fetch a page of measurement values from Liftosaur.
 */
async function getMeasurementPage(
  apiKey: string,
  key: string,
  cursor?: number
): Promise<LiftosaurMeasurementResponseData> {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
  };

  const params: Record<string, string | number> = {};
  if (cursor !== undefined) {
    params.cursor = cursor;
  }

  const response = await axios.get<{
    data?: LiftosaurMeasurementResponseData;
  }>(
    `${getValidatedLiftosaurBaseUrl()}/api/v1/measurements/${encodeURIComponent(key)}`,
    {
      headers,
      params,
      timeout: 15000,
    }
  );

  return (
    response.data.data || {
      key,
      category: '',
      values: [],
      hasMore: false,
    }
  );
}

/**
 * Ingest measurements from Liftosaur into SparkyFitness.
 * `failedKeys` lists keys whose fetch failed; a key Liftosaur does not have
 * (400/404) is not a failure. Values collected before a failure are still saved.
 */
export async function importMeasurementsFromLiftosaur(
  userId: string,
  createdByUserId: string,
  apiKey: string,
  tz: string,
  cutoffMs: number
): Promise<{ imported: number; failedKeys: string[] }> {
  const healthDataToProcess: Array<{
    type: string;
    value: number;
    date: string;
    source: string;
    dataType: string;
    measurementType: string;
  }> = [];
  const failedKeys: string[] = [];

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
        // On a full sync every value is inside the window, so the window alone
        // cannot end the loop. Stop if the provider reports more pages without
        // advancing the cursor rather than re-fetching the same page forever.
        if (
          hasMore &&
          (page.nextCursor === undefined || page.nextCursor === cursor)
        ) {
          log(
            'warn',
            `[liftosaurMeasurements] Liftosaur reported more values for key ${def.key} without advancing the cursor; stopping pagination.`
          );
          hasMore = false;
        }
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
      failedKeys.push(def.key);
    }
  }

  if (healthDataToProcess.length > 0) {
    await measurementService.processHealthData(
      healthDataToProcess,
      userId,
      createdByUserId
    );
  }

  return { imported: healthDataToProcess.length, failedKeys };
}

export default {
  importMeasurementsFromLiftosaur,
  parseLiftosaurValue,
};
