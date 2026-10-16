import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useCSSVariable } from 'uniwind';
import { findProgram } from '@workspace/shared';
import Button from '../components/ui/Button';
import {
  programName,
  workoutTitle,
} from '../components/recording/RunProgramCard';
import Icon from '../components/Icon';
import { useScreenHeader } from '../hooks/useScreenHeader';
import {
  removeCustomProgram,
  saveCustomProgram,
  useCustomRunPrograms,
} from '../services/runProgramService';
import { addLog } from '../services/LogService';
import type { RootStackScreenProps } from '../types/navigation';
import {
  addStep,
  addWorkout,
  canAddWorkout,
  cycleStepKind,
  draftFromBuiltIn,
  draftFromProgram,
  draftProblem,
  draftToInput,
  duplicateWorkout,
  emptyDraft,
  heartRateBandFrom,
  moveWorkout,
  nudgeStep,
  paceBandFrom,
  removeStep,
  removeWorkout,
  setStepTarget,
  setWorkoutTitle,
  workoutSeconds,
  type DraftActivity,
  type DraftStep,
  type ProgramDraft,
  type StepKind,
} from '../utils/customProgramDraft';

type Props = RootStackScreenProps<'RunProgramEdit'>;

const clock = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

const kindLabel = (
  t: ReturnType<typeof useTranslation>['t'],
  kind: StepKind,
  activity: DraftActivity
): string => {
  switch (kind) {
    case 'warmup':
      return t('runPrograms.custom.kind.warmup', { defaultValue: 'Warm up' });
    case 'cooldown':
      return t('runPrograms.custom.kind.cooldown', {
        defaultValue: 'Cool down',
      });
    case 'recovery':
      return t('runPrograms.custom.kind.recovery', {
        defaultValue: 'Easy',
      });
    default:
      return activity === 'walk'
        ? t('runPrograms.custom.kind.workWalk', { defaultValue: 'Brisk walk' })
        : t('runPrograms.custom.kind.workRun', { defaultValue: 'Run' });
  }
};

const clockText = (seconds: number | undefined): string =>
  seconds === undefined ? '' : clock(seconds);

const TargetInput: React.FC<{
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  label: string;
  muted: string;
  testID: string;
}> = ({ value, onChangeText, placeholder, label, muted, testID }) => (
  <TextInput
    className="flex-1 bg-background rounded-lg px-2 py-1 text-text-primary text-center mx-1"
    style={{ fontSize: 14 }}
    value={value}
    onChangeText={onChangeText}
    placeholder={placeholder}
    placeholderTextColor={muted}
    accessibilityLabel={label}
    keyboardType="numbers-and-punctuation"
    maxLength={5}
    testID={testID}
  />
);

/** Optional pace and heart-rate ranges for one step. */
const StepTargets: React.FC<{
  step: DraftStep;
  muted: string;
  testIDPrefix: string;
  onPace: (pace: DraftStep['pace'] | null) => void;
  onHeartRate: (band: DraftStep['heartRate'] | null) => void;
}> = ({ step, muted, testIDPrefix, onPace, onHeartRate }) => {
  const { t } = useTranslation();
  const [fast, setFast] = useState(clockText(step.pace?.minSecondsPerKm));
  const [slow, setSlow] = useState(clockText(step.pace?.maxSecondsPerKm));
  const [low, setLow] = useState(step.heartRate?.minBpm.toString() ?? '');
  const [high, setHigh] = useState(step.heartRate?.maxBpm.toString() ?? '');

  const changePace = (nextFast: string, nextSlow: string) => {
    setFast(nextFast);
    setSlow(nextSlow);
    if (!nextFast.trim() && !nextSlow.trim()) return onPace(null);
    const band = paceBandFrom(nextFast, nextSlow);
    if (band) onPace(band);
  };
  const changeHeartRate = (nextLow: string, nextHigh: string) => {
    setLow(nextLow);
    setHigh(nextHigh);
    if (!nextLow.trim() && !nextHigh.trim()) return onHeartRate(null);
    const band = heartRateBandFrom(nextLow, nextHigh);
    if (band) onHeartRate(band);
  };
  const paceInvalid =
    (fast.trim() !== '' || slow.trim() !== '') && !paceBandFrom(fast, slow);
  const hrInvalid =
    (low.trim() !== '' || high.trim() !== '') && !heartRateBandFrom(low, high);

  return (
    <View className="mt-1 ml-1" testID={`${testIDPrefix}-targets`}>
      <View className="flex-row items-center">
        <Text className="text-text-muted text-xs w-20">
          {t('runPrograms.custom.paceTarget', { defaultValue: 'Pace /km' })}
        </Text>
        <TargetInput
          value={fast}
          onChangeText={(text) => changePace(text, slow)}
          placeholder="5:00"
          label={t('runPrograms.custom.paceFast', {
            defaultValue: 'Fastest pace per kilometre',
          })}
          muted={muted}
          testID={`${testIDPrefix}-pace-fast`}
        />
        <Text className="text-text-muted">–</Text>
        <TargetInput
          value={slow}
          onChangeText={(text) => changePace(fast, text)}
          placeholder="6:00"
          label={t('runPrograms.custom.paceSlow', {
            defaultValue: 'Slowest pace per kilometre',
          })}
          muted={muted}
          testID={`${testIDPrefix}-pace-slow`}
        />
      </View>
      <View className="flex-row items-center mt-1">
        <Text className="text-text-muted text-xs w-20">
          {t('runPrograms.custom.heartRateTarget', {
            defaultValue: 'Heart rate',
          })}
        </Text>
        <TargetInput
          value={low}
          onChangeText={(text) => changeHeartRate(text, high)}
          placeholder="120"
          label={t('runPrograms.custom.heartRateLow', {
            defaultValue: 'Lowest heart rate',
          })}
          muted={muted}
          testID={`${testIDPrefix}-hr-low`}
        />
        <Text className="text-text-muted">–</Text>
        <TargetInput
          value={high}
          onChangeText={(text) => changeHeartRate(low, text)}
          placeholder="150"
          label={t('runPrograms.custom.heartRateHigh', {
            defaultValue: 'Highest heart rate',
          })}
          muted={muted}
          testID={`${testIDPrefix}-hr-high`}
        />
      </View>
      {paceInvalid || hrInvalid ? (
        <Text className="text-text-muted text-xs mt-1">
          {t('runPrograms.custom.targetHint', {
            defaultValue:
              'Use m:ss for pace and bpm for heart rate, with the two ends at least 10 apart. Empty means no target.',
          })}
        </Text>
      ) : null}
    </View>
  );
};

const IconButton: React.FC<{
  icon: React.ComponentProps<typeof Icon>['name'];
  label: string;
  onPress: () => void;
  disabled?: boolean;
  color: string;
  testID?: string;
}> = ({ icon, label, onPress, disabled, color, testID }) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityLabel={label}
    hitSlop={8}
    className="p-2"
    style={{ opacity: disabled ? 0.3 : 1 }}
    testID={testID}
  >
    <Icon name={icon} size={18} color={color} />
  </Pressable>
);

/**
 * Builds or changes one of the person's own programs: a name, run or walk, and
 * a free list of workouts, each a list of timed steps.
 */
const RunProgramEditScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const id = route.params?.id;
  const { programs, loaded } = useCustomRunPrograms();
  const existing = id ? programs.find((p) => p.id === id) : undefined;
  const [muted, accent] = useCSSVariable([
    '--color-text-muted',
    '--color-accent-primary',
  ]) as [string, string];
  const fromProgramId = route.params?.fromProgramId;
  const [draft, setDraft] = useState<ProgramDraft | null>(() => {
    if (id) return null;
    // A built-in program opened to be customised starts as a copy of it.
    const source = fromProgramId ? findProgram(fromProgramId) : undefined;
    if (source) {
      return draftFromBuiltIn(
        source,
        t('runPrograms.custom.copyName', {
          name: programName(t, source.id),
          defaultValue: '{{name}} (my copy)',
        }),
        (workout) => workoutTitle(t, source, workout)
      );
    }
    return emptyDraft();
  });
  const [saving, setSaving] = useState(false);
  // Bumped when steps or workouts move or go, so the target boxes (which hold
  // their own text while typing) start over from the step now at that place.
  const [revision, setRevision] = useState(0);
  // An existing program fills the form once, when it arrives.
  if (id && !draft && existing) setDraft(draftFromProgram(existing));

  const header = useScreenHeader({
    title: id
      ? t('screens.runProgramEdit', { defaultValue: 'Edit plan' })
      : t('screens.runProgramNew', { defaultValue: 'New plan' }),
    left: { kind: 'back' },
  });

  if (!draft) {
    return (
      <>
        {header}
        <View className="flex-1 bg-background p-4">
          <Text className="text-text-secondary text-sm">
            {loaded
              ? t('runPrograms.custom.missing', {
                  defaultValue: 'This plan is no longer there.',
                })
              : t('common.loading', { defaultValue: 'Loading...' })}
          </Text>
        </View>
      </>
    );
  }

  const problem = draftProblem(draft);
  const problemText =
    problem === 'name'
      ? t('runPrograms.custom.problem.name', {
          defaultValue: 'Give the plan a name.',
        })
      : problem === 'noWorkouts'
        ? t('runPrograms.custom.problem.noWorkouts', {
            defaultValue: 'Add at least one workout.',
          })
        : problem === 'emptyWorkout'
          ? t('runPrograms.custom.problem.emptyWorkout', {
              defaultValue: 'Every workout needs at least one step.',
            })
          : null;

  const update = (next: ProgramDraft) => setDraft(next);
  const restructure = (next: ProgramDraft) => {
    setRevision((r) => r + 1);
    setDraft(next);
  };

  const save = async () => {
    if (problem || saving) return;
    setSaving(true);
    try {
      await saveCustomProgram(draftToInput(draft), id);
      navigation.goBack();
    } catch (error) {
      addLog(`[Run Program] Could not save the plan: ${error}`, 'WARNING');
      Toast.show({
        type: 'error',
        text1: t('runPrograms.custom.saveError', {
          defaultValue: 'Could not save your plan',
        }),
        text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
      });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () => {
    if (!id) return;
    Alert.alert(
      t('runPrograms.custom.deleteTitle', {
        defaultValue: 'Delete this plan?',
      }),
      t('runPrograms.custom.deleteMessage', {
        defaultValue:
          'If you are following it, you can carry on; it just leaves your list of plans.',
      }),
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: t('common.delete', { defaultValue: 'Delete' }),
          style: 'destructive',
          onPress: () => {
            void removeCustomProgram(id)
              .then(() => navigation.goBack())
              .catch((error: unknown) => {
                addLog(
                  `[Run Program] Could not delete the plan: ${error}`,
                  'WARNING'
                );
                Toast.show({
                  type: 'error',
                  text1: t('runPrograms.custom.deleteError', {
                    defaultValue: 'Could not delete your plan',
                  }),
                });
              });
          },
        },
      ]
    );
  };

  return (
    <>
      {header}
      <ScrollView
        className="flex-1 bg-background"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 24,
        }}
      >
        <Text className="text-text-secondary text-xs mb-1">
          {t('runPrograms.custom.nameLabel', { defaultValue: 'Name' })}
        </Text>
        <TextInput
          className="bg-surface rounded-xl px-3 py-3 text-text-primary"
          style={{ fontSize: 16 }}
          value={draft.name}
          onChangeText={(name) => update({ ...draft, name })}
          maxLength={60}
          placeholder={t('runPrograms.custom.namePlaceholder', {
            defaultValue: 'My plan',
          })}
          placeholderTextColor={muted}
          testID="plan-name"
        />

        <View className="flex-row mt-4">
          {(['run', 'walk'] as const).map((activity) => (
            <Pressable
              key={activity}
              onPress={() => update({ ...draft, activity })}
              accessibilityRole="button"
              accessibilityState={{ selected: draft.activity === activity }}
              className={`flex-1 items-center py-2 rounded-lg mr-2 ${
                draft.activity === activity ? 'bg-accent-primary' : 'bg-surface'
              }`}
              testID={`plan-activity-${activity}`}
            >
              <Text
                className={
                  draft.activity === activity
                    ? 'text-white font-semibold'
                    : 'text-text-primary'
                }
              >
                {activity === 'run'
                  ? t('runPrograms.custom.activityRun', { defaultValue: 'Run' })
                  : t('runPrograms.custom.activityWalk', {
                      defaultValue: 'Walk',
                    })}
              </Text>
            </Pressable>
          ))}
        </View>

        {draft.workouts.map((workout, index) => (
          <View
            key={index}
            className="bg-surface rounded-xl p-4 mt-4"
            testID={`plan-workout-${index}`}
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-text-primary text-base font-semibold">
                {t('runPrograms.custom.workoutNumber', {
                  number: index + 1,
                  defaultValue: 'Workout {{number}}',
                })}
              </Text>
              <View className="flex-row">
                <IconButton
                  icon="chevron-up"
                  label={t('runPrograms.custom.moveUp', {
                    defaultValue: 'Move earlier',
                  })}
                  disabled={index === 0}
                  onPress={() => restructure(moveWorkout(draft, index, -1))}
                  color={muted}
                  testID={`plan-workout-up-${index}`}
                />
                <IconButton
                  icon="chevron-down"
                  label={t('runPrograms.custom.moveDown', {
                    defaultValue: 'Move later',
                  })}
                  disabled={index === draft.workouts.length - 1}
                  onPress={() => restructure(moveWorkout(draft, index, 1))}
                  color={muted}
                  testID={`plan-workout-down-${index}`}
                />
                <IconButton
                  icon="copy"
                  label={t('runPrograms.custom.duplicate', {
                    defaultValue: 'Duplicate workout',
                  })}
                  disabled={!canAddWorkout(draft)}
                  onPress={() => restructure(duplicateWorkout(draft, index))}
                  color={muted}
                  testID={`plan-workout-copy-${index}`}
                />
                <IconButton
                  icon="trash"
                  label={t('runPrograms.custom.removeWorkout', {
                    defaultValue: 'Remove workout',
                  })}
                  onPress={() => restructure(removeWorkout(draft, index))}
                  color={muted}
                  testID={`plan-workout-remove-${index}`}
                />
              </View>
            </View>
            <TextInput
              className="border-b border-border-subtle text-text-primary mt-2 py-1"
              style={{ fontSize: 15 }}
              value={workout.title}
              onChangeText={(title) =>
                update(setWorkoutTitle(draft, index, title))
              }
              maxLength={40}
              placeholder={t('runPrograms.custom.titlePlaceholder', {
                defaultValue: 'Name (optional)',
              })}
              placeholderTextColor={muted}
            />
            <Text className="text-text-muted text-xs mt-2">
              {t('runPrograms.custom.totalMinutes', {
                minutes: Math.round(workoutSeconds(workout) / 60),
                defaultValue: '{{minutes}} minutes in all',
              })}
            </Text>

            {workout.steps.map((step, stepIndex) => (
              <View key={stepIndex} className="mt-2">
                <View
                  className="flex-row items-center"
                  testID={`plan-step-${index}-${stepIndex}`}
                >
                  <Pressable
                    onPress={() =>
                      update(cycleStepKind(draft, index, stepIndex))
                    }
                    accessibilityRole="button"
                    accessibilityHint={t('runPrograms.custom.kindHint', {
                      defaultValue: 'Changes the kind of step',
                    })}
                    className="flex-1 bg-background rounded-lg px-3 py-2"
                    testID={`plan-step-kind-${index}-${stepIndex}`}
                  >
                    <Text className="text-text-primary text-sm">
                      {kindLabel(t, step.kind, draft.activity)}
                    </Text>
                  </Pressable>
                  <IconButton
                    icon="remove-circle"
                    label={t('runPrograms.custom.shorter', {
                      defaultValue: 'Shorter',
                    })}
                    onPress={() =>
                      update(nudgeStep(draft, index, stepIndex, -1))
                    }
                    color={accent}
                    testID={`plan-step-less-${index}-${stepIndex}`}
                  />
                  <Text className="text-text-primary text-sm w-12 text-center">
                    {clock(step.seconds)}
                  </Text>
                  <IconButton
                    icon="add-circle"
                    label={t('runPrograms.custom.longer', {
                      defaultValue: 'Longer',
                    })}
                    onPress={() =>
                      update(nudgeStep(draft, index, stepIndex, 1))
                    }
                    color={accent}
                    testID={`plan-step-more-${index}-${stepIndex}`}
                  />
                  <IconButton
                    icon="close"
                    label={t('runPrograms.custom.removeStep', {
                      defaultValue: 'Remove step',
                    })}
                    onPress={() =>
                      restructure(removeStep(draft, index, stepIndex))
                    }
                    color={muted}
                    testID={`plan-step-remove-${index}-${stepIndex}`}
                  />
                </View>
                {step.kind === 'warmup' || step.kind === 'cooldown' ? null : (
                  <StepTargets
                    key={`${revision}-${step.kind}`}
                    step={step}
                    muted={muted}
                    testIDPrefix={`plan-step-${index}-${stepIndex}`}
                    onPace={(pace) =>
                      update(setStepTarget(draft, index, stepIndex, { pace }))
                    }
                    onHeartRate={(heartRate) =>
                      update(
                        setStepTarget(draft, index, stepIndex, { heartRate })
                      )
                    }
                  />
                )}
              </View>
            ))}
            <View className="mt-3">
              <Button
                variant="outline"
                onPress={() => update(addStep(draft, index))}
                testID={`plan-add-step-${index}`}
              >
                {t('runPrograms.custom.addStep', {
                  defaultValue: 'Add a step',
                })}
              </Button>
            </View>
          </View>
        ))}

        <View className="mt-4">
          <Button
            variant="outline"
            disabled={!canAddWorkout(draft)}
            onPress={() => update(addWorkout(draft))}
            testID="plan-add-workout"
          >
            {t('runPrograms.custom.addWorkout', {
              defaultValue: 'Add a workout',
            })}
          </Button>
        </View>

        {problemText ? (
          <Text className="text-text-secondary text-xs mt-4">
            {problemText}
          </Text>
        ) : null}
        <View className="mt-4">
          <Button
            variant="primary"
            disabled={!!problem}
            loading={saving}
            onPress={() => void save()}
            testID="plan-save"
          >
            {t('common.save', { defaultValue: 'Save' })}
          </Button>
        </View>
        {id ? (
          <View className="mt-3">
            <Button variant="destructive" onPress={confirmDelete}>
              {t('runPrograms.custom.delete', { defaultValue: 'Delete plan' })}
            </Button>
          </View>
        ) : null}
      </ScrollView>
    </>
  );
};

export default RunProgramEditScreen;
