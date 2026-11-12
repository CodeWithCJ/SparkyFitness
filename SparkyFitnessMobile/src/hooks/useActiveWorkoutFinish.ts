import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Keyboard } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import type { PresetSessionResponse } from '@workspace/shared';
import type { WorkoutDurationSheetRef } from '../components/WorkoutDurationSheet';
import type { CompletedSetMap } from '../stores/activeWorkoutStore';
import { useActiveWorkoutStore } from '../stores/activeWorkoutStore';
import { ApiError } from '../services/api/errors';
import { getWorkout, updateWorkout } from '../services/api/exerciseApi';
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
      // of staying in progress forever. The stamp presents the revision the
      // flush adopted from the server (or the one the session was seeded
      // with, when the flush found nothing to save), so it can never mark a
      // newer session that another device resumed or edited in between: the
      // server refuses with 409, the revision is refreshed once, and a stamp
      // that still fails falls back to the retry alert below.
      const sessionId = useActiveWorkoutStore.getState().sessionId;
      if (sessionId != null) {
        const stampFinished = async (): Promise<boolean> => {
          let revision = useActiveWorkoutStore.getState().session?.revision;
          // A session restored from storage can lack the revision, and a
          // clean flush never fetches it: fetch the server's current one
          // first so this stamp is guarded too. Refuse rather than stamp
          // unguarded.
          if (revision == null) {
            try {
              revision = (await getWorkout(sessionId)).revision;
            } catch {
              return false;
            }
            if (revision == null) return false;
          }
          for (let stampAttempt = 0; stampAttempt < 2; stampAttempt += 1) {
            try {
              await updateWorkout(sessionId, {
                finished_at: new Date().toISOString(),
                revision,
              });
              return true;
            } catch (error) {
              if (
                stampAttempt === 0 &&
                error instanceof ApiError &&
                error.statusCode === 409
              ) {
                // Another device changed the session after this phone's
                // save: adopt the server's current revision and retry once
                // instead of presenting the stale revision again.
                try {
                  revision = (await getWorkout(sessionId)).revision;
                  // A session without a revision cannot be guarded:
                  // refuse instead of stamping unguarded.
                  if (revision == null) return false;
                } catch {
                  return false;
                }
                continue;
              }
              return false;
            }
          }
          return false;
        };
        // Capture the entry date before the async stamp: the store must
        // not be re-read afterwards, when the session may have been
        // swapped mid-stamp.
        const entryDate = useActiveWorkoutStore.getState().session?.entry_date;
        const stamped = await stampFinished();
        if (!stamped) {
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
        // The stamp bumps the revision after the flush above already
        // invalidated the diary, so refresh it again: otherwise the
        // next read could resurrect the pre-finish state.
        if (entryDate != null) {
          invalidateExerciseCache(queryClient, normalizeDate(entryDate));
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
