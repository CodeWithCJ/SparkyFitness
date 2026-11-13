import { describe, expect, test } from 'vitest';
import {
  addDays,
  analyzeSince,
  compareSinceQuerySchema,
  biasCorrectedEffectiveNForMean,
  compareDays,
  dayOfWeek,
  daysBetween,
  daysInRange,
  mean,
  olsSlope,
  percentile,
  suggestedHabitStart,
  tCritical95,
  welch,
  type CompareMetricKey,
  type CompareSinceResult,
  type DaySeries,
} from '@workspace/shared';
import { mulberry32, normal } from './helpers/seededRandom.js';

const TODAY = '2026-09-01'; // a Tuesday
const YESTERDAY = addDays(TODAY, -1);
const START = '2026-05-04'; // a Monday; START..YESTERDAY is 120 days
const BEFORE_FROM = addDays(START, -120);
const EARLIEST = addDays(TODAY, -730); // the oldest start allowed, a Sunday

/** A series on the days from..to; `f` gets the day's index from `from` and the day, and undefined leaves the day out. */
function series(
  from: string,
  to: string,
  f: (i: number, day: string) => number | undefined
): DaySeries {
  const out: DaySeries = {};
  daysInRange(from, to).forEach((day, i) => {
    const value = f(i, day);
    if (value !== undefined) out[day] = value;
  });
  return out;
}

/** A habit that is `on` on the given days and 0 on every other day from..to, as an event metric is filled. */
function habitOn(
  active: readonly string[],
  from: string,
  to: string,
  on = 1
): DaySeries {
  return series(from, to, (_, day) => (active.includes(day) ? on : 0));
}

/** The first `count` days of each week, the weeks starting at `firstWeek` a week apart. */
function firstDaysOfWeeks(firstWeek: string, counts: readonly number[]) {
  return counts.flatMap((count, week) =>
    Array.from({ length: count }, (_, i) => addDays(firstWeek, 7 * week + i))
  );
}

/** The series' values on from..to, in day order. */
function valuesIn(values: DaySeries, from: string, to: string): number[] {
  return daysInRange(from, to).flatMap((day) =>
    values[day] === undefined ? [] : [values[day]]
  );
}

/** Every number anywhere in a result, to show none is NaN or infinite. */
function numbersIn(value: unknown): number[] {
  if (typeof value === 'number') return [value];
  if (value !== null && typeof value === 'object') {
    return Object.values(value).flatMap(numbersIn);
  }
  return [];
}

/** analyzeSince on TODAY with Monday weeks and, unless given, a habit with no records. */
function since(input: {
  outcome: { key: CompareMetricKey; values: DaySeries };
  start: string | null;
  habit?: { key: CompareMetricKey; values: DaySeries };
  line?: number;
  firstDayOfWeek?: number;
}): CompareSinceResult {
  return analyzeSince({
    habit: input.habit ?? { key: 'meditated', values: {} },
    outcome: input.outcome,
    start: input.start,
    line: input.line ?? null,
    today: TODAY,
    firstDayOfWeek: input.firstDayOfWeek ?? 1,
  });
}

/** Noisy daily values from `from` to YESTERDAY, `shift` added from START on. */
function stepAtStart(
  from: string,
  seed: number,
  shift: number,
  base = 70,
  sd = 4
): DaySeries {
  const noise = normal(seed);
  return series(from, YESTERDAY, (_, day) => {
    const after = compareDays(day, START) >= 0 ? shift : 0;
    return base + after + sd * noise();
  });
}

describe('compare since: suggested start', () => {
  test('is the first active day of the earliest run of 3 weeks with at least 4 active days', () => {
    // Monday weeks: 05-18 qualifies alone; 05-25 has 1 day; the run is 06-01, 06-08, 06-15,
    // and its first week's active days begin on Wednesday 06-03.
    const active = [
      ...firstDaysOfWeeks('2026-05-18', [4, 1]),
      '2026-06-03',
      '2026-06-04',
      '2026-06-05',
      '2026-06-06',
      ...firstDaysOfWeeks('2026-06-08', [4, 5]),
    ];
    const habit = habitOn(active, '2026-05-18', YESTERDAY, 30);

    expect(suggestedHabitStart(habit, 'workoutMinutes', 1, EARLIEST)).toBe(
      '2026-06-03'
    );
  });

  test("follows the person's first day of the week", () => {
    // Thursday to Sunday, then Monday to Thursday for three weeks. Monday weeks: 4, 4, 4, 4.
    // Sunday weeks: 3 (Thu to Sat), then 5 (Sun to Thu), 4, 4.
    const active = [
      '2026-06-04',
      '2026-06-05',
      '2026-06-06',
      '2026-06-07',
      ...firstDaysOfWeeks('2026-06-08', [4, 4, 4]),
    ];
    const habit = habitOn(active, '2026-06-01', YESTERDAY);

    expect(suggestedHabitStart(habit, 'meditated', 1, EARLIEST)).toBe(
      '2026-06-04'
    );
    expect(suggestedHabitStart(habit, 'meditated', 0, EARLIEST)).toBe(
      '2026-06-07'
    );
  });

  test('two qualifying weeks in a row are not a run', () => {
    const active = firstDaysOfWeeks('2026-06-01', [4, 4, 3, 4, 4, 0, 7, 7]);
    const habit = habitOn(active, '2026-06-01', YESTERDAY, 20);

    expect(suggestedHabitStart(habit, 'cardioMinutes', 1, EARLIEST)).toBeNull();
  });

  test.each<CompareMetricKey>(['steps', 'weightTrend', 'alcohol'])(
    'is never offered for %s, which is not an event or a yes/no',
    (key) => {
      const habit = series('2026-03-01', YESTERDAY, () => 8000);
      expect(suggestedHabitStart(habit, key, 1, EARLIEST)).toBeNull();
    }
  );

  test('analyzeSince uses the suggestion when no start is given', () => {
    const habit = habitOn(daysInRange(START, YESTERDAY), START, YESTERDAY);
    const result = since({
      habit: { key: 'meditated', values: habit },
      outcome: { key: 'sleepScore', values: stepAtStart(BEFORE_FROM, 1, 0) },
      start: null,
    });

    expect(result.suggestedStart).toBe(START);
    expect(result.start).toBe(START);
    expect(result.status).toBe('ok');
  });

  test('an explicit start overrides the suggestion, which is still reported', () => {
    const habit = habitOn(daysInRange(START, YESTERDAY), START, YESTERDAY);
    const picked = addDays(START, 10);
    const result = since({
      habit: { key: 'meditated', values: habit },
      outcome: { key: 'sleepScore', values: stepAtStart(BEFORE_FROM, 1, 0) },
      start: picked,
    });

    expect(result.suggestedStart).toBe(START);
    expect(result.start).toBe(picked);
    expect(result.since?.from).toBe(picked);
  });

  test('today never counts toward the suggestion', () => {
    // Saturday weeks: 08-15 and 08-22 qualify; 08-29 has Saturday to Monday before today, and
    // only today makes it a fourth day.
    const active = [
      ...firstDaysOfWeeks('2026-08-15', [4, 4]),
      '2026-08-29',
      '2026-08-30',
      '2026-08-31',
      TODAY,
    ];
    const habit = habitOn(active, '2026-08-15', TODAY);
    expect(suggestedHabitStart(habit, 'meditated', 6, EARLIEST)).toBe(
      '2026-08-15'
    );

    const result = since({
      habit: { key: 'meditated', values: habit },
      outcome: { key: 'mood', values: stepAtStart(BEFORE_FROM, 2, 0) },
      start: null,
      firstDayOfWeek: 6,
    });
    expect(result.suggestedStart).toBeNull();
    expect(result.reason).toBe('noStart');
  });
});

describe('compare since: suggested start at the 730-day limit', () => {
  // Monday weeks: the limit, Sunday 2024-09-01, ends the week of Monday 2024-08-26.
  const OUTCOME = stepAtStart(addDays(EARLIEST, -400), 40, 0);

  test('a habit already kept at the limit gets no suggestion', () => {
    const from = addDays(EARLIEST, -400);
    const habit = habitOn(daysInRange(from, YESTERDAY), from, YESTERDAY);

    expect(suggestedHabitStart(habit, 'meditated', 1, EARLIEST)).toBeNull();
    // analyzeSince holds the suggestion to the limit itself.
    const result = since({
      habit: { key: 'meditated', values: habit },
      outcome: { key: 'mood', values: OUTCOME },
      start: null,
    });
    expect(result).toMatchObject({
      status: 'not_enough',
      reason: 'noStart',
      suggestedStart: null,
    });
  });

  test('nor does a later run once the habit was kept at the limit', () => {
    // Kept from before the limit, 4 weeks off, then kept again.
    const lapse = addDays(EARLIEST, 99);
    const back = addDays(lapse, 28);
    const from = addDays(EARLIEST, -60);
    const active = [
      ...daysInRange(from, addDays(lapse, -1)),
      ...daysInRange(back, YESTERDAY),
    ];
    const habit = habitOn(active, from, YESTERDAY, 30);

    expect(
      suggestedHabitStart(habit, 'workoutMinutes', 1, EARLIEST)
    ).toBeNull();
  });

  test('a run that began just before the limit is not suggested', () => {
    // Every day from Thursday 2024-08-29, three days before the limit: the run's first
    // week holds the limit, but its first active day is older than a start may be.
    const from = addDays(EARLIEST, -3);
    const habit = habitOn(daysInRange(from, YESTERDAY), from, YESTERDAY);

    expect(suggestedHabitStart(habit, 'meditated', 1, EARLIEST)).toBeNull();
  });

  test('a run after a week that was not kept is suggested, though there are records before the limit', () => {
    // Weekends only (2 days a week) from before the limit, then every day from Wednesday
    // 2025-03-05: its week has Wednesday to Sunday, the week before only the weekend.
    const from = addDays(EARLIEST, -60);
    const run = '2025-03-05';
    const weekends = daysInRange(from, YESTERDAY).filter((day) =>
      [0, 6].includes(dayOfWeek(day))
    );
    const active = [...weekends, ...daysInRange(run, YESTERDAY)];
    const habit = habitOn(active, from, YESTERDAY);

    expect(suggestedHabitStart(habit, 'meditated', 1, EARLIEST)).toBe(run);
    const result = since({
      habit: { key: 'meditated', values: habit },
      outcome: { key: 'mood', values: OUTCOME },
      start: null,
    });
    expect(result.suggestedStart).toBe(run);
    expect(result.start).toBe(run);
  });

  test('a run at the very first record is suggested', () => {
    // Records begin on Thursday 2024-09-05, mid-week: nothing before it at all.
    const first = addDays(EARLIEST, 4);
    const habit = habitOn(daysInRange(first, YESTERDAY), first, YESTERDAY);

    expect(suggestedHabitStart(habit, 'meditated', 1, EARLIEST)).toBe(first);
  });

  test('a run whose records begin on the limit is suggested there', () => {
    // Sunday weeks start on the limit itself.
    const habit = habitOn(
      daysInRange(EARLIEST, YESTERDAY),
      EARLIEST,
      YESTERDAY
    );

    expect(suggestedHabitStart(habit, 'meditated', 0, EARLIEST)).toBe(EARLIEST);
  });
});

describe('compare since: rolling metrics', () => {
  /**
   * One session every Monday from Monday `from`, as the 7-day count the server builds: the
   * 7 days ending on any day hold exactly one Monday, so the count is 1 every day.
   */
  function weeklySessionCount(from: string): DaySeries {
    expect(dayOfWeek(from)).toBe(1);
    return series(from, YESTERDAY, () => 1);
  }

  test('a 7-day session count gets no suggested start', () => {
    const habit = weeklySessionCount('2026-01-05');
    expect(Object.values(habit).every((v) => v > 0)).toBe(true);

    expect(
      suggestedHabitStart(habit, 'meditationSessions7d', 1, EARLIEST)
    ).toBeNull();
    expect(
      since({
        habit: { key: 'meditationSessions7d', values: habit },
        outcome: { key: 'mood', values: stepAtStart(BEFORE_FROM, 41, 0) },
        start: null,
      }).reason
    ).toBe('noStart');
  });

  test('a 7-day session count gets no regularity from a picked start', () => {
    const result = since({
      habit: {
        key: 'meditationSessions7d',
        values: weeklySessionCount('2026-01-05'),
      },
      outcome: { key: 'mood', values: stepAtStart(BEFORE_FROM, 42, 0) },
      start: START,
    });

    expect(result.status).toBe('ok');
    expect(result).not.toHaveProperty('regularity');
  });
});

describe('compare since: analysis', () => {
  test('a clear step at the start reads as a change of about the step', () => {
    const outcome = stepAtStart(addDays(BEFORE_FROM, -30), 3, 8);
    outcome[TODAY] = 1000; // today is never data
    const result = since({
      outcome: { key: 'sleepScore', values: outcome },
      start: START,
    });

    expect(result.status).toBe('ok');
    expect(result.since).toMatchObject({
      from: START,
      to: YESTERDAY,
      days: 120,
      valueDays: 120,
    });
    // The same number of days immediately before the start, though there are earlier ones.
    expect(result.before).toMatchObject({
      from: BEFORE_FROM,
      to: addDays(START, -1),
      days: 120,
      valueDays: 120,
    });
    expect(result.changed).toBe(true);
    expect(result.diff).toBeGreaterThan(6.5);
    expect(result.diff).toBeLessThan(9.5);
    expect(result.low).toBeGreaterThan(0);
    expect(result.alreadyChanging).toBe(false);
  });

  test("the difference, range and p are Welch's with each stretch's own effective n, and each stretch is summarized", () => {
    // AR(0.7) days, so a stretch's effective n is well below its day count.
    const noise = normal(4);
    let level = noise() / Math.sqrt(1 - 0.7 ** 2);
    const outcome = series(BEFORE_FROM, YESTERDAY, (_, day) => {
      level = 0.7 * level + noise();
      return 60 + 5 * level + (compareDays(day, START) >= 0 ? 4 : 0);
    });
    const result = since({
      outcome: { key: 'restingHeartRate', values: outcome },
      start: START,
      line: 62,
    });

    const before = valuesIn(outcome, BEFORE_FROM, addDays(START, -1));
    const after = valuesIn(outcome, START, YESTERDAY);
    const nEffBefore = biasCorrectedEffectiveNForMean(before, 14);
    const nEffAfter = biasCorrectedEffectiveNForMean(after, 14);
    expect(nEffBefore).toBeLessThan(before.length / 2);
    expect(nEffAfter).toBeLessThan(after.length / 2);
    const expected = welch(after, before, nEffAfter, nEffBefore);
    const naive = welch(after, before, after.length, before.length);
    expect(naive.p).not.toBeCloseTo(expected.p, 6);

    expect(result.status).toBe('ok');
    expect(result.diff).toBeCloseTo(mean(after) - mean(before), 9);
    expect(result.diff).toBeCloseTo(expected.diff, 9);
    expect(result.low).toBeCloseTo(expected.low, 9);
    expect(result.high).toBeCloseTo(expected.high, 9);
    expect(result.p).toBeCloseTo(expected.p, 9);
    expect(result.changed).toBe(
      expected.p < 0.05 && (expected.low > 0 || expected.high < 0)
    );
    expect(result.line).toBe(62);
    for (const [stretch, values] of [
      [result.before, before],
      [result.since, after],
    ] as const) {
      expect(stretch?.mean).toBeCloseTo(mean(values), 9);
      expect(stretch?.p10).toBeCloseTo(percentile(values, 0.1) ?? NaN, 9);
      expect(stretch?.p90).toBeCloseTo(percentile(values, 0.9) ?? NaN, 9);
      expect(stretch?.shareAtOrAbove).toBeCloseTo(
        values.filter((v) => v >= 62).length / values.length,
        9
      );
    }
  });

  test('an outcome already trending the same way warns that it was already changing', () => {
    const noise = normal(5);
    const outcome = series(BEFORE_FROM, YESTERDAY, (i, day) => {
      const after = compareDays(day, START) >= 0 ? 8 : 0;
      return 60 + 0.05 * i + after + 2 * noise();
    });
    const result = since({
      outcome: { key: 'sleepScore', values: outcome },
      start: START,
    });

    expect(result.changed).toBe(true);
    expect(result.diff).toBeGreaterThan(0);
    expect(result.alreadyChanging).toBe(true);
  });

  test('a trend running the other way gives no warning', () => {
    const noise = normal(6);
    const outcome = series(BEFORE_FROM, YESTERDAY, (i, day) => {
      const after = compareDays(day, START) >= 0 ? 20 : 0;
      return 60 - 0.05 * i + after + 2 * noise();
    });
    const result = since({
      outcome: { key: 'sleepScore', values: outcome },
      start: START,
    });

    expect(result.changed).toBe(true);
    expect(result.diff).toBeGreaterThan(0);
    expect(result.alreadyChanging).toBe(false);
  });

  test("the trend's range allows for days that carry over", () => {
    // A slow wave: the plain OLS range says it was falling, but its residuals are one long
    // swing, worth about 2.5 independent days, so the scaled range takes in 0.
    const wave = (i: number) => 10 * Math.sin((2 * Math.PI * i) / 120);
    const outcome = series(BEFORE_FROM, YESTERDAY, (i, day) =>
      compareDays(day, START) >= 0 ? 40 + wave(i) : 50 + wave(i)
    );
    const before = valuesIn(outcome, BEFORE_FROM, addDays(START, -1));
    const plain = olsSlope(
      before.map((_, i) => i),
      before
    );
    expect(plain).not.toBeNull();
    const { slope, se, n } = plain ?? { slope: 0, se: 0, n: 0 };
    expect(slope).toBeLessThan(0);
    expect(slope + tCritical95(n - 2) * se).toBeLessThan(0);

    const result = since({
      outcome: { key: 'sleepScore', values: outcome },
      start: START,
    });
    expect(result.status).toBe('ok');
    expect(result.diff).toBeLessThan(0);
    expect(result.alreadyChanging).toBe(false);
  });

  test('a before stretch shorter than the since stretch uses all the earlier data', () => {
    const outcome = stepAtStart(addDays(START, -40), 7, 0);
    const result = since({
      outcome: { key: 'timeAsleep', values: outcome },
      start: START,
    });

    expect(result.status).toBe('ok');
    expect(result.before).toMatchObject({
      from: addDays(START, -40),
      to: addDays(START, -1),
      days: 40,
      valueDays: 40,
    });
    expect(result.since).toMatchObject({ days: 120, valueDays: 120 });
  });

  test('a since stretch over 365 days uses the most recent 365, and the before stretch the 365 days before the start', () => {
    const start = addDays(YESTERDAY, -399); // 400 days since
    const outcome = stepAtStart(addDays(start, -500), 8, 0);
    const result = since({
      outcome: { key: 'steps', values: outcome },
      start,
    });

    expect(result.status).toBe('ok');
    expect(result.start).toBe(start);
    expect(result.since).toMatchObject({
      from: addDays(YESTERDAY, -364),
      to: YESTERDAY,
      days: 365,
      valueDays: 365,
    });
    expect(result.before).toMatchObject({
      from: addDays(start, -365),
      to: addDays(start, -1),
      days: 365,
      valueDays: 365,
    });
  });

  test('regularity counts the whole weeks since the start with at least 4 active days', () => {
    // Since Wednesday 06-03: the partial first week (1 active day) and the partial last week
    // (Monday 08-31, active) are left out, so 12 Monday weeks from 06-08 to 08-24 count.
    const start = '2026-06-03';
    const counts = [4, 5, 3, 7, 0, 4, 6, 2, 4, 4, 1, 7];
    const active = [
      start,
      ...firstDaysOfWeeks('2026-06-08', counts),
      YESTERDAY,
    ];
    const result = since({
      habit: {
        key: 'meditated',
        values: habitOn(active, '2026-01-01', YESTERDAY),
      },
      outcome: { key: 'mood', values: stepAtStart('2026-01-01', 9, 0) },
      start,
    });

    expect(result.status).toBe('ok');
    expect(result.regularity).toEqual({ weeksKept: 8, weeks: 12 });
  });
});

describe('compare since: not enough', () => {
  test('a start near today is not enough since, with the counts and no statistics', () => {
    const start = addDays(YESTERDAY, -9);
    const result = since({
      outcome: { key: 'mood', values: stepAtStart(BEFORE_FROM, 10, 0) },
      start,
    });

    expect(result).toStrictEqual({
      status: 'not_enough',
      reason: 'fewSince',
      start,
      suggestedStart: null,
      before: {
        from: addDays(start, -10),
        to: addDays(start, -1),
        days: 10,
        valueDays: 10,
      },
      since: { from: start, to: YESTERDAY, days: 10, valueDays: 10 },
      line: 70,
    });
  });

  test.each([
    ['today', TODAY],
    ['after today', addDays(TODAY, 5)],
  ])('a start of %s is not enough since and never NaN', (_, start) => {
    const result = since({
      outcome: { key: 'steps', values: stepAtStart(BEFORE_FROM, 11, 0) },
      start,
    });

    expect(result.status).toBe('not_enough');
    expect(result.reason).toBe('fewSince');
    expect(result.since).toMatchObject({ days: 0, valueDays: 0 });
    expect(result.before).toMatchObject({ days: 0, valueDays: 0 });
    expect(numbersIn(result).every(Number.isFinite)).toBe(true);
  });

  test('a start near the first record is not enough before, with the counts and no statistics', () => {
    const outcome = stepAtStart(addDays(START, -20), 12, 0);
    const result = since({
      outcome: { key: 'mood', values: outcome },
      start: START,
    });

    expect(result).toStrictEqual({
      status: 'not_enough',
      reason: 'fewBefore',
      start: START,
      suggestedStart: null,
      before: {
        from: addDays(START, -20),
        to: addDays(START, -1),
        days: 20,
        valueDays: 20,
      },
      since: { from: START, to: YESTERDAY, days: 120, valueDays: 120 },
      line: 70,
    });
  });

  test('each stretch needs 28 days and 14 days with a value', () => {
    const noise = normal(13);
    const withBefore = (first: string, count: number) => {
      const outcome = stepAtStart(START, 14, 0);
      for (let k = 0; k < count; k++) {
        outcome[addDays(first, 2 * k)] = 70 + 4 * noise();
      }
      return since({ outcome: { key: 'mood', values: outcome }, start: START });
    };

    // 28 days with 14 values, every other day.
    const enough = withBefore(addDays(START, -28), 14);
    expect(enough.status).toBe('ok');
    expect(enough.before).toMatchObject({ days: 28, valueDays: 14 });

    const fewValues = withBefore(addDays(START, -28), 13);
    expect(fewValues.reason).toBe('fewBefore');
    expect(fewValues.before).toMatchObject({ days: 28, valueDays: 13 });

    const fewDays = withBefore(addDays(START, -27), 14);
    expect(fewDays.reason).toBe('fewBefore');
    expect(fewDays.before).toMatchObject({ days: 27, valueDays: 14 });

    // Since: 120 days, but a value only on the first 13 Mondays.
    const sparse = stepAtStart(BEFORE_FROM, 15, 0);
    for (const day of daysInRange(START, YESTERDAY)) {
      const index = daysBetween(START, day);
      if (index % 7 !== 0 || index >= 13 * 7) delete sparse[day];
    }
    const fewSince = since({
      outcome: { key: 'mood', values: sparse },
      start: START,
    });
    expect(fewSince.reason).toBe('fewSince');
    expect(fewSince.since).toMatchObject({ days: 120, valueDays: 13 });
  });

  test('when both stretches fall short, not enough since wins', () => {
    const start = addDays(YESTERDAY, -9);
    const outcome = stepAtStart(addDays(start, -5), 16, 0);
    const result = since({ outcome: { key: 'mood', values: outcome }, start });

    expect(result.reason).toBe('fewSince');
    expect(result.before).toMatchObject({ days: 5, valueDays: 5 });
  });

  test('no start and no suggestion asks for a date, with no stretches', () => {
    // Twice a week: never a regular run.
    const active = firstDaysOfWeeks(
      '2026-01-05',
      Array.from({ length: 30 }, () => 2)
    );
    const habit = {
      key: 'workoutMinutes' as const,
      values: habitOn(active, '2026-01-05', YESTERDAY, 45),
    };
    const outcome = stepAtStart(BEFORE_FROM, 17, 0);

    expect(
      since({ habit, outcome: { key: 'mood', values: outcome }, start: null })
    ).toStrictEqual({
      status: 'not_enough',
      reason: 'noStart',
      start: null,
      suggestedStart: null,
      line: 70,
    });
    // With no stretch to take a percentile of, a line without a fixed default is 0.
    expect(
      since({ habit, outcome: { key: 'steps', values: outcome }, start: null })
        .line
    ).toBe(0);
  });

  test.each<CompareMetricKey>(['alcohol', 'steps'])(
    '%s as the habit gets no suggestion but works from a picked date, with no regularity',
    (key) => {
      const habit = series(BEFORE_FROM, YESTERDAY, (_, day) =>
        compareDays(day, START) >= 0 ? 0 : 30
      );
      const result = since({
        habit: { key, values: habit },
        outcome: { key: 'sleepScore', values: stepAtStart(BEFORE_FROM, 18, 6) },
        start: START,
      });

      expect(result.status).toBe('ok');
      expect(result.suggestedStart).toBeNull();
      expect(result.changed).toBe(true);
      expect(result).not.toHaveProperty('regularity');
    }
  );
});

describe('compare since: line', () => {
  test.each<[CompareMetricKey, number]>([
    ['mood', 70],
    ['energy', 4],
    ['focus', 4],
  ])('defaults to a fixed line for %s', (key, line) => {
    const result = since({
      outcome: { key, values: stepAtStart(BEFORE_FROM, 19, 0, 3, 1) },
      start: START,
    });
    expect(result.line).toBe(line);
  });

  test("defaults to the before stretch's 75th percentile otherwise", () => {
    const outcome = stepAtStart(BEFORE_FROM, 20, 1500, 8000, 2000);
    const result = since({
      outcome: { key: 'steps', values: outcome },
      start: START,
    });

    expect(result.line).toBeCloseTo(
      percentile(valuesIn(outcome, BEFORE_FROM, addDays(START, -1)), 0.75) ??
        NaN,
      9
    );
  });

  test("uses the since stretch's 75th percentile when the before stretch has no values", () => {
    const outcome = stepAtStart(START, 21, 0, 8000, 2000);
    const result = since({
      outcome: { key: 'steps', values: outcome },
      start: START,
    });

    expect(result.reason).toBe('fewBefore');
    expect(result.line).toBeCloseTo(
      percentile(valuesIn(outcome, START, YESTERDAY), 0.75) ?? NaN,
      9
    );
  });

  test('a given line is used as it is', () => {
    const result = since({
      outcome: { key: 'mood', values: stepAtStart(BEFORE_FROM, 22, 0) },
      start: START,
      line: 55,
    });
    expect(result.line).toBe(55);
  });
});

describe('compare since: false changes', () => {
  // Calibration (with the bias-corrected effective n): 8000 runs of this scenario on other seeds
  // (730000 up and 740000 up, 4000 each) read as changed 4.30% of the time (344 of 8000; 4.63% and
  // 3.98% for the two halves); these 400 seeded runs 4.50% (18 of 400). The bound is the plan's 8%,
  // about 3.5 points above that.
  test('an unchanged slow-moving outcome rarely reads as a change', () => {
    // 400 runs of 120 days before and 120 since: an AR(0.7) outcome with no change at the start.
    let answered = 0;
    let changed = 0;
    for (let trial = 0; trial < 400; trial++) {
      const noise = normal(30000 + trial);
      let level = noise() / Math.sqrt(1 - 0.7 ** 2);
      const outcome = series(BEFORE_FROM, YESTERDAY, () => {
        level = 0.7 * level + noise();
        return 60 + 10 * level;
      });
      const result = since({
        outcome: { key: 'sleepScore', values: outcome },
        start: START,
      });
      if (result.status !== 'ok') continue;
      answered++;
      if (result.changed) changed++;
    }

    expect(answered).toBe(400);
    expect(changed / answered).toBeLessThanOrEqual(0.08);
  });

  /** `runs` seeded AR(rho) outcomes with `days` (default 120) before the start and since it: how many answered, how many read as changed. `keep` thins the days. */
  function falseChangeRuns(
    runs: number,
    seedBase: number,
    rho: number,
    options: { keep?: number; step?: number; days?: number } = {}
  ) {
    const days = options.days ?? 120;
    const runStart = addDays(TODAY, -days);
    const runFrom = addDays(runStart, -days);
    let answered = 0;
    let changed = 0;
    for (let trial = 0; trial < runs; trial++) {
      const noise = normal(seedBase + trial);
      const kept = mulberry32(seedBase + 500000 + trial);
      let level = noise() / Math.sqrt(1 - rho ** 2);
      const outcome = series(runFrom, YESTERDAY, (_, day) => {
        level = rho * level + noise();
        if (options.keep !== undefined && kept() >= options.keep) {
          return undefined;
        }
        const after =
          compareDays(day, runStart) >= 0
            ? (options.step ?? 0) / Math.sqrt(1 - rho ** 2)
            : 0;
        return 60 + 10 * (level + after);
      });
      const result = since({
        outcome: { key: 'sleepScore', values: outcome },
        start: runStart,
      });
      if (result.status !== 'ok') continue;
      answered++;
      if (result.changed) changed++;
    }
    return { answered, changed };
  }

  // Calibration: 3000 runs of each scenario on other seeds read as changed 4.33% of the time at
  // AR(0.95) (130 of 3000) and 4.07% at AR(0.98) (122 of 3000); these 400 seeded runs 4.50%
  // (18 of 400) and 3.50% (14 of 400). Without the bias-corrected effective n the rates were
  // about 10.7% and 14.3%. The bound is 8%, as for AR(0.7) above.
  test.each([
    [0.95, 31000],
    [0.98, 32000],
  ])(
    'an unchanged very persistent outcome rarely reads as a change (AR %s)',
    (rho, seedBase) => {
      const { answered, changed } = falseChangeRuns(400, seedBase, rho);
      expect(answered).toBe(400);
      expect(changed / answered).toBeLessThanOrEqual(0.08);
    }
  );

  // Calibration: 3000 runs on other seeds, AR(0.95) with each day kept at random with probability
  // 0.6, read as changed 4.13% of the time (124 of 3000); these 400 seeded runs 4.75% (19 of 400).
  // The bound is 8%.
  test('an unchanged outcome logged on some days rarely reads as a change', () => {
    const { answered, changed } = falseChangeRuns(400, 33000, 0.95, {
      keep: 0.6,
    });
    expect(answered).toBe(400);
    expect(changed / answered).toBeLessThanOrEqual(0.08);
  });

  // Calibration: 3000 runs on other seeds caught the +1 SD step at AR(0.3) 99.97% of the time
  // (2999 of 3000); these 400 seeded runs 100% (400 of 400). The bound is 95%.
  test('a real step in a fast outcome is still caught', () => {
    const { answered, changed } = falseChangeRuns(400, 34000, 0.3, {
      step: 1,
    });
    expect(answered).toBe(400);
    expect(changed / answered).toBeGreaterThanOrEqual(0.95);
  });

  // Calibration: 6000 runs on other seeds (700000 up and 750000 up, 3000 each) caught the +1 SD step
  // at AR(0.7), the persistence of mood and sleep, 85.6% of the time (5137 of 6000; 85.2% and 86.0%
  // for the two halves, about 1.8 points of sampling spread per 400 runs). The bound is 75%, well
  // below that.
  test('a real step in a persistent outcome is still caught (AR 0.7)', () => {
    const { answered, changed } = falseChangeRuns(400, 35000, 0.7, {
      step: 1,
    });
    expect(answered).toBe(400);
    expect(changed / answered).toBeGreaterThanOrEqual(0.75);
  });

  // Calibration: on other seeds (710000 up, 4000 runs) AR(0.95) with 28 days before and since read
  // as changed 5.33% of the time (213 of 4000); with 365 days each side (720000 up, 3000 runs)
  // 4.83% (145 of 3000). The bound is 8% for both. The 365-day case runs fewer times because each
  // run is longer (the 3000-run calibration took 3.2 s).
  test.each([
    [28, 400, 36000],
    [365, 200, 37000],
  ])(
    'an unchanged very persistent outcome rarely reads as a change with %s days on each side',
    (days, runs, seedBase) => {
      const { answered, changed } = falseChangeRuns(runs, seedBase, 0.95, {
        days,
      });
      expect(answered).toBe(runs);
      expect(changed / answered).toBeLessThanOrEqual(0.08);
    }
  );
});

describe('compareSinceQuerySchema weight trend', () => {
  const MESSAGE =
    'weightTrend is not offered in since mode; it drifts too slowly to tell a change from its own wandering';

  test('rejects weightTrend as the habit or the outcome', () => {
    const asHabit = compareSinceQuerySchema.safeParse({
      a: 'weightTrend',
      b: 'mood',
      mode: 'since',
    });
    expect(asHabit.success).toBe(false);
    if (!asHabit.success) {
      expect(asHabit.error.issues).toHaveLength(1);
      expect(asHabit.error.issues[0]?.path).toEqual(['a']);
      expect(asHabit.error.issues[0]?.message).toBe(MESSAGE);
    }

    const asOutcome = compareSinceQuerySchema.safeParse({
      a: 'meditated',
      b: 'weightTrend',
      mode: 'since',
    });
    expect(asOutcome.success).toBe(false);
    if (!asOutcome.success) {
      expect(asOutcome.error.issues).toHaveLength(1);
      expect(asOutcome.error.issues[0]?.path).toEqual(['b']);
      expect(asOutcome.error.issues[0]?.message).toBe(MESSAGE);
    }
  });

  test('still takes the other metrics', () => {
    expect(
      compareSinceQuerySchema.safeParse({
        a: 'meditated',
        b: 'mood',
        mode: 'since',
      }).success
    ).toBe(true);
  });
});
