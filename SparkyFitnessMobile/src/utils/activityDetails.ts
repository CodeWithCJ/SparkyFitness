import type { ActivityDetailResponse } from '@workspace/shared';
import type { TFunction } from 'i18next';

export interface ActivitySummaryItem {
  label: string;
  value: string;
}

const activityLabel = (t: TFunction | undefined, key: string, defaultValue: string): string => {
  if (!t) return defaultValue;
  switch (key) {
    case 'activitySummary.avgHeartRate': return t('activitySummary.avgHeartRate', { defaultValue: 'Avg HR' });
    case 'activitySummary.maxHeartRate': return t('activitySummary.maxHeartRate', { defaultValue: 'Max HR' });
    case 'activitySummary.elevationGain': return t('activitySummary.elevationGain', { defaultValue: 'Elevation Gain' });
    case 'activitySummary.avgCadence': return t('activitySummary.avgCadence', { defaultValue: 'Avg Cadence' });
    case 'activitySummary.zone': return t('activitySummary.zone', { defaultValue: 'Zone {{zone}}', zone: '' });
    case 'activitySummary.heartRateZone': return t('activitySummary.heartRateZone', { defaultValue: 'HR {{zone}}', zone: '' });
    default: return defaultValue;
  }
};


function parseDetailData(detailData: unknown): unknown {
  let data = detailData;

  while (typeof data === 'string') {
    try {
      data = JSON.parse(data);
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

export function extractActivitySummary(
  details: ActivityDetailResponse[],
  t?: TFunction,
): ActivitySummaryItem[] {
  const items: ActivitySummaryItem[] = [];

  for (const detail of details) {
    if (detail.detail_type.endsWith('_raw_data')) continue;

    const data = parseDetailData(detail.detail_data);
    if (data == null) continue;

    if (typeof data !== 'object') {
      items.push({ label: detail.detail_type, value: String(data) });
      continue;
    }

    const record = toRecord(data);
    if (!record) continue;

    const providerName = detail.provider_name.toLowerCase();

    if (providerName === 'garmin' || providerName === 'garmin_fit') {
      const directActivity = toRecord(record.activity);
      const nestedActivity = toRecord(directActivity?.activity);
      const garminActivity = nestedActivity ?? directActivity;

      if (garminActivity) {
        const averageHeartRate = readNumber(garminActivity, [
          'averageHeartRateInBeatsPerMinute',
          'averageHR',
        ]);
        if (averageHeartRate != null) {
          items.push({ label: activityLabel(t, 'activitySummary.avgHeartRate', 'Avg HR'), value: `${averageHeartRate} bpm` });
        }

        const maxHeartRate = readNumber(garminActivity, [
          'maxHeartRateInBeatsPerMinute',
          'maxHR',
        ]);
        if (maxHeartRate != null) {
          items.push({ label: activityLabel(t, 'activitySummary.maxHeartRate', 'Max HR'), value: `${maxHeartRate} bpm` });
        }

        const elevationGain = readNumber(garminActivity, [
          'totalElevationGainInMeters',
          'totalAscent',
        ]);
        if (elevationGain != null) {
          items.push({ label: activityLabel(t, 'activitySummary.elevationGain', 'Elevation Gain'), value: `${elevationGain} m` });
        }

        const averageCadence = readNumber(garminActivity, [
          'averageRunCadenceInStepsPerMinute',
          'averageRunCadence',
        ]);
        if (averageCadence != null) {
          items.push({ label: activityLabel(t, 'activitySummary.avgCadence', 'Avg Cadence'), value: `${averageCadence} spm` });
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

          const mins = Math.floor(secondsInZone / 60);
          const secs = secondsInZone % 60;
          items.push({ label: t ? t('activitySummary.zone', { defaultValue: 'Zone {{zone}}', zone: zoneNumber }) : `Zone ${zoneNumber}`, value: `${mins}m ${secs}s` });
        }
      }

      if (garminActivity || Array.isArray(hrZones)) continue;
    }

    const withingsZones = toRecord(record.hr_zones);
    if (withingsZones) {
      for (const [zone, seconds] of Object.entries(withingsZones)) {
        if (typeof seconds !== 'number' || seconds <= 0) continue;

        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        items.push({ label: t ? t('activitySummary.heartRateZone', { defaultValue: 'HR {{zone}}', zone }) : `HR ${zone}`, value: `${mins}m ${secs}s` });
      }
      continue;
    }
  }

  return items;
}
