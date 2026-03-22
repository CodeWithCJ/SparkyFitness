import type { ActivityDetailResponse } from '@workspace/shared';
import { extractActivitySummary } from '../../src/utils/activityDetails';

function activityDetail(overrides: Partial<ActivityDetailResponse> = {}): ActivityDetailResponse {
  return {
    id: 'detail-1',
    exercise_entry_id: 'entry-1',
    provider_name: 'garmin',
    detail_type: 'full_activity_data',
    detail_data: {},
    ...overrides,
  };
}

describe('extractActivitySummary', () => {
  test('reads Garmin metrics from the server payload shape', () => {
    const items = extractActivitySummary([
      activityDetail({
        detail_data: {
          activity: {
            averageHeartRateInBeatsPerMinute: 145,
            maxHeartRateInBeatsPerMinute: 173,
            totalElevationGainInMeters: 81,
            averageRunCadenceInStepsPerMinute: 164,
          },
          hr_in_timezones: [
            { zoneNumber: 3, secsInZone: 125 },
          ],
        },
      }),
    ]);

    expect(items).toEqual([
      { label: 'Avg HR', value: '145 bpm' },
      { label: 'Max HR', value: '173 bpm' },
      { label: 'Elevation Gain', value: '81 m' },
      { label: 'Avg Cadence', value: '164 spm' },
      { label: 'Zone 3', value: '2m 5s' },
    ]);
  });

  test('renders non-JSON primitive detail values', () => {
    const items = extractActivitySummary([
      activityDetail({
        provider_name: 'CSV_Import_Custom',
        detail_type: 'effort_note',
        detail_data: 'steady effort',
      }),
    ]);

    expect(items).toEqual([
      { label: 'effort_note', value: 'steady effort' },
    ]);
  });

  test('renders JSON-parsed primitive detail values', () => {
    const items = extractActivitySummary([
      activityDetail({
        provider_name: 'CSV_Import_Custom',
        detail_type: 'effort_score',
        detail_data: '7',
      }),
    ]);

    expect(items).toEqual([
      { label: 'effort_score', value: '7' },
    ]);
  });

  test('skips raw-data blobs', () => {
    const items = extractActivitySummary([
      activityDetail({
        provider_name: 'HealthConnect',
        detail_type: 'Workout_raw_data',
        detail_data: { ignored: true },
      }),
    ]);

    expect(items).toEqual([]);
  });

  test('returns empty array for empty details', () => {
    expect(extractActivitySummary([])).toEqual([]);
  });

  test('skips detail with null detail_data', () => {
    const details = [activityDetail({ detail_data: null as any })];
    expect(extractActivitySummary(details)).toEqual([]);
  });

  test('extracts Garmin data from nested activity.activity structure', () => {
    const garminData = {
      activity: {
        activity: {
          averageHeartRateInBeatsPerMinute: 145,
          maxHeartRateInBeatsPerMinute: 178,
          totalElevationGainInMeters: 120,
        },
      },
    };

    const items = extractActivitySummary([
      activityDetail({
        detail_type: 'activity_summary',
        detail_data: JSON.stringify(garminData),
        provider_name: 'garmin',
      }),
    ]);

    expect(items).toContainEqual({ label: 'Avg HR', value: '145 bpm' });
    expect(items).toContainEqual({ label: 'Max HR', value: '178 bpm' });
    expect(items).toContainEqual({ label: 'Elevation Gain', value: '120 m' });
  });

  test('extracts Garmin data from direct activity with alternate keys', () => {
    const garminData = {
      activity: {
        averageHR: 140,
        maxHR: 170,
        totalAscent: 80,
        averageRunCadence: 170,
      },
    };

    const items = extractActivitySummary([
      activityDetail({
        detail_type: 'activity_summary',
        detail_data: JSON.stringify(garminData),
        provider_name: 'garmin',
      }),
    ]);

    expect(items).toContainEqual({ label: 'Avg HR', value: '140 bpm' });
    expect(items).toContainEqual({ label: 'Max HR', value: '170 bpm' });
    expect(items).toContainEqual({ label: 'Elevation Gain', value: '80 m' });
    expect(items).toContainEqual({ label: 'Avg Cadence', value: '170 spm' });
  });

  test('extracts Garmin HR zones and skips zero-second zones', () => {
    const garminData = {
      hr_in_timezones: [
        { zoneNumber: 1, secsInZone: 300 },
        { zoneNumber: 2, secsInZone: 600 },
        { zoneNumber: 3, secsInZone: 0 },
      ],
    };

    const items = extractActivitySummary([
      activityDetail({
        detail_type: 'hr_zones',
        detail_data: JSON.stringify(garminData),
        provider_name: 'garmin',
      }),
    ]);

    expect(items).toContainEqual({ label: 'Zone 1', value: '5m 0s' });
    expect(items).toContainEqual({ label: 'Zone 2', value: '10m 0s' });
    expect(items).toHaveLength(2);
  });

  test('extracts Withings HR zones', () => {
    const withingsData = {
      hr_zones: {
        'Zone 1': 180,
        'Zone 2': 360,
        'Zone 3': 0,
      },
    };

    const items = extractActivitySummary([
      activityDetail({
        detail_type: 'hr_zones',
        detail_data: JSON.stringify(withingsData),
        provider_name: 'withings',
      }),
    ]);

    expect(items).toContainEqual({ label: 'HR Zone 1', value: '3m 0s' });
    expect(items).toContainEqual({ label: 'HR Zone 2', value: '6m 0s' });
    expect(items).toHaveLength(2);
  });

  test('handles non-object parsed data as primitive', () => {
    const items = extractActivitySummary([
      activityDetail({
        detail_type: 'step_count',
        detail_data: '"5000"',
        provider_name: 'garmin',
      }),
    ]);

    expect(items).toContainEqual({ label: 'step_count', value: '5000' });
  });

  test('handles array parsed data by returning no items', () => {
    const items = extractActivitySummary([
      activityDetail({
        detail_type: 'some_type',
        detail_data: JSON.stringify([1, 2, 3]),
        provider_name: 'garmin',
      }),
    ]);

    expect(items).toEqual([]);
  });

  test('skips Garmin detail without activity or hr_in_timezones', () => {
    const items = extractActivitySummary([
      activityDetail({
        detail_type: 'unknown',
        detail_data: JSON.stringify({ some_other_field: 'value' }),
        provider_name: 'garmin',
      }),
    ]);

    expect(items).toEqual([]);
  });

  test('skips invalid hr_in_timezones entries', () => {
    const garminData = {
      hr_in_timezones: [
        'not-an-object',
        { zoneNumber: 'not-a-number', secsInZone: 300 },
        { zoneNumber: 1, secsInZone: -5 },
        { zoneNumber: 2, secsInZone: 120 },
      ],
    };

    const items = extractActivitySummary([
      activityDetail({
        detail_type: 'hr_zones',
        detail_data: JSON.stringify(garminData),
        provider_name: 'garmin',
      }),
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({ label: 'Zone 2', value: '2m 0s' });
  });

  test('handles Withings HR zones with non-number values', () => {
    const items = extractActivitySummary([
      activityDetail({
        detail_type: 'hr_zones',
        detail_data: JSON.stringify({
          hr_zones: {
            'Zone 1': 'not-a-number',
            'Zone 2': 300,
          },
        }),
        provider_name: 'withings',
      }),
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({ label: 'HR Zone 2', value: '5m 0s' });
  });
});
