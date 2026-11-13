import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  realignInputFromProgram,
  realignProgram,
  type RaceDistance,
  type RealignOutcome,
  type RunProgramRealignChange,
  type RunProgramRealignPreview,
  type RunProgramResponse,
} from '@workspace/shared';
import { toLocalDateString } from '../../utils/dateUtils';
import { formatDayLabel } from '../../utils/dayLabel';
import Button from '../ui/Button';

/** Changes listed before "Show all". */
const PREVIEW_CHANGES = 5;

const distanceLabel = (t: TFunction, id: RaceDistance): string => {
  switch (id) {
    case '5k':
      return t('runPrograms.race.distance.5k', { defaultValue: '5K' });
    case '10k':
      return t('runPrograms.race.distance.10k', { defaultValue: '10K' });
    case 'half':
      return t('runPrograms.race.distance.half', {
        defaultValue: 'Half marathon',
      });
    default:
      return t('runPrograms.race.distance.marathon', {
        defaultValue: 'Marathon',
      });
  }
};

/** One line saying what a change does to one workout. */
function changeLine(t: TFunction, change: RunProgramRealignChange): string {
  const what =
    change.title ??
    t('runPrograms.realign.what', {
      week: change.week,
      run: change.run,
      minutes: change.minutes,
      defaultValue: 'week {{week}}, run {{run}} · {{minutes}} min',
    });
  if (change.kind === 'dropped' && change.reason === 'repeat') {
    return t('runPrograms.realign.change.droppedRepeat', {
      what,
      defaultValue: 'Drop {{what}}: it repeats another run that week',
    });
  }
  if (change.kind === 'dropped') {
    return t('runPrograms.realign.change.droppedShortest', {
      what,
      defaultValue: 'Drop {{what}}: the shortest run of that week',
    });
  }
  if (change.kind === 'merged') {
    return t('runPrograms.realign.change.merged', {
      what,
      defaultValue: 'Fold {{what}} into the next week: a lighter week joins it',
    });
  }
  if (change.kind === 'added') {
    return t('runPrograms.realign.change.added', {
      what,
      defaultValue: 'Do {{what}} again, as an extra base week',
    });
  }
  return t('runPrograms.realign.change.repeated', {
    what,
    defaultValue: 'Repeat {{what}}',
  });
}

const Preview: React.FC<{
  preview: RunProgramRealignPreview;
  stretch: boolean;
}> = ({ preview, stretch }) => {
  const { t } = useTranslation();
  const [showAll, setShowAll] = useState(false);
  const changes = showAll
    ? preview.changes
    : preview.changes.slice(0, PREVIEW_CHANGES);
  const day = (value: string | null) =>
    value ? formatDayLabel(value, 'long') : '';
  return (
    <View testID="run-program-realign-preview">
      <Text className="text-text-secondary text-sm mt-2">
        {t('runPrograms.realign.before', {
          count: preview.before.workouts,
          date: day(preview.before.finishDay),
          defaultValue: 'Now: {{count}} workouts left, ending {{date}}.',
          defaultValue_one: 'Now: {{count}} workout left, ending {{date}}.',
          defaultValue_other: 'Now: {{count}} workouts left, ending {{date}}.',
        })}
      </Text>
      <Text className="text-text-primary text-sm font-semibold mt-1">
        {t('runPrograms.realign.after', {
          count: preview.after.workouts,
          date: day(preview.after.finishDay),
          defaultValue: 'After: {{count}} workouts, ending {{date}}.',
          defaultValue_one: 'After: {{count}} workout, ending {{date}}.',
          defaultValue_other: 'After: {{count}} workouts, ending {{date}}.',
        })}
      </Text>
      <Text className="text-text-secondary text-xs font-semibold mt-3">
        {stretch
          ? t('runPrograms.realign.changesMore', {
              defaultValue: 'What it adds',
            })
          : t('runPrograms.realign.changes', { defaultValue: 'What changes' })}
      </Text>
      {changes.map((change, index) => (
        <Text
          key={`${change.kind}-${change.week}-${change.run}-${index}`}
          className="text-text-primary text-sm py-1"
          testID="run-program-realign-change"
        >
          {changeLine(t, change)}
        </Text>
      ))}
      {preview.changes.length > PREVIEW_CHANGES ? (
        <Button
          variant="ghost"
          onPress={() => setShowAll((value) => !value)}
          testID="run-program-realign-show-all"
        >
          {showAll
            ? t('runPrograms.calendar.showLess', { defaultValue: 'Show fewer' })
            : t('runPrograms.calendar.showAll', {
                count: preview.changes.length,
                defaultValue: 'Show all {{count}}',
                defaultValue_one: 'Show {{count}}',
                defaultValue_other: 'Show all {{count}}',
              })}
        </Button>
      ) : null}
      {preview.eased ? (
        <Text className="text-text-secondary text-sm mt-2">
          {t('runPrograms.realign.eased', {
            count: preview.eased.count,
            days: preview.eased.daysAway,
            percent: Math.abs(preview.eased.percent),
            defaultValue:
              'You have been away {{days}} days, so the running in your next {{count}} workouts is eased by {{percent}}%.',
            defaultValue_one:
              'You have been away {{days}} days, so the running in your next {{count}} workout is eased by {{percent}}%.',
            defaultValue_other:
              'You have been away {{days}} days, so the running in your next {{count}} workouts is eased by {{percent}}%.',
          })}
        </Text>
      ) : null}
      {preview.keptTail > 0 && !stretch ? (
        <Text className="text-text-muted text-xs mt-2">
          {t('runPrograms.realign.kept', {
            defaultValue:
              'The taper and the final workout stay exactly as they are.',
          })}
        </Text>
      ) : null}
      {preview.spare > 0 ? (
        <Text className="text-text-muted text-xs mt-1">
          {t('runPrograms.realign.spare', {
            count: preview.spare,
            defaultValue:
              '{{count}} workout days before your goal stay empty: only so much is added at once.',
            defaultValue_one:
              '{{count}} workout day before your goal stays empty: only so much is added at once.',
            defaultValue_other:
              '{{count}} workout days before your goal stay empty: only so much is added at once.',
          })}
        </Text>
      ) : null}
    </View>
  );
};

/**
 * Offers to rebuild the rest of the plan so it still ends on the goal day:
 * what would change before and after, with Accept and Not now. A goal that is
 * not realistic is said plainly, with the choices (a later date, a shorter
 * race, or going ahead anyway). Nothing changes until Accept.
 */
/** What realigning the program to its goal day would do, as of `today`. */
export function realignOutcomeFor(
  program: RunProgramResponse,
  today: string
): RealignOutcome {
  const lastAdjusted = program.adjustment_log.at(-1);
  return realignProgram(
    realignInputFromProgram(program, {
      today,
      lastAdjustedDay: lastAdjusted
        ? toLocalDateString(new Date(lastAdjusted.at))
        : null,
    })
  );
}

/** Whether the outcome is something to offer: a plan, or an unrealistic goal. */
export function realignIsOffered(
  outcome: RealignOutcome
): outcome is Extract<RealignOutcome, { state: 'plan' | 'unrealistic' }> {
  return outcome.state === 'plan' || outcome.state === 'unrealistic';
}

const RunProgramRealignCard: React.FC<{
  program: RunProgramResponse;
  /** Today, YYYY-MM-DD. */
  today: string;
  /** Applies the realignment; resolves when done (a failure is shown by the caller). */
  onAccept: (token: string, force: boolean) => Promise<void>;
  /** Moves the goal day. */
  onMoveGoal: (day: string) => void;
  /** Opens the race planner for a shorter distance. */
  onPlanShorter: (distance: RaceDistance) => void;
}> = ({ program, today, onAccept, onMoveGoal, onPlanShorter }) => {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [forced, setForced] = useState(false);
  const [busy, setBusy] = useState(false);
  const outcome = useMemo(
    () => realignOutcomeFor(program, today),
    [program, today]
  );
  if (!realignIsOffered(outcome)) return null;
  const key = outcome.state === 'plan' ? outcome.preview.token : 'unrealistic';
  if (dismissed === key) return null;

  const accept = async (token: string, force: boolean) => {
    setBusy(true);
    try {
      await onAccept(token, force);
    } finally {
      setBusy(false);
    }
  };

  const acceptButtons = (token: string, force: boolean) => (
    <View className="flex-row mt-3">
      <View className="flex-1 mr-2">
        <Button
          variant="primary"
          loading={busy}
          disabled={busy}
          onPress={() => void accept(token, force)}
          testID="run-program-realign-accept"
        >
          {t('runPrograms.realign.accept', { defaultValue: 'Realign plan' })}
        </Button>
      </View>
      <View className="flex-1">
        <Button
          variant="outline"
          disabled={busy}
          onPress={() => {
            if (force) setForced(false);
            else setDismissed(key);
          }}
          testID="run-program-realign-not-now"
        >
          {force
            ? t('runPrograms.realign.back', { defaultValue: 'Back' })
            : t('runPrograms.realign.notNow', { defaultValue: 'Not now' })}
        </Button>
      </View>
    </View>
  );

  if (outcome.state === 'plan') {
    const stretch =
      outcome.preview.dropped + outcome.preview.merged === 0 &&
      outcome.preview.added + outcome.preview.repeated > 0;
    return (
      <View
        className="bg-surface rounded-xl p-4 mt-4"
        testID="run-program-realign"
      >
        <Text className="text-text-primary text-base font-semibold">
          {stretch
            ? t('runPrograms.realign.titleMore', {
                defaultValue: 'You have time to spare',
              })
            : t('runPrograms.realign.title', {
                defaultValue: 'Realign your plan',
              })}
        </Text>
        <Text className="text-text-secondary text-sm mt-1">
          {stretch
            ? t('runPrograms.realign.introMore', {
                defaultValue:
                  'You have more days before your goal than workouts. Repeating some base weeks gives you a steadier build and still ends on your goal date.',
              })
            : t('runPrograms.realign.intro', {
                defaultValue:
                  'You have missed some time. Realigning rebuilds the rest of your plan so you still finish on your goal date, keeping your long runs, the taper and the final workout.',
              })}
        </Text>
        <Preview preview={outcome.preview} stretch={stretch} />
        {acceptButtons(outcome.preview.token, false)}
      </View>
    );
  }

  if (forced && outcome.continuePlan) {
    return (
      <View
        className="bg-surface rounded-xl p-4 mt-4"
        testID="run-program-realign"
      >
        <Text className="text-text-primary text-base font-semibold">
          {t('runPrograms.realign.titleForced', {
            defaultValue: 'Continue anyway',
          })}
        </Text>
        <Text className="text-text-secondary text-sm mt-1">
          {t('runPrograms.realign.introForced', {
            defaultValue:
              'This drops as many workouts as it takes to end on your goal date. It is a lot to skip, so the build will be thinner than planned. The taper and the final workout are still kept.',
          })}
        </Text>
        <Preview preview={outcome.continuePlan.preview} stretch={false} />
        {acceptButtons(outcome.continuePlan.preview.token, true)}
      </View>
    );
  }

  const reasonText = outcome.reasons.map((reason) => {
    switch (reason) {
      case 'noTimeLeft':
        return t('runPrograms.realign.reason.noTimeLeft', {
          defaultValue: 'There is no workout day left before your goal date.',
        });
      case 'taperDoesNotFit':
        return t('runPrograms.realign.reason.taperDoesNotFit', {
          defaultValue:
            'There is no longer room for the taper and the final workout.',
        });
      case 'tooMuchToDrop':
        return t('runPrograms.realign.reason.tooMuchToDrop', {
          defaultValue:
            'Fitting everything in would mean dropping a lot of your build.',
        });
      default:
        return t('runPrograms.realign.reason.tooFewWeeks', {
          count: outcome.weeksLeft,
          defaultValue: '{{count}} weeks is too short a build for this race.',
          defaultValue_one:
            '{{count}} week is too short a build for this race.',
          defaultValue_other:
            '{{count}} weeks is too short a build for this race.',
        });
    }
  });
  return (
    <View
      className="bg-surface rounded-xl p-4 mt-4"
      testID="run-program-realign"
    >
      <Text className="text-text-primary text-base font-semibold">
        {t('runPrograms.realign.titleTight', {
          defaultValue: 'Your goal date is too tight',
        })}
      </Text>
      <Text className="text-text-secondary text-sm mt-1">
        {t('runPrograms.realign.tight', {
          count: outcome.slots,
          left: outcome.workoutsLeft,
          defaultValue:
            'Only {{count}} workout days are left before your goal date and {{left}} workouts remain.',
          defaultValue_one:
            'Only {{count}} workout day is left before your goal date and {{left}} workouts remain.',
          defaultValue_other:
            'Only {{count}} workout days are left before your goal date and {{left}} workouts remain.',
        })}
      </Text>
      {reasonText.map((line) => (
        <Text
          key={line}
          className="text-text-secondary text-sm mt-1"
          testID="run-program-realign-reason"
        >
          {line}
        </Text>
      ))}
      <Text className="text-text-muted text-xs mt-2">
        {t('runPrograms.realign.choose', {
          defaultValue: 'Nothing changes until you choose:',
        })}
      </Text>
      {outcome.options.includes('later') && outcome.laterDay ? (
        <View className="mt-2">
          <Button
            variant="outline"
            onPress={() => onMoveGoal(outcome.laterDay as string)}
            testID="run-program-realign-later"
          >
            {t('runPrograms.realign.later', {
              date: formatDayLabel(outcome.laterDay, 'long'),
              defaultValue: 'Move my goal to {{date}}',
            })}
          </Button>
        </View>
      ) : null}
      {outcome.lowerDistance ? (
        <View className="mt-2">
          <Button
            variant="outline"
            onPress={() => onPlanShorter(outcome.lowerDistance as RaceDistance)}
            testID="run-program-realign-lower"
          >
            {t('runPrograms.realign.lower', {
              distance: distanceLabel(t, outcome.lowerDistance),
              defaultValue: 'Plan a {{distance}} instead',
            })}
          </Button>
        </View>
      ) : null}
      {outcome.options.includes('continue') ? (
        <View className="mt-2">
          <Button
            variant="ghost"
            onPress={() => setForced(true)}
            testID="run-program-realign-continue"
          >
            {t('runPrograms.realign.continue', {
              defaultValue: 'Continue anyway',
            })}
          </Button>
        </View>
      ) : null}
      <View className="mt-1">
        <Button
          variant="ghost"
          onPress={() => setDismissed(key)}
          testID="run-program-realign-not-now"
        >
          {t('runPrograms.realign.notNow', { defaultValue: 'Not now' })}
        </Button>
      </View>
    </View>
  );
};

export default RunProgramRealignCard;
