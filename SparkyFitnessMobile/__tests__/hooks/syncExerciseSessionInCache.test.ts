import { syncExerciseSessionInCache } from '../../src/hooks/syncExerciseSessionInCache';
import {
  dailySummaryQueryKey,
  exerciseHistoryQueryKey,
} from '../../src/hooks/queryKeys';
import {
  createTestQueryClient,
  type QueryClient,
} from './queryTestUtils';
import type {
  ExerciseHistoryResponse,
  ExerciseSessionResponse,
  CalorieBalance,
} from '@workspace/shared';
import type { InfiniteData } from '@tanstack/react-query';
import type { DailySummaryRawData } from '../../src/hooks/useDailySummary';

type PresetSession = Extract<ExerciseSessionResponse, { type: 'preset' }>;

const makePresetSession = (
  id: string,
  name: string,
  overrides?: Partial<PresetSession>,
): PresetSession => ({
  type: 'preset',
  id,
  entry_date: '2024-06-15',
  workout_preset_id: null,
  name,
  description: null,
  notes: null,
  source: 'sparky',
  total_duration_minutes: 45,
  exercises: [],
  activity_details: [],
  ...overrides,
});

const makeDefaultGoals = () => ({
  calories: 2000,
  protein: 150,
  carbs: 200,
  fat: 60,
  dietary_fiber: 25,
  water_goal_ml: 2500,
  target_exercise_duration_minutes: 30,
  target_exercise_calories_burned: 400,
});

const makeDefaultCalorieBalance = (): CalorieBalance => ({
  eaten: 0,
  burned: 0,
  remaining: 2000,
  goal: 2000,
  net: 0,
  progress: 0,
  bmr: 1700,
  exerciseSource: 'none',
});

describe('syncExerciseSessionInCache', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  test('replaces matching sessions in history cache without mutating daily summary cache', () => {
    const originalSession = makePresetSession('session-1', 'Push Day');
    const otherSession = makePresetSession('session-2', 'Leg Day');
    const updatedSession = {
      ...originalSession,
      name: 'Chest + Triceps',
      notes: 'Updated notes',
    };

    const historyPage: ExerciseHistoryResponse = {
      sessions: [originalSession, otherSession],
      pagination: {
        page: 1,
        pageSize: 20,
        totalCount: 2,
        hasMore: false,
      },
    };

    const dailySummary: DailySummaryRawData = {
      goals: {
        calories: 2000,
        protein: 150,
        carbs: 200,
        fat: 60,
        dietary_fiber: 25,
        water_goal_ml: 2500,
        target_exercise_duration_minutes: 30,
        target_exercise_calories_burned: 400,
      },
      foodEntries: [],
      exerciseEntries: [originalSession, otherSession],
      waterIntake: {
        water_ml: 0,
      },
      stepCalories: 0,
      calorieBalance: makeDefaultCalorieBalance(),
    };

    queryClient.setQueryData<InfiniteData<ExerciseHistoryResponse>>(exerciseHistoryQueryKey, {
      pages: [historyPage],
      pageParams: [1],
    });
    queryClient.setQueryData(dailySummaryQueryKey('2024-06-15'), dailySummary);

    syncExerciseSessionInCache(queryClient, updatedSession);

    const cachedHistory = queryClient.getQueryData<InfiniteData<ExerciseHistoryResponse>>(
      exerciseHistoryQueryKey,
    );
    const cachedSummary = queryClient.getQueryData<DailySummaryRawData>(
      dailySummaryQueryKey('2024-06-15'),
    );

    expect(cachedHistory?.pages[0].sessions[0]).toEqual(updatedSession);
    expect(cachedHistory?.pages[0].sessions[1]).toEqual(otherSession);
    expect(cachedSummary).toBe(dailySummary);
  });

  test('does not modify history cache when session id does not match', () => {
    const session1 = makePresetSession('session-1', 'Push Day');
    const updatedSession = makePresetSession('session-999', 'Ghost Session');

    const historyPage: ExerciseHistoryResponse = {
      sessions: [session1],
      pagination: { page: 1, pageSize: 20, totalCount: 1, hasMore: false },
    };

    queryClient.setQueryData<InfiniteData<ExerciseHistoryResponse>>(exerciseHistoryQueryKey, {
      pages: [historyPage],
      pageParams: [1],
    });

    syncExerciseSessionInCache(queryClient, updatedSession);

    const cached = queryClient.getQueryData<InfiniteData<ExerciseHistoryResponse>>(
      exerciseHistoryQueryKey,
    );
    expect(cached?.pages[0]).toBe(historyPage);
  });

  test('handles null entry_date without touching daily summary cache', () => {
    const updatedSession = makePresetSession('session-1', 'Updated', {
      entry_date: null as any,
    });

    const dailySummary: DailySummaryRawData = {
      goals: makeDefaultGoals(),
      foodEntries: [],
      exerciseEntries: [makePresetSession('session-1', 'Original')],
      waterIntake: { water_ml: 0 },
      stepCalories: 0,
      calorieBalance: makeDefaultCalorieBalance(),
    };

    queryClient.setQueryData(dailySummaryQueryKey('2024-06-15'), dailySummary);

    syncExerciseSessionInCache(queryClient, updatedSession);

    const cached = queryClient.getQueryData<DailySummaryRawData>(
      dailySummaryQueryKey('2024-06-15'),
    );
    expect(cached).toBe(dailySummary);
  });

  test('handles empty history cache gracefully', () => {
    const updatedSession = makePresetSession('session-1', 'Updated');

    expect(() => {
      syncExerciseSessionInCache(queryClient, updatedSession);
    }).not.toThrow();
  });

  test('preserves referential equality when daily summary session does not match', () => {
    const session = makePresetSession('session-1', 'Push Day');
    const updatedSession = makePresetSession('session-999', 'No Match', {
      entry_date: '2024-06-15',
    });

    const dailySummary: DailySummaryRawData = {
      goals: makeDefaultGoals(),
      foodEntries: [],
      exerciseEntries: [session],
      waterIntake: { water_ml: 0 },
      stepCalories: 0,
      calorieBalance: makeDefaultCalorieBalance(),
    };

    queryClient.setQueryData(dailySummaryQueryKey('2024-06-15'), dailySummary);

    syncExerciseSessionInCache(queryClient, updatedSession);

    const cached = queryClient.getQueryData<DailySummaryRawData>(
      dailySummaryQueryKey('2024-06-15'),
    );
    expect(cached).toBe(dailySummary);
  });
});
