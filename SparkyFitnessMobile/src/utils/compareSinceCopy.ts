import {
  COMPARE_METRICS,
  type CompareMetricKey,
  type CompareQuestion,
  type CompareSinceResponse,
  sinceAlreadyChanging,
  sinceVerdictCase,
  type SinceVerdictCase,
} from '@workspace/shared';
import type { Translator } from '../constants/reports';
import { formatLocalizedNumber } from '../localization';
import {
  compareAmountText,
  compareValueText,
  metricName,
  pValueText,
  questionParts,
} from './compareCopy';
import { formatDateWithYear } from './dayLabel';

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

function isYesNo(key: CompareMetricKey): boolean {
  return COMPARE_METRICS[key].kind === 'binary';
}

function days(count: number, t: Translator): string {
  return t('compareReport.verdict.days', {
    defaultValue: '{{count}} days',
    count,
  });
}

function percentText(share: number, signed = false): string {
  return formatLocalizedNumber(share, {
    style: 'percent',
    maximumFractionDigits: 0,
    ...(signed ? { signDisplay: 'exceptZero' as const } : {}),
  });
}

/** An average as the person reads it; a yes/no outcome's is the share of days it was yes. */
function averageText(key: CompareMetricKey, value: number): string {
  return isYesNo(key) ? percentText(value) : compareValueText(key, value);
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

export function sinceVerdictCopy(
  response: CompareSinceResponse,
  t: Translator
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

  const start = formatDateWithYear(verdict.start);
  if (verdict.kind === 'notEnough') {
    return notEnoughCopy(verdict, start, outcome, t);
  }

  if (verdict.kind === 'changed') {
    const change = {
      start,
      outcome,
      since: averageText(key, verdict.since),
      before: averageText(key, verdict.before),
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
      since: averageText(key, verdict.averages.since),
      before: averageText(key, verdict.averages.before),
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

/** The lines under a since answer; each is null when there is nothing to say. */
export interface SinceDetails {
  /** "Usually between 5.2 and 8.0 (before: 4.0–7.2)." */
  typicalRange: string | null;
  /** "At or above 7.0 on 64% of days (before: 38%)." */
  aboveLine: string | null;
  /** "You kept it up in 24 of 28 weeks since." Event and yes/no habits only. */
  regularity: string | null;
  /** "⚠ Mood was already rising before you started." */
  alreadyChanging: string | null;
  /** The numbers behind the verdict: difference, 95% range, p and days. */
  stats: string | null;
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

function statsText(
  response: CompareSinceResponse,
  t: Translator
): string | null {
  const { result } = response;
  const key = response.outcome.key;
  const { diff, low, high, p } = result;
  if (
    diff === undefined ||
    low === undefined ||
    high === undefined ||
    p === undefined
  ) {
    return null;
  }
  const n = days(
    (result.before?.valueDays ?? 0) + (result.since?.valueDays ?? 0),
    t
  );
  if (key === 'bedtime') {
    return t('compareReport.stats.differenceMinutes', {
      defaultValue:
        'difference {{diff}} min · 95% range {{low}} to {{high}} min · {{p}} · {{n}}',
      diff: compareAmountText(key, diff, true),
      low: compareAmountText(key, low),
      high: compareAmountText(key, high),
      p: pValueText(p, t),
      n,
    });
  }
  return t('compareReport.stats.difference', {
    defaultValue:
      'difference {{diff}} · 95% range {{low}} to {{high}} · {{p}} · {{n}}',
    diff: differenceText(key, diff, true),
    low: differenceText(key, low, false),
    high: differenceText(key, high, false),
    p: pValueText(p, t),
    n,
  });
}

/**
 * How steady the outcome is, how often it reached the line, how regularly the
 * habit was kept, whether it was already changing, and the numbers. A yes/no
 * outcome has no typical range or line to speak of. Nothing until an answer.
 */
export function sinceDetails(
  response: CompareSinceResponse,
  t: Translator
): SinceDetails {
  const { result } = response;
  if (result.status !== 'ok') {
    return {
      typicalRange: null,
      aboveLine: null,
      regularity: null,
      alreadyChanging: null,
      stats: null,
    };
  }
  const key = response.outcome.key;
  const { before, since, regularity } = result;
  const scaled = !isYesNo(key);
  const changing = sinceAlreadyChanging(result);

  const typicalRange =
    scaled &&
    before?.p10 !== undefined &&
    before.p90 !== undefined &&
    since?.p10 !== undefined &&
    since.p90 !== undefined
      ? t('compareReport.since.typicalRange', {
          defaultValue:
            'Usually between {{low}} and {{high}} (before: {{beforeLow}}–{{beforeHigh}}).',
          low: compareValueText(key, since.p10),
          high: compareValueText(key, since.p90),
          beforeLow: compareValueText(key, before.p10),
          beforeHigh: compareValueText(key, before.p90),
        })
      : null;

  const aboveLine =
    scaled &&
    before?.shareAtOrAbove !== undefined &&
    since?.shareAtOrAbove !== undefined
      ? t('compareReport.since.aboveLine', {
          defaultValue:
            'At or above {{line}} on {{since}} of days (before: {{before}}).',
          line: compareValueText(key, result.line),
          since: percentText(since.shareAtOrAbove),
          before: percentText(before.shareAtOrAbove),
        })
      : null;

  return {
    typicalRange,
    aboveLine,
    regularity:
      regularity && regularity.weeks > 0
        ? t('compareReport.since.regularity', {
            defaultValue:
              'You kept it up in {{weeksKept}} of {{count}} weeks since.',
            weeksKept: regularity.weeksKept,
            count: regularity.weeks,
          })
        : null,
    alreadyChanging:
      changing === null ? null : alreadyChangingText(key, changing === 'up', t),
    stats: statsText(response, t),
  };
}

/** Always shown under a since answer: a change since, not proof the habit caused it. */
export function sinceCaveat(q: SinceKeys, t: Translator): string {
  return t('compareReport.since.caveat', {
    defaultValue:
      'A lot can change over months; this shows a change since you started, not that {{habit}} caused it.',
    habit: sinceParts(q, t).habit,
  });
}
