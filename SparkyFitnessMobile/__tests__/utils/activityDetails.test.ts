import type { ActivityDetailResponse } from '@workspace/shared';
import { extractActivitySummary } from '../../src/utils/activityDetails';

function activityDetail(overrides: Partial<ActivityDetailResponse> = {}): ActivityDetailResponse {
  return {
    id: 'detail-1',
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
});
