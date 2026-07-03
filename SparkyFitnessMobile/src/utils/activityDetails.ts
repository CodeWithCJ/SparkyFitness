import type { ActivityDetailResponse } from '@workspace/shared';

export interface ActivitySummaryItem {
  label: string;
  value: string;
}

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

export function extractActivitySummary(details: ActivityDetailResponse[]): ActivitySummaryItem[] {
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
          items.push({ label: 'Avg HR', value: `${averageHeartRate} bpm` });
        }

        const maxHeartRate = readNumber(garminActivity, [
          'maxHeartRateInBeatsPerMinute',
          'maxHR',
        ]);
        if (maxHeartRate != null) {
          items.push({ label: 'Max HR', value: `${maxHeartRate} bpm` });
        }

        const elevationGain = readNumber(garminActivity, [
          'totalElevationGainInMeters',
          'totalAscent',
        ]);
        if (elevationGain != null) {
          items.push({ label: 'Elevation Gain', value: `${elevationGain} m` });
        }

        const averageCadence = readNumber(garminActivity, [
          'averageRunCadenceInStepsPerMinute',
          'averageRunCadence',
        ]);
        if (averageCadence != null) {
          items.push({ label: 'Avg Cadence', value: `${averageCadence} spm` });
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
          items.push({ label: `Zone ${zoneNumber}`, value: `${mins}m ${secs}s` });
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
        items.push({ label: `HR ${zone}`, value: `${mins}m ${secs}s` });
      }
      continue;
    }
  }

  return items;
}
