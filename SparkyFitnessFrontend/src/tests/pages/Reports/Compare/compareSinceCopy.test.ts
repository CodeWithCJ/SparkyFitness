import fs from 'fs';
import path from 'path';
import {
  type CompareMetricKey,
  type CompareQuestion,
  type CompareSinceResponse,
  type CompareSinceResult,
} from '@workspace/shared';
import { translateForTest } from '@/tests/mocks/reactI18next';
import {
  questionParts,
  type Translator,
} from '@/pages/Reports/Compare/compareCopy';
import {
  sinceAlreadyChangingLine,
  sinceCaveat,
  sinceHowSureLines,
  sinceRegularityLine,
  sinceSentence,
  sinceStretchRows,
  sinceVerdictCopy,
} from '@/pages/Reports/Compare/compareSinceCopy';

// Every key the module asks for, with the English it passed, so the last test
// can check en/translation.json says the same thing.
const defaultsByKey = new Map<string, { other: string; one?: string }>();

const t: Translator = (key, options) => {
  const one = options['defaultValue_one'];
  defaultsByKey.set(key, {
    other: options.defaultValue,
    one: typeof one === 'string' ? one : undefined,
  });
  return translateForTest(key, options);
};

/** What the app's `formatDateInUserTimezone(day, 'PP')` gives, e.g. "Apr 1, 2026". */
const formatDay = (day: string): string =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`));

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
    expect(collect(sinceVerdictCopy(response({}), t, formatDay))).toEqual({
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
        t,
        formatDay
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
      t,
      formatDay
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
      t,
      formatDay
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
      t,
      formatDay
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
      t,
      formatDay
    );
    expect(later.detail).toMatch(/\(45 min later\)\.$/);
  });

  test('a bedtime verdict follows the 12/24-hour setting', () => {
    const copy = sinceVerdictCopy(
      response(
        {
          before: { ...OK.before!, mean: 330 },
          since: { ...OK.since!, mean: 300 },
          diff: -30,
        },
        'bedtime'
      ),
      t,
      formatDay,
      'HH:mm'
    );
    expect(copy.detail).toBe(
      'Since Apr 1, 2026, your bedtime averaged 23:00 vs 23:30 before (30 min earlier).'
    );
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
      t,
      formatDay
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
    expect(collect(sinceVerdictCopy(response(longAgo), t, formatDay))).toEqual({
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
          t,
          formatDay
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
          t,
          formatDay
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
        t,
        formatDay
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
          t,
          formatDay
        )
      ).detail
    ).toBe("It's been 20 days since then; an answer needs 28 days.");
    expect(
      collect(
        sinceVerdictCopy(
          response(short('fewBefore', { days: 20, valueDays: 20 })),
          t,
          formatDay
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
        sinceVerdictCopy(
          recent('fewBefore', { days: 20, valueDays: 18 }),
          t,
          formatDay
        )
      )
    ).toEqual({
      headline: 'Not enough since Apr 1, 2026 yet',
      detail: "It's been 20 days since then; an answer needs 28 days.",
    });
    expect(
      collect(
        sinceVerdictCopy(
          recent('fewSince', { days: 20, valueDays: 5 }),
          t,
          formatDay
        )
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
        t,
        formatDay
      )
    );
    expect(copy).toEqual({
      headline: 'Pick the day you started',
      detail: 'Then this compares your mood before and since that day.',
    });
    expect(copy.detail.toLowerCase()).not.toContain('not enough');
  });
});

describe('sinceCaveat', () => {
  test('names the habit and never claims a cause', () => {
    expect(sinceCaveat({ a: 'meditated', b: 'mood' }, t)).toBe(
      'A lot can change over months; this shows a change since you started, not that meditating caused it.'
    );
  });
});

describe('sinceHowSureLines', () => {
  test('the difference, range, how unusual and days used', () => {
    expect(sinceHowSureLines(response({}), t)).toEqual([
      { label: 'Difference', value: '+0.8' },
      { label: 'Likely between', value: '0.3 to 1.3' },
      {
        label: 'How unusual',
        value:
          'With no real change, a difference this big would show up about 1 time in 250 (p = 0.004)',
      },
      { label: 'Days used', value: '350 days (160 before, 190 since)' },
    ]);
  });

  test('how-sure lines word the p-value as a change, never a fluke', () => {
    for (const p of [0.0002, 0.004, 0.7]) {
      const lines = sinceHowSureLines(response({ p }), t);
      for (const line of lines) {
        expect(`${line.label} ${line.value}`).not.toMatch(/fluke/i);
      }
      expect(lines[2]?.value).toMatch(/real change/);
    }
    expect(sinceHowSureLines(response({ p: 0.0002 }), t)[2]?.value).toBe(
      'With no real change, a difference this big would show up less than 1 time in 1,000 (p < 0.001)'
    );
    expect(sinceHowSureLines(response({ p: 0.7 }), t)[2]?.value).toBe(
      'Differences like this are common with no real change (p = 0.700)'
    );
    expect(sinceHowSureLines(response({}), t)[2]?.value).toContain(
      'With no real change'
    );
  });

  test('bedtime gives its range in minutes', () => {
    const lines = sinceHowSureLines(
      response({ diff: 25, low: 10, high: 40 }, 'bedtime'),
      t
    );
    expect(lines[0]?.value).toBe('25 min later');
    expect(lines[1]?.value).toBe('10 to 40 min');
  });

  test('a yes/no outcome gives shares', () => {
    const lines = sinceHowSureLines(
      response({ diff: 0.15, low: 0.05, high: 0.25 }, 'meditated', 'caffeine'),
      t
    );
    expect(lines[0]?.value).toBe('+15%');
    expect(lines[1]?.value).toBe('5% to 25%');
  });

  test('nothing until there is an answer', () => {
    expect(
      sinceHowSureLines(
        response(short('fewSince', { days: 203, valueDays: 3 })),
        t
      )
    ).toEqual([]);
    expect(sinceHowSureLines(response({ p: undefined }), t)).toEqual([]);
  });
});

describe('sinceStretchRows', () => {
  test('a before row and a since row', () => {
    expect(sinceStretchRows(response({}), t, formatDay)).toEqual([
      {
        side: 'before',
        label: 'Before',
        dates: 'Oct 8, 2025 – Mar 31, 2026',
        valueDays: '160 days',
        average: '5.8',
        usual: '4.0–7.2',
        atOrAbove: '38%',
      },
      {
        side: 'since',
        label: 'Since',
        dates: 'Apr 1, 2026 – Oct 20, 2026',
        valueDays: '190 days',
        average: '6.6',
        usual: '5.2–8.0',
        atOrAbove: '64%',
      },
    ]);
  });

  test('a yes/no outcome has no usual range or line share', () => {
    const rows = sinceStretchRows(
      response(
        {
          before: { ...OK.before!, mean: 0.25, p10: 0, p90: 1 },
          since: { ...OK.since!, mean: 0.62, p10: 0, p90: 1 },
        },
        'meditated',
        'caffeine'
      ),
      t,
      formatDay
    );
    expect(rows[1]?.usual).toBeNull();
    expect(rows[1]?.atOrAbove).toBeNull();
    expect(rows[1]?.average).toBe('62%');
    expect(rows[0]?.average).toBe('25%');
  });

  test('bedtime averages follow the 24-hour setting', () => {
    const rows = sinceStretchRows(
      response(
        {
          before: { ...OK.before!, mean: 300, p10: 270, p90: 360 },
          since: { ...OK.since!, mean: 315, p10: 300, p90: 390 },
          line: 330,
        },
        'bedtime'
      ),
      t,
      formatDay,
      'HH:mm'
    );
    expect(rows[1]?.average).toBe('23:15');
    expect(rows[1]?.usual).toBe('23:00–00:30');
  });

  test('no rows until there is an answer', () => {
    expect(
      sinceStretchRows(
        response(short('fewSince', { days: 203, valueDays: 3 })),
        t,
        formatDay
      )
    ).toEqual([]);
  });
});

describe('sinceRegularityLine', () => {
  test('counts the weeks kept', () => {
    expect(sinceRegularityLine(OK, t)).toBe(
      'You kept it up in 24 of 28 weeks since.'
    );
  });

  test('regularity uses the plural', () => {
    expect(
      sinceRegularityLine({ ...OK, regularity: { weeksKept: 1, weeks: 1 } }, t)
    ).toBe('You kept it up in 1 of 1 week since.');
  });

  test('none without regularity or without weeks', () => {
    expect(sinceRegularityLine({ ...OK, regularity: undefined }, t)).toBeNull();
    expect(
      sinceRegularityLine({ ...OK, regularity: { weeksKept: 0, weeks: 0 } }, t)
    ).toBeNull();
  });
});

describe('sinceAlreadyChangingLine', () => {
  test('warns when the outcome was already rising or falling', () => {
    expect(
      sinceAlreadyChangingLine(response({ alreadyChanging: true }), t)
    ).toBe('⚠ Mood was already rising before you started.');
    expect(
      sinceAlreadyChangingLine(
        response({ alreadyChanging: true, diff: -0.4 }, 'energy'),
        t
      )
    ).toBe('⚠ Energy was already falling before you started.');
  });

  test('bedtime was already getting later or earlier', () => {
    expect(
      sinceAlreadyChangingLine(
        response({ alreadyChanging: true, diff: 25 }, 'bedtime'),
        t
      )
    ).toBe('⚠ Bedtime was already getting later before you started.');
    expect(
      sinceAlreadyChangingLine(
        response({ alreadyChanging: true, diff: -25 }, 'bedtime'),
        t
      )
    ).toBe('⚠ Bedtime was already getting earlier before you started.');
  });

  test('none when it was not already changing', () => {
    expect(sinceAlreadyChangingLine(response({}), t)).toBeNull();
  });
});

describe('the wording of a since choice', () => {
  test('since reads Since', () => {
    expect(
      questionParts({ a: 'meditated', b: 'mood', choice: 'sinceHabit' }, t)
        .timing
    ).toBe('Since');
  });
});

// Runs last, so it sees every key the tests above asked for.
describe('en/translation.json', () => {
  test('says the same English as every default the wording passes', () => {
    const json: unknown = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), 'public/locales/en/translation.json'),
        'utf-8'
      )
    );
    const leaf = (key: string): unknown =>
      key
        .split('.')
        .reduce<unknown>(
          (node, part) =>
            typeof node === 'object' && node !== null
              ? (node as Record<string, unknown>)[part]
              : undefined,
          json
        );

    expect(defaultsByKey.size).toBeGreaterThan(20);
    const mismatches: string[] = [];
    for (const [key, { other, one }] of defaultsByKey) {
      const plain = leaf(key);
      if (typeof plain === 'string') {
        if (plain !== other) mismatches.push(`${key}: ${plain} != ${other}`);
        continue;
      }
      if (leaf(`${key}_other`) !== other) {
        mismatches.push(`${key}(_other) missing or != ${other}`);
      }
      if (one !== undefined && leaf(`${key}_one`) !== one) {
        mismatches.push(`${key}_one missing or != ${one}`);
      }
    }
    expect(mismatches).toEqual([]);
  });
});
