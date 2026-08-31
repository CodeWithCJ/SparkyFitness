import { act, renderHook, waitFor } from '@testing-library/react-native';
import {
  useCreateMealPlan,
  useDeleteMealPlan,
  useDuplicateMealPlan,
  useMealPlans,
  useUpdateMealPlan,
} from '../../src/hooks/useMealPlans';
import {
  dailySummaryRootQueryKey,
  mealPlansQueryKey,
  recentMealsQueryKeyRoot,
  topMealsQueryKeyRoot,
} from '../../src/hooks/queryKeys';
import {
  createMealPlan,
  deleteMealPlan,
  duplicateMealPlan,
  fetchMealPlans,
  updateMealPlan,
} from '../../src/services/api/mealPlansApi';
import {
  createQueryWrapper,
  createTestQueryClient,
  type QueryClient,
} from './queryTestUtils';

jest.mock('../../src/services/api/mealPlansApi', () => ({
  createMealPlan: jest.fn(),
  deleteMealPlan: jest.fn(),
  duplicateMealPlan: jest.fn(),
  fetchMealPlans: jest.fn(),
  updateMealPlan: jest.fn(),
}));

const mockCreate = createMealPlan as jest.MockedFunction<typeof createMealPlan>;
const mockDelete = deleteMealPlan as jest.MockedFunction<typeof deleteMealPlan>;
const mockDuplicate = duplicateMealPlan as jest.MockedFunction<
  typeof duplicateMealPlan
>;
const mockFetch = fetchMealPlans as jest.MockedFunction<typeof fetchMealPlans>;
const mockUpdate = updateMealPlan as jest.MockedFunction<typeof updateMealPlan>;

const payload = {
  plan_name: 'Prep week',
  description: null,
  start_date: '2026-09-01',
  end_date: null,
  is_active: true,
  assignments: [
    {
      item_type: 'meal' as const,
      day_of_week: 1,
      meal_type_id: 'lunch',
      meal_id: 'meal-1',
      quantity: 1,
      unit: 'serving',
    },
  ],
};

const plan = {
  id: 'plan-1',
  user_id: 'user-1',
  ...payload,
  created_at: '2026-08-29T12:00:00.000Z',
  updated_at: '2026-08-29T12:00:00.000Z',
};

describe('useMealPlans', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  afterEach(() => queryClient.clear());

  test('loads meal plans', async () => {
    mockFetch.mockResolvedValue([plan]);

    const { result } = renderHook(() => useMealPlans(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.mealPlans).toEqual([plan]));
    expect(mealPlansQueryKey).toEqual(['mealPlans']);
  });

  test('invalidates the list after create, update, duplicate, and delete', async () => {
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    mockCreate.mockResolvedValue(plan);
    mockUpdate.mockResolvedValue(plan);
    mockDuplicate.mockResolvedValue({
      ...plan,
      id: 'plan-2',
      is_active: false,
    });
    mockDelete.mockResolvedValue(undefined);

    const createHook = renderHook(() => useCreateMealPlan(), {
      wrapper: createQueryWrapper(queryClient),
    });
    const updateHook = renderHook(() => useUpdateMealPlan('plan-1'), {
      wrapper: createQueryWrapper(queryClient),
    });
    const duplicateHook = renderHook(() => useDuplicateMealPlan(), {
      wrapper: createQueryWrapper(queryClient),
    });
    const deleteHook = renderHook(() => useDeleteMealPlan(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await act(async () => {
      await createHook.result.current.createMealPlanAsync(
        payload,
        '2026-08-29'
      );
      await updateHook.result.current.updateMealPlanAsync(
        payload,
        '2026-08-29'
      );
      await duplicateHook.result.current.duplicateMealPlanAsync(
        'plan-1',
        '2026-08-29'
      );
      await deleteHook.result.current.deleteMealPlanAsync(
        'plan-1',
        '2026-08-29'
      );
    });

    expect(mockCreate).toHaveBeenCalledWith(payload, '2026-08-29');
    expect(mockUpdate).toHaveBeenCalledWith('plan-1', payload, '2026-08-29');
    expect(mockDuplicate).toHaveBeenCalledWith('plan-1', '2026-08-29');
    expect(mockDelete).toHaveBeenCalledWith('plan-1', '2026-08-29');
    expect(invalidate).toHaveBeenCalledTimes(16);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: mealPlansQueryKey });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: dailySummaryRootQueryKey,
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: recentMealsQueryKeyRoot,
      refetchType: 'all',
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: topMealsQueryKeyRoot,
      refetchType: 'all',
    });
  });
});
