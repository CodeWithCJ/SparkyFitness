import { useMemo, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { PresetSessionResponse } from '@workspace/shared';
import ActionSheet, {
  type ActionSheetItem,
  type ActionSheetRef,
} from './ActionSheet';
import type { CompletedSetMap } from '../stores/activeWorkoutStore';
import {
  rendersCardioEffortForm,
  type SupersetRun,
} from '../utils/workoutSession';

export interface OverflowMenuState {
  entryId: string;
  mode: 'main' | 'pick';
}

interface ActiveWorkoutOverflowSheetProps {
  sheetRef: RefObject<ActionSheetRef | null>;
  overflowMenu: OverflowMenuState | null;
  session: PresetSessionResponse | null;
  supersetRuns: SupersetRun[];
  completedSetIds: CompletedSetMap;
  onPressThumb: (entryId: string) => void;
  onToggleExerciseNote: (entryId: string) => void;
  onReplaceExercise: (entryId: string) => void;
  /** Whether the exercise can take a warm-up ramp: a weight to ramp to, and none logged yet. */
  canAddWarmups: (entryId: string) => boolean;
  onAddWarmups: (entryId: string) => void;
  onClearExerciseSets: (entryId: string) => void;
  onRemoveExercise: (entryId: string) => void;
  onSelectSupersetPartner: (entryId: string, candidateId: string) => void;
  onUngroupExercise: (entryId: string) => void;
  onSwitchToPickMode: () => void;
  onSwitchToMainMode: () => void;
  onDismiss: () => void;
}

export default function ActiveWorkoutOverflowSheet({
  sheetRef,
  overflowMenu,
  session,
  supersetRuns,
  completedSetIds,
  onPressThumb,
  onToggleExerciseNote,
  onReplaceExercise,
  canAddWarmups,
  onAddWarmups,
  onClearExerciseSets,
  onRemoveExercise,
  onSelectSupersetPartner,
  onUngroupExercise,
  onSwitchToPickMode,
  onSwitchToMainMode,
  onDismiss,
}: ActiveWorkoutOverflowSheetProps) {
  const { t } = useTranslation();

  const overflowMenuItems = useMemo<ActionSheetItem[]>(() => {
    if (overflowMenu == null || session == null) return [];
    const { entryId, mode } = overflowMenu;
    const groupedIds = new Set(supersetRuns.flatMap((run) => run.entryIds));
    const candidates = session.exercises.filter(
      (e) => e.id !== entryId && !groupedIds.has(e.id)
    );

    if (mode === 'pick') {
      return candidates.map((candidate) => ({
        key: candidate.id,
        label:
          candidate.exercise_snapshot?.name ??
          t('workout.exercise', { defaultValue: 'Exercise' }),
        onPress: () => {
          onSelectSupersetPartner(entryId, candidate.id);
        },
      }));
    }

    const entry = session.exercises.find((e) => e.id === entryId);
    const entryHasCompleted =
      entry?.sets.some((s) => completedSetIds[String(s.id)] != null) ?? false;
    const entryIsCardioForm =
      entry != null &&
      rendersCardioEffortForm(entry.exercise_snapshot, entry.sets.length);

    const items: ActionSheetItem[] = [];
    items.push({
      key: 'view',
      label: t('workout.viewExercise', { defaultValue: 'View exercise' }),
      onPress: () => onPressThumb(entryId),
    });
    items.push({
      key: 'notes',
      label: t('workout.notes', { defaultValue: 'Notes' }),
      onPress: () => onToggleExerciseNote(entryId),
    });
    if (candidates.length > 0) {
      items.push({
        key: 'superset-with',
        label: t('workout.supersetWith', { defaultValue: 'Superset with…' }),
        dismissOnPress: false,
        onPress: onSwitchToPickMode,
      });
    }
    if (groupedIds.has(entryId)) {
      items.push({
        key: 'ungroup',
        label: t('workout.removeFromSuperset', {
          defaultValue: 'Remove from superset',
        }),
        onPress: () => {
          onUngroupExercise(entryId);
        },
      });
    }
    if (canAddWarmups(entryId)) {
      items.push({
        key: 'warmups',
        label: t('workout.addWarmups', { defaultValue: 'Add warm-ups' }),
        onPress: () => onAddWarmups(entryId),
      });
    }
    items.push({
      key: 'replace',
      label: t('workout.replaceExercise', { defaultValue: 'Replace exercise' }),
      onPress: () => onReplaceExercise(entryId),
    });
    if (entryHasCompleted && !entryIsCardioForm) {
      items.push({
        key: 'clear',
        label: t('workout.clearLoggedSets', {
          defaultValue: 'Clear logged sets',
        }),
        destructive: true,
        onPress: () => onClearExerciseSets(entryId),
      });
    }
    items.push({
      key: 'remove',
      label: t('workout.removeExercise', { defaultValue: 'Remove exercise' }),
      destructive: true,
      onPress: () => onRemoveExercise(entryId),
    });
    return items;
  }, [
    overflowMenu,
    session,
    supersetRuns,
    completedSetIds,
    onPressThumb,
    onToggleExerciseNote,
    onReplaceExercise,
    canAddWarmups,
    onAddWarmups,
    onClearExerciseSets,
    onRemoveExercise,
    onSelectSupersetPartner,
    onUngroupExercise,
    onSwitchToPickMode,
    t,
  ]);

  const title =
    overflowMenu?.mode === 'pick'
      ? t('workout.supersetWith', { defaultValue: 'Superset with…' })
      : (session?.exercises.find((e) => e.id === overflowMenu?.entryId)
          ?.exercise_snapshot?.name ??
        t('workout.exercise', { defaultValue: 'Exercise' }));

  return (
    <ActionSheet
      ref={sheetRef}
      title={title}
      items={overflowMenuItems}
      onBack={overflowMenu?.mode === 'pick' ? onSwitchToMainMode : undefined}
      onDismiss={onDismiss}
    />
  );
}
