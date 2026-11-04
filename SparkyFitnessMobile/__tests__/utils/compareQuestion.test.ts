import {
  clampSinceStart,
  COMPARE_SPANS,
  type CompareQuestion,
  compareWindow,
  daysBetween,
  DEFAULT_COMPARE_SPAN,
  isAskable,
  knownCompareQuestions,
  MAX_CUSTOM_DAYS,
  offeredInMode,
  sinceStartBounds,
  SUGGESTED_QUESTIONS,
  timingOf,
  withRecentQuestion,
} from '@workspace/shared';

const TODAY = '2026-10-21';

describe('SUGGESTED_QUESTIONS', () => {
  test('are the four starters in order', () => {
    expect(SUGGESTED_QUESTIONS).toEqual([
      { a: 'timeAsleep', b: 'energy', choice: 'sameDay' },
      { a: 'meditated', b: 'mood', choice: 'sameDay' },
      { a: 'caffeine', b: 'timeAsleep', choice: 'nextDay' },
      { a: 'trainingLoad', b: 'overnightHrv', choice: 'nextDay' },
    ]);
  });
});

describe('timingOf', () => {
  test('maps choices to mode and timing', () => {
    expect(timingOf('dayBefore')).toEqual({ mode: 'day', timing: -1 });
    expect(timingOf('sameDay')).toEqual({ mode: 'day', timing: 0 });
    expect(timingOf('nextDay')).toEqual({ mode: 'day', timing: 1 });
    expect(timingOf('sameWeek')).toEqual({ mode: 'week', timing: 0 });
    expect(timingOf('nextWeek')).toEqual({ mode: 'week', timing: 1 });
    expect(timingOf('sinceHabit')).toEqual({ mode: 'since', timing: 0 });
  });
});

describe('spans', () => {
  test('lists and defaults', () => {
    expect(COMPARE_SPANS.day).toEqual(['30d', '60d', '90d', 'custom']);
    expect(COMPARE_SPANS.week).toEqual(['6m', '1y', 'custom']);
    expect(DEFAULT_COMPARE_SPAN).toEqual({ day: '90d', week: '6m' });
  });

  test('since mode has no span', () => {
    expect(Object.keys(COMPARE_SPANS)).toEqual(['day', 'week']);
    expect(Object.keys(DEFAULT_COMPARE_SPAN)).toEqual(['day', 'week']);
    expect(Object.keys(MAX_CUSTOM_DAYS)).toEqual(['day', 'week']);
  });
});

describe('compareWindow', () => {
  test('30 days ends today', () => {
    expect(compareWindow('30d', 'day', TODAY)).toEqual({
      startDate: '2026-09-22',
      endDate: TODAY,
    });
  });

  test('60d and 90d and 1y', () => {
    expect(
      daysBetween(compareWindow('60d', 'day', TODAY).startDate, TODAY)
    ).toBe(59);
    expect(
      daysBetween(compareWindow('90d', 'day', TODAY).startDate, TODAY)
    ).toBe(89);
    expect(
      daysBetween(compareWindow('1y', 'week', TODAY).startDate, TODAY)
    ).toBe(363);
  });

  test('6m is 182 days', () => {
    expect(compareWindow('6m', 'week', TODAY)).toEqual({
      startDate: '2026-04-23',
      endDate: TODAY,
    });
  });

  test('custom is kept when within the cap', () => {
    expect(
      compareWindow('custom', 'day', TODAY, {
        startDate: '2026-10-01',
        endDate: '2026-10-15',
      })
    ).toEqual({ startDate: '2026-10-01', endDate: '2026-10-15' });
  });

  test('custom day range over 180 days is clamped, keeping the end', () => {
    const w = compareWindow('custom', 'day', TODAY, {
      startDate: '2026-01-01',
      endDate: '2026-07-19',
    });
    expect(w.endDate).toBe('2026-07-19');
    expect(daysBetween(w.startDate, w.endDate) + 1).toBe(180);
  });

  test('custom week range over 366 days is clamped', () => {
    const w = compareWindow('custom', 'week', TODAY, {
      startDate: '2025-01-01',
      endDate: '2026-10-01',
    });
    expect(w.endDate).toBe('2026-10-01');
    expect(daysBetween(w.startDate, w.endDate) + 1).toBe(366);
  });

  test('custom without a range falls back to the mode default', () => {
    expect(compareWindow('custom', 'day', TODAY, null)).toEqual(
      compareWindow('90d', 'day', TODAY)
    );
  });
});

describe('withRecentQuestion', () => {
  test('puts a duplicate at the front without repeating it', () => {
    const first: CompareQuestion = {
      a: 'mood',
      b: 'energy',
      choice: 'sameDay',
    };
    const second: CompareQuestion = {
      a: 'mood',
      b: 'focus',
      choice: 'sameDay',
    };
    expect(withRecentQuestion([first, second], second)).toEqual([
      second,
      first,
    ]);
    expect(withRecentQuestion([first, second], { ...first })).toEqual([
      first,
      second,
    ]);
  });

  test('keeps at most five, dropping the oldest', () => {
    const five: CompareQuestion[] = [
      { a: 'mood', b: 'energy', choice: 'sameDay' },
      { a: 'mood', b: 'focus', choice: 'sameDay' },
      { a: 'mood', b: 'steps', choice: 'sameDay' },
      { a: 'mood', b: 'fat', choice: 'sameDay' },
      { a: 'mood', b: 'carbs', choice: 'sameDay' },
    ];
    const next: CompareQuestion = {
      a: 'mood',
      b: 'protein',
      choice: 'sameDay',
    };
    const out = withRecentQuestion(five, next);
    expect(out).toHaveLength(5);
    expect(out[0]).toEqual(next);
    expect(out).not.toContainEqual(five[4]);
  });
});

describe('knownCompareQuestions', () => {
  const good: CompareQuestion = { a: 'mood', b: 'energy', choice: 'nextDay' };

  test('drops stored questions this build no longer knows', () => {
    expect(
      knownCompareQuestions([
        good,
        { a: 'vo2max', b: 'energy', choice: 'sameDay' },
        { a: 'mood', b: 'stress', choice: 'sameDay' },
        { a: 'mood', b: 'energy', choice: 'twoDaysLater' },
        { a: 'mood', b: 'energy' },
        null,
        'mood',
        { a: 'toString', b: 'energy', choice: 'sameDay' },
        { a: 'mood', b: 'energy', choice: 'constructor' },
      ])
    ).toEqual([good]);
  });

  test('keeps a since question', () => {
    const since: CompareQuestion = {
      a: 'meditated',
      b: 'mood',
      choice: 'sinceHabit',
    };
    expect(knownCompareQuestions([since])).toEqual([since]);
  });

  test('reads anything that is not a list as no questions', () => {
    expect(knownCompareQuestions(undefined)).toEqual([]);
    expect(knownCompareQuestions({ a: 'mood' })).toEqual([]);
  });

  test('withRecentQuestion leaves the unknown ones behind', () => {
    const stale = [
      { a: 'vo2max', b: 'energy', choice: 'sameDay' },
    ] as unknown as CompareQuestion[];
    expect(withRecentQuestion(stale, good)).toEqual([good]);
  });
});

describe('isAskable', () => {
  test('needs both metrics, different', () => {
    expect(isAskable({ a: 'mood', choice: 'sameDay' })).toBe(false);
    expect(isAskable({ a: 'mood', b: 'mood', choice: 'sameDay' })).toBe(false);
    expect(isAskable({ a: 'mood', b: 'energy' })).toBe(false);
  });

  test('week mode rejects metrics without a weekly rule', () => {
    expect(
      isAskable({ a: 'meditationSessions7d', b: 'mood', choice: 'sameWeek' })
    ).toBe(false);
    expect(
      isAskable({ a: 'mood', b: 'meditationSessions7d', choice: 'nextWeek' })
    ).toBe(false);
  });

  test('accepts a valid question', () => {
    expect(isAskable({ a: 'timeAsleep', b: 'energy', choice: 'sameDay' })).toBe(
      true
    );
    expect(isAskable({ a: 'mood', b: 'energy', choice: 'sameWeek' })).toBe(
      true
    );
  });

  test('a since question takes any two different metrics and needs no start', () => {
    expect(
      isAskable({ a: 'meditationSessions7d', b: 'mood', choice: 'sinceHabit' })
    ).toBe(true);
    expect(isAskable({ a: 'mood', b: 'mood', choice: 'sinceHabit' })).toBe(
      false
    );
  });
});

describe('weight trend and since', () => {
  test('isAskable is false for a since question with weight trend in either slot', () => {
    expect(
      isAskable({ a: 'weightTrend', b: 'mood', choice: 'sinceHabit' })
    ).toBe(false);
    expect(
      isAskable({ a: 'meditated', b: 'weightTrend', choice: 'sinceHabit' })
    ).toBe(false);
    expect(isAskable({ a: 'weightTrend', b: 'mood', choice: 'sameDay' })).toBe(
      true
    );
  });

  test('offeredInMode follows the weekly and since rules', () => {
    expect(offeredInMode('meditationSessions7d', 'day')).toBe(true);
    expect(offeredInMode('meditationSessions7d', 'week')).toBe(false);
    expect(offeredInMode('meditationSessions7d', 'since')).toBe(true);
    expect(offeredInMode('weightTrend', 'day')).toBe(true);
    expect(offeredInMode('weightTrend', 'week')).toBe(true);
    expect(offeredInMode('weightTrend', 'since')).toBe(false);
  });

  test('knownCompareQuestions drops a stored weight-trend since question but keeps the same pair by day', () => {
    const since = { a: 'weightTrend', b: 'mood', choice: 'sinceHabit' };
    const byDay: CompareQuestion = {
      a: 'weightTrend',
      b: 'mood',
      choice: 'sameDay',
    };
    expect(knownCompareQuestions([since, byDay])).toEqual([byDay]);
  });
});

describe('since start bounds', () => {
  test('run from 730 days back to yesterday', () => {
    expect(sinceStartBounds(TODAY)).toEqual({
      min: '2024-10-21',
      max: '2026-10-20',
    });
    expect(daysBetween(sinceStartBounds(TODAY).min, TODAY)).toBe(730);
  });

  test('keep a picked start inside them', () => {
    expect(clampSinceStart('2026-04-01', TODAY)).toBe('2026-04-01');
    expect(clampSinceStart('2024-10-21', TODAY)).toBe('2024-10-21');
    expect(clampSinceStart('2024-10-20', TODAY)).toBe('2024-10-21');
    expect(clampSinceStart(TODAY, TODAY)).toBe('2026-10-20');
    expect(clampSinceStart('2026-12-01', TODAY)).toBe('2026-10-20');
  });
});
