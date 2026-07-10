import type { ActivityDetailResponse } from '@workspace/shared';
import { distanceFromKm } from './unitConversions';
import { formatMobileNumber, localizeServingUnit, mobileT } from '../localization';

export interface ActivitySummaryItem {
  label: string;
  value: string;
}

export function formatActivityPace(
  durationMinutes: number,
  distanceKm: number,
  distanceUnit: 'km' | 'miles',
): string | null {
  if (durationMinutes <= 0 || distanceKm <= 0) return null;

  const distanceInUnit = distanceFromKm(distanceKm, distanceUnit);
  const totalSeconds = Math.round((durationMinutes / distanceInUnit) * 60);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const unit = localizeServingUnit(distanceUnit === 'miles' ? 'mi' : 'km');

  return `${formatMobileNumber(minutes, {
    maximumFractionDigits: 0,
    useGrouping: false,
  })}:${formatMobileNumber(seconds, {
    minimumIntegerDigits: 2,
    maximumFractionDigits: 0,
    useGrouping: false,
  })} / ${unit}`;
}

function parseDetailData(detailData: unknown): unknown {
  let data = detailData;

  while (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data) as unknown;
      if (typeof parsed !== 'string') return parsed;

      const trimmed = parsed.trim();
      if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        return parsed;
      }
      data = parsed;
    } catch {
      return data;
    }
  }

  return data;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number') {
      return value;
    }
  }
  return null;
}

function formatZoneDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${formatMobileNumber(minutes)} ${mobileT('units.minuteShort')} ${formatMobileNumber(seconds)} ${mobileT('units.secondShort')}`;
}

function formatWithingsZone(zone: string): string {
  const numericSuffix = zone.match(/(\d+)\s*$/)?.[1];
  return numericSuffix == null ? zone : formatMobileNumber(Number(numericSuffix));
}

export function extractActivitySummary(details: ActivityDetailResponse[]): ActivitySummaryItem[] {
  const items: ActivitySummaryItem[] = [];

  for (const detail of details) {
    if (detail.detail_type.endsWith('_raw_data')) continue;

    const data = parseDetailData(detail.detail_data);
    if (data == null) continue;

    if (typeof data !== 'object') {
      items.push({
        label: detail.detail_type,
        value: typeof data === 'number' ? formatMobileNumber(data) : String(data),
      });
      continue;
    }

    const record = toRecord(data);
    if (!record) continue;

    const providerName = detail.provider_name.toLowerCase();

    if (providerName === 'garmin') {
      const directActivity = toRecord(record.activity);
      const nestedActivity = toRecord(directActivity?.activity);
      const garminActivity = nestedActivity ?? directActivity;

      if (garminActivity) {
        const averageHeartRate = readNumber(garminActivity, [
          'averageHeartRateInBeatsPerMinute',
          'averageHR',
        ]);
        if (averageHeartRate != null) {
          items.push({
            label: mobileT('activityDetail.averageHeartRate'),
            value: `${formatMobileNumber(averageHeartRate)} ${mobileT('units.beatsPerMinute')}`,
          });
        }

        const maxHeartRate = readNumber(garminActivity, [
          'maxHeartRateInBeatsPerMinute',
          'maxHR',
        ]);
        if (maxHeartRate != null) {
          items.push({
            label: mobileT('activityDetail.maxHeartRate'),
            value: `${formatMobileNumber(maxHeartRate)} ${mobileT('units.beatsPerMinute')}`,
          });
        }

        const elevationGain = readNumber(garminActivity, [
          'totalElevationGainInMeters',
          'totalAscent',
        ]);
        if (elevationGain != null) {
          items.push({
            label: mobileT('activityDetail.elevationGain'),
            value: `${formatMobileNumber(elevationGain)} ${mobileT('units.meterShort')}`,
          });
        }

        const averageCadence = readNumber(garminActivity, [
          'averageRunCadenceInStepsPerMinute',
          'averageRunCadence',
        ]);
        if (averageCadence != null) {
          items.push({
            label: mobileT('activityDetail.averageCadence'),
            value: `${formatMobileNumber(averageCadence)} ${mobileT('units.stepsPerMinute')}`,
          });
        }
      }

      const hrZones = record.hr_in_timezones;
      if (Array.isArray(hrZones)) {
        for (const zone of hrZones) {
          const zoneRecord = toRecord(zone);
          if (!zoneRecord) continue;

          const zoneNumber = zoneRecord.zoneNumber;
          const secondsInZone = zoneRecord.secsInZone;
          if (typeof zoneNumber !== 'number' || typeof secondsInZone !== 'number' || secondsInZone <= 0) {
            continue;
          }

          items.push({
            label: mobileT('activityDetail.zone', {
              zone: formatMobileNumber(zoneNumber),
            }),
            value: formatZoneDuration(secondsInZone),
          });
        }
      }

      if (garminActivity || Array.isArray(hrZones)) continue;
    }

    const withingsZones = toRecord(record.hr_zones);
    if (withingsZones) {
      for (const [zone, seconds] of Object.entries(withingsZones)) {
        if (typeof seconds !== 'number' || seconds <= 0) continue;

        items.push({
          label: mobileT('activityDetail.heartRateZone', {
            zone: formatWithingsZone(zone),
          }),
          value: formatZoneDuration(seconds),
        });
      }
      continue;
    }
  }

  return items;
}
