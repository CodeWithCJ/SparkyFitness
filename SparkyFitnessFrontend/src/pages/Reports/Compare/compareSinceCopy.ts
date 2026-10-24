import {
  type CompareMetricKey,
  type CompareQuestion,
  type CompareSinceResponse,
  type CompareSinceResult,
  sinceAlreadyChanging,
  sinceVerdictCase,
  type SinceVerdictCase,
} from '@workspace/shared';
import {
  compareAmountText,
  compareValueText,
  formatNumber,
  isYesNo,
  metricName,
  pPlainWords,
  questionParts,
  type Translator,
} from './compareCopy';

// The "since a habit started" wording, the website's copy of the phone's
// `SparkyFitnessMobile/src/utils/compareSinceCopy.ts`: the same English under
// the same `compareReport.since.*` keys. The numbers behind an answer are
// laid out as lines and table rows rather than the phone's single stats line.

type SinceKeys = Pick<CompareQuestion, 'a' | 'b'>;

/**
 * The habit and the outcome as the since sentence names them, from the same
 * phrasing as its chips: a yes/no habit as a noun, anything else plainly.
 */
function sinceParts(
  q: SinceKeys,
  t: Translator
): { habit: string; outcome: string } {
  const { a, b } = questionParts({ ...q, choice: 'sinceHabit' }, t);
  return { habit: a ?? '', outcome: b ?? '' };
}

function responseKeys(response: CompareSinceResponse): SinceKeys {
  return { a: response.habit.key, b: response.outcome.key };
}

function days(count: number, t: Translator): string {
  return t('compareReport.verdict.days', {
    defaultValue: '{{count}} days',
    defaultValue_one: '{{count}} day',
    count,
  });
}

/** A share as a whole percent ("62%"); `signed` shows a difference with its sign. */
export function percentText(share: number, signed = false): string {
  return formatNumber(share, {
    style: 'percent',
    maximumFractionDigits: 0,
    ...(signed ? { signDisplay: 'exceptZero' as const } : {}),
  });
}

/** An average as the person reads it; a yes/no outcome's is the share of days it was yes. */
function averageText(
  key: CompareMetricKey,
  value: number,
  timeFormat?: string
): string {
  return isYesNo(key)
    ? percentText(value)
    : compareValueText(key, value, timeFormat);
}

/** A difference, or one end of its range: a share for yes/no, else an amount (bedtime in minutes). */
function differenceText(
  key: CompareMetricKey,
  value: number,
  signed: boolean
): string {
  return isYesNo(key)
    ? percentText(value, signed)
    : compareAmountText(key, value, signed);
}

/** The change after the averages: bedtime later or earlier, anything else with its sign. */
function changeText(
  key: CompareMetricKey,
  diff: number,
  t: Translator
): string {
  if (key !== 'bedtime') return differenceText(key, diff, true);
  const minutes = compareAmountText(key, Math.abs(diff));
  return diff >= 0
    ? t('compareReport.since.minutesLater', {
        defaultValue: '{{minutes}} min later',
        minutes,
      })
    : t('compareReport.since.minutesEarlier', {
        defaultValue: '{{minutes}} min earlier',
        minutes,
      });
}

export function sinceSentence(q: SinceKeys, t: Translator): string {
  return t('compareReport.since.question', {
    defaultValue:
      'Since I started {{habit}} regularly, has {{outcome}} changed?',
    ...sinceParts(q, t),
  });
}

/**
 * Why there is no answer yet, from the case `sinceVerdictCase` picks
 * (`shared/src/compare/sinceVerdict.ts`): the days since a recent start, the
 * days before it, or the stretch's days with a value.
 */
function notEnoughCopy(
  verdict: Extract<SinceVerdictCase, { kind: 'notEnough' }>,
  start: string,
  outcome: string,
  t: Translator
): { headline: string; detail: string } {
  const headline =
    verdict.side === 'before'
      ? t('compareReport.since.fewBeforeHeadline', {
          defaultValue: 'Not enough before {{start}} yet',
          start,
        })
      : t('compareReport.since.fewSinceHeadline', {
          defaultValue: 'Not enough since {{start}} yet',
          start,
        });
  const { detail } = verdict;

  if (detail.kind === 'shortSince') {
    return {
      headline,
      detail: t('compareReport.since.shortSinceDetail', {
        defaultValue:
          "It's been {{days}} since then; an answer needs {{needed}}.",
        days: days(detail.days, t),
        needed: days(detail.needed, t),
      }),
    };
  }
  if (detail.kind === 'shortBefore') {
    return {
      headline,
      detail: t('compareReport.since.shortBeforeDetail', {
        defaultValue:
          'Your {{outcome}} records begin {{days}} before then; an answer needs {{needed}}.',
        outcome,
        days: days(detail.days, t),
        needed: days(detail.needed, t),
      }),
    };
  }
  return {
    headline,
    detail: t('compareReport.since.fewValuesDetail', {
      defaultValue:
        'You have {{n}} with {{outcome}}; an answer needs {{needed}}.',
      n: days(detail.valueDays, t),
      outcome,
      needed: detail.needed,
    }),
  };
}

/**
 * The headline and detail of a since answer. `formatDay` words a start date
 * for the person ("Apr 1, 2026"); `timeFormat` (the 12/24-hour setting) words
 * a bedtime average.
 */
export function sinceVerdictCopy(
  response: CompareSinceResponse,
  t: Translator,
  formatDay: (day: string) => string,
  timeFormat?: string
): { headline: string; detail: string } {
  const key = response.outcome.key;
  const { outcome } = sinceParts(responseKeys(response), t);
  const verdict = sinceVerdictCase(response.result);

  if (verdict.kind === 'noStart') {
    return {
      headline: t('compareReport.since.noStartHeadline', {
        defaultValue: 'Pick the day you started',
      }),
      detail: t('compareReport.since.noStartDetail', {
        defaultValue:
          'Then this compares your {{outcome}} before and since that day.',
        outcome,
      }),
    };
  }

  const start = formatDay(verdict.start);
  if (verdict.kind === 'notEnough') {
    return notEnoughCopy(verdict, start, outcome, t);
  }

  if (verdict.kind === 'changed') {
    const change = {
      start,
      outcome,
      since: averageText(key, verdict.since, timeFormat),
      before: averageText(key, verdict.before, timeFormat),
      diff: changeText(key, verdict.diff, t),
    };
    return {
      headline: t('compareReport.since.changedHeadline', {
        defaultValue: 'Yes, it changed',
      }),
      detail: verdict.lastYear
        ? t('compareReport.since.changedDetailLastYear', {
            defaultValue:
              'Over the last year, your {{outcome}} averaged {{since}} vs {{before}} in the year before you started ({{diff}}).',
            ...change,
          })
        : t('compareReport.since.changedDetail', {
            defaultValue:
              'Since {{start}}, your {{outcome}} averaged {{since}} vs {{before}} before ({{diff}}).',
            ...change,
          }),
    };
  }
  let detail = '';
  if (verdict.averages) {
    const averages = {
      start,
      outcome,
      since: averageText(key, verdict.averages.since, timeFormat),
      before: averageText(key, verdict.averages.before, timeFormat),
    };
    detail = verdict.lastYear
      ? t('compareReport.since.noChangeDetailLastYear', {
          defaultValue:
            'Over the last year, your {{outcome}} averaged {{since}} vs {{before}} in the year before you started, not different enough to rule out chance.',
          ...averages,
        })
      : t('compareReport.since.noChangeDetail', {
          defaultValue:
            'Since {{start}}, your {{outcome}} averaged {{since}} vs {{before}} before, not different enough to rule out chance.',
          ...averages,
        });
  }
  return {
    headline: t('compareReport.since.noChangeHeadline', {
      defaultValue: 'No clear change',
    }),
    detail,
  };
}

/**
 * The numbers behind a since answer, one labelled line each: the difference,
 * its 95% range, the p-value in plain words, and the days used. Empty until
 * there is an answer.
 */
export function sinceHowSureLines(
  response: CompareSinceResponse,
  t: Translator
): { label: string; value: string }[] {
  const { result } = response;
  const key = response.outcome.key;
  const { diff, low, high, p } = result;
  if (
    result.status !== 'ok' ||
    diff === undefined ||
    low === undefined ||
    high === undefined ||
    p === undefined
  ) {
    return [];
  }
  const range = {
    low: differenceText(key, low, false),
    high: differenceText(key, high, false),
  };
  const before = result.before?.valueDays ?? 0;
  const since = result.since?.valueDays ?? 0;
  return [
    {
      label: t('compareReport.howSure.difference', {
        defaultValue: 'Difference',
      }),
      value: changeText(key, diff, t),
    },
    {
      label: t('compareReport.howSure.likelyBetween', {
        defaultValue: 'Likely between',
      }),
      // A bedtime range is a span of minutes, not a time of day.
      value:
        key === 'bedtime'
          ? t('compareReport.howSure.rangeMinutes', {
              defaultValue: '{{low}} to {{high}} min',
              ...range,
            })
          : t('compareReport.howSure.range', {
              defaultValue: '{{low}} to {{high}}',
              ...range,
            }),
    },
    {
      label: t('compareReport.howSure.howUnusual', {
        defaultValue: 'How unusual',
      }),
      value: pPlainWords(p, t, 'change'),
    },
    {
      label: t('compareReport.howSure.daysUsed', {
        defaultValue: 'Days used',
      }),
      value: t('compareReport.since.daysUsed', {
        defaultValue: '{{days}} ({{before}} before, {{since}} since)',
        days: days(before + since, t),
        before,
        since,
      }),
    },
  ];
}

/** One stretch of the before-and-since table. */
export interface SinceStretchRow {
  side: 'before' | 'since';
  label: string;
  dates: string;
  valueDays: string;
  average: string;
  /** "5.2–8.0" from the 10th to the 90th percentile; null for a yes/no outcome. */
  usual: string | null;
  /** The share of days at or above the line; null for a yes/no outcome. */
  atOrAbove: string | null;
}

/**
 * The before stretch, then the since stretch, as table rows. A yes/no outcome
 * has an average as a share of days but no usual range or line to speak of.
 * Nothing until an answer.
 */
export function sinceStretchRows(
  response: CompareSinceResponse,
  t: Translator,
  formatDay: (day: string) => string,
  timeFormat?: string
): SinceStretchRow[] {
  const { result } = response;
  if (result.status !== 'ok') return [];
  const key = response.outcome.key;
  const scaled = !isYesNo(key);

  const row = (
    side: 'before' | 'since',
    stretch: CompareSinceResult['before']
  ): SinceStretchRow[] => {
    if (!stretch) return [];
    return [
      {
        side,
        label:
          side === 'before'
            ? t('compareReport.since.chartBefore', { defaultValue: 'Before' })
            : t('compareReport.since.chartSince', { defaultValue: 'Since' }),
        dates: t('compareReport.since.dates', {
          defaultValue: '{{from}} – {{to}}',
          from: formatDay(stretch.from),
          to: formatDay(stretch.to),
        }),
        valueDays: days(stretch.valueDays, t),
        average:
          stretch.mean === undefined
            ? ''
            : averageText(key, stretch.mean, timeFormat),
        usual:
          scaled && stretch.p10 !== undefined && stretch.p90 !== undefined
            ? t('compareReport.since.usualRange', {
                defaultValue: '{{low}}–{{high}}',
                low: compareValueText(key, stretch.p10, timeFormat),
                high: compareValueText(key, stretch.p90, timeFormat),
              })
            : null,
        atOrAbove:
          scaled && stretch.shareAtOrAbove !== undefined
            ? percentText(stretch.shareAtOrAbove)
            : null,
      },
    ];
  };
  return [...row('before', result.before), ...row('since', result.since)];
}

/** "You kept it up in 24 of 28 weeks since."; null without regularity or weeks. */
export function sinceRegularityLine(
  result: CompareSinceResult,
  t: Translator
): string | null {
  const { regularity } = result;
  if (!regularity || regularity.weeks <= 0) return null;
  return t('compareReport.since.regularity', {
    defaultValue: 'You kept it up in {{weeksKept}} of {{count}} weeks since.',
    defaultValue_one:
      'You kept it up in {{weeksKept}} of {{count}} week since.',
    weeksKept: regularity.weeksKept,
    count: regularity.weeks,
  });
}

function alreadyChangingText(
  key: CompareMetricKey,
  up: boolean,
  t: Translator
): string {
  const metric = metricName(key, t);
  if (key === 'bedtime') {
    return up
      ? t('compareReport.since.alreadyLater', {
          defaultValue:
            '⚠ {{metric}} was already getting later before you started.',
          metric,
        })
      : t('compareReport.since.alreadyEarlier', {
          defaultValue:
            '⚠ {{metric}} was already getting earlier before you started.',
          metric,
        });
  }
  return up
    ? t('compareReport.since.alreadyRising', {
        defaultValue: '⚠ {{metric}} was already rising before you started.',
        metric,
      })
    : t('compareReport.since.alreadyFalling', {
        defaultValue: '⚠ {{metric}} was already falling before you started.',
        metric,
      });
}

/** "⚠ Mood was already rising before you started."; null when it was not already changing. */
export function sinceAlreadyChangingLine(
  response: CompareSinceResponse,
  t: Translator
): string | null {
  const changing = sinceAlreadyChanging(response.result);
  return changing === null
    ? null
    : alreadyChangingText(response.outcome.key, changing === 'up', t);
}

/** Always shown under a since answer: a change since, not proof the habit caused it. */
export function sinceCaveat(q: SinceKeys, t: Translator): string {
  return t('compareReport.since.caveat', {
    defaultValue:
      'A lot can change over months; this shows a change since you started, not that {{habit}} caused it.',
    habit: sinceParts(q, t).habit,
  });
}
