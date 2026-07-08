import React, { useCallback, useEffect, useRef } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { ExerciseEntryResponse } from '@workspace/shared';
import Icon from './Icon';
import SafeImage from './SafeImage';
import type { GetImageSource } from '../hooks/useExerciseImageSource';
import type { CompletedSetMap } from '../stores/activeWorkoutStore';
import { CATEGORY_ICON_MAP } from '../utils/workoutSession';

const THUMB_SIZE = 52;
/** contentContainer gap-3 — non-last superset bars extend across it. */
const ITEM_GAP = 12;
/** Horizontal inset of a superset bar from its item's edges. */
const BAR_INSET = 4;

export interface SupersetBorder {
  color: string;
  /** Last member of its run — the shared bar stops at this thumb. */
  isLast: boolean;
}

interface ActiveWorkoutRailProps {
  exercises: ExerciseEntryResponse[];
  completedSetIds: CompletedSetMap;
  /** The scroll-focused exercise (bold label + kept in view as the log scrolls). */
  focusedEntryId: string | null;
  /** The current (cursor) exercise — always carries the accent ring so the rail
   * shows where you are in the workout regardless of scroll position. */
  activeEntryId: string | null;
  /** Superset membership: grouped thumbs get a flat bottom bar in the group color. */
  supersetBorders: Map<string, SupersetBorder>;
  getImageSource: GetImageSource;
  onPressExercise: (entryId: string) => void;
  onPressAdd: () => void;
}

/**
 * Horizontal map of the session: one photo chip per exercise (done = dimmed +
 * green check badge, focused = accent ring) and a trailing add-exercise tile.
 */
function ActiveWorkoutRail({
  exercises,
  completedSetIds,
  focusedEntryId,
  activeEntryId,
  supersetBorders,
  getImageSource,
  onPressExercise,
  onPressAdd,
}: ActiveWorkoutRailProps) {
  const [textMuted, accentPrimary, successColor] = useCSSVariable([
    '--color-text-muted',
    '--color-accent-primary',
    '--color-icon-success',
  ]) as [string, string, string];

  const scrollRef = useRef<ScrollView>(null);
  const itemOffsetsRef = useRef<Record<string, number>>({});

  const handleItemLayout = useCallback((entryId: string, x: number) => {
    itemOffsetsRef.current[entryId] = x;
  }, []);

  // Keep the focused chip in view as the cursor advances or the log scrolls.
  useEffect(() => {
    if (focusedEntryId == null) return;
    const x = itemOffsetsRef.current[focusedEntryId];
    if (x == null) return;
    scrollRef.current?.scrollTo({ x: Math.max(0, x - 24), animated: true });
  }, [focusedEntryId]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      className="grow-0 border-b border-border-subtle bg-background"
      contentContainerClassName="px-3 py-2 gap-3"
    >
      {exercises.map((exercise) => {
        const name = exercise.exercise_snapshot?.name ?? 'Exercise';
        const image = exercise.exercise_snapshot?.images?.[0] ?? null;
        const fallbackIcon =
          (exercise.exercise_snapshot?.category &&
            CATEGORY_ICON_MAP[exercise.exercise_snapshot.category]) ||
          'exercise-weights';
        const isDone =
          exercise.sets.length > 0 &&
          exercise.sets.every((s) => completedSetIds[String(s.id)]);
        const isFocused = exercise.id === focusedEntryId;
        const isCurrent = exercise.id === activeEntryId;
        const supersetBorder = supersetBorders.get(exercise.id) ?? null;

        return (
          <Pressable
            key={exercise.id}
            onPress={() => onPressExercise(exercise.id)}
            onLayout={(e) => handleItemLayout(exercise.id, e.nativeEvent.layout.x)}
            accessibilityRole="button"
            accessibilityLabel={name}
            className="items-center"
            style={{ width: THUMB_SIZE + 16 }}
          >
            <View
              testID={`rail-ring-${exercise.id}`}
              className="rounded-xl"
              style={{
                padding: 2,
                borderWidth: 2,
                borderRadius: 14,
                // Ring tracks scroll focus (which chip is centered in the log).
                borderColor: isFocused ? accentPrimary : 'transparent',
              }}
            >
              <View style={{ opacity: isDone ? 0.45 : 1 }}>
                <SafeImage
                  source={image ? getImageSource(image) : null}
                  style={{ width: THUMB_SIZE, height: THUMB_SIZE, borderRadius: 10 }}
                  fallback={
                    <View
                      className="bg-raised items-center justify-center"
                      style={{ width: THUMB_SIZE, height: THUMB_SIZE, borderRadius: 10 }}
                    >
                      <Icon name={fallbackIcon} size={26} color={textMuted} />
                    </View>
                  }
                />
              </View>
              {isDone && (
                <View
                  className="absolute items-center justify-center rounded-full"
                  style={{
                    right: -2,
                    top: -2,
                    width: 18,
                    height: 18,
                    backgroundColor: successColor,
                  }}
                >
                  <Icon name="checkmark" size={11} color="#ffffff" weight="bold" />
                </View>
              )}
              {/* Current-exercise marker (has the active set): an accent "play"
                  badge, mirroring the green-check done badge. Distinct from the
                  scroll-focus ring so both can show at once. Never collides with
                  the done badge — the current exercise is never fully done. */}
              {isCurrent && !isDone && (
                <View
                  testID={`rail-current-${exercise.id}`}
                  className="absolute items-center justify-center rounded-full"
                  style={{
                    left: -2,
                    top: -2,
                    width: 18,
                    height: 18,
                    backgroundColor: accentPrimary,
                  }}
                >
                  <Icon name="play" size={10} color="#ffffff" weight="bold" />
                </View>
              )}
            </View>
            {supersetBorder && (
              <View
                testID={`superset-bar-${exercise.id}`}
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  // Flat bar just under the thumb block (thumb + 2px padding
                  // + 2px ring border on each side).
                  top: THUMB_SIZE + 8 + 1,
                  left: BAR_INSET,
                  // Non-last members bridge the item gap up to the next
                  // member's inset so the group reads as one shared line.
                  right: supersetBorder.isLast ? BAR_INSET : -(ITEM_GAP + BAR_INSET),
                  height: 3,
                  backgroundColor: supersetBorder.color,
                }}
              />
            )}
            <Text
              numberOfLines={2}
              className={`mt-1 text-center text-[11px] leading-[13px] ${
                isCurrent
                  ? 'font-semibold'
                  : isFocused
                    ? 'font-semibold text-text-primary'
                    : 'text-text-secondary'
              }`}
              style={isCurrent ? { color: accentPrimary } : undefined}
            >
              {name}
            </Text>
          </Pressable>
        );
      })}

      <Pressable
        onPress={onPressAdd}
        accessibilityRole="button"
        accessibilityLabel="Add exercise"
        className="items-center"
        style={{ width: THUMB_SIZE + 16 }}
      >
        <View style={{ padding: 4 }}>
          <View
            className="items-center justify-center rounded-xl bg-raised"
            style={{ width: THUMB_SIZE, height: THUMB_SIZE }}
          >
            <Icon name="add" size={22} color={accentPrimary} />
          </View>
        </View>
        <Text
          className="mt-1 text-center text-[11px] leading-[13px] font-medium"
          style={{ color: accentPrimary }}
        >
          Add
        </Text>
      </Pressable>
    </ScrollView>
  );
}

export default React.memo(ActiveWorkoutRail);
