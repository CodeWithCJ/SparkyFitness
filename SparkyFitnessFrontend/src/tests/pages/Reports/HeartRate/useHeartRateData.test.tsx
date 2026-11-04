import { renderHook } from '@testing-library/react';
import type { HealthMetricSamples } from '@workspace/shared';
import { useHeartRateData } from '@/pages/Reports/HeartRate/useHeartRateData';
import { useHeartRateWindow } from '@/pages/Reports/HeartRate/useHeartRateWindow';
import { useHealthMetricSamples } from '@/hooks/useGenericHealth';
import type { DailyExerciseEntry } from '@/types/reports';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue?: unknown) =>
      typeof defaultValue === 'string' ? defaultValue : _key,
  }),
}));
jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({ timezone: 'UTC', timeFormat: '24h' }),
}));
jest.mock('@/hooks/CheckIn/useSleep', () => ({
  useSleepEntriesQuery: () => ({ data: [] }),
}));
jest.mock('@/hooks/Settings/useHeartRateZones', () => {
  const shared = jest.requireActual('@workspace/shared');
  const resolved = shared.defaultHeartRateZones();
  return {
    useResolvedHeartRateZones: () => ({
      resolved,
      isDefault: true,
      displayZones: 5,
      bands: shared.heartRateDisplayBands(resolved.zones, 5),
    }),
  };
});
jest.mock('@/hooks/useGenericHealth', () => ({
  useHealthMetricSamples: jest.fn(),
  useDailyHealthMetrics: () => ({ data: [] }),
}));

const DAY = '2026-10-28';

/** One stored row per source, as GET /generic-health/samples returns them. */
const row = (
  source: string,
  samples: Array<{ t: string; bpm: number; ex?: string }>
): HealthMetricSamples =>
  ({
    id: `hms-${source}`,
    user_id: 'user-1',
    metric: 'heart_rate',
    entry_date: DAY,
    source_provider: source,
    device_name: null,
    samples,
  }) as unknown as HealthMetricSamples;

const render = (
  rows: HealthMetricSamples[],
  exerciseEntries: DailyExerciseEntry[] = []
) => {
  jest.mocked(useHealthMetricSamples).mockReturnValue({
    data: rows,
  } as unknown as ReturnType<typeof useHealthMetricSamples>);
  return renderHook(() =>
    useHeartRateData(
      {
        startDate: DAY,
        endDate: DAY,
        exerciseEntries,
        restingHeartRateData: [],
      },
      useHeartRateWindow(DAY, DAY)
    )
  ).result.current;
};

describe('useHeartRateData with several sources on one day', () => {
  it('charts the readings of every row for the day, not only the first', () => {
    const data = render([
      row('garmin', [{ t: `${DAY}T08:00:00Z`, bpm: 60 }]),
      row('xiaomi', [
        { t: `${DAY}T07:00:00Z`, bpm: 55 },
        { t: `${DAY}T09:00:00Z`, bpm: 65 },
      ]),
    ]);

    expect(data.daySamples.map((s) => [s.t, s.bpm])).toEqual([
      [`${DAY}T07:00:00Z`, 55],
      [`${DAY}T08:00:00Z`, 60],
      [`${DAY}T09:00:00Z`, 65],
    ]);
  });

  it('finds a workout whose heart rate is stored in a later row of the day', () => {
    const workout = {
      id: 'entry-1',
      entry_date: DAY,
      entry_time: '18:00',
      duration_minutes: 30,
      exercise_name: 'Run',
      exercises: { name: 'Run' },
    } as unknown as DailyExerciseEntry;

    const data = render(
      [
        row('xiaomi', [{ t: `${DAY}T08:00:00Z`, bpm: 60 }]),
        row('manual', [{ t: `${DAY}T18:10:00Z`, bpm: 150, ex: 'entry-1' }]),
      ],
      [workout]
    );

    expect(data.relevantWorkouts.map((w) => w.id)).toEqual(['entry-1']);
  });
});
