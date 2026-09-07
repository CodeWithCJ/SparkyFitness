import { renderHook, waitFor } from '@testing-library/react-native';
import { useSleepDetail } from '../../src/hooks/useSleepDetail';
import { sleepDayQueryKey } from '../../src/hooks/queryKeys';
import { fetchSleepEntries } from '../../src/services/api/sleepApi';
import { buildSleepEntry, buildStageEvent } from '../helpers/sleepFixtures';
import {
  createTestQueryClient,
  createQueryWrapper,
  type QueryClient,
} from './queryTestUtils';

jest.mock('../../src/services/api/sleepApi', () => ({
  fetchSleepEntries: jest.fn(),
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
}));

const mockFetchSleepEntries = fetchSleepEntries as jest.MockedFunction<
  typeof fetchSleepEntries
>;

const DAY = '2026-08-23';
const ENTRY_ID = 'entry-main';

describe('useSleepDetail', () => {
  let queryClient: QueryClient;

  const renderDetail = (entryId = ENTRY_ID, day = DAY) =>
    renderHook(() => useSleepDetail(entryId, day), {
      wrapper: createQueryWrapper(queryClient),
    });

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  test('resolves the entry and its stages together', async () => {
    const stage = buildStageEvent();
    mockFetchSleepEntries.mockResolvedValue([
      buildSleepEntry({ id: ENTRY_ID, stage_events: [stage] }),
    ]);

    const { result } = renderDetail();

    await waitFor(() => expect(result.current.entry).not.toBeNull());
    expect(result.current.entry?.id).toBe(ENTRY_ID);
    expect(result.current.stages).toEqual([stage]);
    expect(result.current.isError).toBe(false);
  });

  test('a failing entry fetch surfaces isError', async () => {
    mockFetchSleepEntries.mockRejectedValue(
      new Error('Network request failed')
    );

    const { result } = renderDetail();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.entry).toBeNull();
  });

  test('an entryId absent from the range resolves to null rather than throwing', async () => {
    mockFetchSleepEntries.mockResolvedValue([
      buildSleepEntry({ id: 'someone-else' }),
    ]);

    const { result } = renderDetail('missing-entry');

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.entry).toBeNull();
    expect(result.current.stages).toEqual([]);
    expect(result.current.isError).toBe(false);
  });

  test('a row without stage_events defaults stages to []', async () => {
    const withoutStages = buildSleepEntry({ id: ENTRY_ID });
    delete (withoutStages as Partial<typeof withoutStages>).stage_events;
    mockFetchSleepEntries.mockResolvedValue([
      withoutStages as typeof withoutStages,
    ]);

    const { result } = renderDetail();

    await waitFor(() => expect(result.current.entry).not.toBeNull());
    expect(result.current.stages).toEqual([]);
  });

  test('reuses the Diary day cache rather than issuing a second entry request', async () => {
    // Navigating from a card must be a cache hit; a separate details key would refetch.
    // Uses the production staleTime (Infinity) rather than the shared harness's 0, which
    // would mark the seeded data stale on mount and mask the cache hit behind a refetch.
    queryClient = createTestQueryClient({
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    });
    queryClient.setQueryData(sleepDayQueryKey(DAY), [
      buildSleepEntry({ id: ENTRY_ID }),
    ]);

    const { result } = renderDetail();

    await waitFor(() => expect(result.current.entry).not.toBeNull());
    expect(mockFetchSleepEntries).not.toHaveBeenCalled();
  });

  describe('query keys', () => {
    test('the detail screen reads the same day key the Diary populates', () => {
      expect(sleepDayQueryKey(DAY)).toEqual(['sleep', 'day', '2026-08-23']);
    });
  });
});
