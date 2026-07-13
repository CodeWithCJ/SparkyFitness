import { extractGarminActivityEntries } from '@/utils/exerciseTrendUtils';
import type { ExerciseProgressResponse } from '@workspace/shared';

const parseISO = (dateString: string) => new Date(`${dateString}T00:00:00Z`);

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
