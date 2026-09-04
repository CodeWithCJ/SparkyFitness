import { renderHook, waitFor } from '@testing-library/react-native';
import {
  useFamilyDailySummary,
  useFamilyUsers,
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
