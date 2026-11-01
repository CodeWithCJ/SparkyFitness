import { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Keyboard } from 'react-native';
import Toast from 'react-native-toast-message';
import type { TFunction } from 'i18next';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { formatLocalizedNumber } from '../localization';
import { offerCheckinRemindersAfterLeaving } from '../services/offerCheckinReminders';
import { useGuidedCheckInStore } from '../stores/guidedCheckInStore';
import type {
  GuidedCheckInParams,
  GuidedCheckInStep,
  RootStackParamList,
} from '../types/navigation';

type GuidedCheckInNavigation = Pick<
  NativeStackNavigationProp<RootStackParamList>,
  'replace' | 'goBack' | 'isFocused'
>;

const STEPS: readonly GuidedCheckInStep[] = [
  'MoodLog',
  'MeasurementsAdd',
  'ProgressPhotos',
];

/** What a step reports as it hands over. */
interface GuidedCheckInStepResult {
  saved?: boolean;
  offerReminders?: boolean;
  moodCheckin?: GuidedCheckInParams['moodCheckin'];
}

export interface GuidedCheckIn {
  step: number;
  total: number;
  /** Hands over to the next step; on the last one it finishes. */
  advance: (result?: GuidedCheckInStepResult) => void;
  /**
   * Moves on without saving, asking first when the step has unsaved edits.
   * `result` is what the step had already saved, if anything.
   */
  skip: (hasUnsavedEdits: boolean, result?: GuidedCheckInStepResult) => void;
  /**
   * Opens the step before, asking first when this step has unsaved edits.
   * `result` is as for `skip`. Null on the first step.
   */
  back:
    | ((hasUnsavedEdits: boolean, result?: GuidedCheckInStepResult) => void)
    | null;
  /** Leaves the flow from the last step. */
  finish: (result?: GuidedCheckInStepResult) => void;
  /**
   * Finishes the flow when the navigator closed the last step itself (system
   * Back, the iOS swipe): the same confirmation as `finish`, with no goBack.
   */
  onNavigatorClose: (result?: GuidedCheckInStepResult) => void;
  /** True once this step has handed over or finished. */
  hasLeft: () => boolean;
}

interface UseGuidedCheckInArgs {
  navigation: GuidedCheckInNavigation;
  step: GuidedCheckInStep;
  date: string | undefined;
  params: GuidedCheckInParams | undefined;
}

/**
 * The guided check-in for a step screen, or null when the screen was opened
 * on its own. Every step works on the one day the flow started with, and each
 * hop replaces the step, so leaving (X, Back, a swipe) always lands where the
 * flow began, with what was saved kept. Each hop also records the step it
 * opens, so the Add menu can offer to continue the check-in later.
 */
export function useGuidedCheckIn({
  navigation,
  step,
  date,
  params,
}: UseGuidedCheckInArgs): GuidedCheckIn | null {
  const { t } = useTranslation();
  // Set once the step hands over, so a second press, or a save that resolves
  // after the user already left, never moves the stack again.
  const leftRef = useRef(false);
  const confirmingRef = useRef(false);

  return useMemo(() => {
    if (!params || !date) return null;

    const index = STEPS.indexOf(step);

    const merged = (result?: GuidedCheckInStepResult): GuidedCheckInParams => ({
      offerReminders: Boolean(params.offerReminders || result?.offerReminders),
      saved: Boolean(params.saved || result?.saved),
      ...((result?.moodCheckin ?? params.moodCheckin)
        ? { moodCheckin: result?.moodCheckin ?? params.moodCheckin }
        : {}),
    });

    // Replace and goBack act on whichever route is focused, so a step that
    // is no longer on top must not move.
    const leave = (): boolean => {
      if (leftRef.current || !navigation.isFocused()) return false;
      leftRef.current = true;
      Keyboard.dismiss();
      return true;
    };

    const open = (
      target: GuidedCheckInStep,
      guidedCheckIn: GuidedCheckInParams
    ) => {
      useGuidedCheckInStore
        .getState()
        .saveProgress({ date, step: target, flags: guidedCheckIn });
      if (target === 'MoodLog') {
        navigation.replace('MoodLog', { date, guidedCheckIn });
      } else if (target === 'MeasurementsAdd') {
        navigation.replace('MeasurementsAdd', { date, guidedCheckIn });
      } else {
        navigation.replace('ProgressPhotos', { date, guidedCheckIn });
      }
    };

    // Shown once the flow is closed: the toast when a step saved something,
    // then the reminder offer step 1 held back.
    const confirm = (result?: GuidedCheckInStepResult) => {
      useGuidedCheckInStore.getState().clearProgress();
      const flags = merged(result);
      if (flags.saved) {
        Toast.show({
          type: 'success',
          text1: t('guidedCheckIn.done', { defaultValue: 'Check-in complete' }),
        });
      }
      if (flags.offerReminders) offerCheckinRemindersAfterLeaving(t);
    };

    const finish = (result?: GuidedCheckInStepResult) => {
      if (!leave()) return;
      navigation.goBack();
      confirm(result);
    };

    // The navigator is already removing the step, so it is no longer a
    // question of focus; only the latch keeps this to once.
    const onNavigatorClose = (result?: GuidedCheckInStepResult) => {
      if (leftRef.current) return;
      leftRef.current = true;
      confirm(result);
    };

    const advance = (result?: GuidedCheckInStepResult) => {
      const next = STEPS[index + 1];
      if (!next) {
        finish(result);
        return;
      }
      if (!leave()) return;
      open(next, merged(result));
    };

    // Asks before dropping the step's edits, then runs `then`.
    const confirmDroppingEdits = (
      title: string,
      action: string,
      then: () => void
    ) => {
      confirmingRef.current = true;
      const release = () => {
        confirmingRef.current = false;
      };
      Alert.alert(
        title,
        t('guidedCheckIn.skipUnsavedMessage', {
          defaultValue: "Your changes on this step won't be saved.",
        }),
        [
          {
            text: t('common.cancel', { defaultValue: 'Cancel' }),
            style: 'cancel',
            onPress: release,
          },
          {
            text: action,
            style: 'destructive',
            onPress: () => {
              release();
              then();
            },
          },
        ],
        { cancelable: true, onDismiss: release }
      );
    };

    const skip = (
      hasUnsavedEdits: boolean,
      result?: GuidedCheckInStepResult
    ) => {
      if (leftRef.current || confirmingRef.current) return;
      if (!hasUnsavedEdits) {
        advance(result);
        return;
      }
      confirmDroppingEdits(
        t('guidedCheckIn.skipUnsavedTitle', {
          defaultValue: 'Skip this step?',
        }),
        t('guidedCheckIn.skip', { defaultValue: 'Skip' }),
        () => advance(result)
      );
    };

    const previous = STEPS[index - 1];
    const back = previous
      ? (hasUnsavedEdits: boolean, result?: GuidedCheckInStepResult) => {
          if (leftRef.current || confirmingRef.current) return;
          const goBackAStep = () => {
            if (!leave()) return;
            open(previous, merged(result));
          };
          if (!hasUnsavedEdits) {
            goBackAStep();
            return;
          }
          confirmDroppingEdits(
            t('guidedCheckIn.backUnsavedTitle', {
              defaultValue: 'Go back a step?',
            }),
            t('common.back', { defaultValue: 'Back' }),
            goBackAStep
          );
        }
      : null;

    return {
      step: index + 1,
      total: STEPS.length,
      advance,
      skip,
      back,
      finish,
      onNavigatorClose,
      hasLeft: () => leftRef.current,
    };
  }, [date, navigation, params, step, t]);
}

/**
 * Starts the guided check-in for `date`, from the Add menu (the Diary's day)
 * or the What's New card (today). When one was left part-way on the same day
 * it asks first: Continue opens the step it stopped at, Start over a new
 * check-in from step 1.
 */
export function startGuidedCheckIn(
  date: string,
  t: TFunction,
  open: (step: GuidedCheckInStep, guidedCheckIn: GuidedCheckInParams) => void
): void {
  const { progress, clearProgress } = useGuidedCheckInStore.getState();
  if (!progress || progress.date !== date) {
    open('MoodLog', {});
    return;
  }
  Alert.alert(
    t('guidedCheckIn.resumeTitle', {
      defaultValue: 'Continue your check-in?',
    }),
    t('guidedCheckIn.resumeMessage', {
      defaultValue: 'You stopped at step {{step}} of {{total}}.',
      step: formatLocalizedNumber(STEPS.indexOf(progress.step) + 1),
      total: formatLocalizedNumber(STEPS.length),
    }),
    [
      {
        text: t('common.cancel', { defaultValue: 'Cancel' }),
        style: 'cancel',
      },
      {
        text: t('guidedCheckIn.startOver', { defaultValue: 'Start over' }),
        onPress: () => {
          clearProgress();
          open('MoodLog', {});
        },
      },
      {
        text: t('common.continue', { defaultValue: 'Continue' }),
        onPress: () => open(progress.step, progress.flags),
      },
    ],
    { cancelable: true }
  );
}
