import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Keyboard } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import type { PresetSessionResponse } from '@workspace/shared';
import type { WorkoutDurationSheetRef } from '../components/WorkoutDurationSheet';
import type { CompletedSetMap } from '../stores/activeWorkoutStore';
import { useActiveWorkoutStore } from '../stores/activeWorkoutStore';
import { updateWorkout } from '../services/api/exerciseApi';
import { invalidateExerciseCache } from './invalidateExerciseCache';
import { normalizeDate } from '../utils/dateUtils';
import { formatDuration, summarizeWorkoutSpan } from '../utils/workoutSession';
import { buildWorkoutCelebration } from '../utils/workoutCelebration';
import type { RootStackParamList } from '../types/navigation';

interface UseActiveWorkoutFinishArgs {
  navigation: Pick<NativeStackNavigationProp<RootStackParamList>, 'replace'>;
  session: PresetSessionResponse | null;
  completedSetIds: CompletedSetMap;
  flush: () => Promise<boolean>;
  durationSheetRef: React.RefObject<WorkoutDurationSheetRef | null>;
  safeGoBack: () => void;
}

export function useActiveWorkoutFinish({
  navigation,
  session,
  completedSetIds,
  flush,
  durationSheetRef,
  safeGoBack,
}: UseActiveWorkoutFinishArgs): {
  handleFinish: () => Promise<void>;
  maybeAdjustDurationThenFinish: () => void;
  handleDurationSave: (minutes: number) => void;
  handleConfirmEnd: () => void;
} {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const handleFinish = useCallback(async () => {
    function confirmDiscardChanges(): void {
      Alert.alert(
        t('workout.discardChangesTitle', {
          defaultValue: 'Discard unsaved changes?',
        }),
        t('workout.discardChangesMessage', {
          defaultValue:
            "Sets and edits that haven't reached the server will be lost. Changes already saved are kept.",
        }),
        [
          {
            text: t('common.cancel', { defaultValue: 'Cancel' }),
            style: 'cancel',
          },
          {
            text: t('workout.discard', { defaultValue: 'Discard' }),
            style: 'destructive',
            onPress: () => {
              useActiveWorkoutStore
                .getState()
                .clearWorkout({ discarded: true });
              safeGoBack();
            },
          },
        ]
      );
    }

    async function attempt(): Promise<void> {
      const ok = await flush();
      if (!ok) {
        Alert.alert(
          t('workout.saveError', {
            defaultValue: 'Could not save your workout',
          }),
          t('workout.failedChangesMessage', {
            defaultValue: 'Some changes have not reached the server yet.',
          }),
          [
            {
              text: t('workout.retry', { defaultValue: 'Retry' }),
              onPress: () => void attempt(),
            },
            {
              text: t('common.discardChanges', {
                defaultValue: 'Discard changes',
              }),
              style: 'destructive',
              onPress: confirmDiscardChanges,
            },
            {
              text: t('common.cancel', { defaultValue: 'Cancel' }),
              style: 'cancel',
            },
          ]
        );
        return;
      }
      // #1995 phase 1: the flush delivered every set; stamp the lifecycle
      // end so the session derives partial/completed from its sets instead
      // of staying in progress forever. The stamp carries no content, so it
      // can never overwrite edits made from another device.
      const sessionId = useActiveWorkoutStore.getState().sessionId;
      if (sessionId != null) {
        try {
          await updateWorkout(sessionId, {
            finished_at: new Date().toISOString(),
          });
          // The stamp bumps the revision after the flush above already
          // invalidated the diary, so refresh it again: otherwise the
          // next read could resurrect the pre-finish state.
          const entryDate =
            useActiveWorkoutStore.getState().session?.entry_date;
          if (entryDate != null) {
            invalidateExerciseCache(queryClient, normalizeDate(entryDate));
          }
        } catch {
          Alert.alert(
            t('workout.finishStampFailedTitle', {
              defaultValue: 'Could not mark the workout as finished',
            }),
            t('workout.finishStampFailedMessage', {
              defaultValue:
                'Your sets were saved, but marking the workout finished failed. Retry to complete it.',
            }),
            [
              {
                text: t('workout.retry', { defaultValue: 'Retry' }),
                onPress: () => void attempt(),
              },
              {
                text: t('common.cancel', { defaultValue: 'Cancel' }),
                style: 'cancel',
              },
            ]
          );
          return;
        }
      }
      const celebration = buildWorkoutCelebration(
        useActiveWorkoutStore.getState()
      );
      useActiveWorkoutStore.getState().clearWorkout();
      if (celebration != null) {
        navigation.replace('WorkoutComplete', celebration);
      } else {
        safeGoBack();
      }
    }
    await attempt();
  }, [flush, navigation, queryClient, safeGoBack, t]);

  const maybeAdjustDurationThenFinish = useCallback(() => {
    const { completedSetIds: completed, startedAt } =
      useActiveWorkoutStore.getState();
    const span = summarizeWorkoutSpan(completed, startedAt);
    if (span == null || !span.hasLongGap) {
      void handleFinish();
      return;
    }
    const activeLabel = formatDuration(span.activeMinutes);
    Alert.alert(
      t('workout.adjustDurationTitle', {
        defaultValue: 'Adjust workout duration?',
      }),
      t('workout.endWorkoutMessage', {
        defaultValue:
          'This workout spans {{span}}, including a long break. Log {{active}} of active time instead?',
        span: formatDuration(span.totalMinutes),
        active: activeLabel,
      }),
      [
        {
          text: t('workout.logWorkout', {
            defaultValue: 'Log {{name}}',
            name: activeLabel,
          }),
          onPress: () => {
            useActiveWorkoutStore
              .getState()
              .setWorkoutDurationMinutes(span.activeMinutes);
            void handleFinish();
          },
        },
        {
          text: t('workout.keep', {
            defaultValue: 'Keep {{name}}',
            name: formatDuration(span.totalMinutes),
          }),
          onPress: () => void handleFinish(),
        },
        {
          text: t('workout.custom', { defaultValue: 'Custom…' }),
          onPress: () =>
            durationSheetRef.current?.present(
              span.activeMinutes,
              Math.floor(span.totalMinutes)
            ),
        },
      ]
    );
  }, [durationSheetRef, handleFinish, t]);

  const handleDurationSave = useCallback(
    (minutes: number) => {
      useActiveWorkoutStore.getState().setWorkoutDurationMinutes(minutes);
      void handleFinish();
    },
    [handleFinish]
  );

  const handleConfirmEnd = useCallback(() => {
    Keyboard.dismiss();
    const totalSets =
      session?.exercises.reduce((sum, e) => sum + e.sets.length, 0) ?? 0;
    const doneSets =
      session?.exercises.reduce(
        (sum, e) =>
          sum + e.sets.filter((s) => completedSetIds[String(s.id)]).length,
        0
      ) ?? 0;
    const remaining = totalSets - doneSets;
    const message =
      remaining > 0
        ? t('workout.setsRemaining', {
            defaultValue:
              '{{done}} of {{total}} sets logged. {{remaining}} still to go.',
            done: doneSets,
            total: totalSets,
            remaining,
          })
        : t('workout.allSetsLogged', {
            defaultValue: 'All {{total}} sets logged. Nice work!',
            total: totalSets,
          });
    Alert.alert(
      t('workout.endWorkoutTitle', { defaultValue: 'End workout?' }),
      message,
      [
        {
          text: t('workout.keepGoing', { defaultValue: 'Keep going' }),
          style: 'cancel',
        },
        {
          text: t('workout.endWorkout', { defaultValue: 'End Workout' }),
          style: 'default',
          onPress: maybeAdjustDurationThenFinish,
        },
      ]
    );
  }, [session, completedSetIds, maybeAdjustDurationThenFinish, t]);

  return {
    handleFinish,
    maybeAdjustDurationThenFinish,
    handleDurationSave,
    handleConfirmEnd,
  };
}
