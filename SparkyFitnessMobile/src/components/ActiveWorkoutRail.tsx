import React, { useCallback, useEffect, useRef } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { ExerciseEntryResponse } from '@workspace/shared';
import Icon from './Icon';
import SafeImage from './SafeImage';
import type { GetImageSource } from '../hooks/useExerciseImageSource';
import { CATEGORY_ICON_MAP } from '../utils/workoutSession';

const THUMB_SIZE = 52;

interface ActiveWorkoutRailProps {
  exercises: ExerciseEntryResponse[];
  completedSetIds: Record<string, true>;
  /** The exercise highlighted with the accent ring (cursor or scroll focus). */
  focusedEntryId: string | null;
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
              className="rounded-xl"
              style={{
                padding: 2,
                borderWidth: 2,
                borderRadius: 14,
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
            </View>
            <Text
              numberOfLines={2}
              className={`mt-1 text-center text-[11px] leading-[13px] ${
                isFocused ? 'font-semibold text-text-primary' : 'text-text-secondary'
              }`}
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
            className="items-center justify-center rounded-xl border border-dashed border-border-subtle bg-raised"
            style={{ width: THUMB_SIZE, height: THUMB_SIZE }}
          >
            <Icon name="add" size={22} color={textMuted} />
          </View>
        </View>
        <Text className="mt-1 text-center text-[11px] leading-[13px] text-text-secondary">
          Add
        </Text>
      </Pressable>
    </ScrollView>
  );
}

export default React.memo(ActiveWorkoutRail);
