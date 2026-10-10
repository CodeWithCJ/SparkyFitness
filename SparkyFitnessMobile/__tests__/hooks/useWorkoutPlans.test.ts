import { act, renderHook, waitFor } from '@testing-library/react-native';
import {
  useCreateWorkoutPlan,
  useDeleteWorkoutPlan,
  useUpdateWorkoutPlan,
  useWorkoutPlans,
} from '../../src/hooks/useWorkoutPlans';
import {
  dailySummaryRootQueryKey,
  workoutPlansRootQueryKey,
} from '../../src/hooks/queryKeys';
import {
  createWorkoutPlan,
  deleteWorkoutPlan,
  fetchWorkoutPlans,
  updateWorkoutPlan,
} from '../../src/services/api/workoutPlansApi';
import {
  createQueryWrapper,
  createTestQueryClient,
  type QueryClient,
} from './queryTestUtils';
import type {
  SaveWorkoutPlanPayload,
  WorkoutPlanTemplate,
} from '../../src/types/workoutPlans';

jest.mock('../../src/services/api/workoutPlansApi', () => ({
  createWorkoutPlan: jest.fn(),
  deleteWorkoutPlan: jest.fn(),
  fetchWorkoutPlans: jest.fn(),
  updateWorkoutPlan: jest.fn(),
}));

const mockCreate = createWorkoutPlan as jest.MockedFunction<
  typeof createWorkoutPlan
>;
const mockDelete = deleteWorkoutPlan as jest.MockedFunction<
  typeof deleteWorkoutPlan
>;
const mockFetch = fetchWorkoutPlans as jest.MockedFunction<
  typeof fetchWorkoutPlans
>;
const mockUpdate = updateWorkoutPlan as jest.MockedFunction<
  typeof updateWorkoutPlan
>;

const payload: SaveWorkoutPlanPayload = {
  plan_name: 'Push pull',
  description: '',
  start_date: '2026-10-08',
  end_date: null,
  is_active: true,
  schedule_type: 'weekly',
  entry_mode: 'prompt',
  assignments: [],
};

const plan = { id: 'plan-1', plan_name: 'Push pull' } as WorkoutPlanTemplate;

describe('useWorkoutPlans', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  afterEach(() => queryClient.clear());

  test('loads workout plans', async () => {
    mockFetch.mockResolvedValue([plan]);
    const { result } = renderHook(() => useWorkoutPlans(), {
      wrapper: createQueryWrapper(queryClient),
    });
    await waitFor(() => expect(result.current.workoutPlans).toEqual([plan]));
  });

  test('create, update and delete refresh plans and daily summaries', async () => {
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    mockCreate.mockResolvedValue(plan);
    mockUpdate.mockResolvedValue(plan);
    mockDelete.mockResolvedValue(undefined);
    const wrapper = createQueryWrapper(queryClient);
    const create = renderHook(() => useCreateWorkoutPlan(), { wrapper });
    const update = renderHook(() => useUpdateWorkoutPlan('plan-1'), {
      wrapper,
    });
    const remove = renderHook(() => useDeleteWorkoutPlan(), { wrapper });

    await act(async () => {
      await create.result.current.createWorkoutPlanAsync(payload, '2026-10-08');
      await update.result.current.updateWorkoutPlanAsync(payload, '2026-10-08');
      await remove.result.current.deleteWorkoutPlanAsync('plan-1');
    });

    expect(mockCreate).toHaveBeenCalledWith(payload, '2026-10-08');
    expect(mockUpdate).toHaveBeenCalledWith('plan-1', payload, '2026-10-08');
    expect(mockDelete).toHaveBeenCalledWith('plan-1');
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: workoutPlansRootQueryKey,
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: dailySummaryRootQueryKey,
    });
  });

  test('updating without a plan id rejects', async () => {
    const { result } = renderHook(() => useUpdateWorkoutPlan(undefined), {
      wrapper: createQueryWrapper(queryClient),
    });
    await expect(
      act(() => result.current.updateWorkoutPlanAsync(payload, '2026-10-08'))
    ).rejects.toThrow('Workout plan ID is required');
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
