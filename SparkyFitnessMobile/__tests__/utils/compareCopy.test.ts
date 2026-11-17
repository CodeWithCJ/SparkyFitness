import {
  type CompareQuestion,
  type CompareResponse,
  type CompareResult,
  SUGGESTED_QUESTIONS,
} from '@workspace/shared';
import i18n, { initializeI18n } from '../../src/localization/i18n';
import {
  compareAmountText,
  compareValueText,
  questionParts,
  sentenceText,
  statsLine,
  verdictCopy,
  yesNoWording,
} from '../../src/utils/compareCopy';

const t = ((key: string, options: Record<string, unknown>) =>
  i18n.t(key, options)) as never;

beforeAll(async () => {
  await initializeI18n('en');
  await i18n.changeLanguage('en');
});

const DAY_Q: CompareQuestion = {
  a: 'timeAsleep',
  b: 'energy',
  choice: 'sameDay',
};

function values(count: number, fill: (i: number) => number = (i) => i) {
  const out: Record<string, number> = {};
  for (let i = 0; i < count; i += 1) {
    out[`2026-09-${String((i % 28) + 1).padStart(2, '0')}-${i}`] = fill(i);
  }
  return out;
}

function response(
  result: Partial<CompareResult>,
  q: CompareQuestion = DAY_Q,
  a: Record<string, number> = values(20),
  b: Record<string, number> = values(20)
): CompareResponse {
  return {
    a: { key: q.a, values: a },
    b: { key: q.b, values: b },
    through: '2026-10-21',
    deviations: { a: {}, b: {} },
    result: {
      status: 'ok',
      n: 62,
      needed: 14,
      checks: { ownNormal: true },
      ...result,
    },
  } as CompareResponse;
}

const ALL: string[] = [];
function collect(copy: { headline: string; detail: string }) {
  ALL.push(copy.headline, copy.detail);
  return copy;
}

afterAll(() => {
  for (const s of ALL) expect(s.toLowerCase()).not.toMatch(/\bcause/);
});

describe('phrases', () => {
  test("a sleep metric is last night's by the day and plain by the week", () => {
    expect(questionParts({ a: 'timeAsleep', choice: 'sameDay' }, t).a).toBe(
      "last night's time asleep"
    );
    expect(
      questionParts({ a: 'overnightHrv', choice: 'nextDay' }, t).a
    ).toMatch(/^last night's/);
    expect(questionParts({ a: 'timeAsleep', choice: 'sameWeek' }, t).a).toBe(
      'time asleep'
    );
    expect(questionParts({ a: 'energy' }, t).a).toBe('energy');
    expect(questionParts({ b: 'timeAsleep' }, t).b).toBe('time asleep');
    expect(questionParts({ b: 'meditated' }, t).b).toBe('meditating');
  });

  test('the timing reads as plain days until both metrics are picked', () => {
    expect(
      questionParts({ a: 'timeAsleep', choice: 'sameDay' }, t).timing
    ).toBe('the same day');
    expect(
      questionParts({ a: 'timeAsleep', b: 'energy', choice: 'sameDay' }, t)
        .timing
    ).toBe('that day');
    expect(
      questionParts({ a: 'calories', b: 'energy', choice: 'sameWeek' }, t)
        .timing
    ).toBe('the same week');
    expect(
      questionParts({ a: 'calories', b: 'energy', choice: 'nextWeek' }, t)
        .timing
    ).toBe('the next week');
    expect(questionParts({}, t)).toEqual({
      a: undefined,
      b: undefined,
      timing: undefined,
    });
  });

  test('since mode names a sleep metric plainly and its timing chip reads "Since"', () => {
    expect(
      questionParts({ a: 'timeAsleep', b: 'mood', choice: 'sinceHabit' }, t)
    ).toEqual({ a: 'time asleep', b: 'mood', timing: 'Since' });
  });

  test('sentenceText', () => {
    expect(sentenceText(DAY_Q, t)).toBe(
      "Does last night's time asleep go with energy that day?"
    );
  });
});

describe('suggested questions read naturally', () => {
  test.each([
    [0, "Does last night's time asleep go with energy that day?"],
    [1, 'Does meditating go with mood the same day?'],
    [2, 'Does caffeine go with time asleep that night?'],
    [3, 'Does training load go with overnight HRV that night?'],
  ])('question %i', (i, text) => {
    expect(sentenceText(SUGGESTED_QUESTIONS[i], t)).toBe(text);
  });
});

describe('week-mode habits read as days per week', () => {
  const linked = { linked: true, strength: 'weak', sign: 'positive' } as const;

  test('binary A', () => {
    const q: CompareQuestion = {
      a: 'meditated',
      b: 'mood',
      choice: 'sameWeek',
    };
    expect(verdictCopy(response(linked, q), q, '1y', t).detail).toBe(
      'When the number of days you meditated was higher than usual, your mood the same week was higher than usual too.'
    );
    expect(sentenceText(q, t)).toBe(
      'Does meditating go with mood the same week?'
    );
  });

  test('binary B', () => {
    const q: CompareQuestion = {
      a: 'sleepScore',
      b: 'meditated',
      choice: 'sameWeek',
    };
    expect(verdictCopy(response(linked, q), q, '1y', t).detail).toBe(
      'When sleep score was higher than usual, the number of days you meditated the same week was higher than usual too.'
    );
  });

  test('noVariation names the habit as a count', () => {
    const q: CompareQuestion = {
      a: 'meditated',
      b: 'mood',
      choice: 'sameWeek',
    };
    const c = verdictCopy(
      response(
        { status: 'not_enough', reason: 'noVariation', n: 0 },
        q,
        values(20, () => 2),
        values(20)
      ),
      q,
      '1y',
      t
    );
    expect(c.detail).toBe(
      "The number of days you meditated was the same every time over this span, so there's nothing to compare it with."
    );
  });
});

describe('verdictCopy', () => {
  test('difference path hint wording', () => {
    const q: CompareQuestion = { a: 'meditated', b: 'mood', choice: 'sameDay' };
    const binary = {
      yesKey: 'meditated' as const,
      yesMean: 5,
      noMean: 1,
      yesCount: 9,
      noCount: 30,
      diff: 4,
    };
    const c = verdictCopy(
      response({ method: 'difference', linked: false, binary }, q),
      q,
      '30d',
      t
    );
    expect(c.detail).toContain(
      'A longer span makes a small difference easier to see.'
    );
    expect(c.detail).not.toContain('weak link');
  });

  test('linked positive', () => {
    const c = collect(
      verdictCopy(
        response({ linked: true, strength: 'moderate', sign: 'positive' }),
        DAY_Q,
        '90d',
        t
      )
    );
    expect(c.headline).toBe('Yes, a moderate link');
    expect(c.detail).toBe(
      "When last night's time asleep was higher than usual, your energy that day was higher than usual too."
    );
  });

  test('linked negative', () => {
    const c = collect(
      verdictCopy(
        response({ linked: true, strength: 'weak', sign: 'negative' }),
        DAY_Q,
        '90d',
        t
      )
    );
    expect(c.headline).toBe('Yes, a weak link');
    expect(c.detail).toContain('your energy that day was lower than usual.');
  });

  test('not linked with the longer-span hint', () => {
    const c = collect(
      verdictCopy(response({ linked: false }), DAY_Q, '30d', t)
    );
    expect(c.headline).toBe('No clear link');
    expect(c.detail).toContain(
      "Over these 62 days, they didn't move together more than chance would explain."
    );
    expect(c.detail).toContain(
      'A longer span makes a weak link easier to see.'
    );
  });

  test('not linked without the hint on the longest or custom span', () => {
    for (const span of ['90d', 'custom'] as const) {
      const c = collect(
        verdictCopy(response({ linked: false }), DAY_Q, span, t)
      );
      expect(c.detail).not.toContain('longer span');
    }
    const weekQ: CompareQuestion = {
      a: 'calories',
      b: 'steps',
      choice: 'sameWeek',
    };
    const week = collect(
      verdictCopy(response({ linked: false, n: 20 }, weekQ), weekQ, '1y', t)
    );
    expect(week.detail).toContain('Over these 20 weeks');
    expect(week.detail).not.toContain('longer span');
    expect(
      verdictCopy(response({ linked: false }, weekQ), weekQ, '6m', t).detail
    ).toContain('longer span');
  });

  test('binary linked and not linked', () => {
    const q: CompareQuestion = { a: 'meditated', b: 'mood', choice: 'sameDay' };
    const binary = {
      yesKey: 'meditated' as const,
      yesMean: 5,
      noMean: 1,
      yesCount: 9,
      noCount: 30,
      diff: 4,
    };
    const up = collect(
      verdictCopy(
        response({ method: 'difference', linked: true, binary }, q),
        q,
        '90d',
        t
      )
    );
    expect(up.headline).toBe('Yes, a difference');
    expect(up.detail).toBe(
      'On days you meditated, your mood was higher than on days without meditating.'
    );
    const down = collect(
      verdictCopy(
        response(
          {
            method: 'difference',
            linked: true,
            binary: { ...binary, diff: -4 },
          },
          q
        ),
        q,
        '90d',
        t
      )
    );
    expect(down.detail).toBe(
      'On days you meditated, your mood was lower than on days without meditating.'
    );
    const none = collect(
      verdictCopy(
        response({ method: 'difference', linked: false, binary }, q),
        q,
        '90d',
        t
      )
    );
    expect(none.headline).toBe('No clear difference');
  });

  test('too few in day and week modes', () => {
    const day = collect(
      verdictCopy(
        response(
          {
            status: 'not_enough',
            reason: 'tooFew',
            n: 9,
            needed: 14,
          },
          DAY_Q,
          values(10),
          values(10)
        ),
        DAY_Q,
        '90d',
        t
      )
    );
    expect(day.headline).toBe('Not enough days yet');
    expect(day.detail).toContain('You have 9 days; an answer needs 14 days.');
    expect(day.detail).toContain(
      'Log time asleep on 5 more days, or pick a longer span.'
    );
    expect(day.detail).not.toContain('previous two weeks');

    const weekQ: CompareQuestion = {
      a: 'calories',
      b: 'steps',
      choice: 'sameWeek',
    };
    const week = collect(
      verdictCopy(
        response(
          { status: 'not_enough', reason: 'tooFew', n: 3, needed: 8 },
          weekQ
        ),
        weekQ,
        '6m',
        t
      )
    );
    expect(week.headline).toBe('Not enough weeks yet');
    expect(week.detail).toContain('You have 3 weeks; an answer needs 8 weeks.');
  });

  test('the weaker side is the one with fewer values', () => {
    const c = verdictCopy(
      response(
        { status: 'not_enough', reason: 'tooFew', n: 9, needed: 14 },
        DAY_Q,
        values(30),
        values(10)
      ),
      DAY_Q,
      '90d',
      t
    );
    expect(c.detail).toContain('Log energy on 5 more days');
  });

  test.each<[CompareQuestion['a'], string]>([
    ['weightTrend', 'weight'],
    ['bedtime', 'sleep'],
    ['bedtimeConsistency', 'sleep'],
    ['trainingLoad', 'workouts'],
    ['workoutMinutes', 'workouts'],
    ['cardioMinutes', 'workouts'],
    ['strengthVolume', 'workouts'],
    ['meditationSessions7d', 'meditation'],
    ['meditationMinutes', 'meditation'],
    ['meditated', 'meditation'],
    ['timeAsleep', 'time asleep'],
    ['caffeine', 'caffeine'],
  ])('asks to log what %s is worked out from', (key, logged) => {
    const q: CompareQuestion = { a: key, b: 'energy', choice: 'sameDay' };
    const c = verdictCopy(
      response(
        { status: 'not_enough', reason: 'tooFew', n: 8, needed: 14 },
        q,
        values(8),
        values(30)
      ),
      q,
      '90d',
      t
    );
    expect(c.detail).toContain(
      `Log ${logged} on 6 more days, or pick a longer span.`
    );
  });

  test('asks for more weeks of workouts by the week', () => {
    const q: CompareQuestion = {
      a: 'mood',
      b: 'trainingLoad',
      choice: 'nextWeek',
    };
    const c = verdictCopy(
      response(
        { status: 'not_enough', reason: 'tooFew', n: 5, needed: 8 },
        q,
        values(30),
        values(5)
      ),
      q,
      '6m',
      t
    );
    expect(c.detail).toContain(
      'Log workouts for 3 more weeks, or pick a longer span.'
    );
  });

  test('explains the own-normal history when many days are logged', () => {
    const c = verdictCopy(
      response(
        { status: 'not_enough', reason: 'tooFew', n: 3, needed: 14 },
        DAY_Q,
        values(40),
        values(40)
      ),
      DAY_Q,
      '90d',
      t
    );
    expect(c.detail).toContain(
      'Each day is compared with your previous two weeks, so a day needs a week of history first.'
    );
  });

  test('fewYes and fewNo name the yes/no metric', () => {
    const q: CompareQuestion = { a: 'meditated', b: 'mood', choice: 'sameDay' };
    const few = collect(
      verdictCopy(
        response(
          { status: 'not_enough', reason: 'fewYes', n: 2, needed: 5 },
          q
        ),
        q,
        '90d',
        t
      )
    );
    expect(few.headline).toBe('Not enough days when you meditated yet');
    expect(few.detail).toBe(
      'You have 2 days; an answer needs 5 days. Try a longer span.'
    );
    const no = collect(
      verdictCopy(
        response({ status: 'not_enough', reason: 'fewNo', n: 1, needed: 5 }, q),
        q,
        '90d',
        t
      )
    );
    expect(no.headline).toBe('Not enough days without meditating yet');
    expect(no.detail).toBe(
      "You meditated on almost every day here, so there's nothing to compare against. Try a longer span."
    );
  });

  test('no variation names what did not change and never asks for more days', () => {
    const c = collect(
      verdictCopy(
        response(
          { status: 'not_enough', reason: 'noVariation', n: 0 },
          DAY_Q,
          values(20, () => 3),
          values(20)
        ),
        DAY_Q,
        '90d',
        t
      )
    );
    expect(c.headline).toBe('Nothing to compare yet');
    expect(c.detail).toBe(
      "Time asleep was the same every time over this span, so there's nothing to compare it with."
    );
    const generic = collect(
      verdictCopy(
        response({ status: 'not_enough', reason: 'noVariation', n: 0 }),
        DAY_Q,
        '90d',
        t
      )
    );
    expect(generic.detail).toBe("One of these didn't change over this span.");
    expect(c.detail.toLowerCase()).not.toContain('more days');
    expect(generic.detail.toLowerCase()).not.toContain('more days');
  });
});

describe('bedtime reads later or earlier', () => {
  const positive = {
    method: 'pearson',
    linked: true,
    strength: 'weak',
    sign: 'positive',
  } as const;
  const negative = { ...positive, sign: 'negative' } as const;

  test('bedtime as the first thing', () => {
    const q: CompareQuestion = { a: 'bedtime', b: 'energy', choice: 'nextDay' };
    expect(verdictCopy(response(positive, q), q, '90d', t).detail).toBe(
      "When last night's bedtime was later than usual, your energy the day after you woke was higher than usual too."
    );
    expect(verdictCopy(response(negative, q), q, '90d', t).detail).toBe(
      "When last night's bedtime was later than usual, your energy the day after you woke was lower than usual."
    );
  });

  test('bedtime as the second thing', () => {
    const q: CompareQuestion = {
      a: 'caffeine',
      b: 'bedtime',
      choice: 'sameDay',
    };
    expect(verdictCopy(response(positive, q), q, '90d', t).detail).toBe(
      'When caffeine was higher than usual, your bedtime the night before was later than usual too.'
    );
    expect(verdictCopy(response(negative, q), q, '90d', t).detail).toBe(
      'When caffeine was higher than usual, your bedtime the night before was earlier than usual.'
    );
  });

  test('bedtime as the outcome of a yes/no habit', () => {
    const q: CompareQuestion = {
      a: 'meditated',
      b: 'bedtime',
      choice: 'nextDay',
    };
    const binary = {
      yesKey: 'meditated' as const,
      yesMean: 255,
      noMean: 230,
      yesCount: 12,
      noCount: 28,
      diff: 25,
    };
    expect(
      verdictCopy(
        response({ method: 'difference', linked: true, binary }, q),
        q,
        '90d',
        t
      ).detail
    ).toBe(
      'On days you meditated, your bedtime that night was later than on other nights.'
    );
    expect(
      verdictCopy(
        response(
          {
            method: 'difference',
            linked: true,
            binary: { ...binary, diff: -25 },
          },
          q
        ),
        q,
        '90d',
        t
      ).detail
    ).toBe(
      'On days you meditated, your bedtime that night was earlier than on other nights.'
    );
  });

  test('bedtime consistency is a spread, so it stays higher or lower', () => {
    const q: CompareQuestion = {
      a: 'bedtimeConsistency',
      b: 'mood',
      choice: 'sameDay',
    };
    expect(verdictCopy(response(negative, q), q, '90d', t).detail).toBe(
      "When last night's bedtime consistency was higher than usual, your mood that day was lower than usual."
    );
  });
});

describe('statsLine', () => {
  const base: CompareResult = {
    status: 'ok',
    n: 62,
    needed: 14,
    method: 'pearson',
    r: 0.41,
    low: 0.12,
    high: 0.64,
    p: 0.012,
    checks: { ownNormal: true },
  };

  test('correlation', () => {
    expect(statsLine(base, 'day', t)).toBe(
      'r 0.41 · 95% range 0.12 to 0.64 · p 0.012 · 62 days'
    );
  });

  test('tiny p', () => {
    expect(statsLine({ ...base, p: 0.0004 }, 'day', t)).toContain('p < 0.001');
  });

  test('week mode counts weeks', () => {
    expect(statsLine({ ...base, n: 20 }, 'week', t)).toContain('20 weeks');
  });

  test('not enough is null', () => {
    expect(
      statsLine({ ...base, status: 'not_enough', reason: 'tooFew' }, 'day', t)
    ).toBeNull();
  });

  test('a bedtime difference is in whole minutes', () => {
    const line = statsLine(
      {
        ...base,
        method: 'difference',
        r: undefined,
        low: 10.4,
        high: 39.6,
        binary: {
          yesKey: 'meditated',
          yesMean: 255,
          noMean: 230,
          yesCount: 12,
          noCount: 28,
          diff: 25,
        },
      },
      'day',
      t,
      'bedtime'
    );
    expect(line).toBe(
      'difference +25 min · 95% range 10 to 40 min · p 0.012 · 62 days'
    );
  });

  test('difference shows mood on the 1-10 scale', () => {
    const line = statsLine(
      {
        ...base,
        method: 'difference',
        r: undefined,
        low: 2,
        high: 16,
        binary: {
          yesKey: 'meditated',
          yesMean: 60,
          noMean: 50,
          yesCount: 9,
          noCount: 30,
          diff: 9.4,
        },
      },
      'day',
      t,
      'mood'
    );
    expect(line).toBe(
      'difference 0.9 · 95% range 0.2 to 1.6 · p 0.012 · 62 days'
    );
  });
});

describe('compareAmountText', () => {
  test('an amount on the display scale, to the metric precision', () => {
    expect(compareAmountText('mood', 8)).toBe('0.8');
    expect(compareAmountText('timeAsleep', 0.44)).toBe('0.4');
    expect(compareAmountText('steps', 1623.4)).toBe('1,623');
  });

  test('a signed difference', () => {
    expect(compareAmountText('mood', 8, true)).toBe('+0.8');
    expect(compareAmountText('energy', -0.5, true)).toBe('-0.5');
    expect(compareAmountText('steps', 0, true)).toBe('0');
  });

  test('bedtime is a span of whole minutes, not a clock time', () => {
    expect(compareAmountText('bedtime', -30.4, true)).toBe('-30');
  });

  test('calories follow the energy unit; other metrics do not', () => {
    expect(compareAmountText('calories', 2000)).toBe('2,000');
    expect(compareAmountText('calories', 2000, false, 'kJ')).toBe('8,368');
    expect(compareValueText('calories', 100, 'kJ')).toBe('418');
    expect(compareAmountText('steps', 2000, false, 'kJ')).toBe('2,000');
  });
});

describe('compareValueText', () => {
  test('keeps one decimal on scales and averages', () => {
    expect(compareValueText('mood', 58)).toBe('5.8');
    expect(compareValueText('energy', 3.25)).toBe('3.3');
    expect(compareValueText('timeAsleep', 7)).toBe('7.0');
  });

  test('shows counts and minutes whole', () => {
    expect(compareValueText('steps', 8432.6)).toBe('8,433');
    expect(compareValueText('workoutMinutes', 45.4)).toBe('45');
    expect(compareValueText('meditationSessions7d', 3)).toBe('3');
    expect(compareValueText('meditated', 4)).toBe('4');
  });

  test('shows bedtime as a clock time, wrapping past midnight', () => {
    expect(compareValueText('bedtime', 255)).toMatch(/^10:15\sPM$/);
    expect(compareValueText('bedtime', 390)).toMatch(/^12:30\sAM$/);
    expect(compareValueText('bedtime', -30)).toMatch(/^5:30\sPM$/);
  });
});

describe('metric names in a language that capitalizes nouns', () => {
  // German labels and the German question, as translated on Weblate.
  const GERMAN: Record<string, string> = {
    'compareReport.metrics.mood': 'Stimmung',
    'compareReport.metrics.steps': 'Schritte',
    'compareReport.metrics.meditated': 'Meditiert',
    'compareReport.yesNo.onDays': 'An Tagen, an denen du {{yes}} hast',
  };
  // The German string where the test has one, else the app's own (English)
  // catalog. Not via `defaultValue`: i18next prefers the English fallback.
  const german = ((key: string, options: Record<string, unknown>) => {
    const template = GERMAN[key];
    if (template === undefined) return i18n.t(key, options);
    return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) =>
      String(options[name])
    );
  }) as never;

  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  test('German keeps the capital of a noun in the middle of a sentence', async () => {
    await i18n.changeLanguage('de');
    const text = sentenceText(
      { a: 'mood', b: 'steps', choice: 'sameDay' },
      german
    );
    expect(text).toContain('Stimmung');
    expect(text).toContain('Schritte');
  });

  test('German still lowers a yes/no label, which is a verb', async () => {
    await i18n.changeLanguage('de');
    const wording = yesNoWording(
      { a: 'meditated', b: 'mood', choice: 'sameDay' },
      'meditated',
      german
    );
    expect(wording.when).toBe('An Tagen, an denen du meditiert hast');
  });

  test('German lowers a label that is not translated yet, as English needs', async () => {
    await i18n.changeLanguage('de');
    const english = ((key: string, options: Record<string, unknown>) =>
      i18n.t(key, { ...options, lng: 'en' })) as never;
    expect(
      sentenceText({ a: 'mood', b: 'steps', choice: 'sameDay' }, english)
    ).toBe('Does mood go with steps the same day?');
  });

  test('English still lowers a noun in the middle of a sentence', () => {
    expect(sentenceText({ a: 'mood', b: 'steps', choice: 'sameDay' }, t)).toBe(
      'Does mood go with steps the same day?'
    );
  });
});
