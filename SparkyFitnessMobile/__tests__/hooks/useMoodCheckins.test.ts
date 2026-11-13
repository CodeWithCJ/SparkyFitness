import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { QueryKey } from '@tanstack/react-query';
import {
  useCreateMoodCheckin,
  useDeleteMoodCheckin,
  useMoodCheckinsForDate,
  useMoodEntries,
  useMoodEntryForDate,
  useUpdateMoodCheckin,
} from '../../src/hooks/useMood';
import {
  moodCheckinsQueryKey,
  moodCheckinsSupportQueryKey,
  moodRatingsSupportQueryKey,
} from '../../src/hooks/queryKeys';
import {
  createMoodCheckin,
  deleteMoodCheckin,
  fetchLegacyMoodEntries,
  fetchMoodCheckinsForDate,
  fetchMoodEntries,
  updateMoodCheckin,
} from '../../src/services/api/moodApi';
import { getTodayDate } from '../../src/utils/dateUtils';
import {
  createTestQueryClient,
  createQueryWrapper,
  type QueryClient,
} from './queryTestUtils';

jest.mock('../../src/services/api/moodApi', () => ({
  createMoodCheckin: jest.fn(),
  deleteMoodCheckin: jest.fn(),
  fetchCustomMoods: jest.fn(),
  fetchLegacyMoodEntries: jest.fn(),
  fetchMoodCheckinsForDate: jest.fn(),
  fetchMoodEntries: jest.fn(),
  saveMoodEntry: jest.fn(),
  updateMoodCheckin: jest.fn(),
}));

jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));

const mocked = <T extends (...args: never[]) => unknown>(fn: T) =>
  fn as unknown as jest.Mock;

describe('mood check-in hooks', () => {
  beforeEach(() => jest.clearAllMocks());

  it('loads a day under its own key', async () => {
    mocked(fetchMoodCheckinsForDate).mockResolvedValue([]);
    const client = createTestQueryClient();
    const { result } = renderHook(() => useMoodCheckinsForDate('2026-10-05'), {
      wrapper: createQueryWrapper(client),
    });

    await waitFor(() => expect(result.current.checkins).toEqual([]));
    expect(
      client.getQueryData(['moodEntries', 'checkins', '2026-10-05'])
    ).toEqual([]);
  });

  it('charts one point per day, averaging several check-ins and skipping null moods', async () => {
    const today = getTodayDate();
    const row = (id: string, mood_value: number | null) => ({
      id,
      entry_date: today,
      entry_timestamp: `${today}T12:00:00Z`,
      source: 'manual',
      mood_value,
      mood_tags: null,
      notes: null,
    });
    mocked(fetchMoodEntries).mockResolvedValue([
      row('a', 40),
      row('b', 80),
      row('c', null),
    ]);
    const { result } = renderHook(() => useMoodEntries('7d'), {
      wrapper: createQueryWrapper(createTestQueryClient()),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.points).toEqual([{ day: today, mood: 60 }]);
  });

  it('keeps the legacy single-day entry apart from a one-day range', async () => {
    mocked(fetchLegacyMoodEntries).mockResolvedValue([{ id: 'a' }]);
    const client = createTestQueryClient();
    const { result } = renderHook(() => useMoodEntryForDate('2026-10-05'), {
      wrapper: createQueryWrapper(client),
    });

    await waitFor(() => expect(result.current.entry).toEqual({ id: 'a' }));
    expect(
      client.getQueryData(['moodEntries', 'legacyDay', '2026-10-05'])
    ).toEqual({ id: 'a' });
    expect(
      client.getQueryData(['moodEntries', '2026-10-05', '2026-10-05'])
    ).toBeUndefined();
  });

  const expectBothInvalidated = (spy: jest.SpyInstance) => {
    const keys = spy.mock.calls.map(([filters]) => filters.queryKey);
    expect(keys).toContainEqual(['moodEntries']);
    expect(keys).toContainEqual(['cycleCorrelations']);
  };

  const invalidatingClient = () => {
    const client = createTestQueryClient();
    return { client, spy: jest.spyOn(client, 'invalidateQueries') };
  };

  it('create invalidates mood entries and cycle correlations', async () => {
    mocked(createMoodCheckin).mockResolvedValue(undefined);
    const { client, spy } = invalidatingClient();
    const { result } = renderHook(() => useCreateMoodCheckin(), {
      wrapper: createQueryWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({
        mood_value: 50,
        entry_date: '2026-10-05',
        entry_timestamp: '2026-10-05T14:00:00.000Z',
      });
    });

    expectBothInvalidated(spy);
  });

  it('update invalidates mood entries and cycle correlations', async () => {
    mocked(updateMoodCheckin).mockResolvedValue(undefined);
    const { client, spy } = invalidatingClient();
    const { result } = renderHook(() => useUpdateMoodCheckin(), {
      wrapper: createQueryWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({ id: 'x', body: { notes: 'hi' } });
    });

    expectBothInvalidated(spy);
  });

  it('delete invalidates mood entries and cycle correlations', async () => {
    mocked(deleteMoodCheckin).mockResolvedValue(undefined);
    const { client, spy } = invalidatingClient();
    const { result } = renderHook(() => useDeleteMoodCheckin(), {
      wrapper: createQueryWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync('x');
    });

    expectBothInvalidated(spy);
  });

  const dayKey = moodCheckinsQueryKey('2026-10-05');

  const createIn = async (client: QueryClient) => {
    mocked(createMoodCheckin).mockResolvedValue(undefined);
    const { result } = renderHook(() => useCreateMoodCheckin(), {
      wrapper: createQueryWrapper(client),
    });
    await act(async () => {
      await result.current.mutateAsync({
        mood_value: 50,
        entry_date: '2026-10-05',
        entry_timestamp: '2026-10-05T14:00:00.000Z',
      });
    });
    const invalidated = (key: QueryKey) =>
      client.getQueryState(key)?.isInvalidated;
    return {
      day: invalidated(dayKey),
      checkinsProbe: invalidated(moodCheckinsSupportQueryKey),
      ratingsProbe: invalidated(moodRatingsSupportQueryKey),
    };
  };

  it('a write refreshes the day but keeps known server-support answers', async () => {
    const client = createTestQueryClient();
    client.setQueryData(dayKey, []);
    client.setQueryData(moodCheckinsSupportQueryKey, true);
    client.setQueryData(moodRatingsSupportQueryKey, false);

    expect(await createIn(client)).toEqual({
      day: true,
      checkinsProbe: false,
      ratingsProbe: false,
    });
  });

  it('a write re-checks server support while the answer is still unknown', async () => {
    const client = createTestQueryClient();
    client.setQueryData(dayKey, []);
    // A failed check-ins probe has no answer; a ratings probe with no rows is null.
    await client.prefetchQuery({
      queryKey: moodCheckinsSupportQueryKey,
      queryFn: () => Promise.reject(new Error('boom')),
    });
    client.setQueryData(moodRatingsSupportQueryKey, null);

    expect(await createIn(client)).toEqual({
      day: true,
      checkinsProbe: true,
      ratingsProbe: true,
    });
  });
});
