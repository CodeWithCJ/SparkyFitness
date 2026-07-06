import React, { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { PresetSessionResponse } from '@workspace/shared';
import Icon from './Icon';
import AnchoredMenu, {
  measureAnchoredMenuTrigger,
  type AnchorRect,
} from './AnchoredMenu';

/** Per-exercise completion used by the segmented progress bar. */
export interface ExerciseProgress {
  entryId: string;
  totalSets: number;
  completedSets: number;
}

export function buildExerciseProgress(
  session: PresetSessionResponse,
  completedSetIds: Record<string, true>,
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
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

interface ActiveWorkoutHeaderProps {
  name: string;
  startedAt: number | null;
  /** Epoch ms driving the elapsed clock — the screen's 1s tick. */
  now: number;
  progress: ExerciseProgress[];
  onBack: () => void;
  onDiscard: () => void;
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
        items={[
          {
            key: 'discard',
            label: 'Discard workout',
            icon: 'trash',
            onPress: onDiscard,
          },
        ]}
      />
    </View>
  );
}

export default React.memo(ActiveWorkoutHeader);
