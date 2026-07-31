import React, { useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { PresetSessionResponse } from '@workspace/shared';
import { useNativeIOSTabsActive } from '../services/nativeTabBarPreference';
import type { CompletedSetMap } from '../stores/activeWorkoutStore';
import { formatElapsed } from '../utils/workoutSession';
import Icon, { type IconName } from './Icon';
import KeyboardCollapsible from './KeyboardCollapsible';
import LiquidGlassSurface, { createLiquidGlassPillStyle } from './LiquidGlassSurface';
import ActionSheet, { type ActionSheetItem, type ActionSheetRef } from './ActionSheet';

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

interface ActiveWorkoutHeaderProps {
  name: string;
  startedAt: number | null;
  /** Epoch ms driving the elapsed clock — the screen's 1s tick. */
  now: number;
  progress: ExerciseProgress[];
  onBack: () => void;
  onDiscard: () => void;
  /** Adds an "End workout" action (the finish flow) in its own menu group. */
  onEndWorkout?: () => void;
  /** Opens the rename dialog from a "Rename workout" menu action. */
  onRename?: () => void;
  /** When provided, adds an "Add exercise" action. */
  onAddExercise?: () => void;
  /** When provided, adds a "Reorder exercises" action. */
  onReorder?: () => void;
  /** When provided, adds a "Workout settings" action. */
  onOpenSettings?: () => void;
  /** When provided (any set logged), adds a "Clear all logged sets" action. */
  onClearAllSets?: () => void;
}

/**
 * Header action button. With Liquid Glass active it floats on its own round
 * glass surface, matching the native iOS 26 bar buttons every native-header
 * screen gets; otherwise it stays a flat pressable icon.
 */
function HeaderIconButton({
  icon,
  color,
  usesGlass,
  chromeBorder,
  onPress,
  accessibilityLabel,
}: {
  icon: IconName;
  color: string;
  usesGlass: boolean;
  chromeBorder: string;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const button = (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className={usesGlass ? 'h-[38px] w-[38px] items-center justify-center' : 'p-2'}
    >
      <Icon name={icon} size={22} color={color} />
    </Pressable>
  );

  if (!usesGlass) return button;
  return (
    <LiquidGlassSurface
      style={createLiquidGlassPillStyle(chromeBorder, {
        marginHorizontal: 0,
        marginBottom: 0,
      })}
      isInteractive
    >
      {button}
    </LiquidGlassSurface>
  );
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
  onOpenSettings,
  onClearAllSets,
}: ActiveWorkoutHeaderProps) {
  const [textPrimary, textMuted, accentPrimary, successColor, trackColor, chromeBorder] =
    useCSSVariable([
      '--color-text-primary',
      '--color-text-muted',
      '--color-accent-primary',
      '--color-icon-success',
      '--color-progress-track',
      '--color-chrome-border',
    ]) as [string, string, string, string, string, string];
  const usesGlass = useNativeIOSTabsActive();

  const menuSheetRef = useRef<ActionSheetRef>(null);
  const openMenu = () => menuSheetRef.current?.present();

  const doneCount = progress.filter(
    (p) => p.totalSets > 0 && p.completedSets >= p.totalSets,
  ).length;

  const menuItems: ActionSheetItem[] = [];
  if (onAddExercise) {
    menuItems.push({
      key: 'add-exercise',
      label: 'Add exercise',
      group: 'edit',
      onPress: onAddExercise,
    });
  }
  if (onReorder) {
    menuItems.push({
      key: 'reorder',
      label: 'Reorder exercises',
      group: 'edit',
      onPress: onReorder,
    });
  }
  if (onRename) {
    menuItems.push({
      key: 'rename',
      label: 'Rename workout',
      group: 'workout',
      onPress: onRename,
    });
  }
  if (onOpenSettings) {
    menuItems.push({
      key: 'workout-settings',
      label: 'Workout settings',
      group: 'workout',
      onPress: onOpenSettings,
    });
  }
  if (onEndWorkout) {
    menuItems.push({
      key: 'end-workout',
      label: 'End workout',
      group: 'finish',
      onPress: onEndWorkout,
    });
  }
  if (onClearAllSets) {
    menuItems.push({
      key: 'clear-sets',
      label: 'Clear all logged sets',
      group: 'danger',
      destructive: true,
      onPress: onClearAllSets,
    });
  }
  menuItems.push({
    key: 'discard',
    label: 'Discard workout',
    group: 'danger',
    destructive: true,
    onPress: onDiscard,
  });

  return (
    <View className="px-3 pb-2 border-b border-border-subtle bg-background">
      <View className="flex-row items-center">
        <HeaderIconButton
          icon="chevron-back"
          color={textPrimary}
          usesGlass={usesGlass}
          chromeBorder={chromeBorder}
          onPress={onBack}
          accessibilityLabel="Back"
        />

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

        {/* Glass chrome is monochrome (see resolveHeaderActionColors), so the
            kebab takes the primary tint on that path. */}
        <HeaderIconButton
          icon="ellipsis-horizontal"
          color={usesGlass ? textPrimary : textMuted}
          usesGlass={usesGlass}
          chromeBorder={chromeBorder}
          onPress={openMenu}
          accessibilityLabel="Workout menu"
        />
      </View>

      {/* Folds away with the keyboard so the log gets the row's height back;
          the name + elapsed clock above stay visible. */}
      <KeyboardCollapsible>
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
      </KeyboardCollapsible>

      <ActionSheet ref={menuSheetRef} title={name} items={menuItems} />
    </View>
  );
}

export default React.memo(ActiveWorkoutHeader);
