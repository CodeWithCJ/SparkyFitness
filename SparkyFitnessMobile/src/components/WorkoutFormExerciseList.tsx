import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Keyboard, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';
import ActiveWorkoutExerciseCard from './ActiveWorkoutExerciseCard';
import { MetricColumnMenu, SetTypeMenu } from './WorkoutMenus';
import AnchoredMenu, { type AnchorRect } from './AnchoredMenu';
import RestPeriodSheet, { type RestPeriodSheetRef } from './RestPeriodSheet';
import WorkoutReorderList from './WorkoutReorderList';
import { weightFromKg } from '../utils/unitConversions';
import {
  draftExerciseToCardExercise,
  exerciseFromDraft,
} from '../utils/workoutSession';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import type { ActiveSetPatch, CompletedSetMap } from '../stores/activeWorkoutStore';
import { useSupersetBorders } from './ActiveWorkoutRail';
import type { WorkoutDraftExercise, WorkoutSetMetaPatch } from '../types/drafts';
import type { Exercise } from '../types/exercise';
import type { GetImageSource } from '../hooks/useExerciseImageSource';

interface WorkoutFormExerciseListProps {
  exercises: WorkoutDraftExercise[];
  weightUnit: 'kg' | 'lbs';
  getImageSource: GetImageSource;
  /** `${exerciseClientId}:${setClientId}` from useExerciseSetEditing. */
  activeSetKey: string | null;
  activeSetField: 'weight' | 'reps' | 'rpe';
  onActivateSet: (setKey: string, field: 'weight' | 'reps' | 'rpe') => void;
  onDeactivateSet: () => void;
  updateSetField: (
    exerciseClientId: string,
    setClientId: string,
    field: 'weight' | 'reps',
    value: string,
  ) => void;
  updateSetMeta: (
    exerciseClientId: string,
    setClientId: string,
    patch: WorkoutSetMetaPatch,
  ) => void;
  removeSet: (exerciseClientId: string, setClientId: string) => void;
  onAddSet: (exerciseClientId: string) => void;
  onRemoveExercise: (exercise: WorkoutDraftExercise) => void;
  setExerciseRest: (exerciseClientId: string, seconds: number) => void;
  supersetWith: (currentClientId: string, pickedClientId: string) => void;
  ungroupExercise: (clientId: string) => void;
  /** Move a draggable item (solo or whole run) from one item index to another. */
  onReorderExercises: (fromItemIndex: number, toItemIndex: number) => void;
  onAddExercisePress: () => void;
  /**
   * Open the library Exercise Detail for a row (its thumbnail and a "View
   * exercise" ⋮-menu item). Omit to leave both off.
   */
  onViewExercise?: (exercise: Exercise) => void;
  isEligibleForPrefill?: (clientId: string) => boolean;
  /** False for the preset form — preset sets store no RPE. */
  rpeEditable?: boolean;
  /**
   * Enables the per-set completion toggle (workout sessions). Off for the
   * preset form, which has no completion concept.
   */
  showCompletion?: boolean;
  /**
   * Deleting an exercise's last remaining set removes the exercise instead
   * (routed through `onRemoveExercise`, which confirms when data would be
   * lost) — matching the live workout screen. On for workout forms, whose
   * save path drops zero-set exercises; off for the preset form, where
   * zero-set exercises are valid and kept.
   */
  removeExerciseOnLastSetDelete?: boolean;
}

/** Imperative handle so the owning screen's header can open the reorder overlay. */
export interface WorkoutFormExerciseListHandle {
  openReorder: () => void;
}

/**
 * Card-based exercise list for the workout/preset form screens: renders the
 * shared ActiveWorkoutExerciseCard stack in edit mode over form-draft state,
 * owning the draft→card mapping, expansion, superset rails and grouping menu,
 * the shared metric column, set-type long-press, the rest sheet, and the
 * reorder overlay (opened from the screen header via the imperative handle).
 */
const WorkoutFormExerciseList = forwardRef<
  WorkoutFormExerciseListHandle,
  WorkoutFormExerciseListProps
>(function WorkoutFormExerciseList(
  {
    exercises,
    weightUnit,
    getImageSource,
    activeSetKey,
    activeSetField,
    onActivateSet,
    onDeactivateSet,
    updateSetField,
    updateSetMeta,
    removeSet,
    onAddSet,
    onRemoveExercise,
    setExerciseRest,
    supersetWith,
    ungroupExercise,
    onReorderExercises,
    onAddExercisePress,
    onViewExercise,
    isEligibleForPrefill,
    rpeEditable = true,
    showCompletion = false,
    removeExerciseOnLastSetDelete = false,
  },
  ref,
) {
  const accentPrimary = useCSSVariable('--color-accent-primary') as string;

  const cardExercises = useMemo(
    () => exercises.map(exercise => draftExerciseToCardExercise(exercise, weightUnit)),
    [exercises, weightUnit],
  );

  // Reorder overlay. The open trigger lives in the owning screen's header
  // (gated there on ≥2 draggable items via canReorderDraftExercises); this
  // component only owns the overlay, exposed through the imperative handle.
  const [reorderVisible, setReorderVisible] = useState(false);
  useImperativeHandle(
    ref,
    () => ({
      openReorder: () => {
        // Commit a focused set input's edit before the overlay covers it.
        onDeactivateSet();
        Keyboard.dismiss();
        setReorderVisible(true);
      },
    }),
    [onDeactivateSet],
  );

  // Form cards default expanded; the map tracks explicit collapses.
  const [collapsedIds, setCollapsedIds] = useState<Record<string, boolean>>({});
  const toggleExpanded = useCallback((entryId: string) => {
    setCollapsedIds(prev => ({ ...prev, [entryId]: !prev[entryId] }));
  }, []);

  const setOwnerByClientId = useMemo(() => {
    const map = new Map<string, string>();
    for (const exercise of exercises) {
      for (const set of exercise.sets) map.set(set.clientId, exercise.clientId);
    }
    return map;
  }, [exercises]);

  // Completion is display-only in the forms (static badge); completedAt
  // round-trips through the draft untouched.
  const completedSetIds = useMemo(() => {
    const map: CompletedSetMap = {};
    for (const exercise of exercises) {
      for (const set of exercise.sets) {
        if (set.completedAt) map[set.clientId] = Date.parse(set.completedAt);
      }
    }
    return map;
  }, [exercises]);

  // Superset rails, same presentation as the live/detail screens but keyed by
  // draft clientIds.
  const exercisesForBorders = useMemo(
    () => exercises.map(e => ({ id: e.clientId, superset_group: e.supersetGroup ?? null })),
    [exercises],
  );
  const { runs: supersetRuns, borders: supersetBorders } =
    useSupersetBorders(exercisesForBorders);

  const handleActivateSet = useCallback(
    (setId: string, field: 'weight' | 'reps') => {
      const owner = setOwnerByClientId.get(setId);
      if (owner) onActivateSet(`${owner}:${setId}`, field);
    },
    [setOwnerByClientId, onActivateSet],
  );

  // Tapping the RPE column makes the row active and focuses its RPE input.
  const handleActivateRpe = useCallback(
    (setId: string) => {
      const owner = setOwnerByClientId.get(setId);
      if (owner) onActivateSet(`${owner}:${setId}`, 'rpe');
    },
    [setOwnerByClientId, onActivateSet],
  );

  const handleEditFieldChange = useCallback(
    (setId: string, field: 'weight' | 'reps', text: string) => {
      const owner = setOwnerByClientId.get(setId);
      if (owner) updateSetField(owner, setId, field, text);
    },
    [setOwnerByClientId, updateSetField],
  );

  // Programmatic commits (prefill weight/reps in kg, RPE from the row input)
  // are converted to the reducer's display-string/meta form here.
  const handleCommitField = useCallback(
    (setId: string, patch: ActiveSetPatch) => {
      const owner = setOwnerByClientId.get(setId);
      if (!owner) return;
      if (patch.weight !== undefined) {
        const text =
          patch.weight == null
            ? ''
            : String(parseFloat(weightFromKg(patch.weight, weightUnit).toFixed(1)));
        updateSetField(owner, setId, 'weight', text);
      }
      if (patch.reps !== undefined) {
        updateSetField(owner, setId, 'reps', patch.reps == null ? '' : String(patch.reps));
      }
      if (patch.rpe !== undefined) {
        updateSetMeta(owner, setId, { rpe: patch.rpe });
      }
    },
    [setOwnerByClientId, updateSetField, updateSetMeta, weightUnit],
  );

  const handleDeleteSet = useCallback(
    (setId: string) => {
      const owner = setOwnerByClientId.get(setId);
      if (!owner) return;
      if (removeExerciseOnLastSetDelete) {
        const exercise = exercises.find(e => e.clientId === owner);
        if (exercise != null && exercise.sets.length <= 1) {
          onRemoveExercise(exercise);
          return;
        }
      }
      removeSet(owner, setId);
    },
    [setOwnerByClientId, removeSet, removeExerciseOnLastSetDelete, exercises, onRemoveExercise],
  );

  // Toggle a set's completion (stamp/clear completedAt), which round-trips to
  // the server through the draft on save.
  const handleToggleComplete = useCallback(
    (setId: string) => {
      const owner = exercises.find(e => e.sets.some(s => s.clientId === setId));
      const set = owner?.sets.find(s => s.clientId === setId);
      if (!owner || !set) return;
      updateSetMeta(owner.clientId, setId, {
        completedAt: set.completedAt ? null : new Date().toISOString(),
      });
    },
    [exercises, updateSetMeta],
  );

  // Set-type menu: tapping a set number (or long-pressing the row) anchors
  // the shared SetTypeMenu (with its Delete-set item). Replaces an Alert,
  // which capped at 3 buttons on Android and hid most of the options.
  const [setTypeMenu, setSetTypeMenu] = useState<{ setId: string; anchor: AnchorRect } | null>(
    null,
  );
  const handlePressSetType = useCallback((setId: string, anchor: AnchorRect) => {
    setSetTypeMenu({ setId, anchor });
  }, []);
  const setTypeTarget = useMemo(() => {
    if (setTypeMenu == null) return null;
    const owner = exercises.find(e => e.sets.some(s => s.clientId === setTypeMenu.setId));
    const set = owner?.sets.find(s => s.clientId === setTypeMenu.setId);
    if (!owner || !set) return null;
    return { ownerClientId: owner.clientId, setId: setTypeMenu.setId, currentType: set.setType ?? 'normal' };
  }, [setTypeMenu, exercises]);

  // Open the library Exercise Detail for a draft row (thumbnail tap + ⋮ menu).
  // Existing-session drafts carry a full snapshot; freshly-added ones are
  // sparse and the detail screen hydrates the rest by id.
  const handleViewExercise = useCallback(
    (clientId: string) => {
      if (!onViewExercise) return;
      const draft = exercises.find(e => e.clientId === clientId);
      if (draft) onViewExercise(exerciseFromDraft(draft));
    },
    [exercises, onViewExercise],
  );

  // Rest sheet (per-exercise rest duration).
  const restSheetRef = useRef<RestPeriodSheetRef>(null);
  const restSheetTargetRef = useRef<string | null>(null);
  const handlePressRestChip = useCallback((entryId: string, currentSec: number | null) => {
    restSheetTargetRef.current = entryId;
    restSheetRef.current?.present(currentSec);
  }, []);
  const handleRestChange = useCallback(
    (seconds: number) => {
      const target = restSheetTargetRef.current;
      if (target != null) setExerciseRest(target, seconds);
    },
    [setExerciseRest],
  );

  // Metric column is shared with the active-workout screen (intended).
  // Preset sets store no RPE, so the preset form hides RPE from the column
  // picker and falls the shared 'rpe' selection back to volume for display.
  const metricColumn = useAppPreferencesStore(s => s.activeWorkoutMetricColumn);
  const effectiveMetricColumn =
    !rpeEditable && metricColumn === 'rpe' ? 'volume' : metricColumn;
  const [metricMenuAnchor, setMetricMenuAnchor] = useState<AnchorRect | null>(null);
  const handlePressMetricHeader = useCallback((anchor: AnchorRect) => {
    setMetricMenuAnchor(anchor);
  }, []);

  // Card ⋮ menu. 'main' offers grouping + remove; 'pick' swaps in the
  // candidate list (ungrouped exercises other than the current one) at the
  // same anchor. This menu is the only place preset supersets can be created.
  const [overflowMenu, setOverflowMenu] = useState<{
    clientId: string;
    anchor: AnchorRect;
    mode: 'main' | 'pick';
  } | null>(null);
  const handlePressOverflow = useCallback((entryId: string, anchor: AnchorRect) => {
    setOverflowMenu({ clientId: entryId, anchor, mode: 'main' });
  }, []);

  const overflowMenuItems = useMemo(() => {
    if (overflowMenu == null) return [];
    const { clientId, mode } = overflowMenu;
    const groupedIds = new Set(supersetRuns.flatMap(run => run.entryIds));
    const candidates = exercises.filter(
      e => e.clientId !== clientId && !groupedIds.has(e.clientId),
    );

    if (mode === 'pick') {
      return candidates.map(candidate => ({
        key: candidate.clientId,
        label: candidate.exerciseName,
        onPress: () => supersetWith(clientId, candidate.clientId),
      }));
    }

    const items: { key: string; label: string; onPress: () => void }[] = [];
    if (onViewExercise) {
      items.push({
        key: 'view',
        label: 'View exercise',
        onPress: () => handleViewExercise(clientId),
      });
    }
    if (candidates.length > 0) {
      items.push({
        key: 'superset-with',
        label: 'Superset with…',
        onPress: () => {
          // Re-open at the same anchor with the candidate list. AnchoredMenu
          // closes first (onClose), then this runs — both land in one commit.
          setOverflowMenu({ ...overflowMenu, mode: 'pick' });
        },
      });
    }
    if (groupedIds.has(clientId)) {
      items.push({
        key: 'ungroup',
        label: 'Remove from superset',
        onPress: () => ungroupExercise(clientId),
      });
    }
    items.push({
      key: 'remove',
      label: 'Remove exercise',
      onPress: () => {
        const exercise = exercises.find(e => e.clientId === clientId);
        if (exercise) onRemoveExercise(exercise);
      },
    });
    return items;
  }, [
    overflowMenu,
    exercises,
    supersetRuns,
    supersetWith,
    ungroupExercise,
    onRemoveExercise,
    onViewExercise,
    handleViewExercise,
  ]);

  return (
    <Animated.View layout={LinearTransition.duration(300)}>
      {cardExercises.map(cardExercise => {
        const clientId = cardExercise.id;
        const isExpanded = !collapsedIds[clientId];
        const supersetBorder = supersetBorders.get(clientId) ?? null;
        const setPrefix = `${clientId}:`;
        const cardActiveSetId = activeSetKey?.startsWith(setPrefix)
          ? activeSetKey.slice(setPrefix.length)
          : null;

        const card = (
          <ActiveWorkoutExerciseCard
            exercise={cardExercise}
            mode="edit"
            expanded={isExpanded}
            completedSetIds={completedSetIds}
            activeSetId={cardActiveSetId}
            activeField={cardActiveSetId != null ? activeSetField : undefined}
            metricColumn={effectiveMetricColumn}
            weightUnit={weightUnit}
            getImageSource={getImageSource}
            rpeEditable={rpeEditable}
            eligibleForPrefill={isEligibleForPrefill?.(clientId) ?? false}
            onPressThumb={onViewExercise ? handleViewExercise : undefined}
            onToggleExpanded={toggleExpanded}
            onPressRestChip={handlePressRestChip}
            onPressMetricHeader={handlePressMetricHeader}
            onPressOverflow={handlePressOverflow}
            onCommitField={handleCommitField}
            onDeleteSet={handleDeleteSet}
            onPressSetType={handlePressSetType}
            onAddSet={onAddSet}
            onActivateSet={handleActivateSet}
            onActivateRpe={handleActivateRpe}
            onToggleComplete={showCompletion ? handleToggleComplete : undefined}
            onDeactivateSet={onDeactivateSet}
            onEditFieldChange={handleEditFieldChange}
          />
        );

        return (
          <Animated.View
            key={clientId}
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(150)}
            layout={LinearTransition.duration(300)}
          >
            {supersetBorder ? (
              // Grouped members carry a flat 3px left rail. Interior rails run
              // the full wrapper height, meeting the next member's rail at the
              // divider so consecutive members read as one continuous line; the
              // run's last member stops ~8px short to end at the card content.
              <View style={{ paddingLeft: 10 }}>
                <View
                  testID={`superset-rail-${clientId}`}
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: supersetBorder.isLast && isExpanded ? 8 : 0,
                    width: 3,
                    backgroundColor: supersetBorder.color,
                  }}
                />
                {card}
              </View>
            ) : (
              card
            )}
          </Animated.View>
        );
      })}

      <Animated.View className="py-4" layout={LinearTransition.duration(300)}>
        <TouchableOpacity
          className="flex-row items-center self-center py-2 px-3 rounded-lg"
          onPress={onAddExercisePress}
          activeOpacity={0.6}
        >
          <Icon name="add-circle" size={20} color={accentPrimary} />
          <Text className="text-lg font-medium ml-2" style={{ color: accentPrimary }}>
            Add Exercise
          </Text>
        </TouchableOpacity>
      </Animated.View>

      <RestPeriodSheet ref={restSheetRef} onChange={handleRestChange} />

      <MetricColumnMenu
        anchor={metricMenuAnchor}
        onClose={() => setMetricMenuAnchor(null)}
        includeRpe={rpeEditable}
      />

      <AnchoredMenu
        visible={overflowMenu != null}
        anchor={overflowMenu?.anchor ?? null}
        onClose={() => setOverflowMenu(null)}
        minWidth={200}
        items={overflowMenuItems}
      />

      <SetTypeMenu
        anchor={setTypeTarget != null ? (setTypeMenu?.anchor ?? null) : null}
        currentType={setTypeTarget?.currentType}
        onClose={() => setSetTypeMenu(null)}
        onSelect={type => {
          if (setTypeTarget != null) {
            updateSetMeta(setTypeTarget.ownerClientId, setTypeTarget.setId, { setType: type });
          }
        }}
        // Through handleDeleteSet so the last-set → remove-exercise guard applies.
        onDelete={() => {
          if (setTypeTarget != null) handleDeleteSet(setTypeTarget.setId);
        }}
      />

      <WorkoutReorderList
        visible={reorderVisible}
        exercises={cardExercises}
        getImageSource={getImageSource}
        onMoveItem={onReorderExercises}
        onDone={() => setReorderVisible(false)}
      />
    </Animated.View>
  );
});

export default React.memo(WorkoutFormExerciseList);
