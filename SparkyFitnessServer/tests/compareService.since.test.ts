import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addDays,
  CompareModeError,
  dayOfWeek,
  todayInZone,
  type CompareSinceQuery,
} from '@workspace/shared';
import compareRepository from '../models/compareRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import userRepository from '../models/userRepository.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import { getCompareSince } from '../services/compareService.js';

vi.mock('../models/compareRepository.js');
vi.mock('../models/reportRepository.js');
vi.mock('../models/preferenceRepository.js');
vi.mock('../models/userRepository.js');
vi.mock('../utils/timezoneLoader.js', () => ({ loadUserTimezone: vi.fn() }));
// Pin "today" without touching the clock: only the service's own call is replaced.
vi.mock('@workspace/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@workspace/shared')>()),
  todayInZone: vi.fn(),
}));

const USER = '00000000-0000-4000-a000-000000000001';
const TODAY = '2026-10-21'; // a Wednesday
const YESTERDAY = addDays(TODAY, -1);

const query = (extra: Partial<CompareSinceQuery> = {}): CompareSinceQuery => ({
  a: 'meditationMinutes',
  b: 'mood',
  mode: 'since',
  ...extra,
});

/** Every day from first to last inclusive. */
function daysFrom(first: string, last: string): string[] {
  const days: string[] = [];
  for (let day = first; day <= last; day = addDays(day, 1)) days.push(day);
  return days;
}

const meditationRow = (day: string) => ({ day, minutes: 10, sessions: 1 });
const moodRow = (day: string, mood: number) => ({
  day,
  mood,
  energy: null,
  focus: null,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(loadUserTimezone).mockResolvedValue('UTC');
  vi.mocked(todayInZone).mockReturnValue(TODAY);
  vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue(
    undefined
  );
  vi.mocked(userRepository.getUserProfile).mockResolvedValue(undefined);
  vi.mocked(compareRepository.getManualMoodDays).mockResolvedValue([]);
  vi.mocked(compareRepository.getMainSleepDays).mockResolvedValue([]);
  vi.mocked(compareRepository.getMeditationDays).mockResolvedValue([]);
  vi.mocked(compareRepository.getMeditationFirstDay).mockResolvedValue(null);
  vi.mocked(compareRepository.getCheckInDays).mockResolvedValue([]);
});

/** Meditation every day in from..to, and mood 5 before `start`, 8 from it. */
function seedHabit(
  from: string,
  to: string,
  start: string,
  outcomeFrom: string
) {
  vi.mocked(compareRepository.getMeditationFirstDay).mockResolvedValue(from);
  vi.mocked(compareRepository.getMeditationDays).mockImplementation(
    async (_user, f, t) =>
      daysFrom(from, to)
        .filter((d) => d >= f && d <= t && d >= start)
        .map(meditationRow)
  );
  vi.mocked(compareRepository.getManualMoodDays).mockImplementation(
    async (_user, f, t) =>
      daysFrom(outcomeFrom, to)
        .filter((d) => d >= f && d <= t)
        .map((d) => moodRow(d, d < start ? 5 : 8))
  );
}

describe('getCompareSince: validation', () => {
  it('rejects a habitStart that is today, before loading anything', async () => {
    await expect(
      getCompareSince(USER, query({ habitStart: TODAY }))
    ).rejects.toBeInstanceOf(CompareModeError);
    expect(compareRepository.getMeditationDays).not.toHaveBeenCalled();
    expect(compareRepository.getManualMoodDays).not.toHaveBeenCalled();
  });

  it('rejects a habitStart 731 days ago and accepts 730', async () => {
    await expect(
      getCompareSince(USER, query({ habitStart: addDays(TODAY, -731) }))
    ).rejects.toBeInstanceOf(CompareModeError);
    await expect(
      getCompareSince(USER, query({ habitStart: addDays(TODAY, -730) }))
    ).resolves.toMatchObject({ mode: 'since' });
  });
});

describe('getCompareSince: fetch range', () => {
  it('for a recent start, loads the outcome over 736 days back and the habit two weeks past the 730-day limit', async () => {
    await getCompareSince(USER, query({ habitStart: addDays(TODAY, -100) }));
    expect(compareRepository.getMeditationDays).toHaveBeenCalledWith(
      USER,
      addDays(TODAY, -744),
      YESTERDAY
    );
    expect(compareRepository.getManualMoodDays).toHaveBeenCalledWith(
      USER,
      addDays(TODAY, -736),
      YESTERDAY
    );
  });

  it('loads the outcome further back for a start 500 days ago; the habit stays at 744', async () => {
    const start = addDays(TODAY, -500);
    await getCompareSince(USER, query({ habitStart: start }));
    expect(compareRepository.getMeditationDays).toHaveBeenCalledWith(
      USER,
      addDays(TODAY, -744),
      YESTERDAY
    );
    expect(compareRepository.getManualMoodDays).toHaveBeenCalledWith(
      USER,
      addDays(start, -371),
      YESTERDAY
    );
  });

  it('without a start, loads the habit first and sizes the outcome from the suggestion', async () => {
    const start = addDays(TODAY, -600);
    seedHabit(addDays(TODAY, -736), YESTERDAY, start, addDays(TODAY, -736));
    const { result } = await getCompareSince(USER, query());
    expect(result.suggestedStart).not.toBeNull();
    expect(compareRepository.getManualMoodDays).toHaveBeenCalledWith(
      USER,
      addDays(result.suggestedStart ?? '', -371),
      YESTERDAY
    );
  });

  it('without a start or a suggestion, loads the outcome from 736 days back', async () => {
    await getCompareSince(USER, query());
    expect(compareRepository.getManualMoodDays).toHaveBeenCalledWith(
      USER,
      addDays(TODAY, -736),
      YESTERDAY
    );
  });
});

describe('getCompareSince: start and line', () => {
  const start = addDays(TODAY, -100);
  const from = addDays(TODAY, -736);

  it('uses the suggestion when no habitStart is given', async () => {
    seedHabit(from, YESTERDAY, start, addDays(TODAY, -300));
    const { result } = await getCompareSince(USER, query());
    expect(result.suggestedStart).not.toBeNull();
    expect(result.start).toBe(result.suggestedStart);
  });

  it('an explicit habitStart overrides the suggestion', async () => {
    seedHabit(from, YESTERDAY, start, addDays(TODAY, -300));
    const explicit = addDays(TODAY, -60);
    const { result } = await getCompareSince(
      USER,
      query({ habitStart: explicit })
    );
    expect(result.start).toBe(explicit);
    expect(result.suggestedStart).not.toBe(explicit);
  });

  it('passes line through', async () => {
    seedHabit(from, YESTERDAY, start, addDays(TODAY, -300));
    const { result } = await getCompareSince(USER, query({ line: 6.5 }));
    expect(result.line).toBe(6.5);
  });

  it('reads mood from the manual check-ins', async () => {
    await getCompareSince(USER, query({ habitStart: start }));
    expect(compareRepository.getManualMoodDays).toHaveBeenCalled();
  });

  it('never suggests a start older than 730 days (R10)', async () => {
    // A run whose records begin 736 days ago began before the limit, so it is not moved
    // inside it: there is no suggestion.
    const old = addDays(TODAY, -736);
    vi.mocked(compareRepository.getMeditationFirstDay).mockResolvedValue(old);
    vi.mocked(compareRepository.getMeditationDays).mockResolvedValue(
      daysFrom(old, addDays(old, 27)).map(meditationRow)
    );
    const { result } = await getCompareSince(USER, query());
    expect(result).toMatchObject({ reason: 'noStart', suggestedStart: null });
  });

  it('suggests a run whose records begin on the 730-day limit', async () => {
    const limit = addDays(TODAY, -730);
    seedHabit(limit, YESTERDAY, limit, addDays(TODAY, -736));
    const { result } = await getCompareSince(USER, query());
    expect(result.suggestedStart).toBe(limit);
  });

  it('gives no suggestion for a habit kept since before the limit', async () => {
    // Daily meditation for three years: the habit was already kept 730 days ago, so the
    // window's first run is no start, and no later week is one either.
    const longAgo = addDays(TODAY, -1095);
    seedHabit(longAgo, YESTERDAY, longAgo, addDays(TODAY, -736));
    const { result, habit, outcome } = await getCompareSince(USER, query());
    expect(result).toMatchObject({
      status: 'not_enough',
      reason: 'noStart',
      start: null,
      suggestedStart: null,
    });
    expect(habit.values).toEqual({});
    expect(outcome.values).toEqual({});
  });

  it('a 7-day session count as the habit gets no suggestion and no regularity', async () => {
    // One session every Monday: the 7-day count never drops to 0.
    const first = addDays(TODAY, -400);
    vi.mocked(compareRepository.getMeditationFirstDay).mockResolvedValue(first);
    vi.mocked(compareRepository.getMeditationDays).mockImplementation(
      async (_user, f, t) =>
        daysFrom(first, YESTERDAY)
          .filter((d) => d >= f && d <= t && dayOfWeek(d) === 1)
          .map(meditationRow)
    );
    vi.mocked(compareRepository.getManualMoodDays).mockImplementation(
      async (_user, f, t) =>
        daysFrom(first, YESTERDAY)
          .filter((d) => d >= f && d <= t)
          .map((d) => moodRow(d, 5 + (dayOfWeek(d) % 3)))
    );
    const habitQuery = query({ a: 'meditationSessions7d' });

    const suggested = await getCompareSince(USER, habitQuery);
    expect(Object.values(suggested.habit.values)).toEqual([]);
    expect(suggested.result.suggestedStart).toBeNull();

    const picked = await getCompareSince(USER, {
      ...habitQuery,
      habitStart: addDays(TODAY, -100),
    });
    expect(picked.result.status).toBe('ok');
    expect(picked.result).not.toHaveProperty('regularity');
    expect(Object.values(picked.habit.values).every((v) => v === 1)).toBe(true);
  });
});

describe('getCompareSince: response', () => {
  it('with no start, returns empty values', async () => {
    const response = await getCompareSince(USER, query());
    expect(response.mode).toBe('since');
    expect(response.result).toMatchObject({
      status: 'not_enough',
      reason: 'noStart',
      start: null,
    });
    expect(response.habit).toEqual({ key: 'meditationMinutes', values: {} });
    expect(response.outcome).toEqual({ key: 'mood', values: {} });
  });

  it('trims values to the before stretch start through yesterday', async () => {
    // 60 days since, so the before stretch is the 60 days before the start.
    const start = addDays(TODAY, -60);
    const from = addDays(TODAY, -736);
    seedHabit(from, YESTERDAY, start, addDays(TODAY, -300));
    const { result, habit, outcome } = await getCompareSince(
      USER,
      query({ habitStart: start })
    );
    const first = addDays(start, -60);
    expect(result.before?.days).toBeGreaterThan(0);
    expect(result.before?.from).toBe(first);
    for (const values of [outcome.values, habit.values]) {
      const days = Object.keys(values).sort();
      expect(days[0]).toBe(first);
      expect(days[days.length - 1]).toBe(YESTERDAY);
    }
  });

  it('with an empty before stretch, trims values from the since stretch start', async () => {
    // Mood records begin 3 days after the start, so nothing comes before it; the habit has
    // values (0) from long before.
    const start = addDays(TODAY, -60);
    seedHabit(addDays(TODAY, -736), YESTERDAY, start, addDays(start, 3));
    const { result, habit, outcome } = await getCompareSince(
      USER,
      query({ habitStart: start })
    );
    expect(result).toMatchObject({ status: 'not_enough', reason: 'fewBefore' });
    expect(result.before?.days).toBe(0);
    expect(result.since?.from).toBe(start);
    const habitDays = Object.keys(habit.values).sort();
    expect(habitDays[0]).toBe(start);
    expect(habitDays[habitDays.length - 1]).toBe(YESTERDAY);
    const outcomeDays = Object.keys(outcome.values).sort();
    expect(outcomeDays[0]).toBe(addDays(start, 3));
    expect(outcomeDays[outcomeDays.length - 1]).toBe(YESTERDAY);
  });
});
