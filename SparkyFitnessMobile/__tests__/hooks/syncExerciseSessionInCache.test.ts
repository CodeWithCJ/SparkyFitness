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
} from '@workspace/shared';
import type { DailySummaryRawData } from '../../src/hooks/useDailySummary';

const makePresetSession = (
  id: string,
  name: string,
): Extract<ExerciseSessionResponse, { type: 'preset' }> => ({
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
});

describe('syncExerciseSessionInCache', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  test('replaces matching sessions in history and daily summary caches', () => {
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
    };

    queryClient.setQueryData([...exerciseHistoryQueryKey, 1], historyPage);
    queryClient.setQueryData(dailySummaryQueryKey('2024-06-15'), dailySummary);

    syncExerciseSessionInCache(queryClient, updatedSession);

    const cachedHistory = queryClient.getQueryData<ExerciseHistoryResponse>([
      ...exerciseHistoryQueryKey,
      1,
    ]);
    const cachedSummary = queryClient.getQueryData<DailySummaryRawData>(
      dailySummaryQueryKey('2024-06-15'),
    );

    expect(cachedHistory?.sessions[0]).toEqual(updatedSession);
    expect(cachedHistory?.sessions[1]).toEqual(otherSession);
    expect(cachedSummary?.exerciseEntries[0]).toEqual(updatedSession);
    expect(cachedSummary?.exerciseEntries[1]).toEqual(otherSession);
  });
});
