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
  upcomingExercises,
  type SupersetRun,
} from '../utils/workoutSession';

export interface OverflowMenuState {
  entryId: string;
  /** `swap`: the current exercise's quick change — do another one now, or replace it. */
  mode: 'main' | 'pick' | 'swap';
}

interface ActiveWorkoutOverflowSheetProps {
  sheetRef: RefObject<ActionSheetRef | null>;
  overflowMenu: OverflowMenuState | null;
  session: PresetSessionResponse | null;
  supersetRuns: SupersetRun[];
  completedSetIds: CompletedSetMap;
  activeSetId: string | null;
  onDoExerciseNow: (entryId: string) => void;
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
  onSwitchToSwapMode: () => void;
  onSwitchToMainMode: () => void;
  onDismiss: () => void;
  /** The focus view's card-style menu (Phone-Menu board) with icons. */
  cards?: boolean;
}

export default function ActiveWorkoutOverflowSheet({
  sheetRef,
  overflowMenu,
  session,
  supersetRuns,
  completedSetIds,
  activeSetId,
  onDoExerciseNow,
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
  onSwitchToSwapMode,
  onSwitchToMainMode,
  onDismiss,
  cards = false,
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

    // Only the exercise the cursor is on can hand its turn to a later one.
    const upcoming = session.exercises
      .find((e) => e.id === entryId)
      ?.sets.some((s) => String(s.id) === activeSetId)
      ? upcomingExercises(session, activeSetId, completedSetIds)
      : [];

    if (mode === 'swap') {
      const exerciseLabel = t('workout.exercise', { defaultValue: 'Exercise' });
      return [
        ...upcoming.map((candidate) => ({
          key: candidate.id,
          group: 'now',
          label: candidate.exercise_snapshot?.name ?? exerciseLabel,
          description: t('workout.doNowSets', {
            count: candidate.sets.length,
            defaultValue: 'Do now · {{count}} sets',
            defaultValue_one: 'Do now · {{count}} set',
            defaultValue_other: 'Do now · {{count}} sets',
          }),
          onPress: () => onDoExerciseNow(candidate.id),
        })),
        {
          key: 'replace',
          group: 'replace',
          label: t('workout.replaceWithOther', {
            defaultValue: 'Replace with another exercise…',
          }),
          onPress: () => onReplaceExercise(entryId),
        },
      ];
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
      icon: 'play',
      description: cards
        ? t('activeWorkout.focus.menu.viewHint', {
            defaultValue: 'Instructions and history',
          })
        : undefined,
      onPress: () => onPressThumb(entryId),
    });
    items.push({
      key: 'notes',
      label: t('workout.notes', { defaultValue: 'Notes' }),
      icon: 'list',
      onPress: () => onToggleExerciseNote(entryId),
    });
    if (upcoming.length > 0) {
      items.push({
        key: 'do-now',
        label: t('workout.doAnotherFirst', {
          defaultValue: 'Do another exercise first…',
        }),
        icon: 'skip-forward',
        dismissOnPress: false,
        onPress: onSwitchToSwapMode,
      });
    }
    if (candidates.length > 0) {
      items.push({
        key: 'superset-with',
        label: t('workout.supersetWith', { defaultValue: 'Superset with…' }),
        icon: 'add',
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
        icon: 'remove-circle',
        onPress: () => {
          onUngroupExercise(entryId);
        },
      });
    }
    if (canAddWarmups(entryId)) {
      items.push({
        key: 'warmups',
        label: t('workout.addWarmups', { defaultValue: 'Add warm-ups' }),
        icon: 'flame',
        description: cards
          ? t('activeWorkout.focus.menu.warmupsHint', {
              defaultValue: 'Calculated from your working weight',
            })
          : undefined,
        onPress: () => onAddWarmups(entryId),
      });
    }
    items.push({
      key: 'replace',
      label: t('workout.replaceExercise', { defaultValue: 'Replace exercise' }),
      icon: 'arrow-undo',
      onPress: () => onReplaceExercise(entryId),
    });
    if (entryHasCompleted && !entryIsCardioForm) {
      items.push({
        key: 'clear',
        label: t('workout.clearLoggedSets', {
          defaultValue: 'Clear logged sets',
        }),
        icon: 'arrow-undo',
        destructive: true,
        onPress: () => onClearExerciseSets(entryId),
      });
    }
    items.push({
      key: 'remove',
      label: t('workout.removeExercise', { defaultValue: 'Remove exercise' }),
      icon: 'close',
      destructive: true,
      onPress: () => onRemoveExercise(entryId),
    });
    return items;
  }, [
    overflowMenu,
    session,
    supersetRuns,
    completedSetIds,
    activeSetId,
    onDoExerciseNow,
    onSwitchToSwapMode,
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
    cards,
    t,
  ]);

  const name =
    session?.exercises.find((e) => e.id === overflowMenu?.entryId)
      ?.exercise_snapshot?.name ??
    t('workout.exercise', { defaultValue: 'Exercise' });
  const title =
    overflowMenu?.mode === 'pick'
      ? t('workout.supersetWith', { defaultValue: 'Superset with…' })
      : overflowMenu?.mode === 'swap'
        ? t('workout.swapTitle', { defaultValue: 'Swap {{name}}', name })
        : name;

  return (
    <ActionSheet
      ref={sheetRef}
      title={title}
      items={
        cards
          ? overflowMenuItems
          : overflowMenuItems.map(({ icon: _icon, ...rest }) => rest)
      }
      layout={cards ? 'cards' : 'list'}
      onBack={overflowMenu?.mode === 'pick' ? onSwitchToMainMode : undefined}
      onDismiss={onDismiss}
    />
  );
}
