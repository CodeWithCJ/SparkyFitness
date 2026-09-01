import { renderHook, waitFor, act } from '@testing-library/react-native';
import {
  useSleepRange,
  buildSleepTimelineSummary,
} from '../../src/hooks/useSleepRange';
import {
  sleepRangeQueryKey,
  measurementsRangeQueryKey,
} from '../../src/hooks/queryKeys';
import { fetchSleepEntries } from '../../src/services/api/sleepApi';
import { ApiError } from '../../src/services/api/errors';
import { getTodayDate, addDays } from '../../src/utils/dateUtils';
import { usePreferences } from '../../src/hooks/usePreferences';
import type { SleepEntry } from '../../src/types/sleep';
import { buildSleepEntry, buildStageEvent } from '../helpers/sleepFixtures';
import {
  createTestQueryClient,
  createQueryWrapper,
  type QueryClient,
} from './queryTestUtils';

jest.mock('../../src/services/api/sleepApi', () => ({
  fetchSleepEntries: jest.fn(),
}));

// The window ends on the account's today, not the device's, so preferences are part of
// this hook's input. Default to no timezone, which falls the hook back to device-local.
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: jest.fn(() => ({ preferences: undefined })),
}));

// Unlike the sibling measurements suite, the focus callback is captured rather than
// invoked on every render: `useRefetchOnFocus` throttles itself to one refetch per 30 s,
// so an auto-firing mock would consume the only refetch the focus case can observe.
const mockFocusCallbacks: (() => void)[] = [];

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn((callback: () => void) => {
    mockFocusCallbacks.push(callback);
  }),
}));

const mockFetchSleepEntries = fetchSleepEntries as jest.MockedFunction<
  typeof fetchSleepEntries
>;

const mockUsePreferences = usePreferences as jest.MockedFunction<
  typeof usePreferences
>;

const configureTimezone = (timezone: string | null | undefined) => {
  mockUsePreferences.mockReturnValue({
    preferences: { timezone },
  } as ReturnType<typeof usePreferences>);
};

/**
 * Today in `timezone`, derived independently of the hook's own helper. Assembled from
 * named parts rather than a locale that happens to order them YYYY-MM-DD.
 */
const todayIn = (timezone: string): string => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
};

/** A night on `day`, running 23:00 the previous evening to 07:00 that morning. */
const nightOn = (
  day: string,
  overrides: Partial<SleepEntry> = {}
): SleepEntry =>
  buildSleepEntry({
    id: `night-${day}`,
    entry_date: day,
    bedtime: `${addDays(day, -1)}T23:00:00.000Z`,
    wake_time: `${day}T07:00:00.000Z`,
    duration_in_seconds: 28800,
    time_asleep_in_seconds: 27000,
    ...overrides,
  });

const msOf = (iso: string): number => new Date(iso).getTime();

describe('useSleepRange', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFocusCallbacks.length = 0;
    queryClient = createTestQueryClient();
    configureTimezone(undefined);
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe('buildSleepTimelineSummary', () => {
    const DAY = '2026-06-10';

    test('plots one column per day in the window, oldest first', () => {
      const summary = buildSleepTimelineSummary([], DAY, 7);

      expect(summary.days.map((entry) => entry.day)).toEqual(
        Array.from({ length: 7 }, (_, index) => addDays(DAY, -(6 - index)))
      );
    });

    test('gives a day with no session an empty column rather than dropping it', () => {
      const summary = buildSleepTimelineSummary([nightOn(DAY)], DAY, 3);

      const [first, second, third] = summary.days;
      expect(first).toEqual({
        day: addDays(DAY, -2),
        timeInBedSeconds: 0,
        timeAsleepSeconds: null,
        segments: [],
        // No session, so no recording zone to take one from.
        zone: null,
      });
      expect(second.segments).toEqual([]);
      expect(third.timeInBedSeconds).toBe(28800);
      expect(summary.nightsWithData).toBe(1);
    });

    test('plots only the main sleep, dropping the day’s naps', () => {
      // A nap sits hours from the night on the shared clock axis; including it would
      // stretch that axis far enough to squash every real night in the window.
      const nap = buildSleepEntry({
        id: 'nap',
        entry_date: DAY,
        bedtime: `${DAY}T14:00:00.000Z`,
        wake_time: `${DAY}T14:30:00.000Z`,
        duration_in_seconds: 1800,
        time_asleep_in_seconds: 1800,
      });

      const summary = buildSleepTimelineSummary([nap, nightOn(DAY)], DAY, 1);

      expect(summary.days[0].timeInBedSeconds).toBe(28800);
      expect(summary.days[0].segments).toHaveLength(1);
      expect(summary.days[0].segments[0].startMs).toBe(
        msOf(`${addDays(DAY, -1)}T23:00:00.000Z`)
      );
    });

    test('collapses a source that reports no stages into one block', () => {
      const summary = buildSleepTimelineSummary([nightOn(DAY)], DAY, 1);

      expect(summary.days[0].segments).toEqual([
        {
          stage: 'other',
          startMs: msOf(`${addDays(DAY, -1)}T23:00:00.000Z`),
          endMs: msOf(`${DAY}T07:00:00.000Z`),
        },
      ]);
    });

    test('merges back-to-back events of the same stage into one block', () => {
      // Sources emit a fresh event per sampling interval, so an unbroken stretch of light
      // sleep arrives as dozens of adjacent events.
      const night = nightOn(DAY, {
        stage_events: [
          buildStageEvent({
            id: 's1',
            stage_type: 'light',
            start_time: `${DAY}T00:00:00.000Z`,
            end_time: `${DAY}T00:30:00.000Z`,
          }),
          buildStageEvent({
            id: 's2',
            stage_type: 'light',
            start_time: `${DAY}T00:30:00.000Z`,
            end_time: `${DAY}T01:00:00.000Z`,
          }),
          buildStageEvent({
            id: 's3',
            stage_type: 'deep',
            start_time: `${DAY}T01:00:00.000Z`,
            end_time: `${DAY}T02:00:00.000Z`,
          }),
        ],
      });

      const summary = buildSleepTimelineSummary([night], DAY, 1);

      expect(summary.days[0].segments).toEqual([
        {
          stage: 'light',
          startMs: msOf(`${DAY}T00:00:00.000Z`),
          endMs: msOf(`${DAY}T01:00:00.000Z`),
        },
        {
          stage: 'deep',
          startMs: msOf(`${DAY}T01:00:00.000Z`),
          endMs: msOf(`${DAY}T02:00:00.000Z`),
        },
      ]);
    });

    test('keeps a real gap in the night as a gap', () => {
      const night = nightOn(DAY, {
        stage_events: [
          buildStageEvent({
            id: 's1',
            stage_type: 'light',
            start_time: `${DAY}T00:00:00.000Z`,
            end_time: `${DAY}T00:30:00.000Z`,
          }),
          buildStageEvent({
            id: 's2',
            stage_type: 'light',
            start_time: `${DAY}T02:00:00.000Z`,
            end_time: `${DAY}T03:00:00.000Z`,
          }),
        ],
      });

      const summary = buildSleepTimelineSummary([night], DAY, 1);

      expect(summary.days[0].segments).toHaveLength(2);
    });

    test('averages time in bed and time asleep over different denominators', () => {
      // Time in bed is known for every session; time asleep is nullable, so averaging both
      // over the same days would drag the asleep figure down by every silent source.
      const reported = nightOn(DAY, {
        duration_in_seconds: 28800,
        time_asleep_in_seconds: 27000,
      });
      const silent = nightOn(addDays(DAY, -1), {
        duration_in_seconds: 21600,
        time_asleep_in_seconds: null,
      });

      const summary = buildSleepTimelineSummary([reported, silent], DAY, 2);

      expect(summary.averageTimeInBedSeconds).toBe((28800 + 21600) / 2);
      expect(summary.averageTimeAsleepSeconds).toBe(27000);
      expect(summary.nightsWithData).toBe(2);
    });

    test('reports null averages for a window with no sleep at all', () => {
      const summary = buildSleepTimelineSummary([], DAY, 7);

      expect(summary.averageTimeInBedSeconds).toBeNull();
      expect(summary.averageTimeAsleepSeconds).toBeNull();
      expect(summary.nightsWithData).toBe(0);
    });

    test('ignores sessions filed outside the requested window', () => {
      const summary = buildSleepTimelineSummary(
        [nightOn(addDays(DAY, 1)), nightOn(addDays(DAY, -100))],
        DAY,
        7
      );

      expect(summary.nightsWithData).toBe(0);
      expect(summary.days.every((entry) => entry.segments.length === 0)).toBe(
        true
      );
    });

    describe('record zones', () => {
      const dayIn = (
        summary: ReturnType<typeof buildSleepTimelineSummary>,
        day: string
      ) => summary.days.find((entry) => entry.day === day);

      test("carries the night's own recording zone onto its column", () => {
        const summary = buildSleepTimelineSummary(
          [nightOn(DAY, { record_timezone: 'Asia/Tokyo' })],
          DAY,
          7,
          'Europe/Berlin'
        );

        expect(dayIn(summary, DAY)?.zone).toEqual({
          kind: 'tz',
          tz: 'Asia/Tokyo',
        });
      });

      test('falls back to the profile timezone when the session recorded no zone', () => {
        const summary = buildSleepTimelineSummary(
          [nightOn(DAY)],
          DAY,
          7,
          'Europe/Berlin'
        );

        expect(dayIn(summary, DAY)?.zone).toEqual({
          kind: 'tz',
          tz: 'Europe/Berlin',
        });
      });

      test('gives each night its own zone, so a trip does not re-zone the window', () => {
        // The chart draws a fortnight on one axis; a night slept in Berlin and a night
        // slept in Tokyo each belong at the hour they were actually slept.
        const previous = addDays(DAY, -1);
        const summary = buildSleepTimelineSummary(
          [
            nightOn(DAY, { record_timezone: 'Europe/Berlin' }),
            nightOn(previous, { record_utc_offset_minutes: 540 }),
          ],
          DAY,
          7,
          'America/New_York'
        );

        expect(dayIn(summary, DAY)?.zone).toEqual({
          kind: 'tz',
          tz: 'Europe/Berlin',
        });
        expect(dayIn(summary, previous)?.zone).toEqual({
          kind: 'offset',
          minutes: 540,
        });
      });

      test('leaves the zone null when neither the record nor the profile has one', () => {
        const summary = buildSleepTimelineSummary([nightOn(DAY)], DAY, 7);

        expect(dayIn(summary, DAY)?.zone).toBeNull();
        // A day with no session has nothing to take a zone from either.
        expect(dayIn(summary, addDays(DAY, -1))?.zone).toBeNull();
      });
    });
  });

  describe('data transformation', () => {
    test('returns 7 / 30 / 90 columns for the matching range', async () => {
      mockFetchSleepEntries.mockResolvedValue([]);
      const wrapper = createQueryWrapper(queryClient);

      const seven = renderHook(() => useSleepRange({ range: '7d' }), {
        wrapper,
      });
      await waitFor(() => expect(seven.result.current.isLoading).toBe(false));
      expect(seven.result.current.sleep.days).toHaveLength(7);

      const thirty = renderHook(() => useSleepRange({ range: '30d' }), {
        wrapper,
      });
      await waitFor(() => expect(thirty.result.current.isLoading).toBe(false));
      expect(thirty.result.current.sleep.days).toHaveLength(30);

      const ninety = renderHook(() => useSleepRange({ range: '90d' }), {
        wrapper,
      });
      await waitFor(() => expect(ninety.result.current.isLoading).toBe(false));
      expect(ninety.result.current.sleep.days).toHaveLength(90);
    });

    test('maps the server’s sessions onto the window', async () => {
      const today = getTodayDate();
      mockFetchSleepEntries.mockResolvedValue([nightOn(today)]);

      const { result } = renderHook(() => useSleepRange({ range: '7d' }), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.sleep.days.at(-1)).toMatchObject({
        day: today,
        timeInBedSeconds: 28800,
        timeAsleepSeconds: 27000,
      });
      expect(result.current.sleep.nightsWithData).toBe(1);
    });

    test('returns an empty summary before the query resolves', async () => {
      let resolveFetch: (value: SleepEntry[]) => void = () => {};
      mockFetchSleepEntries.mockReturnValue(
        new Promise<SleepEntry[]>((resolve) => {
          resolveFetch = resolve;
        })
      );

      const { result } = renderHook(() => useSleepRange({ range: '7d' }), {
        wrapper: createQueryWrapper(queryClient),
      });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.sleep.days).toEqual([]);
      expect(result.current.sleep.nightsWithData).toBe(0);

      await act(async () => {
        resolveFetch([]);
      });
    });
  });

  describe('API calls', () => {
    test('requests the 7d window as [today-6, today]', async () => {
      mockFetchSleepEntries.mockResolvedValue([]);
      const today = getTodayDate();

      renderHook(() => useSleepRange({ range: '7d' }), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => {
        expect(mockFetchSleepEntries).toHaveBeenCalledWith(
          addDays(today, -6),
          today
        );
      });
    });

    test('requests the 30d and 90d windows', async () => {
      mockFetchSleepEntries.mockResolvedValue([]);
      const today = getTodayDate();
      const wrapper = createQueryWrapper(queryClient);

      renderHook(() => useSleepRange({ range: '30d' }), { wrapper });
      await waitFor(() => {
        expect(mockFetchSleepEntries).toHaveBeenCalledWith(
          addDays(today, -29),
          today
        );
      });

      renderHook(() => useSleepRange({ range: '90d' }), { wrapper });
      await waitFor(() => {
        expect(mockFetchSleepEntries).toHaveBeenCalledWith(
          addDays(today, -89),
          today
        );
      });
    });

    test("ends the window on the profile timezone's today, not the device's", async () => {
      mockFetchSleepEntries.mockResolvedValue([]);
      // Kiritimati is UTC+14 and Niue UTC-11, so on any given instant at most one of them
      // can agree with the runner's clock — whichever the device is in, the other proves
      // the hook read the timezone rather than the device.
      for (const timezone of ['Pacific/Kiritimati', 'Pacific/Niue']) {
        configureTimezone(timezone);
        const expectedToday = todayIn(timezone);

        const { result } = renderHook(() => useSleepRange({ range: '7d' }), {
          wrapper: createQueryWrapper(queryClient),
        });

        await waitFor(() => {
          expect(mockFetchSleepEntries).toHaveBeenCalledWith(
            addDays(expectedToday, -6),
            expectedToday
          );
        });
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        // The chart's last column is that same day.
        expect(result.current.sleep.days[6].day).toBe(expectedToday);
      }
    });

    test('falls back to device-local today when the profile timezone is unusable', async () => {
      mockFetchSleepEntries.mockResolvedValue([]);
      const today = getTodayDate();

      for (const timezone of [null, '', 'Not/AZone']) {
        configureTimezone(timezone);

        renderHook(() => useSleepRange({ range: '7d' }), {
          wrapper: createQueryWrapper(queryClient),
        });

        await waitFor(() => {
          expect(mockFetchSleepEntries).toHaveBeenCalledWith(
            addDays(today, -6),
            today
          );
        });
      }
    });
  });

  describe('options', () => {
    test('respects enabled=false', async () => {
      mockFetchSleepEntries.mockResolvedValue([]);

      renderHook(() => useSleepRange({ range: '7d', enabled: false }), {
        wrapper: createQueryWrapper(queryClient),
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockFetchSleepEntries).not.toHaveBeenCalled();
    });

    test('enabled defaults to true', async () => {
      mockFetchSleepEntries.mockResolvedValue([]);

      renderHook(() => useSleepRange({ range: '7d' }), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => expect(mockFetchSleepEntries).toHaveBeenCalled());
    });

    test('refetches on focus when enabled', async () => {
      mockFetchSleepEntries.mockResolvedValue([]);

      const enabled = renderHook(() => useSleepRange({ range: '7d' }), {
        wrapper: createQueryWrapper(queryClient),
      });
      await waitFor(() =>
        expect(mockFetchSleepEntries).toHaveBeenCalledTimes(1)
      );

      await act(async () => {
        mockFocusCallbacks[mockFocusCallbacks.length - 1]();
      });
      await waitFor(() =>
        expect(mockFetchSleepEntries).toHaveBeenCalledTimes(2)
      );
      enabled.unmount();

      // Disabled: focusing must not reach the network at all.
      jest.clearAllMocks();
      configureTimezone(undefined);
      mockFocusCallbacks.length = 0;
      const disabledClient = createTestQueryClient();

      renderHook(() => useSleepRange({ range: '7d', enabled: false }), {
        wrapper: createQueryWrapper(disabledClient),
      });
      await act(async () => {
        mockFocusCallbacks[mockFocusCallbacks.length - 1]();
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockFetchSleepEntries).not.toHaveBeenCalled();
      disabledClient.clear();
    });
  });

  describe('permissions and errors', () => {
    test('surfaces isError when the API rejects', async () => {
      mockFetchSleepEntries.mockRejectedValue(
        new Error('Network request failed')
      );

      const { result } = renderHook(() => useSleepRange({ range: '7d' }), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.sleep.days).toEqual([]);
    });

    test('treats a 403 as no data rather than an error', async () => {
      mockFetchSleepEntries.mockRejectedValue(
        new ApiError('Server error: 403 - Forbidden', 403, 'Forbidden')
      );

      const { result } = renderHook(() => useSleepRange({ range: '7d' }), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // A delegate holding `checkin` but not `reports` is refused only this request; the
      // pager should hide the sleep page rather than show an error state.
      expect(result.current.isError).toBe(false);
      expect(result.current.sleep.days).toEqual([]);
      expect(result.current.sleep.nightsWithData).toBe(0);
    });
  });

  describe('query key', () => {
    test('sleepRangeQueryKey returns the namespaced tuple', () => {
      expect(sleepRangeQueryKey('2026-06-01', '2026-06-07')).toEqual([
        'sleepRange',
        '2026-06-01',
        '2026-06-07',
      ]);
    });

    test('query key differs across range switches', () => {
      const today = '2026-06-30';
      const sevenDay = sleepRangeQueryKey(addDays(today, -6), today);
      const thirtyDay = sleepRangeQueryKey(addDays(today, -29), today);
      const ninetyDay = sleepRangeQueryKey(addDays(today, -89), today);

      expect(sevenDay).not.toEqual(thirtyDay);
      expect(thirtyDay).not.toEqual(ninetyDay);
      expect(sevenDay).not.toEqual(ninetyDay);

      // Identical dates must not collide with the measurements range cache entry.
      expect(sevenDay).not.toEqual(
        measurementsRangeQueryKey(addDays(today, -6), today)
      );
    });
  });
});
