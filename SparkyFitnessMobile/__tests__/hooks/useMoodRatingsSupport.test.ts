import { renderHook, waitFor } from '@testing-library/react-native';
import {
  moodEntriesSupportRatings,
  useMoodRatingsSupport,
} from '../../src/hooks/useMoodRatingsSupport';
import {
  fetchMoodEntries,
  type MoodEntry,
} from '../../src/services/api/moodApi';
import { addDays, getTodayDate } from '../../src/utils/dateUtils';
import { createTestQueryClient, createQueryWrapper } from './queryTestUtils';

jest.mock('../../src/services/api/moodApi', () => ({
  fetchMoodEntries: jest.fn(),
}));

const mockFetch = fetchMoodEntries as jest.MockedFunction<
  typeof fetchMoodEntries
>;

const entry = (extra: Partial<MoodEntry> = {}): MoodEntry => ({
  id: 'm1',
  mood_value: 60,
  mood_tags: [],
  notes: null,
  entry_date: '2026-10-05',
  ...extra,
});

describe('moodEntriesSupportRatings', () => {
  it('is unknown with no entries', () => {
    expect(moodEntriesSupportRatings([])).toBeNull();
  });

  it('is true when an entry carries the energy_value key, even null', () => {
    expect(moodEntriesSupportRatings([entry({ energy_value: null })])).toBe(
      true
    );
  });

  it('is false when entries lack the energy_value key', () => {
    expect(moodEntriesSupportRatings([entry()])).toBe(false);
  });
});

describe('useMoodRatingsSupport', () => {
  beforeEach(() => jest.clearAllMocks());

  const run = () =>
    renderHook(() => useMoodRatingsSupport(), {
      wrapper: createQueryWrapper(createTestQueryClient()),
    });

  it('probes the last 365 days and reports support', async () => {
    mockFetch.mockResolvedValue([entry({ energy_value: 3 })]);
    const { result } = run();

    await waitFor(() => expect(result.current.supported).toBe(true));
    const today = getTodayDate();
    expect(mockFetch).toHaveBeenCalledWith(addDays(today, -365), today);
  });

  it('keeps the answer instead of refetching when the check-in opens again', async () => {
    mockFetch.mockResolvedValue([entry({ energy_value: 3 })]);
    const client = createTestQueryClient();
    const wrapper = createQueryWrapper(client);
    const first = renderHook(() => useMoodRatingsSupport(), { wrapper });
    await waitFor(() => expect(first.result.current.supported).toBe(true));
    first.unmount();

    const second = renderHook(() => useMoodRatingsSupport(), { wrapper });
    expect(second.result.current.supported).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('reports no support for an older server', async () => {
    mockFetch.mockResolvedValue([entry()]);
    const { result } = run();

    await waitFor(() => expect(result.current.supported).toBe(false));
  });

  it('is unknown when the request fails', async () => {
    mockFetch.mockRejectedValue(new Error('boom'));
    const { result } = run();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.supported).toBeNull();
  });
});
