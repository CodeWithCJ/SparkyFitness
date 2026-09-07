import { renderHook, waitFor } from '@testing-library/react-native';

import { classifySleepDay, useSleepDay } from '../../src/hooks/useSleepDay';
import { sleepDayQueryKey } from '../../src/hooks/queryKeys';
import { fetchSleepEntries } from '../../src/services/api/sleepApi';
import { ApiError } from '../../src/services/api/errors';
import { buildSleepEntry } from '../helpers/sleepFixtures';
import {
  createTestQueryClient,
  createQueryWrapper,
  type QueryClient,
} from './queryTestUtils';

jest.mock('../../src/services/api/sleepApi', () => ({
  fetchSleepEntries: jest.fn(),
}));

// Captured rather than invoked, so the hook never needs a navigation container.
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
}));

const mockFetchSleepEntries = fetchSleepEntries as jest.MockedFunction<
  typeof fetchSleepEntries
>;

const DAY = '2026-08-23';
const NEXT_DAY = '2026-08-24';

describe('useSleepDay', () => {
  let queryClient: QueryClient;

  const renderSleepDay = (day = DAY, options?: { enabled?: boolean }) =>
    renderHook(() => useSleepDay(day, options), {
      wrapper: createQueryWrapper(queryClient),
    });

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  test('fetches exactly the [D, D+1] window', async () => {
    mockFetchSleepEntries.mockResolvedValue([]);

    renderSleepDay();

    await waitFor(() => expect(mockFetchSleepEntries).toHaveBeenCalledTimes(1));
    expect(mockFetchSleepEntries).toHaveBeenCalledWith(DAY, NEXT_DAY);
  });

  test('takes wakeUp and naps from D but bedTime from D+1', async () => {
    const overnight = buildSleepEntry({ id: 'overnight', entry_date: DAY });
    const nap = buildSleepEntry({
      id: 'nap',
      entry_date: DAY,
      duration_in_seconds: 1800,
      bedtime: '2026-08-23T14:00:00+00:00',
    });
    const tonight = buildSleepEntry({ id: 'tonight', entry_date: NEXT_DAY });
    mockFetchSleepEntries.mockResolvedValue([overnight, nap, tonight]);

    const { result } = renderSleepDay();

    await waitFor(() => expect(result.current.wakeUp).not.toBeNull());
    expect(result.current.wakeUp?.entry_date).toBe(DAY);
    expect(result.current.naps.map((n) => n.entry_date)).toEqual([DAY]);
    expect(result.current.bedTime?.entry_date).toBe(NEXT_DAY);
  });

  test('never leaks a D+1 entry into wakeUp or naps', async () => {
    const tomorrow = buildSleepEntry({
      id: 'tomorrow',
      entry_date: NEXT_DAY,
      duration_in_seconds: 36000,
    });
    const today = buildSleepEntry({ id: 'today', entry_date: DAY });
    mockFetchSleepEntries.mockResolvedValue([tomorrow, today]);

    const { result } = renderSleepDay();

    await waitFor(() => expect(result.current.wakeUp).not.toBeNull());
    expect(result.current.wakeUp?.id).not.toBe('tomorrow');
    expect(result.current.wakeUp?.id).toBe('today');
    expect(result.current.naps).toEqual([]);
  });

  test('never promotes a D entry into bedTime', async () => {
    const today = buildSleepEntry({ id: 'today', entry_date: DAY });
    mockFetchSleepEntries.mockResolvedValue([today]);

    const { result } = renderSleepDay();

    await waitFor(() => expect(result.current.wakeUp).not.toBeNull());
    expect(result.current.bedTime).toBeNull();
  });

  test('an empty response yields empty fields without an error', async () => {
    mockFetchSleepEntries.mockResolvedValue([]);

    const { result } = renderSleepDay();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.wakeUp).toBeNull();
    expect(result.current.bedTime).toBeNull();
    expect(result.current.naps).toEqual([]);
    expect(result.current.isError).toBe(false);
  });

  test('D populated and D+1 empty leaves bedTime null', async () => {
    mockFetchSleepEntries.mockResolvedValue([
      buildSleepEntry({ entry_date: DAY }),
    ]);

    const { result } = renderSleepDay();

    await waitFor(() => expect(result.current.wakeUp).not.toBeNull());
    expect(result.current.bedTime).toBeNull();
  });

  test('D empty and D+1 populated leaves only bedTime set', async () => {
    mockFetchSleepEntries.mockResolvedValue([
      buildSleepEntry({ id: 'tonight', entry_date: NEXT_DAY }),
    ]);

    const { result } = renderSleepDay();

    await waitFor(() => expect(result.current.bedTime).not.toBeNull());
    expect(result.current.wakeUp).toBeNull();
    expect(result.current.naps).toEqual([]);
    expect(result.current.bedTime?.id).toBe('tonight');
  });

  test('a manually-entered session filed under its bedtime day surfaces as bedTime, not wakeUp', async () => {
    // Pins the known server attribution inconsistency: synced sessions are filed by wake
    // day, the manual path by bedtime day. If the server is ever reconciled, this fails
    // loudly rather than silently changing which card the entry lands on.
    const manual = buildSleepEntry({
      id: 'manual',
      entry_date: NEXT_DAY,
      source: 'manual',
      bedtime: '2026-08-24T22:30:00+00:00',
    });
    mockFetchSleepEntries.mockResolvedValue([manual]);

    const { result } = renderSleepDay();

    await waitFor(() => expect(result.current.bedTime).not.toBeNull());
    expect(result.current.bedTime?.id).toBe('manual');
    expect(result.current.wakeUp).toBeNull();
  });

  test('naps for D coexist with a D+1 bedTime in one render', async () => {
    mockFetchSleepEntries.mockResolvedValue([
      buildSleepEntry({ id: 'overnight', entry_date: DAY }),
      buildSleepEntry({
        id: 'nap',
        entry_date: DAY,
        duration_in_seconds: 1800,
        bedtime: '2026-08-23T14:00:00+00:00',
      }),
      buildSleepEntry({ id: 'tonight', entry_date: NEXT_DAY }),
    ]);

    const { result } = renderSleepDay();

    await waitFor(() => expect(result.current.wakeUp).not.toBeNull());
    expect(result.current.wakeUp?.id).toBe('overnight');
    expect(result.current.naps.map((n) => n.id)).toEqual(['nap']);
    expect(result.current.bedTime?.id).toBe('tonight');
  });

  test('a rejection surfaces isError with empty fields and no throw', async () => {
    mockFetchSleepEntries.mockRejectedValue(
      new Error('Network request failed')
    );

    const { result } = renderSleepDay();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.wakeUp).toBeNull();
    expect(result.current.bedTime).toBeNull();
    expect(result.current.naps).toEqual([]);
  });

  test('reports a 403 as isForbidden so the Diary can hide the cards outright', async () => {
    mockFetchSleepEntries.mockRejectedValue(
      new ApiError('Server error: 403 - Forbidden', 403, 'Forbidden')
    );

    const { result } = renderSleepDay();

    await waitFor(() => expect(result.current.isForbidden).toBe(true));
    expect(result.current.wakeUp).toBeNull();
    expect(result.current.naps).toEqual([]);
  });

  test('enabled: false makes no request', async () => {
    mockFetchSleepEntries.mockResolvedValue([]);

    renderSleepDay(DAY, { enabled: false });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockFetchSleepEntries).not.toHaveBeenCalled();
  });

  describe('query keys', () => {
    test('sleepDayQueryKey is the namespaced day tuple and varies by date', () => {
      expect(sleepDayQueryKey(DAY)).toEqual(['sleep', 'day', '2026-08-23']);
      expect(sleepDayQueryKey(NEXT_DAY)).not.toEqual(sleepDayQueryKey(DAY));
    });
  });
});

describe('classifySleepDay', () => {
  test('promotes the longest entry to main sleep and demotes the rest to naps', () => {
    const overnight = buildSleepEntry({
      id: 'overnight',
      duration_in_seconds: 28800,
    });
    const longNap = buildSleepEntry({
      id: 'long-nap',
      duration_in_seconds: 2700,
      bedtime: '2026-08-23T13:00:00+00:00',
    });
    const shortNap = buildSleepEntry({
      id: 'short-nap',
      duration_in_seconds: 1200,
      bedtime: '2026-08-23T17:00:00+00:00',
    });

    const result = classifySleepDay([longNap, shortNap, overnight], DAY);

    expect(result.mainSleep?.id).toBe('overnight');
    expect(result.naps.map((nap) => nap.id)).toEqual(['long-nap', 'short-nap']);
  });

  test('a lone entry is the main sleep with no naps', () => {
    const only = buildSleepEntry({ id: 'only' });

    expect(classifySleepDay([only], DAY)).toEqual({
      mainSleep: only,
      naps: [],
    });
  });

  test('an empty day yields no main sleep and no naps', () => {
    expect(() => classifySleepDay([], DAY)).not.toThrow();
    expect(classifySleepDay([], DAY)).toEqual({ mainSleep: null, naps: [] });
  });

  test('breaks a duration tie on the earlier bedtime, regardless of input order', () => {
    const earlier = buildSleepEntry({
      id: 'earlier',
      duration_in_seconds: 3600,
      bedtime: '2026-08-23T13:00:00+00:00',
    });
    const later = buildSleepEntry({
      id: 'later',
      duration_in_seconds: 3600,
      bedtime: '2026-08-23T15:00:00+00:00',
    });

    expect(classifySleepDay([earlier, later], DAY).mainSleep?.id).toBe(
      'earlier'
    );
    expect(classifySleepDay([later, earlier], DAY).mainSleep?.id).toBe(
      'earlier'
    );
  });

  test('excludes D+1 entries from day D', () => {
    const today = buildSleepEntry({ id: 'today', entry_date: DAY });
    const tomorrow = buildSleepEntry({
      id: 'tomorrow',
      entry_date: NEXT_DAY,
      duration_in_seconds: 36000,
    });

    const result = classifySleepDay([today, tomorrow], DAY);

    expect(result.mainSleep?.id).toBe('today');
    expect(
      [result.mainSleep, ...result.naps].some((e) => e?.entry_date === NEXT_DAY)
    ).toBe(false);
  });

  test('returns naps in chronological bedtime order', () => {
    const main = buildSleepEntry({ id: 'main', duration_in_seconds: 28800 });
    const evening = buildSleepEntry({
      id: 'evening',
      duration_in_seconds: 1800,
      bedtime: '2026-08-23T19:00:00+00:00',
    });
    const morning = buildSleepEntry({
      id: 'morning',
      duration_in_seconds: 1200,
      bedtime: '2026-08-23T09:00:00+00:00',
    });
    const afternoon = buildSleepEntry({
      id: 'afternoon',
      duration_in_seconds: 2400,
      bedtime: '2026-08-23T14:00:00+00:00',
    });

    const result = classifySleepDay([evening, main, morning, afternoon], DAY);

    expect(result.naps.map((nap) => nap.id)).toEqual([
      'morning',
      'afternoon',
      'evening',
    ]);
  });

  test('ranks on duration_in_seconds, not the nullable time_asleep_in_seconds', () => {
    // The nap slept longer than the overnight entry was asleep, but spent far less time
    // in bed. Ranking on time_asleep would wrongly promote it.
    const overnight = buildSleepEntry({
      id: 'overnight',
      duration_in_seconds: 28800,
      time_asleep_in_seconds: 1000,
    });
    const nap = buildSleepEntry({
      id: 'nap',
      duration_in_seconds: 3600,
      time_asleep_in_seconds: 3500,
      bedtime: '2026-08-23T14:00:00+00:00',
    });

    const result = classifySleepDay([overnight, nap], DAY);

    expect(result.mainSleep?.id).toBe('overnight');
    expect(result.naps.map((n) => n.id)).toEqual(['nap']);
  });

  test('classifies normally when every entry lacks time_asleep_in_seconds', () => {
    const longer = buildSleepEntry({
      id: 'longer',
      duration_in_seconds: 28800,
      time_asleep_in_seconds: null,
    });
    const shorter = buildSleepEntry({
      id: 'shorter',
      duration_in_seconds: 3600,
      time_asleep_in_seconds: null,
      bedtime: '2026-08-23T14:00:00+00:00',
    });

    const result = classifySleepDay([longer, shorter], DAY);

    expect(result.mainSleep?.id).toBe('longer');
    expect(result.naps.map((n) => n.id)).toEqual(['shorter']);
  });

  test('promotes the longer of two short naps on a nap-only day', () => {
    // Documented consequence of longest-wins: with no duration floor, a day of naps
    // still produces a "main sleep". Pinned so the behaviour is intentional.
    const first = buildSleepEntry({
      id: 'first',
      duration_in_seconds: 1800,
      bedtime: '2026-08-23T11:00:00+00:00',
    });
    const second = buildSleepEntry({
      id: 'second',
      duration_in_seconds: 1500,
      bedtime: '2026-08-23T16:00:00+00:00',
    });

    const result = classifySleepDay([first, second], DAY);

    expect(result.mainSleep?.id).toBe('first');
    expect(result.naps.map((n) => n.id)).toEqual(['second']);
  });

  test('does not mutate the caller’s array', () => {
    const entries = [
      buildSleepEntry({ id: 'a', duration_in_seconds: 1800 }),
      buildSleepEntry({ id: 'b', duration_in_seconds: 28800 }),
      buildSleepEntry({ id: 'c', duration_in_seconds: 3600 }),
    ];
    const snapshot = [...entries];

    classifySleepDay(entries, DAY);

    expect(entries).toEqual(snapshot);
    expect(entries.map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });
});
