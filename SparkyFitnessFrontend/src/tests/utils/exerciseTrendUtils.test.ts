import {
  calculateMaxWeightTrendData,
  extractGarminActivityEntries,
} from '@/utils/exerciseTrendUtils';
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

describe('extractGarminActivityEntries', () => {
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
    const entries = extractGarminActivityEntries(progressData, 'All', parseISO);
    expect(entries.map((e) => e.exercise_entry_id)).toEqual([
      'fit-2',
      'fit-1',
      'connect-1',
    ]);
  });

  it('accepts both providers for a single selected exercise', () => {
    const entries = extractGarminActivityEntries(
      progressData,
      'Tennis',
      parseISO
    );
    expect(entries.map((e) => e.exercise_entry_id)).toEqual([
      'fit-1',
      'connect-1',
    ]);
  });

  it('ignores entries from other providers and entries without an id', () => {
    const data: Record<string, ExerciseProgressResponse[]> = {
      Tennis: [
        makeEntry({ provider_name: 'strava' }),
        makeEntry({ provider_name: null }),
        makeEntry({
          provider_name: 'garmin_fit',
          exercise_entry_id: '',
        }),
      ],
    };
    expect(extractGarminActivityEntries(data, 'All', parseISO)).toEqual([]);
  });
});
