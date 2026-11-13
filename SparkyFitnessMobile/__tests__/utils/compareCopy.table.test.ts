import {
  type CompareQuestion,
  type CompareResponse,
  type CompareResult,
} from '@workspace/shared';
import i18n, { initializeI18n } from '../../src/localization/i18n';
import { sentenceText, verdictCopy } from '../../src/utils/compareCopy';

const t = ((key: string, options: Record<string, unknown>) =>
  i18n.t(key, options)) as never;

beforeAll(async () => {
  await initializeI18n('en');
  await i18n.changeLanguage('en');
});

function response(
  q: CompareQuestion,
  result: Partial<CompareResult>
): CompareResponse {
  return {
    a: { key: q.a, values: { '2026-10-01': 1, '2026-10-02': 2 } },
    b: { key: q.b, values: { '2026-10-01': 1, '2026-10-02': 2 } },
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

const LINKED = {
  method: 'pearson',
  linked: true,
  strength: 'weak',
  sign: 'positive',
} as const;

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

// Sleep is dated by the wake day: A on day d pairs with B on d + timing.
describe('day mode: which side is sleep × timing', () => {
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
    expect(verdictCopy(response(q, LINKED), q, '90d', t).detail).toBe(detail);
  });
});

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
      verdictCopy(response(q, differenceResult()), q, '90d', t).detail
    ).toBe(detail);
  });

  test('a lower outcome follows the same timing', () => {
    const q: CompareQuestion = { a: 'meditated', b: 'mood', choice: 'nextDay' };
    expect(
      verdictCopy(response(q, differenceResult(-6)), q, '90d', t).detail
    ).toBe(
      'The day after you meditated, your mood was lower than on other days.'
    );
  });
});

describe('week mode reads sleep plainly', () => {
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
    const copy = verdictCopy(response(q, LINKED), q, '1y', t);
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
        const copy = verdictCopy(response(q, result), q, '6m', t);
        expect(`${copy.headline} ${copy.detail}`).not.toContain("last night's");
      }
    }
  });
});
