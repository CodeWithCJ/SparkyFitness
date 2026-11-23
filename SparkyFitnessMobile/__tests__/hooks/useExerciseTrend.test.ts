import { renderHook, waitFor } from '@testing-library/react-native';
import type { ExerciseProgressResponse } from '@workspace/shared';
import { useExerciseTrend } from '../../src/hooks/useExerciseTrend';
import { fetchExerciseProgress } from '../../src/services/api/exerciseApi';
import { usePreferences } from '../../src/hooks/usePreferences';
import { getTodayDate } from '../../src/utils/dateUtils';
import {
  createTestQueryClient,
  createQueryWrapper,
  type QueryClient,
} from './queryTestUtils';

jest.mock('../../src/services/api/exerciseApi', () => ({
  fetchExerciseProgress: jest.fn(),
}));
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: jest.fn(),
}));
jest.mock('../../src/utils/dateUtils', () => ({
  getTodayDate: jest.fn(),
}));

const mockFetch = fetchExerciseProgress as jest.MockedFunction<
  typeof fetchExerciseProgress
>;
const mockPreferences = usePreferences as jest.MockedFunction<
  typeof usePreferences
>;
const mockToday = getTodayDate as jest.MockedFunction<typeof getTodayDate>;

const entry = (
  entryDate: string,
  sets: Partial<ExerciseProgressResponse['sets'][number]>[],
  providerName = 'Manual'
): ExerciseProgressResponse =>
  ({
    exercise_entry_id: entryDate,
    entry_date: entryDate,
    duration_minutes: 0,
    calories_burned: 0,
    notes: null,
    image_url: null,
    distance: null,
    avg_heart_rate: null,
    provider_name: providerName,
    category: 'Strength',
    modality: 'weight_reps',
    body_weight_kg: null,
    edited: false,
    session: null,
    sets: sets.map((set, index) => ({ set_number: index + 1, ...set })),
  }) as ExerciseProgressResponse;

describe('useExerciseTrend', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
    mockToday.mockReturnValue('2026-11-21');
    mockPreferences.mockReturnValue({
      preferences: { first_day_of_week: 0 },
    } as unknown as ReturnType<typeof usePreferences>);
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('reads the 12-month window ending today', async () => {
    mockFetch.mockResolvedValue([]);
    renderHook(() => useExerciseTrend('ex-1', 'month', 'estimated1RM'), {
      wrapper: createQueryWrapper(queryClient),
    });
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        'ex-1',
        '2025-12-01',
        '2026-11-21'
      );
    });
  });

  it('starts weeks on the account first day of the week', async () => {
    mockFetch.mockResolvedValue([]);
    renderHook(() => useExerciseTrend('ex-1', 'week', 'estimated1RM'), {
      wrapper: createQueryWrapper(queryClient),
    });
    // Sunday weeks: the current week starts 2026-11-15, 11 weeks earlier is 08-30.
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        'ex-1',
        '2026-08-30',
        '2026-11-21'
      );
    });
  });

  it('builds points without untouched plan rows', async () => {
    mockFetch.mockResolvedValue([
      entry('2026-10-04', [{ weight: 20, reps: 10 }]),
      entry('2026-11-02', [{ weight: 25, reps: 5 }]),
      entry('2026-11-28', [{ weight: 40, reps: 5 }], 'Workout Plan'),
    ]);
    const { result } = renderHook(
      () => useExerciseTrend('ex-1', 'month', 'maxLoad'),
      { wrapper: createQueryWrapper(queryClient) }
    );
    await waitFor(() => {
      expect(result.current.points).toHaveLength(2);
    });
    expect(result.current.points.map((p) => p.valueKg)).toEqual([20, 25]);
    expect(result.current.currentPeriodStart).toBe('2026-11-01');
    expect(result.current.sessionCount).toBe(2);
  });

  it('does not fetch without an exercise id', () => {
    renderHook(() => useExerciseTrend(null, 'month', 'estimated1RM'), {
      wrapper: createQueryWrapper(queryClient),
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
