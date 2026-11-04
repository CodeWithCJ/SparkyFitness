import {
  type CompareMetricKey,
  type CompareQuestion,
  type CompareSinceResponse,
  type CompareSinceResult,
} from '@workspace/shared';
import i18n, { initializeI18n } from '../../src/localization/i18n';
import {
  sinceCaveat,
  sinceDetails,
  sinceSentence,
  sinceVerdictCopy,
} from '../../src/utils/compareSinceCopy';

const t = ((key: string, options: Record<string, unknown>) =>
  i18n.t(key, options)) as never;

beforeAll(async () => {
  await initializeI18n('en');
  await i18n.changeLanguage('en');
});

const OK: CompareSinceResult = {
  status: 'ok',
  start: '2026-04-01',
  suggestedStart: '2026-04-01',
  before: {
    from: '2025-10-08',
    to: '2026-03-31',
    days: 175,
    valueDays: 160,
    mean: 58,
    p10: 40,
    p90: 72,
    shareAtOrAbove: 0.38,
  },
  since: {
    from: '2026-04-01',
    to: '2026-10-20',
    days: 203,
    valueDays: 190,
    mean: 66,
    p10: 52,
    p90: 80,
    shareAtOrAbove: 0.64,
  },
  line: 70,
  diff: 8,
  low: 3,
  high: 13,
  p: 0.004,
  changed: true,
  regularity: { weeksKept: 24, weeks: 28 },
  alreadyChanging: false,
};

function response(
  result: Partial<CompareSinceResult>,
  outcome: CompareMetricKey = 'mood',
  habit: CompareMetricKey = 'meditated'
): CompareSinceResponse {
  return {
    mode: 'since',
    habit: { key: habit, values: {} },
    outcome: { key: outcome, values: {} },
    result: { ...OK, ...result },
  };
}

/** A not-enough answer with only the counts on its stretches, as the server sends it. */
function short(
  reason: 'fewBefore' | 'fewSince',
  stretch: { days: number; valueDays: number }
): Partial<CompareSinceResult> {
  const before = {
    from: '2025-10-08',
    to: '2026-03-31',
    days: 175,
    valueDays: 160,
  };
  const since = {
    from: '2026-04-01',
    to: '2026-10-20',
    days: 203,
    valueDays: 190,
  };
  return {
    status: 'not_enough',
    reason,
    before: reason === 'fewBefore' ? { ...before, ...stretch } : before,
    since: reason === 'fewSince' ? { ...since, ...stretch } : since,
    diff: undefined,
    low: undefined,
    high: undefined,
    p: undefined,
    changed: undefined,
    regularity: undefined,
    alreadyChanging: undefined,
  };
}

const ALL: string[] = [];
function collect<T extends Record<string, string | null>>(copy: T): T {
  for (const s of Object.values(copy)) if (s) ALL.push(s);
  return copy;
}

afterAll(() => {
  expect(ALL.length).toBeGreaterThan(0);
  for (const s of ALL) expect(s.toLowerCase()).not.toMatch(/\bcause/);
});

describe('sinceSentence', () => {
  test.each<[CompareQuestion, string]>([
    [
      { a: 'meditated', b: 'mood', choice: 'sinceHabit' },
      'Since I started meditating regularly, has mood changed?',
    ],
    [
      { a: 'caffeine', b: 'timeAsleep', choice: 'sinceHabit' },
      'Since I started caffeine regularly, has time asleep changed?',
    ],
  ])('%j', (q, text) => {
    expect(sinceSentence(q, t)).toBe(text);
  });
});

describe('sinceVerdictCopy', () => {
  test('a change names both averages and the difference', () => {
    expect(collect(sinceVerdictCopy(response({}), t))).toEqual({
      headline: 'Yes, it changed',
      detail: 'Since Apr 1, 2026, your mood averaged 6.6 vs 5.8 before (+0.8).',
    });
  });

  test('no clear change still gives both averages', () => {
    const copy = collect(
      sinceVerdictCopy(
        response({
          changed: false,
          diff: 1,
          since: { ...OK.since!, mean: 59 },
        }),
        t
      )
    );
    expect(copy).toEqual({
      headline: 'No clear change',
      detail:
        'Since Apr 1, 2026, your mood averaged 5.9 vs 5.8 before, not different enough to rule out chance.',
    });
  });

  test('a fall carries its sign on the scale shown', () => {
    const copy = sinceVerdictCopy(
      response(
        {
          before: { ...OK.before!, mean: 3.6 },
          since: { ...OK.since!, mean: 3.1 },
          diff: -0.5,
        },
        'energy'
      ),
      t
    );
    expect(copy.detail).toBe(
      'Since Apr 1, 2026, your energy averaged 3.1 vs 3.6 before (-0.5).'
    );
  });

  test('counts read whole', () => {
    const copy = sinceVerdictCopy(
      response(
        {
          before: { ...OK.before!, mean: 6500 },
          since: { ...OK.since!, mean: 8123 },
          diff: 1623,
        },
        'steps'
      ),
      t
    );
    expect(copy.detail).toBe(
      'Since Apr 1, 2026, your steps averaged 8,123 vs 6,500 before (+1,623).'
    );
  });

  test('bedtime reads as clock times and a change later or earlier', () => {
    const earlier = sinceVerdictCopy(
      response(
        {
          before: { ...OK.before!, mean: 330 },
          since: { ...OK.since!, mean: 300 },
          diff: -30,
        },
        'bedtime'
      ),
      t
    );
    expect(earlier.detail).toMatch(
      /^Since Apr 1, 2026, your bedtime averaged 11:00\sPM vs 11:30\sPM before \(30 min earlier\)\.$/
    );
    const later = sinceVerdictCopy(
      response(
        {
          before: { ...OK.before!, mean: 300 },
          since: { ...OK.since!, mean: 345 },
          diff: 45,
        },
        'bedtime'
      ),
      t
    );
    expect(later.detail).toMatch(/\(45 min later\)\.$/);
  });

  test('a yes/no outcome reads as a share of days', () => {
    const copy = sinceVerdictCopy(
      response(
        {
          before: { ...OK.before!, mean: 0.25 },
          since: { ...OK.since!, mean: 0.4 },
          diff: 0.15,
        },
        'meditated',
        'caffeine'
      ),
      t
    );
    expect(copy.detail).toBe(
      'Since Apr 1, 2026, your meditating averaged 40% vs 25% before (+15%).'
    );
  });

  test('a start more than a year ago speaks of the last year and the year before the start', () => {
    // Since covers only the last 365 days, so it no longer begins at the start.
    const longAgo = {
      start: '2025-03-01',
      suggestedStart: null,
      before: { ...OK.before!, from: '2024-03-01', to: '2025-02-28' },
      since: { ...OK.since!, from: '2025-10-21', to: '2026-10-20' },
    };
    expect(collect(sinceVerdictCopy(response(longAgo), t))).toEqual({
      headline: 'Yes, it changed',
      detail:
        'Over the last year, your mood averaged 6.6 vs 5.8 in the year before you started (+0.8).',
    });
    expect(
      collect(
        sinceVerdictCopy(
          response({
            ...longAgo,
            changed: false,
            since: { ...longAgo.since, mean: 59 },
            diff: 1,
          }),
          t
        )
      )
    ).toEqual({
      headline: 'No clear change',
      detail:
        'Over the last year, your mood averaged 5.9 vs 5.8 in the year before you started, not different enough to rule out chance.',
    });
  });

  test('too few values before the start', () => {
    expect(
      collect(
        sinceVerdictCopy(
          response(short('fewBefore', { days: 175, valueDays: 9 })),
          t
        )
      )
    ).toEqual({
      headline: 'Not enough before Apr 1, 2026 yet',
      detail: 'You have 9 days with mood; an answer needs 14.',
    });
  });

  test('too few values since the start, counted in days', () => {
    const copy = collect(
      sinceVerdictCopy(
        response(short('fewSince', { days: 203, valueDays: 1 })),
        t
      )
    );
    expect(copy).toEqual({
      headline: 'Not enough since Apr 1, 2026 yet',
      detail: 'You have 1 day with mood; an answer needs 14.',
    });
  });

  test('enough values but too short a stretch names the 28 days', () => {
    expect(
      collect(
        sinceVerdictCopy(
          response(short('fewSince', { days: 20, valueDays: 18 })),
          t
        )
      ).detail
    ).toBe("It's been 20 days since then; an answer needs 28 days.");
    expect(
      collect(
        sinceVerdictCopy(
          response(short('fewBefore', { days: 20, valueDays: 20 })),
          t
        )
      ).detail
    ).toBe(
      'Your mood records begin 20 days before then; an answer needs 28 days.'
    );
  });

  test('a start under four weeks ago is about the days since, whichever stretch the server names', () => {
    // Before is never longer than since, so a recent start leaves both short.
    const recent = (
      reason: 'fewBefore' | 'fewSince',
      since: { days: number; valueDays: number }
    ) =>
      response({
        ...short(reason, { days: 20, valueDays: 20 }),
        before: {
          from: '2026-03-12',
          to: '2026-03-31',
          days: 20,
          valueDays: 20,
        },
        since: { from: '2026-04-01', to: '2026-04-20', ...since },
      });
    expect(
      collect(
        sinceVerdictCopy(recent('fewBefore', { days: 20, valueDays: 18 }), t)
      )
    ).toEqual({
      headline: 'Not enough since Apr 1, 2026 yet',
      detail: "It's been 20 days since then; an answer needs 28 days.",
    });
    expect(
      collect(
        sinceVerdictCopy(recent('fewSince', { days: 20, valueDays: 5 }), t)
      ).detail
    ).toBe("It's been 20 days since then; an answer needs 28 days.");
  });

  test('no start asks the person to pick one', () => {
    const copy = collect(
      sinceVerdictCopy(
        response({
          status: 'not_enough',
          reason: 'noStart',
          start: null,
          suggestedStart: null,
          before: undefined,
          since: undefined,
          line: 0,
          diff: undefined,
          low: undefined,
          high: undefined,
          p: undefined,
          changed: undefined,
          regularity: undefined,
          alreadyChanging: undefined,
        }),
        t
      )
    );
    expect(copy).toEqual({
      headline: 'Pick the day you started',
      detail: 'Then this compares your mood before and since that day.',
    });
    expect(copy.detail.toLowerCase()).not.toContain('not enough');
  });
});

describe('sinceDetails', () => {
  test('the typical range, the line, regularity and the numbers', () => {
    expect(collect(sinceDetails(response({}), t))).toEqual({
      typicalRange: 'Usually between 5.2 and 8.0 (before: 4.0–7.2).',
      aboveLine: 'At or above 7.0 on 64% of days (before: 38%).',
      regularity: 'You kept it up in 24 of 28 weeks since.',
      alreadyChanging: null,
      stats: 'difference +0.8 · 95% range 0.3 to 1.3 · p 0.004 · 350 days',
    });
  });

  test('warns when the outcome was already rising or falling', () => {
    expect(
      sinceDetails(response({ alreadyChanging: true }), t).alreadyChanging
    ).toBe('⚠ Mood was already rising before you started.');
    expect(
      sinceDetails(response({ alreadyChanging: true, diff: -0.4 }, 'energy'), t)
        .alreadyChanging
    ).toBe('⚠ Energy was already falling before you started.');
  });

  test('bedtime was already getting later or earlier, in minutes', () => {
    const later = collect(
      sinceDetails(
        response(
          {
            alreadyChanging: true,
            diff: 25,
            low: 10,
            high: 40,
            before: { ...OK.before!, p10: 270, p90: 360 },
            since: { ...OK.since!, p10: 300, p90: 390 },
            line: 330,
          },
          'bedtime'
        ),
        t
      )
    );
    expect(later.alreadyChanging).toBe(
      '⚠ Bedtime was already getting later before you started.'
    );
    expect(later.stats).toBe(
      'difference +25 min · 95% range 10 to 40 min · p 0.004 · 350 days'
    );
    expect(later.typicalRange).toMatch(
      /^Usually between 11:00\sPM and 12:30\sAM \(before: 10:30\sPM–12:00\sAM\)\.$/
    );
    expect(later.aboveLine).toMatch(/^At or above 11:30\sPM on 64% of days/);
    expect(
      sinceDetails(response({ alreadyChanging: true, diff: -25 }, 'bedtime'), t)
        .alreadyChanging
    ).toBe('⚠ Bedtime was already getting earlier before you started.');
  });

  test('a tiny p reads as p < 0.001', () => {
    expect(sinceDetails(response({ p: 0.0002 }), t).stats).toContain(
      'p < 0.001'
    );
  });

  test('no regularity for a habit without active days', () => {
    expect(
      sinceDetails(response({ regularity: undefined }, 'mood', 'steps'), t)
        .regularity
    ).toBeNull();
  });

  test('a yes/no outcome has no typical range or line, and its numbers are shares', () => {
    const details = sinceDetails(
      response(
        {
          before: { ...OK.before!, mean: 0.25, p10: 0, p90: 1 },
          since: { ...OK.since!, mean: 0.4, p10: 0, p90: 1 },
          diff: 0.15,
          low: 0.05,
          high: 0.25,
          line: 1,
        },
        'meditated',
        'caffeine'
      ),
      t
    );
    expect(details.typicalRange).toBeNull();
    expect(details.aboveLine).toBeNull();
    expect(details.stats).toBe(
      'difference +15% · 95% range 5% to 25% · p 0.004 · 350 days'
    );
  });

  test('nothing to show until there is an answer', () => {
    expect(
      sinceDetails(response(short('fewSince', { days: 203, valueDays: 3 })), t)
    ).toEqual({
      typicalRange: null,
      aboveLine: null,
      regularity: null,
      alreadyChanging: null,
      stats: null,
    });
  });
});

describe('sinceCaveat', () => {
  test('names the habit and never claims a cause', () => {
    expect(
      sinceCaveat({ a: 'meditated', b: 'mood', choice: 'sinceHabit' }, t)
    ).toBe(
      'A lot can change over months; this shows a change since you started, not that meditating caused it.'
    );
  });
});
