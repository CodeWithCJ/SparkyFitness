import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  useFamilyDailySummary,
  useFamilyUsers,
  useFamilyCopySource,
} from '../../src/hooks/useFamilyDiary';
import { fetchFamilyDiaryUsers } from '../../src/services/api/familyApi';
import { fetchDailySummary } from '../../src/services/api/dailySummaryApi';
import { resolveCollapsedFoodEntries } from '../../src/utils/loggedMealCollapse';
import {
  createQueryWrapper,
  createTestQueryClient,
  type QueryClient,
} from './queryTestUtils';

jest.mock('../../src/services/api/familyApi', () => ({
  fetchFamilyDiaryUsers: jest.fn(),
}));

jest.mock('../../src/services/api/dailySummaryApi', () => ({
  fetchDailySummary: jest.fn(),
}));

jest.mock('../../src/utils/loggedMealCollapse', () => ({
  resolveCollapsedFoodEntries: jest.fn(),
}));

jest.mock('@react-navigation/native', () => ({ useFocusEffect: jest.fn() }));

const mockFetchFamilyDiaryUsers = fetchFamilyDiaryUsers as jest.MockedFunction<
  typeof fetchFamilyDiaryUsers
>;
const mockFetchDailySummary = fetchDailySummary as jest.MockedFunction<
  typeof fetchDailySummary
>;

describe('useFamilyDiary', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  test('loads own raw copy entries without a family target or synthetic meal collapse', async () => {
    const data = {
      foodEntries: [{ id: 'component', food_entry_meal_id: 'container' }],
    };
    mockFetchDailySummary.mockResolvedValue(
      data as Awaited<ReturnType<typeof fetchDailySummary>>
    );
    const { result } = renderHook(
      () => useFamilyCopySource({ date: '2026-08-23' }),
      { wrapper: createQueryWrapper(queryClient) }
    );
    await waitFor(() => expect(result.current.data).toEqual(data));
    expect(mockFetchDailySummary).toHaveBeenCalledWith('2026-08-23');
    expect(
      queryClient.getQueryData(['familyCopySource', '2026-08-23'])
    ).toEqual(data);
    expect(resolveCollapsedFoodEntries).not.toHaveBeenCalled();
  });

  test('reloads a meal added between recipient chooser visits despite the app defaulting to infinite freshness', async () => {
    queryClient.setDefaultOptions({
      queries: { retry: false, staleTime: Infinity },
    });
    mockFetchDailySummary.mockResolvedValue({ foodEntries: [] } as Awaited<
      ReturnType<typeof fetchDailySummary>
    >);
    const firstVisit = renderHook(
      () => useFamilyCopySource({ date: '2026-08-23' }),
      { wrapper: createQueryWrapper(queryClient) }
    );
    await waitFor(() =>
      expect(firstVisit.result.current.data?.foodEntries).toEqual([])
    );
    firstVisit.unmount();

    const updated = { foodEntries: [{ id: 'new-entry', quantity: 200 }] };
    mockFetchDailySummary.mockResolvedValue(
      updated as Awaited<ReturnType<typeof fetchDailySummary>>
    );
    const secondVisit = renderHook(
      () => useFamilyCopySource({ date: '2026-08-23' }),
      { wrapper: createQueryWrapper(queryClient) }
    );
    await waitFor(() =>
      expect(secondVisit.result.current.data).toEqual(updated)
    );
  });

  test('refreshes reviewed source quantities when the recipient chooser regains focus', async () => {
    mockFetchDailySummary.mockResolvedValue({
      foodEntries: [{ id: 'entry', quantity: 100 }],
    } as Awaited<ReturnType<typeof fetchDailySummary>>);
    const { result } = renderHook(
      () => useFamilyCopySource({ date: '2026-08-23' }),
      { wrapper: createQueryWrapper(queryClient) }
    );
    await waitFor(() =>
      expect(result.current.data?.foodEntries[0].quantity).toBe(100)
    );
    mockFetchDailySummary.mockResolvedValue({
      foodEntries: [{ id: 'entry', quantity: 200 }],
    } as Awaited<ReturnType<typeof fetchDailySummary>>);
    act(() => {
      (useFocusEffect as jest.Mock).mock.calls.at(-1)?.[0]();
    });
    await waitFor(() =>
      expect(result.current.data?.foodEntries[0].quantity).toBe(200)
    );
  });

  test('uses an isolated key for accessible family users', async () => {
    mockFetchFamilyDiaryUsers.mockResolvedValue([
      {
        userId: 'member-b',
        displayName: 'Member B',
        email: 'b@example.test',
        canCopy: true,
        accessEndDate: null,
      },
    ]);

    const { result } = renderHook(() => useFamilyUsers(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(queryClient.getQueryData(['familyDiaryUsers'])).toEqual(
      result.current.data
    );
  });

  test('reloads recipients granted after an earlier empty chooser despite infinite app freshness', async () => {
    queryClient.setDefaultOptions({
      queries: { retry: false, staleTime: Infinity },
    });
    mockFetchFamilyDiaryUsers.mockResolvedValue([]);
    const firstVisit = renderHook(
      () => useFamilyUsers({ refetchOnFocus: true }),
      {
        wrapper: createQueryWrapper(queryClient),
      }
    );
    await waitFor(() => expect(firstVisit.result.current.data).toEqual([]));
    firstVisit.unmount();
    const recipients = [
      {
        userId: 'new-recipient',
        displayName: 'New recipient',
        email: null,
        canCopy: true,
        accessEndDate: null,
      },
    ];
    mockFetchFamilyDiaryUsers.mockResolvedValue(recipients);
    const secondVisit = renderHook(
      () => useFamilyUsers({ refetchOnFocus: true }),
      {
        wrapper: createQueryWrapper(queryClient),
      }
    );
    await waitFor(() =>
      expect(secondVisit.result.current.data).toEqual(recipients)
    );
  });

  test('refreshes current recipient permissions when the chooser regains focus', async () => {
    mockFetchFamilyDiaryUsers.mockResolvedValue([
      {
        userId: 'recipient',
        displayName: 'Recipient',
        email: null,
        canCopy: true,
        accessEndDate: null,
      },
    ]);
    const { result } = renderHook(
      () => useFamilyUsers({ refetchOnFocus: true }),
      {
        wrapper: createQueryWrapper(queryClient),
      }
    );
    await waitFor(() => expect(result.current.data?.[0].canCopy).toBe(true));
    mockFetchFamilyDiaryUsers.mockResolvedValue([]);
    act(() => {
      (useFocusEffect as jest.Mock).mock.calls.at(-1)?.[0]();
    });
    await waitFor(() => expect(result.current.data).toEqual([]));
  });

  test('preserves default cached family users on focus and later diary visits', async () => {
    queryClient.setDefaultOptions({
      queries: { retry: false, staleTime: Infinity },
    });
    mockFetchFamilyDiaryUsers.mockResolvedValue([]);
    const firstVisit = renderHook(() => useFamilyUsers(), {
      wrapper: createQueryWrapper(queryClient),
    });
    await waitFor(() => expect(firstVisit.result.current.isSuccess).toBe(true));
    act(() => {
      (useFocusEffect as jest.Mock).mock.calls.at(-1)?.[0]();
    });
    await waitFor(() =>
      expect(firstVisit.result.current.isFetching).toBe(false)
    );
    expect(mockFetchFamilyDiaryUsers).toHaveBeenCalledTimes(1);
    firstVisit.unmount();

    const secondVisit = renderHook(() => useFamilyUsers(), {
      wrapper: createQueryWrapper(queryClient),
    });
    await waitFor(() =>
      expect(secondVisit.result.current.isFetching).toBe(false)
    );
    expect(secondVisit.result.current.data).toEqual([]);
    expect(mockFetchFamilyDiaryUsers).toHaveBeenCalledTimes(1);
  });

  test('does not refresh opted-in recipients on focus while disconnected', () => {
    renderHook(() => useFamilyUsers({ enabled: false, refetchOnFocus: true }), {
      wrapper: createQueryWrapper(queryClient),
    });
    act(() => {
      (useFocusEffect as jest.Mock).mock.calls.at(-1)?.[0]();
    });
    expect(mockFetchFamilyDiaryUsers).not.toHaveBeenCalled();
  });

  test('does not fetch accessible family users while the server is disconnected', async () => {
    renderHook(() => useFamilyUsers({ enabled: false }), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() =>
      expect(mockFetchFamilyDiaryUsers).not.toHaveBeenCalled()
    );
  });

  test('isolates family summaries by family user and date without collapsing entries', async () => {
    mockFetchDailySummary.mockResolvedValue({
      goals: {},
      foodEntries: [{ id: 'component-1' }, { id: 'component-2' }],
      exerciseSessions: [],
      waterIntake: 0,
    } as Awaited<ReturnType<typeof fetchDailySummary>>);

    const { result } = renderHook(
      () =>
        useFamilyDailySummary({ familyUserId: 'member-b', date: '2026-08-23' }),
      { wrapper: createQueryWrapper(queryClient) }
    );

    await waitFor(() =>
      expect(result.current.data?.foodEntries).toHaveLength(2)
    );
    expect(
      queryClient.getQueryData(['familyDailySummary', 'member-b', '2026-08-23'])
    ).toBeDefined();
    expect(mockFetchDailySummary).toHaveBeenCalledWith(
      '2026-08-23',
      'member-b'
    );
    expect(resolveCollapsedFoodEntries).not.toHaveBeenCalled();
  });

  test('does not fetch a family summary when no family user is selected', async () => {
    renderHook(
      () => useFamilyDailySummary({ familyUserId: '', date: '2026-08-23' }),
      {
        wrapper: createQueryWrapper(queryClient),
      }
    );

    await waitFor(() => expect(mockFetchDailySummary).not.toHaveBeenCalled());
  });
});
