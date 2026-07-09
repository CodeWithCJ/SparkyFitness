import React, { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { PresetSessionResponse } from '@workspace/shared';
import type { CompletedSetMap } from '../stores/activeWorkoutStore';
import Icon from './Icon';
import AnchoredMenu, {
  measureAnchoredMenuTrigger,
  type AnchorRect,
  type AnchoredMenuItem,
} from './AnchoredMenu';

/** Per-exercise completion used by the segmented progress bar. */
export interface ExerciseProgress {
  entryId: string;
  totalSets: number;
  completedSets: number;
}

export function buildExerciseProgress(
  session: PresetSessionResponse,
  completedSetIds: CompletedSetMap,
): ExerciseProgress[] {
  return session.exercises.map((exercise) => ({
    entryId: exercise.id,
    totalSets: exercise.sets.length,
    completedSets: exercise.sets.filter((s) => completedSetIds[String(s.id)]).length,
  }));
}

export function formatElapsed(startedAt: number | null, now: number): string {
  const totalSeconds = startedAt == null ? 0 : Math.max(0, Math.floor((now - startedAt) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  // Drop the hours segment until the workout actually crosses an hour, so a
  // one-minute set reads "01:00" rather than "00:01:00".
  return hours > 0
    ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}

interface ActiveWorkoutHeaderProps {
  name: string;
  startedAt: number | null;
  /** Epoch ms driving the elapsed clock — the screen's 1s tick. */
  now: number;
  progress: ExerciseProgress[];
  onBack: () => void;
  onDiscard: () => void;
  /** Adds an "End workout" action (the finish flow) at the top of the menu. */
  onEndWorkout?: () => void;
  /** Opens the rename dialog from a "Rename workout" menu action. */
  onRename?: () => void;
  /** Adds an "Add exercise" action at the top of the menu. */
  onAddExercise?: () => void;
  /** When provided, adds a "Reorder exercises" action above Discard. */
  onReorder?: () => void;
  /** When provided (any set logged), adds a "Clear logged sets" action. */
  onClearAllSets?: () => void;
}

/**
 * Custom chrome for the active-workout screen (the route renders with
 * `headerShown: false`): back, name + elapsed clock, kebab menu, and the
 * one segmented per-exercise progress bar.
 */
function ActiveWorkoutHeader({
  name,
  startedAt,
  now,
  progress,
  onBack,
  onDiscard,
  onEndWorkout,
  onRename,
  onAddExercise,
  onReorder,
  onClearAllSets,
}: ActiveWorkoutHeaderProps) {
  const [textPrimary, textMuted, accentPrimary, successColor, trackColor] = useCSSVariable([
    '--color-text-primary',
    '--color-text-muted',
    '--color-accent-primary',
    '--color-icon-success',
    '--color-progress-track',
  ]) as [string, string, string, string, string];

  const menuAnchorRef = useRef<View>(null);
  const [menuAnchor, setMenuAnchor] = useState<AnchorRect | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);

  const openMenu = () => {
    measureAnchoredMenuTrigger(menuAnchorRef.current, (anchor) => {
      setMenuAnchor(anchor);
      setMenuVisible(true);
    });
  };

  const doneCount = progress.filter(
    (p) => p.totalSets > 0 && p.completedSets >= p.totalSets,
  ).length;

  const menuItems: AnchoredMenuItem[] = [];
  if (onEndWorkout) {
    menuItems.push({
      key: 'end-workout',
      label: 'End workout',
      icon: 'checkmark-circle',
      onPress: onEndWorkout,
    });
  }
  if (onRename) {
    menuItems.push({
      key: 'rename',
      label: 'Rename workout',
      icon: 'pencil',
      onPress: onRename,
    });
  }
  if (onAddExercise) {
    menuItems.push({
      key: 'add-exercise',
      label: 'Add exercise',
      icon: 'add',
      onPress: onAddExercise,
    });
  }
  if (onReorder) {
    menuItems.push({
      key: 'reorder',
      label: 'Reorder exercises',
      icon: 'swap-vertical',
      onPress: onReorder,
    });
  }
  if (onClearAllSets) {
    menuItems.push({
      key: 'clear-sets',
      label: 'Clear logged sets',
      icon: 'arrow-undo',
      onPress: onClearAllSets,
    });
  }
  menuItems.push({
    key: 'discard',
    label: 'Discard workout',
    icon: 'trash',
    onPress: onDiscard,
  });

  return (
    <View className="px-3 pb-2 border-b border-border-subtle bg-background">
      <View className="flex-row items-center">
        <Pressable
          onPress={onBack}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Back"
          className="p-2"
        >
          <Icon name="chevron-back" size={22} color={textPrimary} />
        </Pressable>

        <View className="flex-1 items-center">
          <Text numberOfLines={1} className="text-base font-semibold text-text-primary">
            {name}
          </Text>
          <Text
            className="text-xs text-text-secondary"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {formatElapsed(startedAt, now)} elapsed
          </Text>
        </View>

        <View ref={menuAnchorRef} collapsable={false}>
          <Pressable
            onPress={openMenu}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Workout menu"
            className="p-2"
          >
            <Icon name="ellipsis-horizontal" size={22} color={textMuted} />
          </Pressable>
        </View>
      </View>

      <View className="flex-row items-center gap-3 px-2 mt-1">
        <View className="flex-1 flex-row gap-1">
          {progress.map((p) => {
            const isDone = p.totalSets > 0 && p.completedSets >= p.totalSets;
            const fillPct =
              p.totalSets > 0 ? Math.min(1, p.completedSets / p.totalSets) : 0;
            return (
              <View
                key={p.entryId}
                testID={isDone ? 'header-segment-done' : 'header-segment'}
                className="flex-1 h-[5px] rounded-full overflow-hidden"
                style={{ backgroundColor: isDone ? successColor : trackColor }}
              >
                {!isDone && fillPct > 0 && (
                  <View
                    testID="header-segment-fill"
                    className="h-full rounded-full"
                    style={{ width: `${fillPct * 100}%`, backgroundColor: accentPrimary }}
                  />
                )}
              </View>
            );
          })}
        </View>
        <Text
          className="text-xs text-text-secondary"
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {doneCount} / {progress.length} exercises
        </Text>
      </View>

      <AnchoredMenu
        visible={menuVisible}
        anchor={menuAnchor}
        onClose={() => setMenuVisible(false)}
        items={menuItems}
      />
    </View>
  );
}

export default React.memo(ActiveWorkoutHeader);
