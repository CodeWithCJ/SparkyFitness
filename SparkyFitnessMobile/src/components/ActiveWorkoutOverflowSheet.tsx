import { useMemo, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { useCSSVariable } from 'uniwind';
import type { PresetSessionResponse } from '@workspace/shared';
import ActionSheet, {
  type ActionSheetItem,
  type ActionSheetRef,
} from './ActionSheet';
import { formatRestRangeLabel } from './RestPeriodChip';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import type { CompletedSetMap } from '../stores/activeWorkoutStore';
import { upcomingExercises, type SupersetRun } from '../utils/workoutSession';
import { FOCUS_SUPERSET_PALETTE_VARS } from '../utils/workoutSupersets';

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
  /** Opens the exercise's rest period sheet. */
  onPressRest: (entryId: string) => void;
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
  onPressRest,
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
}: ActiveWorkoutOverflowSheetProps) {
  const { t } = useTranslation();
  const defaultRestSec = useAppPreferencesStore((s) => s.defaultRestSec);
  const supersetPalette = useCSSVariable([
    ...FOCUS_SUPERSET_PALETTE_VARS,
  ]) as string[];

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
      // Swap is also opened from an exercise the cursor is not on (the focus
      // view's header), so the list follows the cursor, not the swapped entry.
      const swapUpcoming = upcomingExercises(
        session,
        activeSetId,
        completedSetIds
      ).filter((e) => e.id !== entryId);
      const exerciseLabel = t('workout.exercise', { defaultValue: 'Exercise' });
      // Each exercise is its own card: its place in the workout, and A1 / A2
      // for a superset member, as in the exercises list.
      const memberBadge = (id: string) => {
        const runIndex = supersetRuns.findIndex((run) =>
          run.entryIds.includes(id)
        );
        if (runIndex < 0) return {};
        const member = supersetRuns[runIndex].entryIds.indexOf(id) + 1;
        return {
          badge: `${String.fromCharCode(65 + runIndex)}${member}`,
          badgeColor: supersetPalette[runIndex % supersetPalette.length],
        };
      };
      return [
        ...swapUpcoming.map((candidate) => ({
          key: candidate.id,
          group: candidate.id,
          leading: String(
            session.exercises.findIndex((e) => e.id === candidate.id) + 1
          ),
          ...memberBadge(candidate.id),
          accentDescription: true,
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
          icon: 'chevron-forward' as const,
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

    const items: ActionSheetItem[] = [];
    items.push({
      key: 'view',
      label: t('workout.viewExercise', { defaultValue: 'View exercise' }),
      icon: 'play',
      description: t('activeWorkout.focus.menu.viewHint', {
        defaultValue: 'Instructions and history',
      }),
      onPress: () => onPressThumb(entryId),
    });
    items.push({
      key: 'notes',
      label: t('workout.notes', { defaultValue: 'Notes' }),
      icon: 'list',
      onPress: () => onToggleExerciseNote(entryId),
    });
    if (entry != null) {
      items.push({
        key: 'rest',
        label: t('activeWorkout.focus.menu.restTimer', {
          defaultValue: 'Rest timer · {{duration}}',
          duration: formatRestRangeLabel(
            entry.sets.map((set) => set.rest_time),
            defaultRestSec,
            t('restPeriod.off', { defaultValue: 'Off' })
          ),
        }),
        icon: 'timer',
        onPress: () => onPressRest(entryId),
      });
    }
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
        description: t('activeWorkout.focus.menu.warmupsHint', {
          defaultValue: 'Calculated from your working weight',
        }),
        onPress: () => onAddWarmups(entryId),
      });
    }
    items.push({
      key: 'replace',
      label: t('workout.replaceExercise', { defaultValue: 'Replace exercise' }),
      icon: 'arrow-undo',
      onPress: () => onReplaceExercise(entryId),
    });
    if (entryHasCompleted) {
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
    supersetPalette,
    completedSetIds,
    activeSetId,
    onDoExerciseNow,
    onSwitchToSwapMode,
    onPressThumb,
    onToggleExerciseNote,
    onReplaceExercise,
    onPressRest,
    canAddWarmups,
    defaultRestSec,
    onAddWarmups,
    onClearExerciseSets,
    onRemoveExercise,
    onSelectSupersetPartner,
    onUngroupExercise,
    onSwitchToPickMode,
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
      items={overflowMenuItems}
      layout="cards"
      showCancel={overflowMenu?.mode === 'swap'}
      onBack={overflowMenu?.mode === 'pick' ? onSwitchToMainMode : undefined}
      onDismiss={onDismiss}
    />
  );
}
