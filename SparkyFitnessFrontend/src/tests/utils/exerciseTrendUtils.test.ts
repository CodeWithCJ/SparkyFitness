import {
  calculateMaxWeightTrendData,
  extractTelemetryActivityEntries,
} from '@/utils/exerciseTrendUtils';
import { providerLabel } from '@/utils/activityReportUtil';
import type { ExerciseProgressResponse } from '@workspace/shared';
import { format } from 'date-fns';

const parseISO = (dateString: string) => new Date(`${dateString}T00:00:00Z`);
const formatDate = (date: Date) => date.toISOString().slice(0, 10);

const makeEntry = (
  overrides: Partial<ExerciseProgressResponse>
): ExerciseProgressResponse => ({
  exercise_entry_id: 'entry-1',
  entry_date: '2026-06-01',
  duration_minutes: 60,
  calories_burned: 500,
  notes: null,
  image_url: null,
  distance: null,
  avg_heart_rate: null,
  provider_name: 'garmin',
  sets: [],
  ...overrides,
});

describe('weekly bucketing keeps years apart', () => {
  // The weekly label was 'MMM dd', so the week of Jan 06 2025 and the week of
  // Jan 05 2026 produced the same key and collapsed into a single bucket. This
  // uses a formatter that actually honours the format string — the plain
  // `formatDate` stub above always yields YYYY-MM-DD and so cannot see the bug.
  const formatWithPattern = (date: Date, formatStr: string) =>
    format(date, formatStr);

  it('does not merge the same week from different years', () => {
    const data: Record<string, ExerciseProgressResponse[]> = {
      Squat: [
        makeEntry({
          exercise_entry_id: 'e-2025',
          entry_date: '2025-01-06',
          sets: [{ set_number: 1, reps: 5, weight: 100 }],
        }),
        makeEntry({
          exercise_entry_id: 'e-2026',
          entry_date: '2026-01-05',
          sets: [{ set_number: 1, reps: 5, weight: 200 }],
        }),
      ] as ExerciseProgressResponse[],
    };

    const trend = calculateMaxWeightTrendData(
      data,
      {},
      formatWithPattern,
      parseISO,
      'weekly'
    );

    expect(trend).toHaveLength(2);
    expect(new Set(trend.map((t) => t.date)).size).toBe(2);
    trend.forEach((t) => expect(t.date).toMatch(/\d{4}/));
  });

  // Mid-week dates on purpose: parseISO here builds UTC midnight, which lands
  // on the previous local day, so a Monday date would snap to the prior week.
  it('still merges two entries from the same week', () => {
    const data: Record<string, ExerciseProgressResponse[]> = {
      Squat: [
        makeEntry({
          entry_date: '2026-01-07',
          sets: [{ set_number: 1, reps: 5, weight: 100 }],
        }),
        makeEntry({
          entry_date: '2026-01-09',
          sets: [{ set_number: 1, reps: 5, weight: 120 }],
        }),
      ] as ExerciseProgressResponse[],
    };

    const trend = calculateMaxWeightTrendData(
      data,
      {},
      formatWithPattern,
      parseISO,
      'weekly'
    );

    expect(trend).toHaveLength(1);
    expect(trend[0]?.maxWeight).toBe(120);
  });
});

describe('calculateMaxWeightTrendData', () => {
  it('reports 0 rather than -Infinity for an entry with no sets', () => {
    const data: Record<string, ExerciseProgressResponse[]> = {
      Plank: [makeEntry({ sets: [] })],
    };

    const trend = calculateMaxWeightTrendData(data, {}, formatDate, parseISO);

    expect(trend[0]?.maxWeight).toBe(0);
    expect(trend[0]?.comparisonMaxWeight).toBe(0);
  });

  it('ignores null weights on timed sets', () => {
    const data: Record<string, ExerciseProgressResponse[]> = {
      Plank: [
        makeEntry({
          sets: [
            { set_number: 1, reps: null, weight: null, duration: 45 },
            { set_number: 2, reps: 5, weight: 20 },
          ],
        }),
      ],
    };

    const trend = calculateMaxWeightTrendData(data, {}, formatDate, parseISO);

    expect(trend[0]?.maxWeight).toBe(20);
  });
});

describe('extractTelemetryActivityEntries', () => {
  const progressData: Record<string, ExerciseProgressResponse[]> = {
    Tennis: [
      makeEntry({
        exercise_entry_id: 'connect-1',
        provider_name: 'garmin',
        entry_date: '2026-06-01',
      }),
      makeEntry({
        exercise_entry_id: 'fit-1',
        provider_name: 'garmin_fit',
        entry_date: '2026-06-05',
      }),
      makeEntry({
        exercise_entry_id: 'manual-1',
        provider_name: 'Manual',
        entry_date: '2026-06-03',
      }),
    ],
    Running: [
      makeEntry({
        exercise_entry_id: 'fit-2',
        provider_name: 'garmin_fit',
        entry_date: '2026-06-10',
      }),
    ],
  };

  it('accepts both garmin and garmin_fit entries across all exercises', () => {
    const entries = extractTelemetryActivityEntries(
      progressData,
      'All',
      parseISO
    );
    expect(entries.map((e) => e.exercise_entry_id)).toEqual([
      'fit-2',
      'fit-1',
      'connect-1',
    ]);
  });

  it('accepts both providers for a single selected exercise', () => {
    const entries = extractTelemetryActivityEntries(
      progressData,
      'Tennis',
      parseISO
    );
    expect(entries.map((e) => e.exercise_entry_id)).toEqual([
      'fit-1',
      'connect-1',
    ]);
  });

  it('matches telemetry providers regardless of casing', () => {
    const data: Record<string, ExerciseProgressResponse[]> = {
      Tennis: [
        // The Strava pipeline writes 'Strava'; the Garmin ones write lowercase.
        makeEntry({ provider_name: 'Strava', exercise_entry_id: 'strava-1' }),
        makeEntry({ provider_name: 'strava', exercise_entry_id: 'strava-2' }),
      ],
    };
    expect(
      extractTelemetryActivityEntries(data, 'All', parseISO).map(
        (e) => e.exercise_entry_id
      )
    ).toEqual(['strava-1', 'strava-2']);
  });

  it('accepts mobile-synced workouts from HealthKit and Health Connect', () => {
    // The mobile app writes these exact strings (see healthRecords.ts); the
    // workout handler persists their GPS/laps/zones, so they belong in the
    // telemetry list alongside Garmin and Strava.
    const data: Record<string, ExerciseProgressResponse[]> = {
      Walking: [
        makeEntry({
          provider_name: 'HealthKit',
          exercise_entry_id: 'hk-1',
          has_telemetry: true,
        }),
        makeEntry({
          provider_name: 'Health Connect',
          exercise_entry_id: 'hc-1',
          has_telemetry: true,
        }),
      ],
    };
    expect(
      extractTelemetryActivityEntries(data, 'All', parseISO)
        .map((e) => e.exercise_entry_id)
        .sort()
    ).toEqual(['hc-1', 'hk-1']);
  });

  it('matches the mobile providers regardless of casing', () => {
    const data: Record<string, ExerciseProgressResponse[]> = {
      Walking: [
        makeEntry({
          provider_name: 'healthkit',
          exercise_entry_id: 'hk-2',
          has_telemetry: true,
        }),
        makeEntry({
          provider_name: 'HEALTHKIT',
          exercise_entry_id: 'hk-3',
          has_telemetry: true,
        }),
        makeEntry({
          provider_name: 'health connect',
          exercise_entry_id: 'hc-2',
          has_telemetry: true,
        }),
      ],
    };
    expect(extractTelemetryActivityEntries(data, 'All', parseISO)).toHaveLength(
      3
    );
  });

  it.each([
    ['false', false],
    ['null', null],
    ['absent (server predates the flag)', undefined],
  ])(
    'drops mobile-synced entries whose telemetry flag is %s',
    (_label, hasTelemetry) => {
      const data: Record<string, ExerciseProgressResponse[]> = {
        Walking: [
          makeEntry({
            provider_name: 'HealthKit',
            exercise_entry_id: 'hk-empty',
            has_telemetry: hasTelemetry,
          }),
          makeEntry({
            provider_name: 'Health Connect',
            exercise_entry_id: 'hc-empty',
            has_telemetry: hasTelemetry,
          }),
        ],
      };
      expect(extractTelemetryActivityEntries(data, 'All', parseISO)).toEqual(
        []
      );
    }
  );

  it('keeps a mobile entry with telemetry while dropping one without', () => {
    const data: Record<string, ExerciseProgressResponse[]> = {
      Walking: [
        makeEntry({
          provider_name: 'HealthKit',
          exercise_entry_id: 'hk-run',
          has_telemetry: true,
        }),
        makeEntry({
          provider_name: 'HealthKit',
          exercise_entry_id: 'hk-lifting',
          has_telemetry: false,
        }),
      ],
    };
    expect(
      extractTelemetryActivityEntries(data, 'All', parseISO).map(
        (e) => e.exercise_entry_id
      )
    ).toEqual(['hk-run']);
  });

  it.each([['garmin'], ['garmin_fit'], ['strava']])(
    'still cards a %s entry that carries no telemetry flag',
    (providerName) => {
      // These pipelines only ever write activities that have telemetry, so they
      // must keep working against a server that never sends the flag.
      const data: Record<string, ExerciseProgressResponse[]> = {
        Cycling: [
          makeEntry({
            provider_name: providerName,
            exercise_entry_id: 'no-flag',
          }),
        ],
      };
      expect(
        extractTelemetryActivityEntries(data, 'All', parseISO).map(
          (e) => e.exercise_entry_id
        )
      ).toEqual(['no-flag']);
    }
  );

  it('ignores entries from other providers and entries without an id', () => {
    const data: Record<string, ExerciseProgressResponse[]> = {
      Tennis: [
        makeEntry({ provider_name: 'fitbit' }),
        makeEntry({ provider_name: null }),
        makeEntry({ provider_name: 'manual' }),
        makeEntry({
          provider_name: 'garmin_fit',
          exercise_entry_id: '',
        }),
      ],
    };
    expect(extractTelemetryActivityEntries(data, 'All', parseISO)).toEqual([]);
  });
});

describe('providerLabel', () => {
  it('routes the one real brand-name mismatch (Apple Health) through a translation key', () => {
    expect(providerLabel('HealthKit')).toEqual({
      label: 'reports.activityReport.provider.appleHealth',
      isTranslationKey: true,
      fallback: 'Apple Health',
    });
  });

  it('collapses the garmin_fit alias onto the plain "Garmin" string, untranslated', () => {
    expect(providerLabel('garmin_fit')).toEqual({
      label: 'Garmin',
      isTranslationKey: false,
      fallback: 'Garmin',
    });
  });

  it.each([
    ['garmin', 'Garmin'],
    ['strava', 'Strava'],
    ['Health Connect', 'Health Connect'],
    ['Whoop', 'Whoop'],
  ])(
    "capitalizes '%s' generically, with no translation entry needed",
    (source, expectedLabel) => {
      expect(providerLabel(source)).toEqual({
        label: expectedLabel,
        isTranslationKey: false,
        fallback: expectedLabel,
      });
    }
  );

  it('returns null when there is no provider', () => {
    expect(providerLabel(null)).toBeNull();
    expect(providerLabel(undefined)).toBeNull();
    expect(providerLabel('')).toBeNull();
  });
});
