import fs from 'fs';
import path from 'path';
import {
  COMPARE_METRIC_KEYS,
  type CompareQuestion,
  type CompareResponse,
  type CompareResult,
  SUGGESTED_QUESTIONS,
} from '@workspace/shared';
import { translateForTest } from '@/tests/mocks/reactI18next';
import {
  checkLines,
  compareAmountText,
  compareShownAmountText,
  compareValueText,
  dotsAxisCaption,
  howSureLines,
  metricName,
  questionParts,
  sentenceText,
  subjectName,
  timingLabel,
  type Translator,
  verdictCopy,
  yesNoWording,
} from '@/pages/Reports/Compare/compareCopy';
import {
  COMPARE_GROUP_LABELS,
  COMPARE_METRIC_LABELS,
} from '@/pages/Reports/Compare/compareMetricLabels';

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
  };
}

const ALL: string[] = [];
function collect(copy: { headline: string; detail: string }) {
  ALL.push(copy.headline, copy.detail);
  return copy;
}

afterAll(() => {
  for (const s of ALL) expect(s.toLowerCase()).not.toMatch(/\bcause/);
});

describe('labels', () => {
  test('every metric has its English label', () => {
    expect(Object.keys(COMPARE_METRIC_LABELS).sort()).toEqual(
      [...COMPARE_METRIC_KEYS].sort()
    );
    expect(COMPARE_METRIC_LABELS.overnightHrv(t)).toBe('Overnight HRV');
    expect(COMPARE_METRIC_LABELS.meditationSessions7d(t)).toBe(
      'Meditation sessions (7 days)'
    );
  });

  test('the groups read as on the phone', () => {
    expect(
      ['feelings', 'sleep', 'meditation', 'food', 'training', 'body'].map(
        (group) =>
          COMPARE_GROUP_LABELS[group as keyof typeof COMPARE_GROUP_LABELS](t)
      )
    ).toEqual([
      'How you felt',
      'Sleep',
      'Meditation',
      'Food',
      'Training',
      'Body',
    ]);
  });

  test('metricName starts a line, with a yes/no habit as a noun', () => {
    expect(metricName('timeAsleep', t)).toBe('Time asleep');
    expect(metricName('meditated', t)).toBe('Meditating');
  });
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

  test('sentenceText', () => {
    expect(sentenceText(DAY_Q, t)).toBe(
      "Does last night's time asleep go with energy that day?"
    );
  });

  test('sentenceText words caffeine with sleep as that night for nextDay', () => {
    expect(
      sentenceText({ a: 'caffeine', b: 'timeAsleep', choice: 'nextDay' }, t)
    ).toBe('Does caffeine go with time asleep that night?');
  });

  test("sentenceText words time asleep with energy as last night's … that day for sameDay", () => {
    expect(
      sentenceText({ a: 'timeAsleep', b: 'energy', choice: 'sameDay' }, t)
    ).toBe("Does last night's time asleep go with energy that day?");
  });
});

describe('timingLabel', () => {
  test('a since choice reads Since', () => {
    expect(timingLabel('sinceHabit', 'meditated', 'mood', t)).toBe('Since');
    expect(
      questionParts({ a: 'meditated', b: 'mood', choice: 'sinceHabit' }, t)
        .timing
    ).toBe('Since');
  });

  test('lists the three day timings for caffeine → time asleep as two nights before / the night before / that night', () => {
    expect(
      (['dayBefore', 'sameDay', 'nextDay'] as const).map((choice) =>
        timingLabel(choice, 'caffeine', 'timeAsleep', t)
      )
    ).toEqual(['two nights before', 'the night before', 'that night']);
  });

  test('neither side sleep, A sleep, both sleep, and by the week', () => {
    expect(
      (['dayBefore', 'sameDay', 'nextDay'] as const).map((choice) =>
        timingLabel(choice, 'calories', 'energy', t)
      )
    ).toEqual(['the day before', 'the same day', 'the next day']);
    expect(
      (['dayBefore', 'sameDay', 'nextDay'] as const).map((choice) =>
        timingLabel(choice, 'timeAsleep', 'energy', t)
      )
    ).toEqual(['the day before', 'that day', 'the day after you woke']);
    expect(
      (['dayBefore', 'sameDay', 'nextDay'] as const).map((choice) =>
        timingLabel(choice, 'timeAsleep', 'sleepScore', t)
      )
    ).toEqual(['the night before', 'the same night', 'the next night']);
    expect(
      (['sameWeek', 'nextWeek'] as const).map((choice) =>
        timingLabel(choice, 'timeAsleep', 'mood', t)
      )
    ).toEqual(['the same week', 'the next week']);
  });
});

describe('suggested questions read naturally', () => {
  test.each([
    [0, "Does last night's time asleep go with energy that day?"],
    [1, 'Does meditating go with mood the same day?'],
    [2, 'Does caffeine go with time asleep that night?'],
    [3, 'Does training load go with overnight HRV that night?'],
  ])('question %i', (i, text) => {
    const q = SUGGESTED_QUESTIONS[i];
    if (!q) throw new Error(`no suggested question ${i}`);
    expect(sentenceText(q, t)).toBe(text);
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

  test('a strong link', () => {
    expect(
      verdictCopy(
        response({ linked: true, strength: 'strong', sign: 'positive' }),
        DAY_Q,
        '90d',
        t
      ).headline
    ).toBe('Yes, a strong link');
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
    expect(none.detail).toBe(
      "Over these 62 days, your mood wasn't different enough between the two kinds of day to rule out chance."
    );
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

  test('one more day or week reads in the singular', () => {
    const day = verdictCopy(
      response(
        { status: 'not_enough', reason: 'tooFew', n: 13, needed: 14 },
        DAY_Q,
        values(13),
        values(13)
      ),
      DAY_Q,
      '90d',
      t
    );
    expect(day.detail).toContain(
      'Log time asleep on 1 more day, or pick a longer span.'
    );
    const weekQ: CompareQuestion = {
      a: 'calories',
      b: 'steps',
      choice: 'sameWeek',
    };
    const week = verdictCopy(
      response(
        { status: 'not_enough', reason: 'tooFew', n: 1, needed: 2 },
        weekQ,
        values(1),
        values(1)
      ),
      weekQ,
      '6m',
      t
    );
    expect(week.detail).toBe(
      'You have 1 week; an answer needs 2 weeks. Log calories for 1 more week, or pick a longer span.'
    );
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

// Ported from the phone's compareCopy.table.test.ts.
// Sleep is dated by the wake day: A on day d pairs with B on d + timing.
describe('day mode: which side is sleep × timing', () => {
  const LINKED = {
    method: 'pearson',
    linked: true,
    strength: 'weak',
    sign: 'positive',
  } as const;

  test.each<[string, CompareQuestion, string, string]>([
    // Neither side is sleep.
    [
      'neither, the day before',
      { a: 'calories', b: 'energy', choice: 'dayBefore' },
      'Does calories go with energy the day before?',
      'When calories was higher than usual, your energy the day before was higher than usual too.',
    ],
    [
      'neither, the same day',
      { a: 'calories', b: 'energy', choice: 'sameDay' },
      'Does calories go with energy the same day?',
      'When calories was higher than usual, your energy the same day was higher than usual too.',
    ],
    [
      'neither, the next day',
      { a: 'calories', b: 'energy', choice: 'nextDay' },
      'Does calories go with energy the next day?',
      'When calories was higher than usual, your energy the next day was higher than usual too.',
    ],
    // A is a sleep metric.
    [
      'A sleep, the day before',
      { a: 'timeAsleep', b: 'energy', choice: 'dayBefore' },
      "Does last night's time asleep go with energy the day before?",
      "When last night's time asleep was higher than usual, your energy the day before was higher than usual too.",
    ],
    [
      'A sleep, the same day',
      { a: 'timeAsleep', b: 'energy', choice: 'sameDay' },
      "Does last night's time asleep go with energy that day?",
      "When last night's time asleep was higher than usual, your energy that day was higher than usual too.",
    ],
    [
      'A sleep, the next day',
      { a: 'timeAsleep', b: 'energy', choice: 'nextDay' },
      "Does last night's time asleep go with energy the day after you woke?",
      "When last night's time asleep was higher than usual, your energy the day after you woke was higher than usual too.",
    ],
    // B is a sleep metric.
    [
      'B sleep, the day before',
      { a: 'caffeine', b: 'timeAsleep', choice: 'dayBefore' },
      'Does caffeine go with time asleep two nights before?',
      'When caffeine was higher than usual, your time asleep two nights before was higher than usual too.',
    ],
    [
      'B sleep, the same day',
      { a: 'caffeine', b: 'timeAsleep', choice: 'sameDay' },
      'Does caffeine go with time asleep the night before?',
      'When caffeine was higher than usual, your time asleep the night before was higher than usual too.',
    ],
    [
      'B sleep, the next day',
      { a: 'caffeine', b: 'timeAsleep', choice: 'nextDay' },
      'Does caffeine go with time asleep that night?',
      'When caffeine was higher than usual, your time asleep that night was higher than usual too.',
    ],
    // Both sides are sleep metrics.
    [
      'both sleep, the day before',
      { a: 'timeAsleep', b: 'sleepScore', choice: 'dayBefore' },
      "Does last night's time asleep go with sleep score the night before?",
      "When last night's time asleep was higher than usual, your sleep score the night before was higher than usual too.",
    ],
    [
      'both sleep, the same day',
      { a: 'timeAsleep', b: 'sleepScore', choice: 'sameDay' },
      "Does last night's time asleep go with sleep score the same night?",
      "When last night's time asleep was higher than usual, your sleep score the same night was higher than usual too.",
    ],
    [
      'both sleep, the next day',
      { a: 'timeAsleep', b: 'sleepScore', choice: 'nextDay' },
      "Does last night's time asleep go with sleep score the next night?",
      "When last night's time asleep was higher than usual, your sleep score the next night was higher than usual too.",
    ],
  ])('%s', (_name, q, sentence, detail) => {
    expect(sentenceText(q, t)).toBe(sentence);
    expect(verdictCopy(response(LINKED, q), q, '90d', t).detail).toBe(detail);
  });
});

function differenceResult(diff = 6): Partial<CompareResult> {
  return {
    method: 'difference',
    linked: true,
    sign: diff >= 0 ? 'positive' : 'negative',
    binary: {
      yesKey: 'meditated',
      yesMean: 72,
      noMean: 63,
      yesCount: 20,
      noCount: 40,
      diff,
    },
  };
}

describe('day mode: which side is yes/no × timing (difference path)', () => {
  test.each<[string, CompareQuestion, string, string]>([
    // Yes/no on A, the outcome is not sleep.
    [
      'yes/no A, the day before',
      { a: 'meditated', b: 'mood', choice: 'dayBefore' },
      'Does meditating go with mood the day before?',
      'The day before you meditated, your mood was higher than on other days.',
    ],
    [
      'yes/no A, the same day',
      { a: 'meditated', b: 'mood', choice: 'sameDay' },
      'Does meditating go with mood the same day?',
      'On days you meditated, your mood was higher than on days without meditating.',
    ],
    [
      'yes/no A, the next day',
      { a: 'meditated', b: 'mood', choice: 'nextDay' },
      'Does meditating go with mood the next day?',
      'The day after you meditated, your mood was higher than on other days.',
    ],
    // Yes/no on B, the outcome is not sleep.
    [
      'yes/no B, the day before',
      { a: 'mood', b: 'meditated', choice: 'dayBefore' },
      'Does mood go with meditating the day before?',
      'The day after you meditated, your mood was higher than on other days.',
    ],
    [
      'yes/no B, the same day',
      { a: 'mood', b: 'meditated', choice: 'sameDay' },
      'Does mood go with meditating the same day?',
      'On days you meditated, your mood was higher than on days without meditating.',
    ],
    [
      'yes/no B, the next day',
      { a: 'mood', b: 'meditated', choice: 'nextDay' },
      'Does mood go with meditating the next day?',
      'The day before you meditated, your mood was higher than on other days.',
    ],
    // Yes/no on A, the outcome is a sleep metric (dated by the wake day).
    [
      'yes/no A, sleep B, the day before',
      { a: 'meditated', b: 'timeAsleep', choice: 'dayBefore' },
      'Does meditating go with time asleep two nights before?',
      'On days you meditated, your time asleep two nights before was higher than on other nights.',
    ],
    [
      'yes/no A, sleep B, the same day',
      { a: 'meditated', b: 'timeAsleep', choice: 'sameDay' },
      'Does meditating go with time asleep the night before?',
      'On days you meditated, your time asleep the night before was higher than on other nights.',
    ],
    [
      'yes/no A, sleep B, the next day',
      { a: 'meditated', b: 'timeAsleep', choice: 'nextDay' },
      'Does meditating go with time asleep that night?',
      'On days you meditated, your time asleep that night was higher than on other nights.',
    ],
    // Yes/no on B, the outcome is a sleep metric.
    [
      'sleep A, yes/no B, the day before',
      { a: 'timeAsleep', b: 'meditated', choice: 'dayBefore' },
      "Does last night's time asleep go with meditating the day before?",
      'On days you meditated, your time asleep that night was higher than on other nights.',
    ],
    [
      'sleep A, yes/no B, the same day',
      { a: 'timeAsleep', b: 'meditated', choice: 'sameDay' },
      "Does last night's time asleep go with meditating that day?",
      'On days you meditated, your time asleep the night before was higher than on other nights.',
    ],
    [
      'sleep A, yes/no B, the next day',
      { a: 'timeAsleep', b: 'meditated', choice: 'nextDay' },
      "Does last night's time asleep go with meditating the day after you woke?",
      'On days you meditated, your time asleep two nights before was higher than on other nights.',
    ],
  ])('%s', (_name, q, sentence, detail) => {
    expect(sentenceText(q, t)).toBe(sentence);
    expect(
      verdictCopy(response(differenceResult(), q), q, '90d', t).detail
    ).toBe(detail);
  });

  test('a lower outcome follows the same timing', () => {
    const q: CompareQuestion = { a: 'meditated', b: 'mood', choice: 'nextDay' };
    expect(
      verdictCopy(response(differenceResult(-6), q), q, '90d', t).detail
    ).toBe(
      'The day after you meditated, your mood was lower than on other days.'
    );
  });
});

describe('week mode reads sleep plainly', () => {
  const LINKED = {
    method: 'pearson',
    linked: true,
    strength: 'weak',
    sign: 'positive',
  } as const;

  test.each<[string, CompareQuestion, string, string]>([
    [
      'neither, the same week',
      { a: 'calories', b: 'steps', choice: 'sameWeek' },
      'Does calories go with steps the same week?',
      'When calories was higher than usual, your steps the same week was higher than usual too.',
    ],
    [
      'A sleep, the same week',
      { a: 'timeAsleep', b: 'mood', choice: 'sameWeek' },
      'Does time asleep go with mood the same week?',
      'When time asleep was higher than usual, your mood the same week was higher than usual too.',
    ],
    [
      'A sleep, the next week',
      { a: 'sleepScore', b: 'mood', choice: 'nextWeek' },
      'Does sleep score go with mood the next week?',
      'When sleep score was higher than usual, your mood the next week was higher than usual too.',
    ],
    [
      'B sleep, the same week',
      { a: 'calories', b: 'timeAsleep', choice: 'sameWeek' },
      'Does calories go with time asleep the same week?',
      'When calories was higher than usual, your time asleep the same week was higher than usual too.',
    ],
    [
      'B sleep, the next week',
      { a: 'calories', b: 'overnightHrv', choice: 'nextWeek' },
      'Does calories go with overnight HRV the next week?',
      'When calories was higher than usual, your overnight HRV the next week was higher than usual too.',
    ],
    [
      'both sleep, the same week',
      { a: 'timeAsleep', b: 'sleepScore', choice: 'sameWeek' },
      'Does time asleep go with sleep score the same week?',
      'When time asleep was higher than usual, your sleep score the same week was higher than usual too.',
    ],
    [
      'yes/no A, the same week',
      { a: 'meditated', b: 'mood', choice: 'sameWeek' },
      'Does meditating go with mood the same week?',
      'When the number of days you meditated was higher than usual, your mood the same week was higher than usual too.',
    ],
    [
      'sleep A, yes/no B, the next week',
      { a: 'sleepScore', b: 'meditated', choice: 'nextWeek' },
      'Does sleep score go with meditating the next week?',
      'When sleep score was higher than usual, the number of days you meditated the next week was higher than usual too.',
    ],
  ])('%s', (_name, q, sentence, detail) => {
    const copy = verdictCopy(response(LINKED, q), q, '1y', t);
    expect(sentenceText(q, t)).toBe(sentence);
    expect(copy.detail).toBe(detail);
    for (const text of [sentence, copy.headline, copy.detail]) {
      expect(text).not.toContain("last night's");
    }
  });

  test('no week-mode answer names last night', () => {
    const questions: CompareQuestion[] = [
      { a: 'timeAsleep', b: 'mood', choice: 'sameWeek' },
      { a: 'mood', b: 'timeAsleep', choice: 'nextWeek' },
    ];
    const results: Partial<CompareResult>[] = [
      LINKED,
      { ...LINKED, sign: 'negative' },
      { method: 'pearson', linked: false },
      { status: 'not_enough', reason: 'tooFew', n: 3, needed: 8 },
    ];
    for (const q of questions) {
      for (const result of results) {
        const copy = verdictCopy(response(result, q), q, '6m', t);
        expect(`${copy.headline} ${copy.detail}`).not.toContain("last night's");
      }
    }
  });
});

describe('yesNoWording', () => {
  test('names the two kinds of day for a plain outcome', () => {
    expect(
      yesNoWording(
        { a: 'meditated', b: 'mood', choice: 'sameDay' },
        'meditated',
        t
      )
    ).toEqual({
      when: 'On days you meditated',
      outcome: 'your mood',
      yesLabel: 'Days you meditated',
      noLabel: 'Days without meditating',
      nights: false,
    });
    expect(
      yesNoWording(
        { a: 'meditated', b: 'mood', choice: 'nextDay' },
        'meditated',
        t
      )
    ).toEqual({
      when: 'The day after you meditated',
      outcome: 'your mood',
      yesLabel: 'The day after you meditated',
      noLabel: 'Other days',
      nights: false,
    });
  });

  test('counts a sleep outcome in nights, dated by the day you woke', () => {
    expect(
      yesNoWording(
        { a: 'meditated', b: 'timeAsleep', choice: 'nextDay' },
        'meditated',
        t
      )
    ).toEqual({
      when: 'On days you meditated',
      outcome: 'your time asleep that night',
      yesLabel: 'The night after you meditated',
      noLabel: 'Other nights',
      nights: true,
    });
    expect(
      yesNoWording(
        { a: 'meditated', b: 'timeAsleep', choice: 'sameDay' },
        'meditated',
        t
      ).yesLabel
    ).toBe('The night before you meditated');
    expect(
      yesNoWording(
        { a: 'meditated', b: 'timeAsleep', choice: 'dayBefore' },
        'meditated',
        t
      ).yesLabel
    ).toBe('Two nights before you meditated');
  });
});

describe('howSureLines', () => {
  const base: CompareResult = {
    status: 'ok',
    n: 62,
    needed: 14,
    method: 'pearson',
    nEff: 40.4,
    r: 0.41,
    low: 0.12,
    high: 0.64,
    p: 0.012,
    linked: true,
    strength: 'moderate',
    sign: 'positive',
    checks: { ownNormal: true },
  };
  const yesNoQ: CompareQuestion = {
    a: 'meditated',
    b: 'mood',
    choice: 'sameDay',
  };
  const yesNoBinary: NonNullable<CompareResult['binary']> = {
    yesKey: 'meditated',
    yesMean: 60,
    noMean: 50,
    yesCount: 9,
    noCount: 30,
    diff: 5.5,
  };
  const difference: CompareResult = {
    ...base,
    method: 'difference',
    r: undefined,
    strength: undefined,
    low: 2,
    high: 16,
    binary: yesNoBinary,
  };

  function valueOf(lines: { label: string; value: string }[], label: string) {
    return lines.find((line) => line.label === label)?.value;
  }

  test('a correlation lists strength, range, p in plain words and days used, in that order', () => {
    expect(howSureLines(base, DAY_Q, t)).toEqual([
      { label: 'Strength', value: 'r = 0.41 (moderate)' },
      { label: 'Likely between', value: '0.12 to 0.64' },
      {
        label: 'How unusual',
        value:
          'With no real link, a result this strong would show up about 1 time in 83 (p = 0.012)',
      },
      {
        label: 'Days used',
        value:
          '62 days (count as about 40 separate days, because neighbouring days resemble each other)',
      },
    ]);
  });

  test('phrases p 0.02 as about 1 time in 50 and p 0.0004 as less than 1 time in 1,000', () => {
    expect(
      valueOf(howSureLines({ ...base, p: 0.02 }, DAY_Q, t), 'How unusual')
    ).toBe(
      'With no real link, a result this strong would show up about 1 time in 50 (p = 0.020)'
    );
    expect(
      valueOf(howSureLines({ ...base, p: 0.0004 }, DAY_Q, t), 'How unusual')
    ).toBe(
      'With no real link, a result this strong would show up less than 1 time in 1,000 (p < 0.001)'
    );
  });

  test('rounds 1/p to two significant figures, grouped with commas', () => {
    expect(
      valueOf(howSureLines({ ...base, p: 0.0013 }, DAY_Q, t), 'How unusual')
    ).toContain('about 1 time in 770 (p = 0.001)');
    expect(
      valueOf(howSureLines({ ...base, p: 0.001 }, DAY_Q, t), 'How unusual')
    ).toContain('about 1 time in 1,000 (p = 0.001)');
    expect(
      valueOf(howSureLines({ ...base, p: 0.3 }, DAY_Q, t), 'How unusual')
    ).toContain('about 1 time in 3 (p = 0.300)');
  });

  test('a large p reads as common, and an unlinked r as no clear link', () => {
    const lines = howSureLines(
      { ...base, r: 0.08, p: 0.64, linked: false, strength: undefined },
      DAY_Q,
      t
    );
    expect(valueOf(lines, 'Strength')).toBe('r = 0.08 (no clear link)');
    expect(valueOf(lines, 'How unusual')).toBe(
      'Results like this are common with no real link (p = 0.640)'
    );
    expect(
      valueOf(howSureLines({ ...base, p: 0.5 }, DAY_Q, t), 'How unusual')
    ).toBe('Results like this are common with no real link (p = 0.500)');
  });

  test('a negative r keeps its sign and the strong word', () => {
    expect(
      valueOf(
        howSureLines(
          { ...base, r: -0.62, low: -0.8, high: -0.4, strength: 'strong' },
          DAY_Q,
          t
        ),
        'Strength'
      )
    ).toBe('r = -0.62 (strong)');
  });

  test('week mode counts weeks', () => {
    const weekQ: CompareQuestion = {
      a: 'calories',
      b: 'steps',
      choice: 'sameWeek',
    };
    expect(
      valueOf(
        howSureLines({ ...base, n: 20, nEff: 12.3 }, weekQ, t),
        'Weeks used'
      )
    ).toBe(
      '20 weeks (count as about 12 separate weeks, because neighbouring weeks resemble each other)'
    );
  });

  test('without fewer separate days, days used is just the days', () => {
    expect(
      valueOf(howSureLines({ ...base, nEff: undefined }, DAY_Q, t), 'Days used')
    ).toBe('62 days');
    expect(
      valueOf(howSureLines({ ...base, nEff: 61.8 }, DAY_Q, t), 'Days used')
    ).toBe('62 days');
  });

  test('shows a yes/no difference on the 1-10 mood scale', () => {
    const lines = howSureLines(difference, yesNoQ, t);
    expect(lines.map((line) => line.label)).toEqual([
      'Difference',
      'Likely between',
      'How unusual',
      'Days used',
    ]);
    expect(valueOf(lines, 'Difference')).toBe(
      '0.6 higher than on days without meditating (each measured against your own normal)'
    );
    expect(valueOf(lines, 'Likely between')).toBe('0.2 to 1.6');
  });

  test('a negative difference reads lower with no sign, and its range keeps its signs', () => {
    const lines = howSureLines(
      {
        ...difference,
        low: -16,
        high: -2,
        sign: 'negative',
        binary: { ...yesNoBinary, diff: -5.5 },
      },
      yesNoQ,
      t
    );
    expect(valueOf(lines, 'Difference')).toBe(
      '0.6 lower than on days without meditating (each measured against your own normal)'
    );
    expect(valueOf(lines, 'Likely between')).toBe('-1.6 to -0.2');
    expect(
      valueOf(
        howSureLines({ ...difference, low: -3, high: 12 }, yesNoQ, t),
        'Likely between'
      )
    ).toBe('-0.3 to 1.2');
  });

  test('a shifted or sleep outcome names the other days as the bars do', () => {
    expect(
      valueOf(
        howSureLines(
          difference,
          { a: 'meditated', b: 'mood', choice: 'nextDay' },
          t
        ),
        'Difference'
      )
    ).toBe(
      '0.6 higher than on other days (each measured against your own normal)'
    );
    expect(
      valueOf(
        howSureLines(
          {
            ...difference,
            binary: { ...yesNoBinary, diff: -0.4 },
          },
          { a: 'meditated', b: 'timeAsleep', choice: 'nextDay' },
          t
        ),
        'Difference'
      )
    ).toBe(
      '0.4 lower than on other nights (each measured against your own normal)'
    );
  });

  test('a difference that rounds to zero reads as about the same', () => {
    expect(
      valueOf(
        howSureLines(
          { ...difference, binary: { ...yesNoBinary, diff: 0.3 } },
          yesNoQ,
          t
        ),
        'Difference'
      )
    ).toBe(
      'About the same as on days without meditating (each measured against your own normal)'
    );
  });

  test('a difference is never called a distance from usual', () => {
    for (const diff of [-25, -5.5, 0, 0.3, 5.5, 25]) {
      for (const b of ['mood', 'bedtime', 'timeAsleep'] as const) {
        const lines = howSureLines(
          { ...difference, binary: { ...yesNoBinary, diff } },
          { a: 'meditated', b, choice: 'sameDay' },
          t
        );
        expect(valueOf(lines, 'Difference')).toMatch(/^(\d|About)/);
        for (const line of lines) expect(line.value).not.toMatch(/usual/);
      }
    }
  });

  test('a bedtime difference is in whole minutes', () => {
    const q: CompareQuestion = {
      a: 'meditated',
      b: 'bedtime',
      choice: 'nextDay',
    };
    const lines = howSureLines(
      {
        ...difference,
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
      q,
      t
    );
    expect(valueOf(lines, 'Difference')).toBe(
      '25 min later than on other nights (each measured against your own normal)'
    );
    expect(valueOf(lines, 'Likely between')).toBe('10 to 40 min');
    expect(
      valueOf(
        howSureLines(
          {
            ...difference,
            low: -39.6,
            high: -10.4,
            binary: {
              yesKey: 'meditated',
              yesMean: 230,
              noMean: 255,
              yesCount: 12,
              noCount: 28,
              diff: -25,
            },
          },
          q,
          t
        ),
        'Difference'
      )
    ).toBe(
      '25 min earlier than on other nights (each measured against your own normal)'
    );
  });

  test('not enough is empty', () => {
    expect(
      howSureLines(
        {
          status: 'not_enough',
          reason: 'tooFew',
          n: 3,
          needed: 14,
          checks: { ownNormal: true },
        },
        DAY_Q,
        t
      )
    ).toEqual([]);
  });

  test.each(['p', 'low', 'high'] as const)(
    'an ok result missing %s is empty',
    (field) => {
      const missing = { ...base, [field]: undefined };
      expect(howSureLines(missing, DAY_Q, t)).toEqual([]);
      expect(
        howSureLines({ ...difference, [field]: undefined }, yesNoQ, t)
      ).toEqual([]);
    }
  );

  test('never says fluke', () => {
    const fixtures: [CompareResult, CompareQuestion][] = [];
    for (const p of [0, 0.0004, 0.001, 0.012, 0.02, 0.3, 0.49, 0.5, 0.64, 1]) {
      fixtures.push([{ ...base, p }, DAY_Q]);
      fixtures.push([
        { ...base, p, linked: false, strength: undefined },
        DAY_Q,
      ]);
      fixtures.push([{ ...difference, p }, yesNoQ]);
      fixtures.push([
        { ...difference, p, binary: { ...yesNoBinary, diff: -25 } },
        { a: 'meditated', b: 'bedtime', choice: 'nextDay' },
      ]);
      fixtures.push([
        { ...base, p, n: 20, nEff: 9 },
        { a: 'calories', b: 'steps', choice: 'nextWeek' },
      ]);
    }
    const text = fixtures.flatMap(([result, q]) =>
      howSureLines(result, q, t).flatMap((line) => [line.label, line.value])
    );
    expect(text.length).toBeGreaterThan(fixtures.length);
    for (const line of text) {
      expect(line).not.toMatch(/fluke|chance it/i);
    }
  });
});

describe('checkLines', () => {
  function result(
    linked: boolean,
    checks: Partial<CompareResult['checks']> = {}
  ): CompareResult {
    return {
      status: 'ok',
      n: 40,
      needed: 14,
      linked,
      checks: { ownNormal: true, ...checks },
    };
  }
  const MOOD_Q: CompareQuestion = { a: 'mood', b: 'energy', choice: 'sameDay' };

  test('shows only own-normal and the caveat when not linked', () => {
    expect(
      checkLines(
        result(false, { direction: 'firstComesFirst', weekend: 'holds' }),
        MOOD_Q,
        t
      )
    ).toEqual([
      '✓ Compared with your own normal',
      'A link, not proof of cause',
    ]);
  });

  test('adds direction and weekend lines when linked by day, before the caveat', () => {
    expect(
      checkLines(
        result(true, { direction: 'firstComesFirst', weekend: 'holds' }),
        MOOD_Q,
        t
      )
    ).toEqual([
      '✓ Compared with your own normal',
      'Mood seems to come first',
      'Still holds after accounting for weekends',
      'A link, not proof of cause',
    ]);
  });

  test('shows the weekday pattern warning', () => {
    expect(
      checkLines(result(true, { weekend: 'mayBeWeekends' }), MOOD_Q, t)
    ).toContain('This may be a weekday-versus-weekend pattern');
  });

  test('omits the weekend line in week mode', () => {
    const lines = checkLines(
      result(true, { weekend: 'holds' }),
      { a: 'mood', b: 'energy', choice: 'sameWeek' },
      t
    );
    expect(lines.join(' ')).not.toMatch(/weekend/i);
  });

  test('names B at timing 0 when the link is stronger the other way', () => {
    expect(
      checkLines(result(true, { direction: 'strongerOtherWay' }), MOOD_Q, t)
    ).toContain('Energy seems to come first');
  });

  test('names B first at timing -1 with firstComesFirst', () => {
    expect(
      checkLines(
        result(true, { direction: 'firstComesFirst' }),
        { a: 'mood', b: 'energy', choice: 'dayBefore' },
        t
      )
    ).toContain('Energy comes first');
  });

  test('names A first at timing +1 and reads the other way round', () => {
    const q: CompareQuestion = { a: 'mood', b: 'energy', choice: 'nextDay' };
    expect(
      checkLines(result(true, { direction: 'firstComesFirst' }), q, t)
    ).toContain('Mood comes first');
    expect(
      checkLines(result(true, { direction: 'strongerOtherWay' }), q, t)
    ).toContain('The link is stronger the other way round');
  });

  test.each<[CompareQuestion, string]>([
    [
      { a: 'timeAsleep', b: 'energy', choice: 'nextDay' },
      'Time asleep comes first',
    ],
    [
      { a: 'caffeine', b: 'timeAsleep', choice: 'dayBefore' },
      'Time asleep comes first',
    ],
    [
      { a: 'timeAsleep', b: 'energy', choice: 'sameDay' },
      'Time asleep seems to come first',
    ],
    [
      { a: 'mood', b: 'meditated', choice: 'dayBefore' },
      'Meditating comes first',
    ],
    [
      { a: 'sleepScore', b: 'mood', choice: 'nextWeek' },
      'Sleep score comes first',
    ],
  ])('names the metric that leads plainly for %j', (q, line) => {
    const lines = checkLines(
      result(true, { direction: 'firstComesFirst' }),
      q,
      t
    );
    expect(lines).toContain(line);
    expect(lines.join(' ')).not.toMatch(/last night/i);
  });

  test("says it can't tell", () => {
    expect(
      checkLines(result(true, { direction: 'cantTell' }), MOOD_Q, t)
    ).toContain("Can't tell which comes first");
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
});

describe('compareShownAmountText', () => {
  test('an amount already on the display scale is never rescaled', () => {
    // Mood 0.8 on the 1-10 scale stays 0.8; compareAmountText would make it 0.1.
    expect(compareShownAmountText('mood', 0.8, true)).toBe('+0.8');
    expect(compareShownAmountText('mood', 6.25)).toBe('6.3');
  });

  test('to the metric precision, signed when asked, in the app language', () => {
    expect(compareShownAmountText('steps', 1234, true)).toBe('+1,234');
    expect(compareShownAmountText('steps', 1234)).toBe('1,234');
    expect(compareShownAmountText('timeAsleep', -0.44, true)).toBe('-0.4');
    expect(compareShownAmountText('energy', 0, true)).toBe('0.0');
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

  test('shows bedtime in the 24-hour or 12-hour setting when given', () => {
    expect(compareValueText('bedtime', 255, 'HH:mm')).toBe('22:15');
    expect(compareValueText('bedtime', 390, 'HH:mm')).toBe('00:30');
    expect(compareValueText('bedtime', 255, 'h:mm A')).toBe('10:15 PM');
    expect(compareValueText('bedtime', 390, 'h:mm a')).toBe('12:30 am');
    // Other metrics ignore it.
    expect(compareValueText('mood', 58, 'HH:mm')).toBe('5.8');
  });
});

describe('subjectName', () => {
  test("a sleep metric by the day is last night's", () => {
    expect(subjectName('timeAsleep', 'day', t)).toBe(
      "Last night's time asleep"
    );
  });

  test('plain by the week, and a habit is its noun', () => {
    expect(subjectName('timeAsleep', 'week', t)).toBe('Time asleep');
    expect(subjectName('meditated', 'day', t)).toBe('Meditating');
    expect(subjectName('caffeine', 'day', t)).toBe('Caffeine');
  });
});

describe('dotsAxisCaption', () => {
  test('a continuous metric reads against its usual', () => {
    expect(dotsAxisCaption('energy', 'day', t)).toBe('Energy vs. your usual');
  });

  test('a yes/no habit by day is yes or no', () => {
    expect(dotsAxisCaption('meditated', 'day', t)).toBe(
      'Meditated (yes or no)'
    );
  });

  test('a yes/no habit by week is the days you did it', () => {
    expect(dotsAxisCaption('meditated', 'week', t)).toBe(
      'Days you meditated vs. your usual'
    );
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

    expect(defaultsByKey.size).toBeGreaterThan(80);
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
    expect(leaf('compareReport.loadFailed')).toBe(
      "Couldn't load this comparison"
    );
  });
});
