import i18n from 'i18next';
import {
  bedtimeClock,
  COMPARE_METRICS,
  compareDigits,
  compareDisplayValue,
  type CompareMetricKey,
  type CompareMode,
  type CompareQuestion,
  type CompareResponse,
  type CompareResult,
  type CompareSpan,
  type CompareTimingChoice,
  isSleepMetric,
  timingOf,
} from '@workspace/shared';
import { formatTimeOfDayString } from '@/utils/timeFormatters';
import { COMPARE_METRIC_LABELS } from './compareMetricLabels';

// The Compare wording, the website's copy of the phone's
// `SparkyFitnessMobile/src/utils/compareCopy.ts` for day and week questions:
// the same English, the same `compareReport.*` keys and the same wake-day
// dating of sleep.

/** react-i18next's `t`, as the wording calls it. */
export type Translator = (
  key: string,
  options: { defaultValue: string } & Record<string, unknown>
) => string;

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function upperFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** A yes/no metric: a day is yes or no, and an average is the share of days it was yes. */
export function isYesNo(key: CompareMetricKey): boolean {
  return COMPARE_METRICS[key].kind === 'binary';
}

/** The label in lower case, for the middle of a sentence. */
function plainLabel(key: CompareMetricKey, t: Translator): string {
  return lowerFirst(COMPARE_METRIC_LABELS[key](t));
}

/**
 * A yes/no habit as a noun. Its label is a past-tense verb ("Meditated"), so
 * it reads as a gerund here ("meditating").
 */
function habitNoun(key: CompareMetricKey, t: Translator): string {
  if (key === 'meditated') {
    return t('compareReport.metricNouns.meditated', {
      defaultValue: 'meditating',
    });
  }
  return plainLabel(key, t);
}

/**
 * The question's first thing. A yes/no habit is a noun; a sleep metric is
 * last night's by the day, because the timing words are counted from that
 * night, and plain by the week.
 */
function subjectPhrase(
  key: CompareMetricKey,
  mode: CompareMode,
  t: Translator
): string {
  if (isYesNo(key)) return habitNoun(key, t);
  if (mode === 'day' && isSleepMetric(key)) {
    return t('compareReport.phrase.lastNights', {
      defaultValue: "last night's {{metric}}",
      metric: plainLabel(key, t),
    });
  }
  return plainLabel(key, t);
}

/** The question's second thing: a yes/no habit as a noun, else the plain label. */
function objectPhrase(key: CompareMetricKey, t: Translator): string {
  return isYesNo(key) ? habitNoun(key, t) : plainLabel(key, t);
}

/** A metric named on its own at the start of a line: "Time asleep", "Meditating". */
export function metricName(key: CompareMetricKey, t: Translator): string {
  return upperFirst(objectPhrase(key, t));
}

/**
 * The question's first thing named on its own, as the sentence names it: a
 * sleep metric by the day is "Last night's time asleep", because a day's sleep
 * is the night before it.
 */
export function subjectName(
  key: CompareMetricKey,
  mode: CompareMode,
  t: Translator
): string {
  return upperFirst(subjectPhrase(key, mode, t));
}

type Phrase = (t: Translator) => string;
type Step = 'before' | 'same' | 'after';
type SleepSides = 'neither' | 'first' | 'second' | 'both';

function stepOf(days: number): Step {
  if (days < 0) return 'before';
  return days > 0 ? 'after' : 'same';
}

function sleepSides(a: CompareMetricKey, b: CompareMetricKey): SleepSides {
  if (isSleepMetric(a)) return isSleepMetric(b) ? 'both' : 'first';
  return isSleepMetric(b) ? 'second' : 'neither';
}

/**
 * When the second thing is measured, counted from the first, by which side is
 * a sleep metric. A pairs with B on day d + timing, and sleep is dated by the
 * day you woke, so a sleep metric's day is the night before it.
 */
const DAY_TIMING: Record<SleepSides, Record<Step, Phrase>> = {
  neither: {
    before: (t) =>
      t('compareReport.timing.dayBefore', { defaultValue: 'the day before' }),
    same: (t) =>
      t('compareReport.timing.sameDay', { defaultValue: 'the same day' }),
    after: (t) =>
      t('compareReport.timing.nextDay', { defaultValue: 'the next day' }),
  },
  first: {
    before: (t) =>
      t('compareReport.timing.dayBefore', { defaultValue: 'the day before' }),
    same: (t) =>
      t('compareReport.timing.thatDay', { defaultValue: 'that day' }),
    after: (t) =>
      t('compareReport.timing.dayAfterYouWoke', {
        defaultValue: 'the day after you woke',
      }),
  },
  second: {
    before: (t) =>
      t('compareReport.timing.twoNightsBefore', {
        defaultValue: 'two nights before',
      }),
    same: (t) =>
      t('compareReport.timing.nightBefore', {
        defaultValue: 'the night before',
      }),
    after: (t) =>
      t('compareReport.timing.thatNight', { defaultValue: 'that night' }),
  },
  both: {
    before: (t) =>
      t('compareReport.timing.nightBefore', {
        defaultValue: 'the night before',
      }),
    same: (t) =>
      t('compareReport.timing.sameNight', { defaultValue: 'the same night' }),
    after: (t) =>
      t('compareReport.timing.nextNight', { defaultValue: 'the next night' }),
  },
};

/**
 * The timing words for a choice. A day or week choice reads as the day or week
 * relation; a since choice reads "Since", as the phone words it ("Since I
 * started … regularly, has … changed?").
 */
function timingWords(
  choice: CompareTimingChoice,
  sides: SleepSides,
  t: Translator
): string {
  const { mode, timing } = timingOf(choice);
  if (mode === 'since') {
    return t('compareReport.sentence.since', { defaultValue: 'Since' });
  }
  if (mode === 'week') {
    return timing === 1
      ? t('compareReport.timing.nextWeek', { defaultValue: 'the next week' })
      : t('compareReport.timing.sameWeek', { defaultValue: 'the same week' });
  }
  return DAY_TIMING[sides][stepOf(timing)](t);
}

/**
 * The timing words alone for a pair, as the sentence says them: "that night",
 * "the next day", "the same week", "Since" (see `timingWords`).
 */
export function timingLabel(
  choice: CompareTimingChoice,
  a: CompareMetricKey,
  b: CompareMetricKey,
  t: Translator
): string {
  return timingWords(choice, sleepSides(a, b), t);
}

function timingPhrase(q: CompareQuestion, t: Translator): string {
  return timingLabel(q.choice, q.a, q.b, t);
}

/**
 * The three filled-in parts of the question sentence, for whichever are
 * chosen. The sleep timing words need both metrics, so until both are picked
 * the timing reads as plain days.
 */
export function questionParts(
  q: Partial<CompareQuestion>,
  t: Translator
): { a?: string; b?: string; timing?: string } {
  const mode = q.choice ? timingOf(q.choice).mode : 'day';
  return {
    a: q.a ? subjectPhrase(q.a, mode, t) : undefined,
    b: q.b ? objectPhrase(q.b, t) : undefined,
    timing: q.choice
      ? timingWords(q.choice, q.a && q.b ? sleepSides(q.a, q.b) : 'neither', t)
      : undefined,
  };
}

export function sentenceText(q: CompareQuestion, t: Translator): string {
  return t('compareReport.verdict.question', {
    defaultValue: 'Does {{a}} go with {{b}} {{timing}}?',
    a: subjectPhrase(q.a, timingOf(q.choice).mode, t),
    b: objectPhrase(q.b, t),
    timing: timingPhrase(q, t),
  });
}

/**
 * A metric named as a quantity in a verdict. By the week a yes/no habit is
 * counted as days, so it reads "the number of days you meditated".
 */
function quantityPhrase(
  key: CompareMetricKey,
  mode: CompareMode,
  t: Translator
): string {
  if (mode === 'week' && isYesNo(key)) {
    return t('compareReport.phrase.daysYou', {
      defaultValue: 'the number of days you {{verb}}',
      verb: plainLabel(key, t),
    });
  }
  return subjectPhrase(key, mode, t);
}

/** Same as quantityPhrase for the second thing, with "your" in front of a plain metric. */
function yourQuantityPhrase(
  key: CompareMetricKey,
  mode: CompareMode,
  t: Translator
): string {
  if (mode === 'week' && isYesNo(key)) return quantityPhrase(key, mode, t);
  return t('compareReport.phrase.your', {
    defaultValue: 'your {{metric}}',
    metric: plainLabel(key, t),
  });
}

/** How a yes/no comparison by the day is worded, from the days of the habit. */
interface YesNoWording {
  /** Opens the verdict: "On days you meditated", "The day after you meditated". */
  when: string;
  /** The outcome, with its night when it is a sleep metric: "your time asleep that night". */
  outcome: string;
  /** The bar for the habit's days, and the bar for the rest. */
  yesLabel: string;
  noLabel: string;
  /** A sleep outcome is counted in nights rather than days. */
  nights: boolean;
}

/**
 * The outcome is measured on the habit's day plus `offset`: the timing when
 * the habit is the first thing, minus it when the habit is the second.
 */
export function yesNoWording(
  q: CompareQuestion,
  yesKey: CompareMetricKey,
  t: Translator
): YesNoWording {
  const outcomeKey = yesKey === q.a ? q.b : q.a;
  const { timing } = timingOf(q.choice);
  const step = stepOf(yesKey === q.a ? timing : -timing);
  const yes = plainLabel(yesKey, t);

  if (isSleepMetric(outcomeKey)) {
    // Dated by the day you woke, so the night is counted from the habit's day.
    const yesLabel =
      step === 'after'
        ? t('compareReport.yesNo.nightAfter', {
            defaultValue: 'The night after you {{yes}}',
            yes,
          })
        : step === 'same'
          ? t('compareReport.yesNo.nightBefore', {
              defaultValue: 'The night before you {{yes}}',
              yes,
            })
          : t('compareReport.yesNo.twoNightsBefore', {
              defaultValue: 'Two nights before you {{yes}}',
              yes,
            });
    return {
      when: t('compareReport.yesNo.onDays', {
        defaultValue: 'On days you {{yes}}',
        yes,
      }),
      outcome: t('compareReport.phrase.yourWhen', {
        defaultValue: 'your {{metric}} {{timing}}',
        metric: plainLabel(outcomeKey, t),
        timing: DAY_TIMING.second[step](t),
      }),
      yesLabel,
      noLabel: t('compareReport.bars.otherNights', {
        defaultValue: 'Other nights',
      }),
      nights: true,
    };
  }

  const outcome = t('compareReport.phrase.your', {
    defaultValue: 'your {{metric}}',
    metric: plainLabel(outcomeKey, t),
  });
  if (step === 'same') {
    return {
      when: t('compareReport.yesNo.onDays', {
        defaultValue: 'On days you {{yes}}',
        yes,
      }),
      outcome,
      yesLabel: t('compareReport.bars.yesDays', {
        defaultValue: 'Days you {{yes}}',
        yes,
      }),
      noLabel: t('compareReport.bars.noDays', {
        defaultValue: 'Days without {{yesNoun}}',
        yesNoun: habitNoun(yesKey, t),
      }),
      nights: false,
    };
  }
  const shifted =
    step === 'after'
      ? t('compareReport.yesNo.dayAfter', {
          defaultValue: 'The day after you {{yes}}',
          yes,
        })
      : t('compareReport.yesNo.dayBefore', {
          defaultValue: 'The day before you {{yes}}',
          yes,
        });
  return {
    when: shifted,
    outcome,
    yesLabel: shifted,
    noLabel: t('compareReport.bars.otherDays', { defaultValue: 'Other days' }),
    nights: false,
  };
}

/**
 * What the person logs to fill a metric in, for the "Log … on N more days"
 * advice. Derived metrics name their source: weight trend comes from logged
 * weight, bedtime from sleep, training load from workouts.
 */
function loggedThing(key: CompareMetricKey, t: Translator): string {
  switch (key) {
    case 'weightTrend':
      return t('compareReport.logged.weight', { defaultValue: 'weight' });
    case 'bedtime':
    case 'bedtimeConsistency':
      return t('compareReport.logged.sleep', { defaultValue: 'sleep' });
    case 'trainingLoad':
    case 'workoutMinutes':
    case 'cardioMinutes':
    case 'strengthVolume':
      return t('compareReport.logged.workouts', { defaultValue: 'workouts' });
    case 'meditationSessions7d':
    case 'meditationMinutes':
    case 'meditated':
      return t('compareReport.logged.meditation', {
        defaultValue: 'meditation',
      });
    default:
      return plainLabel(key, t);
  }
}

/**
 * The sentence after a yes/no "Yes": the habit's days against the other days, which is what
 * the analysis compares (as on the phone). Not "than usual": a habit kept on most days is the
 * usual, so its days can sit near usual while the other days fall below it.
 */
function differenceSentence(
  outcomeKey: CompareMetricKey,
  up: boolean,
  wording: YesNoWording,
  t: Translator
): string {
  const values = {
    when: wording.when,
    outcome: wording.outcome,
    others: lowerFirst(wording.noLabel),
  };
  if (outcomeKey === 'bedtime') {
    return up
      ? t('compareReport.verdict.differenceLater', {
          defaultValue: '{{when}}, {{outcome}} was later than on {{others}}.',
          ...values,
        })
      : t('compareReport.verdict.differenceEarlier', {
          defaultValue: '{{when}}, {{outcome}} was earlier than on {{others}}.',
          ...values,
        });
  }
  return up
    ? t('compareReport.verdict.differenceHigher', {
        defaultValue: '{{when}}, {{outcome}} was higher than on {{others}}.',
        ...values,
      })
    : t('compareReport.verdict.differenceLower', {
        defaultValue: '{{when}}, {{outcome}} was lower than on {{others}}.',
        ...values,
      });
}

/**
 * "higher than usual" / "lower than usual", except for bedtime, which is a
 * time of day and so is later or earlier. Bedtime consistency is a spread in
 * minutes and stays higher or lower.
 */
function directionPhrase(
  key: CompareMetricKey,
  up: boolean,
  t: Translator
): string {
  if (key === 'bedtime') {
    return up
      ? t('compareReport.direction.later', {
          defaultValue: 'later than usual',
        })
      : t('compareReport.direction.earlier', {
          defaultValue: 'earlier than usual',
        });
  }
  return up
    ? t('compareReport.direction.higher', {
        defaultValue: 'higher than usual',
      })
    : t('compareReport.direction.lower', {
        defaultValue: 'lower than usual',
      });
}

function units(count: number, mode: CompareMode, t: Translator): string {
  return mode === 'week'
    ? t('compareReport.verdict.weeks', {
        defaultValue: '{{count}} weeks',
        defaultValue_one: '{{count}} week',
        count,
      })
    : t('compareReport.verdict.days', {
        defaultValue: '{{count}} days',
        defaultValue_one: '{{count}} day',
        count,
      });
}

function strengthWord(
  strength: CompareResult['strength'],
  t: Translator
): string {
  switch (strength) {
    case 'strong':
      return t('compareReport.verdict.strength.strong', {
        defaultValue: 'strong',
      });
    case 'moderate':
      return t('compareReport.verdict.strength.moderate', {
        defaultValue: 'moderate',
      });
    default:
      return t('compareReport.verdict.strength.weak', {
        defaultValue: 'weak',
      });
  }
}

function binaryKey(q: CompareQuestion): CompareMetricKey | null {
  if (isYesNo(q.a)) return q.a;
  if (isYesNo(q.b)) return q.b;
  return null;
}

function allEqual(values: Record<string, number>): boolean {
  const list = Object.values(values);
  return list.length > 0 && list.every((v) => v === list[0]);
}

function isLongestSpan(span: CompareSpan, mode: CompareMode): boolean {
  return span === 'custom' || span === (mode === 'week' ? '1y' : '90d');
}

export function verdictCopy(
  response: CompareResponse,
  q: CompareQuestion,
  span: CompareSpan,
  t: Translator
): { headline: string; detail: string } {
  const { result } = response;
  const mode = timingOf(q.choice).mode;
  const n = units(result.n, mode, t);

  if (result.status === 'not_enough') {
    const needed = units(result.needed, mode, t);
    const yes = binaryKey(q);
    const yesText = yes ? plainLabel(yes, t) : '';
    switch (result.reason) {
      case 'noVariation': {
        const flat = allEqual(response.a.values)
          ? q.a
          : allEqual(response.b.values)
            ? q.b
            : null;
        return {
          headline: t('compareReport.verdict.noVariationHeadline', {
            defaultValue: 'Nothing to compare yet',
          }),
          detail: flat
            ? t('compareReport.verdict.noVariationDetail', {
                defaultValue:
                  "{{metric}} was the same every time over this span, so there's nothing to compare it with.",
                metric: upperFirst(
                  mode === 'week' && isYesNo(flat)
                    ? quantityPhrase(flat, mode, t)
                    : COMPARE_METRIC_LABELS[flat](t)
                ),
              })
            : t('compareReport.verdict.noVariationGeneric', {
                defaultValue: "One of these didn't change over this span.",
              }),
        };
      }
      case 'fewYes':
        return {
          headline: t('compareReport.verdict.fewYesHeadline', {
            defaultValue: 'Not enough days when you {{yes}} yet',
            yes: yesText,
          }),
          detail: t('compareReport.verdict.fewYesDetail', {
            defaultValue:
              'You have {{n}}; an answer needs {{needed}}. Try a longer span.',
            n,
            needed,
          }),
        };
      case 'fewNo':
        return {
          headline: t('compareReport.verdict.fewNoHeadline', {
            defaultValue: 'Not enough days without {{yesNoun}} yet',
            yesNoun: yes ? habitNoun(yes, t) : '',
          }),
          detail: t('compareReport.verdict.fewNoDetail', {
            defaultValue:
              "You {{yes}} on almost every day here, so there's nothing to compare against. Try a longer span.",
            yes: yesText,
          }),
        };
      default: {
        const parts = [
          t('compareReport.verdict.tooFewDetail', {
            defaultValue: 'You have {{n}}; an answer needs {{needed}}.',
            n,
            needed,
          }),
        ];
        const aCount = Object.keys(response.a.values).length;
        const bCount = Object.keys(response.b.values).length;
        const weaker = aCount <= bCount ? q.a : q.b;
        const weakerText = loggedThing(weaker, t);
        const missing = Math.max(result.needed - result.n, 1);
        parts.push(
          mode === 'week'
            ? t('compareReport.verdict.logWeeks', {
                defaultValue:
                  'Log {{weaker}} for {{count}} more weeks, or pick a longer span.',
                defaultValue_one:
                  'Log {{weaker}} for {{count}} more week, or pick a longer span.',
                weaker: weakerText,
                count: missing,
              })
            : t('compareReport.verdict.logDays', {
                defaultValue:
                  'Log {{weaker}} on {{count}} more days, or pick a longer span.',
                defaultValue_one:
                  'Log {{weaker}} on {{count}} more day, or pick a longer span.',
                weaker: weakerText,
                count: missing,
              })
        );
        if (mode === 'day' && Math.max(aCount, bCount) >= result.needed) {
          parts.push(
            t('compareReport.verdict.needsHistory', {
              defaultValue:
                'Each day is compared with your previous two weeks, so a day needs a week of history first.',
            })
          );
        }
        return {
          headline:
            mode === 'week'
              ? t('compareReport.verdict.tooFewHeadlineWeeks', {
                  defaultValue: 'Not enough weeks yet',
                })
              : t('compareReport.verdict.tooFewHeadline', {
                  defaultValue: 'Not enough days yet',
                }),
          detail: parts.join(' '),
        };
      }
    }
  }

  const isDifference = result.method === 'difference';
  const hint = isLongestSpan(span, mode)
    ? ''
    : isDifference
      ? ` ${t('compareReport.verdict.longerSpanDifference', {
          defaultValue: 'A longer span makes a small difference easier to see.',
        })}`
      : ` ${t('compareReport.verdict.longerSpan', {
          defaultValue: 'A longer span makes a weak link easier to see.',
        })}`;

  if (result.method === 'difference' && result.binary) {
    const { yesKey, diff } = result.binary;
    const outcome = plainLabel(yesKey === q.a ? q.b : q.a, t);
    if (!result.linked) {
      return {
        headline: t('compareReport.verdict.noDifferenceHeadline', {
          defaultValue: 'No clear difference',
        }),
        detail:
          t('compareReport.verdict.noDifferenceDetail', {
            defaultValue:
              "Over these {{n}}, your {{outcome}} wasn't different enough between the two kinds of day to rule out chance.",
            n,
            outcome,
          }) + hint,
      };
    }
    const wording = yesNoWording(q, yesKey, t);
    return {
      headline: t('compareReport.verdict.differenceHeadline', {
        defaultValue: 'Yes, a difference',
      }),
      detail: differenceSentence(
        yesKey === q.a ? q.b : q.a,
        diff >= 0,
        wording,
        t
      ),
    };
  }

  if (!result.linked) {
    return {
      headline: t('compareReport.verdict.noLinkHeadline', {
        defaultValue: 'No clear link',
      }),
      detail:
        t('compareReport.verdict.noLinkDetail', {
          defaultValue:
            "Over these {{n}}, they didn't move together more than chance would explain.",
          n,
        }) + hint,
    };
  }

  const a = quantityPhrase(q.a, mode, t);
  const b = yourQuantityPhrase(q.b, mode, t);
  const timing = timingPhrase(q, t);
  return {
    headline: t('compareReport.verdict.linkedHeadline', {
      defaultValue: 'Yes, a {{strength}} link',
      strength: strengthWord(result.strength, t),
    }),
    detail:
      result.sign === 'negative'
        ? t('compareReport.verdict.linkedNegative', {
            defaultValue:
              'When {{a}} was {{aDirection}}, {{b}} {{timing}} was {{bDirection}}.',
            a,
            b,
            timing,
            aDirection: directionPhrase(q.a, true, t),
            bDirection: directionPhrase(q.b, false, t),
          })
        : t('compareReport.verdict.linkedPositive', {
            defaultValue:
              'When {{a}} was {{aDirection}}, {{b}} {{timing}} was {{bDirection}} too.',
            a,
            b,
            timing,
            aDirection: directionPhrase(q.a, true, t),
            bDirection: directionPhrase(q.b, true, t),
          }),
  };
}

/** Numbers are formatted for the language the app is shown in. */
export function formatNumber(
  value: number,
  options: Intl.NumberFormatOptions
): string {
  return new Intl.NumberFormat(i18n.language || undefined, options).format(
    value
  );
}

function fixed(value: number, digits: number): string {
  return formatNumber(value, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/**
 * An amount already on its display scale (a chart dot, mood 1-10), to the
 * metric's precision: counts and minutes whole, everything else to one
 * decimal. It never converts the scale again. `signed` shows a difference
 * with its sign.
 */
export function compareShownAmountText(
  key: CompareMetricKey,
  shown: number,
  signed = false
): string {
  const digits = compareDigits(key);
  return formatNumber(shown, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    ...(signed ? { signDisplay: 'exceptZero' as const } : {}),
  });
}

/**
 * An amount of a metric on its stored scale, shown on its display scale
 * (mood 1-10). Bedtime here is a span of whole minutes, not a clock time.
 * `signed` shows a difference with its sign.
 */
export function compareAmountText(
  key: CompareMetricKey,
  value: number,
  signed = false
): string {
  return compareShownAmountText(key, compareDisplayValue(key, value), signed);
}

/**
 * A metric's raw value as the person reads it: bedtime (minutes after 18:00)
 * as a clock time, everything else as `compareAmountText`. The clock follows
 * `timeFormat` (the person's 12/24-hour setting) when given, else the app's
 * language.
 */
export function compareValueText(
  key: CompareMetricKey,
  value: number,
  timeFormat?: string
): string {
  if (key === 'bedtime') {
    const clock = bedtimeClock(value);
    if (timeFormat) return formatTimeOfDayString(clock, timeFormat);
    // A fixed non-DST date, so the clock time never shifts.
    const date = new Date(
      2000,
      0,
      1,
      Number(clock.slice(0, 2)),
      Number(clock.slice(3, 5))
    );
    return new Intl.DateTimeFormat(i18n.language || undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  }
  return compareAmountText(key, value);
}

/** "p = 0.012", or "p < 0.001" when it is that small. */
function pValueText(p: number, t: Translator): string {
  return p < 0.001
    ? t('compareReport.stats.pTiny', { defaultValue: 'p < 0.001' })
    : t('compareReport.howSure.pValue', {
        defaultValue: 'p = {{p}}',
        p: fixed(p, 3),
      });
}

/**
 * The p-value in plain words: how often a result this strong would turn up if
 * there were no real link (or, for a before-and-since `subject` of 'change', no
 * real change). It says nothing about the chance that this result is real,
 * because a p-value can't.
 */
export function pPlainWords(
  p: number,
  t: Translator,
  subject: 'link' | 'change' = 'link'
): string {
  const pText = pValueText(p, t);
  const change = subject === 'change';
  if (p < 0.001) {
    const n = formatNumber(1000, {});
    return change
      ? t('compareReport.howSure.pRareChange', {
          defaultValue:
            'With no real change, a difference this big would show up less than 1 time in {{n}} ({{p}})',
          n,
          p: pText,
        })
      : t('compareReport.howSure.pRare', {
          defaultValue:
            'With no real link, a result this strong would show up less than 1 time in {{n}} ({{p}})',
          n,
          p: pText,
        });
  }
  if (p < 0.5) {
    // 1/p as a whole number, to two significant figures: 769 reads as 770.
    const times = Number(Math.round(1 / p).toPrecision(2));
    const n = formatNumber(times, { maximumFractionDigits: 0 });
    return change
      ? t('compareReport.howSure.pAboutChange', {
          defaultValue:
            'With no real change, a difference this big would show up about 1 time in {{n}} ({{p}})',
          n,
          p: pText,
        })
      : t('compareReport.howSure.pAbout', {
          defaultValue:
            'With no real link, a result this strong would show up about 1 time in {{n}} ({{p}})',
          n,
          p: pText,
        });
  }
  return change
    ? t('compareReport.howSure.pCommonChange', {
        defaultValue:
          'Differences like this are common with no real change ({{p}})',
        p: pText,
      })
    : t('compareReport.howSure.pCommon', {
        defaultValue: 'Results like this are common with no real link ({{p}})',
        p: pText,
      });
}

/**
 * How many days (or weeks) were used, and, when neighbouring ones resemble
 * each other, how many separate ones they count as (the effective n).
 */
function usedText(
  result: CompareResult,
  mode: CompareMode,
  t: Translator
): string {
  const n = units(result.n, mode, t);
  const separate =
    result.nEff === undefined ? undefined : Math.round(result.nEff);
  if (separate === undefined || separate >= result.n) return n;
  return mode === 'week'
    ? t('compareReport.howSure.separateWeeks', {
        defaultValue:
          '{{n}} (count as about {{count}} separate weeks, because neighbouring weeks resemble each other)',
        defaultValue_one:
          '{{n}} (count as about {{count}} separate week, because neighbouring weeks resemble each other)',
        n,
        count: separate,
      })
    : t('compareReport.howSure.separateDays', {
        defaultValue:
          '{{n}} (count as about {{count}} separate days, because neighbouring days resemble each other)',
        defaultValue_one:
          '{{n}} (count as about {{count}} separate day, because neighbouring days resemble each other)',
        n,
        count: separate,
      });
}

/**
 * A yes/no difference in words. `binary.diff` is the mean of the habit days
 * minus the mean of the other days, each day measured against the person's own
 * normal, so it is the gap between the two kinds of day, not a distance from
 * usual. The other days are named as the bars name them: "days without
 * meditating", "other days" or "other nights".
 */
function differenceText(
  q: CompareQuestion,
  binary: NonNullable<CompareResult['binary']>,
  t: Translator
): string {
  const outcome = binary.yesKey === q.a ? q.b : q.a;
  const others = lowerFirst(yesNoWording(q, binary.yesKey, t).noLabel);
  const shown = compareDisplayValue(outcome, binary.diff);
  // Rounds to zero at the precision shown: "0.0 higher" would mislead.
  if (Math.abs(shown) < 0.5 / 10 ** compareDigits(outcome)) {
    return t('compareReport.howSure.differenceSame', {
      defaultValue:
        'About the same as on {{others}} (each measured against your own normal)',
      others,
    });
  }
  // The direction word carries the sign, so the amount is shown without one.
  const diff = compareAmountText(outcome, Math.abs(binary.diff));
  // A bedtime difference is a span of minutes, later or earlier.
  if (outcome === 'bedtime') {
    return shown > 0
      ? t('compareReport.howSure.differenceLater', {
          defaultValue:
            '{{diff}} min later than on {{others}} (each measured against your own normal)',
          diff,
          others,
        })
      : t('compareReport.howSure.differenceEarlier', {
          defaultValue:
            '{{diff}} min earlier than on {{others}} (each measured against your own normal)',
          diff,
          others,
        });
  }
  return shown > 0
    ? t('compareReport.howSure.differenceHigher', {
        defaultValue:
          '{{diff}} higher than on {{others}} (each measured against your own normal)',
        diff,
        others,
      })
    : t('compareReport.howSure.differenceLower', {
        defaultValue:
          '{{diff}} lower than on {{others}} (each measured against your own normal)',
        diff,
        others,
      });
}

/**
 * The numbers behind a verdict, one labelled line each: the strength (or the
 * yes/no difference on the outcome's display scale), the 95% range, the
 * p-value in plain words, and the days used. Empty until there is an answer.
 */
export function howSureLines(
  result: CompareResult,
  q: CompareQuestion,
  t: Translator
): { label: string; value: string }[] {
  const { p, low, high } = result;
  if (
    result.status !== 'ok' ||
    p === undefined ||
    low === undefined ||
    high === undefined
  ) {
    return [];
  }
  const mode = timingOf(q.choice).mode;
  const likelyBetween = t('compareReport.howSure.likelyBetween', {
    defaultValue: 'Likely between',
  });
  const lines: { label: string; value: string }[] = [];

  if (result.method === 'difference' && result.binary) {
    const outcome = result.binary.yesKey === q.a ? q.b : q.a;
    const range = {
      low: compareAmountText(outcome, low),
      high: compareAmountText(outcome, high),
    };
    lines.push(
      {
        label: t('compareReport.howSure.difference', {
          defaultValue: 'Difference',
        }),
        value: differenceText(q, result.binary, t),
      },
      {
        label: likelyBetween,
        // A bedtime difference is a span of minutes, not a time of day.
        value:
          outcome === 'bedtime'
            ? t('compareReport.howSure.rangeMinutes', {
                defaultValue: '{{low}} to {{high}} min',
                ...range,
              })
            : t('compareReport.howSure.range', {
                defaultValue: '{{low}} to {{high}}',
                ...range,
              }),
      }
    );
  } else {
    if (result.r === undefined) return [];
    lines.push(
      {
        label: t('compareReport.howSure.strength', {
          defaultValue: 'Strength',
        }),
        value: t('compareReport.howSure.strengthValue', {
          defaultValue: 'r = {{r}} ({{word}})',
          r: fixed(result.r, 2),
          word: result.linked
            ? strengthWord(result.strength, t)
            : t('compareReport.howSure.noClearLink', {
                defaultValue: 'no clear link',
              }),
        }),
      },
      {
        label: likelyBetween,
        value: t('compareReport.howSure.range', {
          defaultValue: '{{low}} to {{high}}',
          low: fixed(low, 2),
          high: fixed(high, 2),
        }),
      }
    );
  }

  lines.push(
    {
      label: t('compareReport.howSure.howUnusual', {
        defaultValue: 'How unusual',
      }),
      value: pPlainWords(p, t),
    },
    {
      label:
        mode === 'week'
          ? t('compareReport.howSure.weeksUsed', {
              defaultValue: 'Weeks used',
            })
          : t('compareReport.howSure.daysUsed', { defaultValue: 'Days used' }),
      value: usedText(result, mode, t),
    }
  );
  return lines;
}

/** Which thing seems to come first, from the server's direction check. */
function directionLine(
  result: CompareResult,
  q: CompareQuestion,
  t: Translator
): string | null {
  const direction = result.checks.direction;
  if (!direction) return null;
  if (direction === 'cantTell') {
    return t('compareReport.checks.cantTell', {
      defaultValue: "Can't tell which comes first",
    });
  }
  const { timing } = timingOf(q.choice);
  const a = metricName(q.a, t);
  const b = metricName(q.b, t);
  if (timing === 0) {
    return t('compareReport.checks.seemsFirst', {
      defaultValue: '{{metric}} seems to come first',
      metric: direction === 'firstComesFirst' ? a : b,
    });
  }
  if (direction === 'strongerOtherWay') {
    return t('compareReport.checks.otherWay', {
      defaultValue: 'The link is stronger the other way round',
    });
  }
  return t('compareReport.checks.comesFirst', {
    defaultValue: '{{metric}} comes first',
    metric: timing === -1 ? b : a,
  });
}

/**
 * The checks under an answer. Which comes first and the weekend check only
 * follow a "yes"; every answer opens with the own-normal line and ends with
 * the caveat.
 */
export function checkLines(
  result: CompareResult,
  q: CompareQuestion,
  t: Translator
): string[] {
  const lines = [
    t('compareReport.checks.ownNormal', {
      defaultValue: '✓ Compared with your own normal',
    }),
  ];
  if (result.linked) {
    const direction = directionLine(result, q, t);
    if (direction) lines.push(direction);
    if (timingOf(q.choice).mode === 'day' && result.checks.weekend) {
      lines.push(
        result.checks.weekend === 'holds'
          ? t('compareReport.checks.weekendHolds', {
              defaultValue: 'Still holds after accounting for weekends',
            })
          : t('compareReport.checks.weekendMay', {
              defaultValue: 'This may be a weekday-versus-weekend pattern',
            })
      );
    }
  }
  lines.push(
    t('compareReport.checks.notProof', {
      defaultValue: 'A link, not proof of cause',
    })
  );
  return lines;
}

/**
 * The caption on one axis of the dots. By the day a yes/no habit is plotted
 * as 0 or 1, not against its usual; by the week it is the days you did it.
 */
export function dotsAxisCaption(
  key: CompareMetricKey,
  mode: CompareMode,
  t: Translator
): string {
  if (isYesNo(key)) {
    return mode === 'week'
      ? t('compareReport.chart.axisDaysYou', {
          defaultValue: 'Days you {{verb}} vs. your usual',
          verb: plainLabel(key, t),
        })
      : t('compareReport.chart.axisYesNo', {
          defaultValue: '{{metric}} (yes or no)',
          metric: COMPARE_METRIC_LABELS[key](t),
        });
  }
  return t('compareReport.chart.axis', {
    defaultValue: '{{metric}} vs. your usual',
    metric: COMPARE_METRIC_LABELS[key](t),
  });
}
