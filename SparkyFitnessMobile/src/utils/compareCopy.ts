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
  EnergyUnit,
} from '@workspace/shared';
import { COMPARE_METRIC_LABELS } from '../constants/compareMetrics';
import type { Translator } from '../constants/reports';
import { formatLocalizedNumber } from '../localization';
import { getAppLanguageCode } from '../localization/i18n';
import { formatTimeLabel } from './entryTimeDisplay';

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function upperFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function isYesNo(key: CompareMetricKey): boolean {
  return COMPARE_METRICS[key].kind === 'binary';
}

/** Languages that capitalize every noun, also in the middle of a sentence. */
const NOUN_CAPITALIZING_LANGUAGES = new Set(['de']);

/**
 * The label for the middle of a sentence: in lower case, except a translated
 * noun in a language that capitalizes nouns ("Stimmung" in German). A label
 * still in English (not translated yet) is lowered, as the English sentence
 * around it needs. A yes/no label is a verb ("Meditated", "Meditiert"), so it
 * is lowered in every language.
 */
function plainLabel(key: CompareMetricKey, t: Translator): string {
  const label = COMPARE_METRIC_LABELS[key](t);
  const english = COMPARE_METRIC_LABELS[key]((_key, o) => o.defaultValue);
  const keepCapital =
    !isYesNo(key) &&
    label !== english &&
    NOUN_CAPITALIZING_LANGUAGES.has(getAppLanguageCode());
  return keepCapital ? label : lowerFirst(label);
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

function timingWords(
  choice: CompareTimingChoice,
  sides: SleepSides,
  t: Translator
): string {
  const { mode, timing } = timingOf(choice);
  // Since mode's chip opens its own sentence: "Since I started …".
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

function timingPhrase(q: CompareQuestion, t: Translator): string {
  return timingWords(q.choice, sleepSides(q.a, q.b), t);
}

/**
 * The three filled-in parts of the question sentence, for whichever are
 * chosen. The sleep timing words need both metrics, so until both are picked
 * the timing reads as plain days. In since mode the timing is the "Since" that
 * opens the sentence.
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
export interface YesNoWording {
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

/**
 * The sentence after a yes/no "Yes": the habit's days against the other days, which is what
 * the analysis compares. Not "than usual": a habit kept on most days is the usual, so its days
 * can sit near usual while the other days fall below it.
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
 * A yes/no habit's difference for the bars: how far the habit's days sat from the other days,
 * each measured against the person's own normal (the analysis's `binary.diff`). The direction
 * word carries the sign, so the amount is unsigned.
 */
export function yesNoDifferenceText(
  q: CompareQuestion,
  binary: NonNullable<CompareResult['binary']>,
  t: Translator,
  energyUnit: EnergyUnit = 'kcal'
): string {
  const outcomeKey = binary.yesKey === q.a ? q.b : q.a;
  const others = lowerFirst(yesNoWording(q, binary.yesKey, t).noLabel);
  const same = () =>
    t('compareReport.howSure.differenceSame', {
      defaultValue:
        'About the same as on {{others}} (each measured against your own normal)',
      others,
    });
  if (outcomeKey === 'bedtime') {
    // A bedtime difference is a span of minutes, not a time of day.
    const minutes = Math.round(Math.abs(binary.diff));
    if (minutes === 0) return same();
    const diff = formatLocalizedNumber(minutes, { maximumFractionDigits: 0 });
    return binary.diff > 0
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
  const shown = Math.abs(
    compareDisplayValue(outcomeKey, binary.diff, energyUnit)
  );
  if (Math.round(shown * 10) === 0) return same();
  const diff = formatLocalizedNumber(shown, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return binary.diff > 0
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

/** A signed span of whole minutes, e.g. "+25" for a bedtime difference. */
export function signedMinutes(value: number): string {
  return formatLocalizedNumber(value, {
    maximumFractionDigits: 0,
    signDisplay: 'exceptZero',
  });
}

function units(count: number, mode: CompareMode, t: Translator): string {
  return mode === 'week'
    ? t('compareReport.verdict.weeks', {
        defaultValue: '{{count}} weeks',
        count,
      })
    : t('compareReport.verdict.days', {
        defaultValue: '{{count}} days',
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
                weaker: weakerText,
                count: missing,
              })
            : t('compareReport.verdict.logDays', {
                defaultValue:
                  'Log {{weaker}} on {{count}} more days, or pick a longer span.',
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

function num(value: number, digits: number): string {
  return formatLocalizedNumber(value, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/**
 * An amount of a metric on its display scale (mood 1-10): counts and minutes
 * whole, everything else to one decimal. Bedtime here is a span of whole
 * minutes, not a clock time. `signed` shows a difference with its sign.
 */
export function compareAmountText(
  key: CompareMetricKey,
  value: number,
  signed = false,
  energyUnit: EnergyUnit = 'kcal'
): string {
  const digits = compareDigits(key);
  return formatLocalizedNumber(compareDisplayValue(key, value, energyUnit), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    ...(signed ? { signDisplay: 'exceptZero' as const } : {}),
  });
}

/**
 * A metric's raw value as the person reads it: bedtime (minutes after 18:00)
 * as a clock time in the app locale, everything else as `compareAmountText`.
 */
export function compareValueText(
  key: CompareMetricKey,
  value: number,
  energyUnit: EnergyUnit = 'kcal'
): string {
  if (key === 'bedtime') {
    const clock = bedtimeClock(value);
    return formatTimeLabel(clock) ?? clock;
  }
  return compareAmountText(key, value, false, energyUnit);
}

/** "p 0.012", or "p < 0.001" when it is that small. */
export function pValueText(p: number, t: Translator): string {
  return p < 0.001
    ? t('compareReport.stats.pTiny', { defaultValue: 'p < 0.001' })
    : t('compareReport.stats.p', {
        defaultValue: 'p {{p}}',
        p: num(p, 3),
      });
}

/**
 * The numbers behind a verdict. For a yes/no result `outcome` is the metric
 * that was compared, so mood shows on the 1-10 scale.
 */
export function statsLine(
  result: CompareResult,
  mode: CompareMode,
  t: Translator,
  outcome?: CompareMetricKey,
  energyUnit: EnergyUnit = 'kcal'
): string | null {
  if (
    result.status !== 'ok' ||
    result.low === undefined ||
    result.high === undefined ||
    result.p === undefined
  ) {
    return null;
  }
  const p = pValueText(result.p, t);
  const n = units(result.n, mode, t);

  if (result.method === 'difference' && result.binary) {
    if (outcome === 'bedtime') {
      // Bedtime is a time of day, so its difference is a span of whole minutes.
      return t('compareReport.stats.differenceMinutes', {
        defaultValue:
          'difference {{diff}} min · 95% range {{low}} to {{high}} min · {{p}} · {{n}}',
        diff: signedMinutes(result.binary.diff),
        low: num(result.low, 0),
        high: num(result.high, 0),
        p,
        n,
      });
    }
    const scale = (v: number) =>
      outcome ? compareDisplayValue(outcome, v, energyUnit) : v;
    return t('compareReport.stats.difference', {
      defaultValue:
        'difference {{diff}} · 95% range {{low}} to {{high}} · {{p}} · {{n}}',
      diff: num(scale(result.binary.diff), 1),
      low: num(scale(result.low), 1),
      high: num(scale(result.high), 1),
      p,
      n,
    });
  }
  if (result.r === undefined) return null;
  return t('compareReport.stats.correlation', {
    defaultValue: 'r {{r}} · 95% range {{low}} to {{high}} · {{p}} · {{n}}',
    r: num(result.r, 2),
    low: num(result.low, 2),
    high: num(result.high, 2),
    p,
    n,
  });
}
