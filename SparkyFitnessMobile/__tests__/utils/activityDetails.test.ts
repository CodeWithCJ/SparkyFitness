import type { ActivityDetailResponse } from '@workspace/shared';
import i18n, { initializeI18n } from '../../src/localization/i18n';
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

  test('uses the supplied translator for Polish labels and interpolation', () => {
    const polish: Record<string, string> = {
      'activitySummary.avgHeartRate': 'Śr. tętno',
      'activitySummary.maxHeartRate': 'Maks. tętno',
      'activitySummary.elevationGain': 'Przewyższenie',
      'activitySummary.avgCadence': 'Śr. kadencja',
      'activitySummary.zone': 'Strefa {{zone}}',
      'activitySummary.heartRateZone': 'Strefa tętna {{zone}}',
    };
    const t = ((key: string, options: { defaultValue: string; zone?: string | number }) =>
      (polish[key] ?? options.defaultValue).replace('{{zone}}', String(options.zone ?? '')));

    expect(extractActivitySummary([
      activityDetail({
        detail_data: { activity: { averageHeartRateInBeatsPerMinute: 145 }, hr_in_timezones: [{ zoneNumber: 3, secsInZone: 125 }] },
      }),
    ], t as never)).toEqual([
      { label: 'Śr. tętno', value: '145 bpm' },
      { label: 'Strefa 3', value: '2m 5s' },
    ]);
  });

  test('falls back to readable English when the supplied translator misses a key', () => {
    const t = ((_key: string, options: { defaultValue: string }) => options.defaultValue);
    expect(extractActivitySummary([
      activityDetail({ detail_data: { hr_in_timezones: [{ zoneNumber: 2, secsInZone: 60 }] } }),
    ], t as never)).toContainEqual({ label: 'Zone 2', value: '1m 0s' });
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
    const garminData = { activity: { activity: { averageHeartRateInBeatsPerMinute: 145, maxHeartRateInBeatsPerMinute: 178, totalElevationGainInMeters: 120 } } };
    const items = extractActivitySummary([activityDetail({ detail_type: 'activity_summary', detail_data: JSON.stringify(garminData), provider_name: 'garmin' })]);
    expect(items).toContainEqual({ label: 'Avg HR', value: '145 bpm' });
    expect(items).toContainEqual({ label: 'Max HR', value: '178 bpm' });
    expect(items).toContainEqual({ label: 'Elevation Gain', value: '120 m' });
  });

  test('extracts Garmin data from direct activity with alternate keys', () => {
    const items = extractActivitySummary([activityDetail({ detail_type: 'activity_summary', detail_data: JSON.stringify({ activity: { averageHR: 140, maxHR: 170, totalAscent: 80, averageRunCadence: 170 } }), provider_name: 'garmin' })]);
    expect(items).toContainEqual({ label: 'Avg HR', value: '140 bpm' });
    expect(items).toContainEqual({ label: 'Max HR', value: '170 bpm' });
    expect(items).toContainEqual({ label: 'Elevation Gain', value: '80 m' });
    expect(items).toContainEqual({ label: 'Avg Cadence', value: '170 spm' });
  });

  test('extracts Garmin HR zones and skips zero-second zones', () => {
    const items = extractActivitySummary([activityDetail({ detail_type: 'hr_zones', detail_data: JSON.stringify({ hr_in_timezones: [{ zoneNumber: 1, secsInZone: 300 }, { zoneNumber: 2, secsInZone: 600 }, { zoneNumber: 3, secsInZone: 0 }] }), provider_name: 'garmin' })]);
    expect(items).toContainEqual({ label: 'Zone 1', value: '5m 0s' });
    expect(items).toContainEqual({ label: 'Zone 2', value: '10m 0s' });
    expect(items).toHaveLength(2);
  });

  test('extracts Withings HR zones', () => {
    const items = extractActivitySummary([activityDetail({ detail_type: 'hr_zones', detail_data: JSON.stringify({ hr_zones: { light: 180, moderate: 360, intense: 60, peak: 0 } }), provider_name: 'withings' })]);
    expect(items).toContainEqual({ label: 'Heart-rate zone: Light', value: '3m 0s' });
    expect(items).toContainEqual({ label: 'Heart-rate zone: Moderate', value: '6m 0s' });
    expect(items).toHaveLength(3);
  });

  test('renders production Withings semantic zone names in Polish', () => {
    const polish: Record<string, string> = {
      'activitySummary.heartRateZone': 'Strefa tętna: {{zone}}',
      'activitySummary.heartRateZoneLight': 'Lekka',
      'activitySummary.heartRateZoneModerate': 'Umiarkowana',
      'activitySummary.heartRateZoneIntense': 'Intensywna',
      'activitySummary.heartRateZonePeak': 'Szczytowa',
    };
    const t = ((key: string, options: { defaultValue: string; zone?: string | number }) =>
      (polish[key] ?? options.defaultValue).replace('{{zone}}', String(options.zone ?? '')));

    expect(extractActivitySummary([
      activityDetail({ detail_data: { hr_zones: { light: 60, peak: 120 } }, provider_name: 'withings' }),
    ], t as never)).toEqual([
      { label: 'Strefa tętna: Lekka', value: '1m 0s' },
      { label: 'Strefa tętna: Szczytowa', value: '2m 0s' },
    ]);
  });

  test('renders unknown Withings zone keys without losing their literal value', () => {
    const items = extractActivitySummary([activityDetail({
      detail_type: 'hr_zones',
      detail_data: JSON.stringify({ hr_zones: { 'Zone 5': 60 } }),
      provider_name: 'withings',
    })]);
    expect(items).toEqual([{ label: 'Heart-rate zone: 5', value: '1m 0s' }]);
  });

  test('handles non-object parsed data as primitive', () => {
    expect(extractActivitySummary([activityDetail({ detail_type: 'step_count', detail_data: '"5000"', provider_name: 'garmin' })])).toContainEqual({ label: 'step_count', value: '5000' });
  });

  test('handles array parsed data by returning no items', () => {
    expect(extractActivitySummary([activityDetail({ detail_type: 'some_type', detail_data: JSON.stringify([1, 2, 3]), provider_name: 'garmin' })])).toEqual([]);
  });

  test('skips Garmin detail without activity or hr_in_timezones', () => {
    expect(extractActivitySummary([activityDetail({ detail_type: 'unknown', detail_data: JSON.stringify({ some_other_field: 'value' }), provider_name: 'garmin' })])).toEqual([]);
  });

  test('skips invalid hr_in_timezones entries', () => {
    const items = extractActivitySummary([activityDetail({ detail_type: 'hr_zones', detail_data: JSON.stringify({ hr_in_timezones: ['not-an-object', { zoneNumber: 'not-a-number', secsInZone: 300 }, { zoneNumber: 1, secsInZone: -5 }, { zoneNumber: 2, secsInZone: 120 }] }), provider_name: 'garmin' })]);
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({ label: 'Zone 2', value: '2m 0s' });
  });

  test('handles Withings HR zones with non-number values', () => {
    const items = extractActivitySummary([activityDetail({ detail_type: 'hr_zones', detail_data: JSON.stringify({ hr_zones: { light: 'not-a-number', moderate: 300 } }), provider_name: 'withings' })]);
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({ label: 'Heart-rate zone: Moderate', value: '5m 0s' });
  });

  test('localizes HR-zone durations per application locale', async () => {
    const enDuration: Record<string, string> = {
      'activitySummary.durationMinutesSeconds': '{{minutes}}m {{seconds}}s',
    };
    const plDuration: Record<string, string> = {
      'activitySummary.durationMinutesSeconds': '{{minutes}} min {{seconds}} s',
    };
    const makeT = (map: Record<string, string>) => ((key: string, options: { defaultValue: string; minutes?: number; seconds?: number; zone?: string | number }) =>
      (map[key] ?? options.defaultValue)
        .replace('{{minutes}}', String(options.minutes ?? ''))
        .replace('{{seconds}}', String(options.seconds ?? '')));

    const garmin = () => [activityDetail({
      detail_type: 'hr_zones',
      detail_data: JSON.stringify({ hr_in_timezones: [{ zoneNumber: 3, secsInZone: 125 }] }),
      provider_name: 'garmin',
    })];

    const enItems = extractActivitySummary(garmin(), makeT(enDuration) as never);
    // 125 seconds = 2 minutes 5 seconds.
    expect(enItems.find(i => i.label === 'Zone 3')?.value).toBe('2m 5s');

    const plItems = extractActivitySummary(garmin(), makeT(plDuration) as never);
    expect(plItems.find(i => i.label === 'Zone 3')?.value).toBe('2 min 5 s');
  });

  test('uses localized numeric separators for Garmin metrics', async () => {
    await initializeI18n('en');
    await i18n.changeLanguage('en');

    const makeSummary = (hr: number) => extractActivitySummary([activityDetail({
      detail_data: { activity: { averageHeartRateInBeatsPerMinute: hr } },
    })]);

    // A fractional heart-rate value proves the numeric separator follows the locale.
    const enItems = makeSummary(151.5);
    expect(enItems.find(i => i.label === 'Avg HR')?.value).toBe('151.5 bpm');

    await i18n.changeLanguage('pl');
    const plItems = makeSummary(151.5);
    expect(plItems.find(i => i.label === 'Avg HR')?.value).toBe('151,5 bpm');

    await i18n.changeLanguage('en');
  });
});
