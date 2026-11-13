import { describe, expect, test } from 'vitest';
import {
  addDays,
  analyzeDays,
  analyzeWeeks,
  COMPARE_METRIC_KEYS,
  COMPARE_METRICS,
  CompareModeError,
  dayOfWeek,
  daySides,
  cautiousEffectiveN,
  correlationTest,
  deviationsFromOwnNormal,
  pearson,
  type CompareMetricDef,
  type DaySeries,
  welch,
  weeklySeries,
  weekSides,
} from '@workspace/shared';
import { mulberry32, normal } from './helpers/seededRandom.js';

const START = '2026-03-02';
const END = addDays(START, 59); // a 60-day window
const FIRST = addDays(START, -21); // history for the own normal

function daysFrom(first: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(first, i));
}

const WINDOW = daysFrom(START, 60);
const ALL_DAYS = daysFrom(FIRST, 83); // FIRST .. END + 1

/** A series over FIRST..END+1; `f` gets the day's index from FIRST and the day. */
function build(f: (i: number, day: string) => number | undefined): DaySeries {
  const out: DaySeries = {};
  ALL_DAYS.forEach((day, i) => {
    const value = f(i, day);
    if (value !== undefined) out[day] = value;
  });
  return out;
}

/** B's value on a day is A's value the day before, plus noise. */
function nextDayOf(a: DaySeries, noise: () => number): DaySeries {
  return build((_, day) => {
    const previous = a[addDays(day, -1)];
    return previous === undefined ? undefined : previous + noise();
  });
}

const isWeekend = (day: string) => [0, 6].includes(dayOfWeek(day));

describe('compare metric catalog', () => {
  test('metric catalog follows the kind, missing, weekly and rolling rules', () => {
    const keysWhere = (pick: (def: CompareMetricDef) => boolean) =>
      COMPARE_METRIC_KEYS.filter((key) => pick(COMPARE_METRICS[key]));

    for (const key of COMPARE_METRIC_KEYS) {
      expect(COMPARE_METRICS[key].key).toBe(key);
    }
    expect(keysWhere((m) => m.kind === 'ordinal')).toEqual(['energy', 'focus']);
    expect(keysWhere((m) => m.kind === 'binary')).toEqual(['meditated']);
    expect(keysWhere((m) => m.missing === 'event')).toEqual([
      'meditationMinutes',
      'meditationSessions7d',
      'meditated',
      'workoutMinutes',
      'cardioMinutes',
      'strengthVolume',
      'trainingLoad',
    ]);
    expect(keysWhere((m) => m.missing === 'food')).toEqual([
      'calories',
      'protein',
      'carbs',
      'fat',
      'caffeine',
      'alcohol',
    ]);
    expect(keysWhere((m) => m.weekly === 'sum')).toEqual([
      'meditationMinutes',
      'workoutMinutes',
      'cardioMinutes',
      'strengthVolume',
      'trainingLoad',
    ]);
    expect(keysWhere((m) => m.weekly === 'daysYes')).toEqual(['meditated']);
    expect(keysWhere((m) => m.weekly === null)).toEqual([
      'meditationSessions7d',
    ]);
    // Read over the 7 days ending on the day: the bedtime spread and the session count.
    expect(keysWhere((m) => m.rolling)).toEqual([
      'bedtimeConsistency',
      'meditationSessions7d',
    ]);
    expect(COMPARE_METRICS.bedtime.unit).toBe('min-after-18:00');
    expect(COMPARE_METRICS.mood.unit).toBe('10-100');
    expect(COMPARE_METRICS.caffeine.unit).toBe('mg');
  });
});

describe('compare day analysis', () => {
  test('deviationsFromOwnNormal subtracts the mean of the previous 14 days and drops days with fewer than 7', () => {
    const d = '2026-04-20';
    const series: DaySeries = { [addDays(d, -15)]: 100, [d]: 8 }; // d-15 is outside the window
    const prior = [1, 9, 2, 8, 3, 7, 4, 6, 5, 5]; // mean 5
    [-14, -13, -11, -10, -8, -7, -5, -4, -2, -1].forEach((offset, i) => {
      series[addDays(d, offset)] = prior[i];
    });

    const sparse = '2026-06-10'; // only 6 earlier values
    series[sparse] = 20;
    for (let i = 1; i <= 6; i++) series[addDays(sparse, -i)] = 4;

    const seven = '2026-08-10'; // exactly 7 earlier values
    series[seven] = 10;
    for (let i = 1; i <= 7; i++) series[addDays(seven, -2 * i)] = 4;

    const unlogged = '2026-09-01';

    expect(
      deviationsFromOwnNormal(series, [d, sparse, seven, unlogged])
    ).toEqual({ [d]: 3, [seven]: 6 });
  });

  test('analyzeDays is not_enough with n 0 when the two series share no days', () => {
    const noise = normal(1);
    const even = build((i) => (i % 2 === 0 ? 60 + 10 * noise() : undefined));
    const odd = build((i) => (i % 2 === 1 ? 70 + 5 * noise() : undefined));
    const expected = {
      status: 'not_enough',
      n: 0,
      needed: 14,
      reason: 'tooFew',
      checks: { ownNormal: true },
    };

    expect(
      analyzeDays({
        a: { key: 'mood', values: even },
        b: { key: 'sleepScore', values: odd },
        timing: 0,
        start: START,
        end: END,
      })
    ).toEqual(expected);
    expect(
      analyzeDays({
        a: { key: 'timeAsleep', values: {} },
        b: { key: 'mood', values: even },
        timing: 1,
        start: START,
        end: END,
      })
    ).toEqual(expected);
  });

  test('analyzeDays is not_enough when one side never varies', () => {
    const noise = normal(2);
    const mood = build(() => 60 + 10 * noise());
    const energy = build(() => 3);
    const meditated = build((i) => i % 2);

    expect(
      analyzeDays({
        a: { key: 'mood', values: mood },
        b: { key: 'energy', values: energy },
        timing: 0,
        start: START,
        end: END,
      })
    ).toEqual({
      status: 'not_enough',
      n: 60,
      needed: 14,
      reason: 'noVariation',
      checks: { ownNormal: true },
    });
    expect(
      analyzeDays({
        a: { key: 'meditated', values: meditated },
        b: { key: 'energy', values: energy },
        timing: 0,
        start: START,
        end: END,
      })
    ).toEqual({
      status: 'not_enough',
      n: 60,
      needed: 14,
      reason: 'noVariation',
      checks: { ownNormal: true },
    });
  });

  // 63.6 averaged over 10 values and over 11 rounds to different floats; skipping
  // every 4th day gives windows of both sizes.
  const constantWithGaps = () => build((i) => (i % 4 === 0 ? undefined : 63.6));

  test('a constant with gaps never varies on the correlation path', () => {
    const noise = normal(14);
    const caffeine = constantWithGaps();
    const mood = build(() => 60 + 10 * noise());

    expect(
      analyzeDays({
        a: { key: 'caffeine', values: caffeine },
        b: { key: 'mood', values: mood },
        timing: 1,
        start: START,
        end: END,
      })
    ).toEqual({
      status: 'not_enough',
      n: 45,
      needed: 14,
      reason: 'noVariation',
      checks: { ownNormal: true },
    });
    expect(
      Object.values(deviationsFromOwnNormal(caffeine, WINDOW)).every(
        (deviation) => deviation === 0
      )
    ).toBe(true);
  });

  test('a constant with gaps never varies on the yes/no path', () => {
    const meditated: DaySeries = {};
    WINDOW.forEach((day, i) => {
      meditated[day] = Math.floor(i / 3) % 2;
    });

    expect(
      analyzeDays({
        a: { key: 'meditated', values: meditated },
        b: { key: 'caffeine', values: constantWithGaps() },
        timing: 0,
        start: START,
        end: END,
      })
    ).toEqual({
      status: 'not_enough',
      n: 45,
      needed: 14,
      reason: 'noVariation',
      checks: { ownNormal: true },
    });
  });

  test('analyzeDays links two series that move together and says positive', () => {
    const noise = normal(3);
    const a = build(() => 60 + 10 * noise());
    const b = build((_, day) => a[day] + 2 * noise());

    const result = analyzeDays({
      a: { key: 'mood', values: a },
      b: { key: 'sleepScore', values: b },
      timing: 0,
      start: START,
      end: END,
    });

    expect(result).toMatchObject({
      status: 'ok',
      n: 60,
      method: 'pearson',
      linked: true,
      sign: 'positive',
      strength: 'strong',
    });
    expect(result.reason).toBeUndefined();
    expect(result.low).toBeGreaterThan(0);
    expect(result.checks.direction).toBeDefined();
    expect(result.checks.weekend).toBe('holds');
  });

  test('analyzeDays uses spearman when a side is ordinal', () => {
    const noise = normal(4);
    const mood = build(() => 60 + 10 * noise());
    const energy = build((_, day) =>
      Math.min(
        5,
        Math.max(1, Math.round(3 + (mood[day] - 60) / 10 + 0.5 * noise()))
      )
    );
    expect(new Set(WINDOW.map((day) => energy[day]))).toEqual(
      new Set([1, 2, 3, 4, 5])
    );

    const result = analyzeDays({
      a: { key: 'mood', values: mood },
      b: { key: 'energy', values: energy },
      timing: 0,
      start: START,
      end: END,
    });

    expect(result.status).toBe('ok');
    expect(result.method).toBe('spearman');
  });

  test('analyzeDays pairs B on the next day for timing 1', () => {
    const noise = normal(5);
    const a = build(() => 60 + 10 * noise());
    const b = nextDayOf(a, () => 2 * noise());
    const ask = (timing: -1 | 0 | 1) =>
      analyzeDays({
        a: { key: 'caffeine', values: a },
        b: { key: 'timeAsleep', values: b },
        timing,
        start: START,
        end: END,
      });

    expect(ask(1).linked).toBe(true);
    expect(ask(0).linked).toBe(false);
  });

  test('analyzeDays pairs B on the day before for timing -1', () => {
    const noise = normal(5);
    const first = build(() => 60 + 10 * noise());
    const second = nextDayOf(first, () => 2 * noise());
    const ask = (timing: -1 | 0 | 1) =>
      analyzeDays({
        a: { key: 'timeAsleep', values: second },
        b: { key: 'caffeine', values: first },
        timing,
        start: START,
        end: END,
      });

    expect(ask(-1).linked).toBe(true);
    expect(ask(0).linked).toBe(false);
    // The mirrored pairing for -1 is the second thing the day after: no link there.
    expect(ask(-1).checks.direction).toBe('firstComesFirst');
    expect(ask(0).checks.direction).toBeUndefined();
  });

  test('a shared slow drift is not a link once compared with the own normal', () => {
    const noise = normal(6);
    const a = build((i) => 40 + 0.5 * i + noise());
    const b = build((i) => 50 + 0.4 * i + noise());

    const rawR = pearson(
      WINDOW.map((day) => a[day]),
      WINDOW.map((day) => b[day])
    );
    expect(rawR).toBeGreaterThan(0.9);

    const result = analyzeDays({
      a: { key: 'weightTrend', values: a },
      b: { key: 'restingHeartRate', values: b },
      timing: 0,
      start: START,
      end: END,
    });
    expect(result.status).toBe('ok');
    expect(result.linked).toBe(false);
  });

  /** Meditated on `yesDays` of the 45 days from START, mood 8 higher on those days. */
  function meditationData(yesDays: number, seed: number) {
    const uniform = mulberry32(seed);
    const noise = normal(seed + 1);
    const window = daysFrom(START, 45);
    const shuffled = [...window];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(uniform() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const yes = new Set(shuffled.slice(0, yesDays));
    const meditated: DaySeries = {};
    for (const day of window) meditated[day] = yes.has(day) ? 1 : 0;
    const mood = build((_, day) => 60 + (yes.has(day) ? 8 : 0) + 3 * noise());
    return { meditated, mood, end: window[window.length - 1] };
  }

  test('binary side compares averages', () => {
    const { meditated, mood, end } = meditationData(20, 7);

    const result = analyzeDays({
      a: { key: 'meditated', values: meditated },
      b: { key: 'mood', values: mood },
      timing: 0,
      start: START,
      end,
    });

    expect(result).toMatchObject({
      status: 'ok',
      n: 45,
      method: 'difference',
      linked: true,
      sign: 'positive',
      binary: { yesKey: 'meditated', yesCount: 20, noCount: 25 },
    });
    expect(result.r).toBeUndefined();
    expect(result.strength).toBeUndefined();
    expect(result.reason).toBeUndefined();
    expect(result.low).toBeGreaterThan(0);
    // The bars show raw mood on each kind of day: about 8 apart.
    const gap = result.binary
      ? result.binary.yesMean - result.binary.noMean
      : NaN;
    expect(gap).toBeGreaterThan(6);
    expect(gap).toBeLessThan(10);
  });

  test('a yes/no Yes gets the same checks as a correlation', () => {
    const { meditated, mood, end } = meditationData(20, 8);

    const result = analyzeDays({
      a: { key: 'meditated', values: meditated },
      b: { key: 'mood', values: mood },
      timing: 0,
      start: START,
      end,
    });

    expect(result.linked).toBe(true);
    // Meditation on random days, mood higher that same day only: neither leads the other.
    expect(result.checks).toEqual({
      ownNormal: true,
      direction: 'cantTell',
      weekend: 'holds',
    });
  });

  test('a yes/no Yes that only weekends explain is flagged', () => {
    const uniform = mulberry32(20);
    const noise = normal(21);
    // Meditates mostly on weekends and mood is higher on weekends; meditating itself does nothing.
    const meditated = build((_, day) =>
      uniform() < (isWeekend(day) ? 0.85 : 0.15) ? 1 : 0
    );
    const mood = build((_, day) => 60 + (isWeekend(day) ? 6 : 0) + 5 * noise());

    const result = analyzeDays({
      a: { key: 'meditated', values: meditated },
      b: { key: 'mood', values: mood },
      timing: 0,
      start: START,
      end: END,
    });

    expect(result).toMatchObject({ method: 'difference', linked: true });
    expect(result.checks.weekend).toBe('mayBeWeekends');
  });

  test('binary side says too few yes days when the yes group is under 5', () => {
    const { meditated, mood, end } = meditationData(4, 8);

    expect(
      analyzeDays({
        a: { key: 'mood', values: mood },
        b: { key: 'meditated', values: meditated },
        timing: 0,
        start: START,
        end,
      })
    ).toEqual({
      status: 'not_enough',
      n: 4,
      needed: 5,
      reason: 'fewYes',
      checks: { ownNormal: true },
    });
  });

  test('binary side says too few no days when the no group is under 5', () => {
    const { meditated, mood, end } = meditationData(42, 8);

    expect(
      analyzeDays({
        a: { key: 'meditated', values: meditated },
        b: { key: 'mood', values: mood },
        timing: 0,
        start: START,
        end,
      })
    ).toEqual({
      status: 'not_enough',
      n: 3,
      needed: 5,
      reason: 'fewNo',
      checks: { ownNormal: true },
    });
  });

  test('binary side counts independent days over the whole run, then shares them out by group size', () => {
    const noise = normal(13);
    // Mood moves in slow waves, so neighbouring days resemble each other.
    const mood = build((i) => 60 + 5 * Math.sin(i / 2) + 3 * noise());
    const meditated: DaySeries = {};
    WINDOW.forEach((day, i) => {
      meditated[day] = Math.floor(i / 5) % 2; // runs of 5 days
    });

    const result = analyzeDays({
      a: { key: 'meditated', values: meditated },
      b: { key: 'mood', values: mood },
      timing: 0,
      start: START,
      end: END,
    });

    // One effective n from the 0/1 flags and the deviations in day order, the cautious count
    // with carry-over up to 14 days back; each group gets its share, nG × nEff / n, for Welch.
    const deviations = deviationsFromOwnNormal(mood, WINDOW);
    const flags = WINDOW.map((day) => meditated[day]);
    const values = WINDOW.map((day) => deviations[day]);
    const n = WINDOW.length;
    const nEff = cautiousEffectiveN(flags, values, 14);
    const yes = values.filter((_, i) => flags[i] === 1);
    const no = values.filter((_, i) => flags[i] === 0);
    const expected = welch(
      yes,
      no,
      Math.max(2, (yes.length * nEff) / n),
      Math.max(2, (no.length * nEff) / n)
    );
    expect(result.method).toBe('difference');
    expect(result.n).toBe(n);
    expect(result.nEff).toBeCloseTo(nEff, 9);
    expect(result.nEff).toBeLessThan(n / 2);
    expect(result.p).toBeCloseTo(expected.p, 9);
    expect(result.low).toBeCloseTo(expected.low, 9);
    expect(result.high).toBeCloseTo(expected.high, 9);
  });

  // Calibration: 4000 runs of this scenario on other seeds say Yes 4.84% of the time (119 of
  // 2461 answered); these 400 seeded runs say Yes 5.15% (12 of 233). The bound is that 4.84%
  // plus about 3 points.
  test('a streaky habit and a slow-moving outcome that are unrelated rarely read as a Yes', () => {
    // 400 runs of 30 days: a habit kept or skipped in long streaks (95% chance of doing the
    // same as yesterday) against a mood that drifts slowly (AR(0.9)), with no link at all.
    const end = addDays(START, 29);
    let answered = 0;
    let yes = 0;
    for (let trial = 0; trial < 400; trial++) {
      const uniform = mulberry32(500 + trial);
      const noise = normal(9000 + trial);
      let flag = uniform() < 0.5 ? 1 : 0;
      let level = noise() / Math.sqrt(1 - 0.9 ** 2);
      const meditated: DaySeries = {};
      const mood: DaySeries = {};
      for (const day of daysFrom(FIRST, 51)) {
        if (uniform() > 0.95) flag = 1 - flag;
        level = 0.9 * level + noise();
        meditated[day] = flag;
        mood[day] = 60 + 5 * level;
      }
      const result = analyzeDays({
        a: { key: 'meditated', values: meditated },
        b: { key: 'mood', values: mood },
        timing: 0,
        start: START,
        end,
      });
      if (result.status !== 'ok') continue;
      answered++;
      if (result.linked) yes++;
    }

    expect(answered).toBeGreaterThan(200);
    expect(yes / answered).toBeLessThanOrEqual(0.078);
  });

  test('direction check names the first thing when the mirrored pairing is not linked', () => {
    const noise = normal(9);
    const a = build(() => 60 + 10 * noise());
    const b = nextDayOf(a, () => 3 * noise());

    const result = analyzeDays({
      a: { key: 'trainingLoad', values: a },
      b: { key: 'overnightHrv', values: b },
      timing: 1,
      start: START,
      end: END,
    });

    expect(result.linked).toBe(true);
    expect(result.checks.direction).toBe('firstComesFirst');
  });

  test('direction check cannot tell when the mirrored pairing is linked but weaker', () => {
    const noise = normal(15);
    const x = build(() => 60 + 10 * noise());
    // B the next day follows A a lot; A the next day follows B a little.
    const b = build((_, day) => {
      const before = x[addDays(day, -1)];
      const after = x[addDays(day, 1)];
      return before === undefined || after === undefined
        ? undefined
        : 2 * before + after + 5 * noise();
    });

    const result = analyzeDays({
      a: { key: 'mood', values: x },
      b: { key: 'sleepScore', values: b },
      timing: 1,
      start: START,
      end: END,
    });

    expect(result.linked).toBe(true);
    expect(result.checks.direction).toBe('cantTell');
  });

  test('direction check needs the mirrored pairing to be a real link: p under 0.05 and a range that leaves out 0', () => {
    // 14 days of slow waves, B following A a day later: the mirrored pairing (B on d against
    // A on d + 1) has p under 0.05 at an effective n of 4, but its range still reaches 0.
    const noise = normal(445);
    const a = build((i) => 60 + 10 * Math.sin(i / 4) + noise());
    const b = build((_, day) => {
      const before = a[addDays(day, -1)];
      return before === undefined ? undefined : before + 0.5 * noise();
    });
    const input = {
      a: { key: 'mood' as const, values: a },
      b: { key: 'sleepScore' as const, values: b },
      start: START,
      end: addDays(START, 13),
    };

    const result = analyzeDays({ ...input, timing: 1 });

    const sides = daySides(input);
    const xs: number[] = [];
    const ys: number[] = [];
    for (const day of sides.keys) {
      const x = sides.a.values[day];
      const y = sides.b.values[addDays(day, -1)];
      if (x === undefined || y === undefined) continue;
      xs.push(x);
      ys.push(y);
    }
    const mirrored = correlationTest(
      pearson(xs, ys) ?? NaN,
      cautiousEffectiveN(xs, ys, 14)
    );
    expect(mirrored.p).toBeLessThan(0.05);
    expect(mirrored.low).toBeLessThan(0);
    expect(result.linked).toBe(true);
    expect(result.checks.direction).toBe('firstComesFirst');
  });

  test('same-day direction says A comes first when A leads B by a day', () => {
    const noise = normal(16);
    const a = build(() => 60 + 10 * noise());
    // B depends a little on A the same day and a lot on A the day before.
    const b = build((_, day) => {
      const before = a[addDays(day, -1)];
      return before === undefined
        ? undefined
        : a[day] + 2 * before + 5 * noise();
    });

    const result = analyzeDays({
      a: { key: 'mood', values: a },
      b: { key: 'sleepScore', values: b },
      timing: 0,
      start: START,
      end: END,
    });

    expect(result.linked).toBe(true);
    expect(result.checks.direction).toBe('firstComesFirst');
  });

  test('same-day direction says the link is stronger the other way round when B leads A by a day', () => {
    const noise = normal(10);
    const b = build(() => 60 + 10 * noise());
    // A depends a little on B the same day and a lot on B the day before.
    const a = build((_, day) => {
      const before = b[addDays(day, -1)];
      return before === undefined
        ? undefined
        : b[day] + 2 * before + 5 * noise();
    });

    const result = analyzeDays({
      a: { key: 'mood', values: a },
      b: { key: 'sleepScore', values: b },
      timing: 0,
      start: START,
      end: END,
    });

    expect(result.linked).toBe(true);
    expect(result.checks.direction).toBe('strongerOtherWay');
  });

  test('same-day direction cannot tell when neither leads the other by a day', () => {
    const noise = normal(17);
    const a = build(() => 60 + 10 * noise());
    const b = build((_, day) => a[day] + 5 * noise());

    const result = analyzeDays({
      a: { key: 'mood', values: a },
      b: { key: 'sleepScore', values: b },
      timing: 0,
      start: START,
      end: END,
    });

    expect(result.linked).toBe(true);
    expect(result.checks.direction).toBe('cantTell');
  });

  test('a p under 0.05 whose 95% range still reaches 0 is not a Yes', () => {
    // 14 days of slow waves: the effective n sits at its floor of 4, where the t-test p and
    // the Fisher range can disagree.
    const noise = normal(174);
    const a = build((i) => 60 + 10 * Math.sin(i / 3) + noise());
    const b = build((_, day) => a[day] + 2 * noise());

    const result = analyzeDays({
      a: { key: 'mood', values: a },
      b: { key: 'sleepScore', values: b },
      timing: 0,
      start: START,
      end: addDays(START, 13),
    });

    expect(result).toMatchObject({ status: 'ok', n: 14, nEff: 4 });
    expect(result.p).toBeLessThan(0.05);
    expect(result.low).toBeLessThan(0);
    expect(result.linked).toBe(false);
    expect(result.checks).toEqual({ ownNormal: true });
  });

  test('weekend check flags a link that only weekends explain', () => {
    const noise = normal(11);
    const a = build((_, day) => 50 + (isWeekend(day) ? 10 : 0) + noise());
    const b = build((_, day) => 70 + (isWeekend(day) ? 10 : 0) + noise());

    const result = analyzeDays({
      a: { key: 'alcohol', values: a },
      b: { key: 'restingHeartRate', values: b },
      timing: 0,
      start: START,
      end: END,
    });

    expect(result.linked).toBe(true);
    expect(result.checks.weekend).toBe('mayBeWeekends');
  });

  test('weekend check holds when every paired day is a weekday', () => {
    const noise = normal(1);
    // Slow waves keep the effective n near its floor, where one degree of freedom matters.
    const a = build((i, day) =>
      isWeekend(day) ? undefined : 60 + 10 * Math.sin(i / 4) + noise()
    );
    const b = build((i) => 70 + 10 * Math.sin(i / 4 + 0.35) + noise());

    const result = analyzeDays({
      a: { key: 'mood', values: a },
      b: { key: 'sleepScore', values: b },
      timing: 0,
      start: START,
      end: END,
    });

    expect(result.linked).toBe(true);
    expect(result.checks.weekend).toBe('holds');
  });

  test('no checks unless linked', () => {
    const noise = normal(12);
    const a = build(() => 60 + 10 * noise());
    const b = build(() => 70 + 5 * noise());

    const result = analyzeDays({
      a: { key: 'mood', values: a },
      b: { key: 'steps', values: b },
      timing: 0,
      start: START,
      end: END,
    });

    expect(result.status).toBe('ok');
    expect(result.linked).toBe(false);
    expect(result.strength).toBeUndefined();
    expect(result.sign).toBeUndefined();
    expect(result.checks).toEqual({ ownNormal: true });
  });

  test('the effective n counts carry-over up to 14 days back', () => {
    const noise = normal(18);
    // Slow waves on both sides, so days resemble each other well beyond yesterday.
    const a = build((i) => 60 + 5 * Math.sin(i / 4) + 2 * noise());
    const b = build((i) => 70 + 5 * Math.sin(i / 5) + 2 * noise());

    const result = analyzeDays({
      a: { key: 'mood', values: a },
      b: { key: 'sleepScore', values: b },
      timing: 0,
      start: START,
      end: END,
    });

    const devA = deviationsFromOwnNormal(a, WINDOW);
    const devB = deviationsFromOwnNormal(b, WINDOW);
    const xs = WINDOW.map((day) => devA[day]);
    const ys = WINDOW.map((day) => devB[day]);
    expect(result.n).toBe(60);
    expect(result.nEff).toBeCloseTo(cautiousEffectiveN(xs, ys, 14), 9);
    // Lags past 6 still count here.
    expect(result.nEff).not.toBeCloseTo(cautiousEffectiveN(xs, ys, 6), 3);
  });

  // Calibration: 4000 runs of this scenario on other seeds say Yes 4.42% of the time (177 of
  // 4000); these 300 seeded runs say Yes 4.00% (12 of 300). The bound is that 4.42% plus about
  // 3 points.
  test('two unrelated slow-moving series rarely read as a Yes', () => {
    // 300 runs of 90 days: two AR(0.6) series with no link at all.
    const end = addDays(START, 89);
    const ar = (noise: () => number) => {
      let level = noise() / Math.sqrt(1 - 0.6 ** 2);
      const out: DaySeries = {};
      for (const day of daysFrom(FIRST, 112)) {
        level = 0.6 * level + noise();
        out[day] = 60 + 10 * level;
      }
      return out;
    };
    let answered = 0;
    let yes = 0;
    for (let trial = 0; trial < 300; trial++) {
      const result = analyzeDays({
        a: { key: 'mood', values: ar(normal(7000 + trial)) },
        b: { key: 'sleepScore', values: ar(normal(17000 + trial)) },
        timing: 0,
        start: START,
        end,
      });
      if (result.status !== 'ok') continue;
      answered++;
      if (result.linked) yes++;
    }

    expect(answered).toBe(300);
    expect(yes / answered).toBeLessThanOrEqual(0.074);
  });
});

describe('compare week analysis', () => {
  // 2026-03-02 is a Monday; 30 weeks, the first 6 only history for the own normal.
  const WEEK0 = addDays(START, -42);
  const weekDays = daysFrom(WEEK0, 31 * 7); // one more week for timing 1
  const weekEnd = addDays(WEEK0, 30 * 7 - 1);
  const weekStart = addDays(WEEK0, 42);

  test("weeklySeries sums event minutes per week starting on the user's first day", () => {
    const daily: DaySeries = {
      '2026-03-02': 10, // Monday
      '2026-03-04': 20,
      '2026-03-08': 5, // Sunday, still the week that started 2026-03-02
      '2026-03-09': 7, // next Monday
    };
    expect(weeklySeries(daily, 'meditationMinutes', 1)).toEqual({
      '2026-03-02': 35,
      '2026-03-09': 7,
    });
    // Weeks starting on Sunday put that Sunday with the days after it.
    expect(weeklySeries(daily, 'meditationMinutes', 0)).toEqual({
      '2026-03-01': 30,
      '2026-03-08': 12,
    });
  });

  test('weeklySeries needs 4 days for a weekly mean', () => {
    const three: DaySeries = {
      '2026-03-02': 50,
      '2026-03-03': 60,
      '2026-03-05': 70,
    };
    expect(weeklySeries(three, 'mood', 1)).toEqual({});
    expect(weeklySeries({ ...three, '2026-03-07': 80 }, 'mood', 1)).toEqual({
      '2026-03-02': 65,
    });
  });

  test('weeklySeries counts yes days for a binary metric', () => {
    const daily: DaySeries = {
      '2026-03-02': 1,
      '2026-03-03': 0,
      '2026-03-04': 1,
      '2026-03-09': 0,
    };
    expect(weeklySeries(daily, 'meditated', 1)).toEqual({
      '2026-03-02': 2,
      '2026-03-09': 0,
    });
  });

  test('analyzeWeeks links weekly meditation to weekly mood across 24 weeks', () => {
    const effect = normal(11);
    const noise = normal(12);
    const byWeek: Record<string, number> = {};
    for (let w = 0; w < 31; w++) byWeek[addDays(WEEK0, w * 7)] = effect();
    const week = (day: string) =>
      byWeek[addDays(day, -((dayOfWeek(day) + 6) % 7))];
    const minutes: DaySeries = {};
    const mood: DaySeries = {};
    for (const day of weekDays) {
      minutes[day] = 30 + 8 * week(day) + noise();
      mood[day] = 60 + 6 * week(day) + noise();
    }
    const result = analyzeWeeks({
      a: { key: 'meditationMinutes', values: minutes },
      b: { key: 'mood', values: mood },
      timing: 0,
      start: weekStart,
      end: weekEnd,
      firstDayOfWeek: 1,
    });
    expect(result.status).toBe('ok');
    expect(result.needed).toBe(8);
    expect(result.n).toBe(24);
    expect(result.method).toBe('pearson');
    expect(result.linked).toBe(true);
    expect(result.sign).toBe('positive');
    expect(result.checks.weekend).toBeUndefined();
  });

  test('analyzeWeeks is not_enough below 8 paired weeks', () => {
    const noise = normal(21);
    const a = build(() => 10 + noise());
    const b = build(() => 50 + noise());
    expect(
      analyzeWeeks({
        a: { key: 'meditationMinutes', values: a },
        b: { key: 'mood', values: b },
        timing: 0,
        start: addDays(START, 14),
        end: addDays(START, 40),
        firstDayOfWeek: 1,
      })
    ).toEqual({
      status: 'not_enough',
      n: 4,
      needed: 8,
      reason: 'tooFew',
      checks: { ownNormal: true },
    });
  });

  test('analyzeWeeks rejects a metric not offered weekly', () => {
    const series = build(() => 1);
    const run = () =>
      analyzeWeeks({
        a: { key: 'meditationSessions7d', values: series },
        b: { key: 'mood', values: series },
        timing: 0,
        start: START,
        end: END,
        firstDayOfWeek: 1,
      });
    expect(run).toThrow(CompareModeError);
    expect(run).toThrow('not offered in week mode');
  });

  /** Daily series for 31 weeks from WEEK0 where `f(w, day)` gives the value in week w. */
  function weekly(f: (w: number, day: string) => number): DaySeries {
    const out: DaySeries = {};
    weekDays.forEach((day, i) => {
      out[day] = f(Math.floor(i / 7), day);
    });
    return out;
  }
  const span = { start: weekStart, end: weekEnd, firstDayOfWeek: 1 };

  test('analyzeWeeks pairs B with the following week at timing 1', () => {
    const effect = normal(31);
    const noise = normal(32);
    const e = Array.from({ length: 31 }, () => effect());
    const a = weekly((w) => 30 + 8 * e[w] + noise());
    // B in week w follows A in week w - 1.
    const b = weekly((w) => 60 + 6 * e[w - 1 < 0 ? 0 : w - 1] + noise());
    const run = (timing: 0 | 1) =>
      analyzeWeeks({
        a: { key: 'meditationMinutes', values: a },
        b: { key: 'mood', values: b },
        timing,
        ...span,
      });
    const lagged = run(1);
    expect(lagged.n).toBe(24);
    expect(lagged.linked).toBe(true);
    expect(run(0).linked).toBe(false);
  });

  test('analyzeWeeks treats a yes/no metric as days per week', () => {
    const effect = normal(41);
    const noise = normal(42);
    const e = Array.from({ length: 31 }, () => effect());
    const yesNo = weekly((w, day) =>
      mulberry32(w * 1000 + dayOfWeek(day) + 7)() <
      1 / (1 + Math.exp(-2 * e[w]))
        ? 1
        : 0
    );
    const mood = weekly((w) => 60 + 6 * e[w] + noise());
    const energy = weekly((w) => Math.round(5 + 2 * e[w] + noise() / 3));
    const withMood = analyzeWeeks({
      a: { key: 'meditated', values: yesNo },
      b: { key: 'mood', values: mood },
      timing: 0,
      ...span,
    });
    expect(withMood.method).toBe('pearson');
    expect(withMood.binary).toBeUndefined();
    const withEnergy = analyzeWeeks({
      a: { key: 'meditated', values: yesNo },
      b: { key: 'energy', values: energy },
      timing: 0,
      ...span,
    });
    expect(withEnergy.method).toBe('spearman');
    expect(withEnergy.binary).toBeUndefined();
  });

  test('analyzeWeeks uses whole weeks around a mid-week span', () => {
    const noise = normal(51);
    const a = weekly(() => 10 + noise());
    const b = weekly(() => 50 + noise());
    // Sunday-first weeks: 2026-03-04 sits in the week of 03-01, 2026-04-14 in the week of 04-12.
    const result = analyzeWeeks({
      a: { key: 'meditationMinutes', values: a },
      b: { key: 'mood', values: b },
      timing: 0,
      start: '2026-03-04',
      end: '2026-04-14',
      firstDayOfWeek: 0,
    });
    expect(result.n).toBe(7);
  });

  test('analyzeWeeks counts carry-over up to 6 weeks back', () => {
    // 52 weeks after 6 of history: 13 lags would fit, but weeks stop at 6.
    const first = addDays(START, -42);
    const noise = normal(81);
    const a: DaySeries = {};
    const b: DaySeries = {};
    daysFrom(first, 59 * 7).forEach((day, i) => {
      const week = Math.floor(i / 7);
      a[day] = 30 + 8 * Math.sin(week / 3) + 3 * noise();
      b[day] = 60 + 6 * Math.sin(week / 4) + 3 * noise();
    });
    const span = {
      start: START,
      end: addDays(START, 52 * 7 - 1),
      firstDayOfWeek: 1,
    };

    const result = analyzeWeeks({
      a: { key: 'meditationMinutes', values: a },
      b: { key: 'mood', values: b },
      timing: 0,
      ...span,
    });

    const sides = weekSides({
      a: { key: 'meditationMinutes', values: a },
      b: { key: 'mood', values: b },
      ...span,
    });
    const xs = sides.keys.map((week) => sides.a.values[week]);
    const ys = sides.keys.map((week) => sides.b.values[week]);
    expect(result.n).toBe(52);
    expect(result.nEff).toBeCloseTo(cautiousEffectiveN(xs, ys, 6), 9);
    expect(result.nEff).not.toBeCloseTo(cautiousEffectiveN(xs, ys, 13), 3);
  });

  test('analyzeWeeks is not_enough when a side never varies', () => {
    const noise = normal(61);
    const result = analyzeWeeks({
      a: { key: 'meditationMinutes', values: weekly(() => 20) },
      b: { key: 'mood', values: weekly(() => 50 + noise()) },
      timing: 0,
      ...span,
    });
    expect(result).toEqual({
      status: 'not_enough',
      n: 24,
      needed: 8,
      reason: 'noVariation',
      checks: { ownNormal: true },
    });
  });
});

describe('compare sides', () => {
  test('daySides gives the deviations analyzeDays pairs on, B a day either side', () => {
    const noise = normal(71);
    const a = build(() => 50 + 10 * noise());
    const b = build(() => 7 + noise());

    const sides = daySides({
      a: { key: 'mood', values: a },
      b: { key: 'timeAsleep', values: b },
      start: START,
      end: END,
    });

    expect(sides.keys).toEqual(WINDOW);
    expect(sides.a.values).toEqual(deviationsFromOwnNormal(a, WINDOW));
    expect(sides.b.values).toEqual(
      deviationsFromOwnNormal(b, daysFrom(addDays(START, -1), 62))
    );
    expect(sides.a.raw).toBe(a);
  });

  test('a yes/no day side stays raw 0/1, only on the days analysed', () => {
    const noise = normal(72);
    const flags = build((i) => i % 2);
    const sides = daySides({
      a: { key: 'meditated', values: flags },
      b: { key: 'mood', values: build(() => 50 + 10 * noise()) },
      start: START,
      end: END,
    });

    expect(sides.a.values).toEqual(
      Object.fromEntries(WINDOW.map((day) => [day, flags[day]]))
    );
  });

  test('weekSides gives the weekly deviations analyzeWeeks pairs on', () => {
    // 2026-01-19 is a Monday: 31 weeks of days, the first 6 history.
    const first = addDays(START, -42);
    const noise = normal(73);
    const a: DaySeries = {};
    const b: DaySeries = {};
    daysFrom(first, 31 * 7).forEach((day, i) => {
      if (i % 3 !== 0) a[day] = 10 + 5 * noise();
      b[day] = 50 + 10 * noise();
    });
    const start = addDays(first, 44); // a Wednesday
    const end = addDays(first, 30 * 7 - 3);

    const sides = weekSides({
      a: { key: 'meditationMinutes', values: a },
      b: { key: 'mood', values: b },
      start,
      end,
      firstDayOfWeek: 1,
    });

    const weeks = Array.from({ length: 24 }, (_, i) =>
      addDays(first, 42 + 7 * i)
    );
    expect(sides.keys).toEqual(weeks);
    const weeklyA = weeklySeries(a, 'meditationMinutes', 1);
    const weeklyB = weeklySeries(b, 'mood', 1);
    expect(sides.a.raw).toEqual(weeklyA);
    expect(sides.a.values).toEqual(
      deviationsFromOwnNormal(weeklyA, weeks, 6, 3, 7)
    );
    expect(sides.b.values).toEqual(
      deviationsFromOwnNormal(
        weeklyB,
        [addDays(weeks[0], -7), ...weeks, addDays(weeks[23], 7)],
        6,
        3,
        7
      )
    );
  });
});
