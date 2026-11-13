import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, Text, View } from 'react-native';
import {
  GestureHandlerRootView,
  GestureDetector,
} from 'react-native-gesture-handler';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import type { PresetSessionResponse } from '@workspace/shared';

import Icon from './Icon';
import {
  useReorderDrag,
  useReorderItemDrag,
  type ReorderDrag,
} from './WorkoutReorderList';
import type { CompletedSetMap } from '../stores/activeWorkoutStore';
import { withAlpha } from '../utils/colors';
import {
  buildExerciseReorderItems,
  type ExerciseReorderItem,
} from '../utils/workoutSession';

type Exercise = PresetSessionResponse['exercises'][number];

/** Row heights and gaps; the drag math needs them exact. */
export const EXERCISES_ROW_HEIGHT = 56;
const ROW_GAP = 8;
const GROUP_HEADER_HEIGHT = 26;
const GROUP_PADDING = 8;
const GROUP_INNER_GAP = 6;

/** Height of one draggable item: a solo row, or a superset box around its members. */
export function exercisesItemHeight(item: ExerciseReorderItem): number {
  const n = item.entryIds.length;
  if (item.groupId == null) return EXERCISES_ROW_HEIGHT;
  return (
    GROUP_HEADER_HEIGHT +
    GROUP_PADDING +
    n * EXERCISES_ROW_HEIGHT +
    (n - 1) * GROUP_INNER_GAP
  );
}

export interface FocusExercisesUndo {
  /** "Bench Press · 80 kg × 8". */
  detail: string;
  onUndo: () => void;
}

interface Props {
  visible: boolean;
  exercises: Exercise[];
  completedSetIds: CompletedSetMap;
  /** Entry id of the exercise on show. */
  selectedId: string | null;
  /** Null when no set is logged yet. */
  undo: FocusExercisesUndo | null;
  /** Lilac group colour, from the focus palette. */
  groupColor: string;
  onSelectExercise: (entryId: string) => void;
  onMoveItem: (fromItemIndex: number, toItemIndex: number) => void;
  onAddExercise: () => void;
  onEndWorkout: () => void;
  onClose: () => void;
}

interface ItemProps {
  item: ExerciseReorderItem;
  index: number;
  letter: string | null;
  exercisesById: Map<string, Exercise>;
  completedSetIds: CompletedSetMap;
  selectedId: string | null;
  groupColor: string;
  drag: ReorderDrag;
  onSelectExercise: (entryId: string) => void;
}

function ExercisesItem({
  item,
  index,
  letter,
  exercisesById,
  completedSetIds,
  selectedId,
  groupColor,
  drag,
  onSelectExercise,
}: ItemProps) {
  const { t } = useTranslation();
  const [textMuted, accent, borderStrong] = useCSSVariable([
    '--color-text-muted',
    '--color-accent-primary',
    '--color-border-strong',
  ]) as [string, string, string];
  const { animatedStyle, gesture } = useReorderItemDrag(index, drag);
  const isGroup = item.groupId != null;

  const rows = item.entryIds.map((entryId, memberIndex) => {
    const exercise = exercisesById.get(entryId);
    if (exercise == null) return null;
    const name =
      exercise.exercise_snapshot?.name ??
      t('workout.exercise', { defaultValue: 'Exercise' });
    const total = exercise.sets.length;
    const done = exercise.sets.filter(
      (s) => completedSetIds[String(s.id)] != null
    ).length;
    const finished = total > 0 && done === total;
    const current = entryId === selectedId;
    const progress = t('activeWorkout.focus.exercises.setsProgress', {
      defaultValue: '{{done}}/{{total}} sets',
      done,
      total,
    });
    const badge =
      isGroup && letter != null ? `${letter}${memberIndex + 1}` : null;
    return (
      <Pressable
        key={entryId}
        testID={`focus-exercise-row-${entryId}`}
        onPress={() => onSelectExercise(entryId)}
        accessibilityRole="button"
        accessibilityState={{ selected: current }}
        accessibilityLabel={`${name}, ${progress}${badge ? `, ${t('activeWorkout.focus.exercises.supersetMember', { defaultValue: 'superset {{badge}}', badge })}` : ''}`}
        className={`flex-row items-center gap-3 rounded-2xl pl-3.5 ${isGroup ? 'bg-background' : 'bg-raised'}`}
        style={{
          height: EXERCISES_ROW_HEIGHT,
          ...(current && !isGroup ? { backgroundColor: borderStrong } : null),
        }}
      >
        <View
          className="h-7 w-7 items-center justify-center rounded-full"
          style={{
            borderWidth: 2,
            borderColor: finished || current ? accent : borderStrong,
            backgroundColor: finished ? accent : 'transparent',
          }}
        >
          {finished && <Icon name="checkmark" size={14} color="#fff" />}
        </View>
        <View className="min-w-0 flex-1">
          <Text
            numberOfLines={1}
            className="text-[17px] font-bold text-text-primary"
          >
            {name}
          </Text>
          <Text className="text-[14px] text-text-secondary" numberOfLines={1}>
            {progress}
            {isGroup && (
              <Text style={{ color: groupColor }}>
                {` · ${t('activeWorkout.focus.exercises.superset', { defaultValue: 'Superset' })}`}
              </Text>
            )}
          </Text>
        </View>
        {badge != null && (
          <View
            className="h-7 min-w-[40px] items-center justify-center rounded-full px-2"
            style={{ backgroundColor: groupColor }}
          >
            <Text className="text-[13px] font-extrabold text-black">
              {badge}
            </Text>
          </View>
        )}
        <GestureDetector gesture={gesture}>
          <View
            testID={`focus-exercise-handle-${entryId}`}
            className="h-full w-12 items-center justify-center"
            accessibilityRole="adjustable"
            accessibilityLabel={t('workoutReorder.drag', {
              defaultValue: 'Drag to reorder',
            })}
          >
            <Icon name="reorder-handle" size={22} color={textMuted} />
          </View>
        </GestureDetector>
      </Pressable>
    );
  });

  return (
    <Animated.View
      testID={`focus-exercise-item-${item.key}`}
      style={[{ marginBottom: ROW_GAP }, animatedStyle]}
    >
      {isGroup ? (
        <View
          className="rounded-[22px] px-2 pb-2"
          style={{
            borderWidth: 2,
            borderColor: groupColor,
            backgroundColor: withAlpha(groupColor, 0.12),
            height: exercisesItemHeight(item),
            gap: GROUP_INNER_GAP,
          }}
        >
          <View
            style={{ height: GROUP_HEADER_HEIGHT - 2 }}
            className="justify-end pl-2.5"
          >
            <Text
              className="text-[12px] font-extrabold uppercase tracking-wider"
              style={{ color: groupColor }}
            >
              {t('activeWorkout.focus.exercises.supersetHeader', {
                defaultValue: 'Superset',
              })}
            </Text>
          </View>
          {rows}
        </View>
      ) : (
        rows
      )}
    </Animated.View>
  );
}

/**
 * The focus view's Exercises sheet (Phone-Exercises board): every exercise with
 * its progress, supersets in one lilac group with A1 / A2 badges, drag handles
 * (the same reorder logic as the list view's overlay), Add exercise, Undo set
 * for the last logged set, Back to workout and End workout. A modal rather
 * than a gorhom sheet: a long-press drag inside a bottom sheet's own scroll
 * would fight the sheet's pan, and `onRequestClose` gives Android Back.
 */
function FocusExercisesSheet({
  visible,
  exercises,
  completedSetIds,
  selectedId,
  undo,
  groupColor,
  onSelectExercise,
  onMoveItem,
  onAddExercise,
  onEndWorkout,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [dangerText, textPrimary] = useCSSVariable([
    '--color-text-danger-subtle',
    '--color-text-primary',
  ]) as [string, string];
  const items = useMemo(
    () =>
      buildExerciseReorderItems(
        exercises.map((e) => ({
          id: e.id,
          superset_group: e.superset_group ?? null,
        }))
      ),
    [exercises]
  );
  const exercisesById = useMemo(
    () => new Map(exercises.map((e) => [e.id, e])),
    [exercises]
  );
  // A for the first superset, B for the next, as the pager's group letters.
  const letters = useMemo(() => {
    let code = 65;
    return items.map((item) =>
      item.groupId != null ? String.fromCharCode(code++) : null
    );
  }, [items]);

  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const drag = useReorderDrag(
    items,
    exercisesItemHeight,
    ROW_GAP,
    onMoveItem,
    scrollRef
  );

  const closeThen = useCallback(
    (action: () => void) => () => {
      onClose();
      action();
    },
    [onClose]
  );

  const handleSelect = useCallback(
    (entryId: string) => {
      onClose();
      onSelectExercise(entryId);
    },
    [onClose, onSelectExercise]
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <GestureHandlerRootView className="flex-1 justify-end">
        <Pressable
          className="absolute inset-0 bg-black/60"
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('common.close', { defaultValue: 'Close' })}
        />
        <View
          className="max-h-[88%] rounded-t-[28px] bg-surface px-4 pt-2"
          style={{ paddingBottom: Math.max(insets.bottom, 16) }}
        >
          <View className="mb-3 h-1 w-10 self-center rounded-full bg-border-strong" />
          <View className="mb-3 flex-row items-center justify-between">
            <Text
              accessibilityRole="header"
              className="text-[26px] font-extrabold text-text-primary"
            >
              {t('activeWorkout.focus.exercises.title', {
                defaultValue: 'Exercises',
              })}
            </Text>
            <Pressable
              onPress={closeThen(onAddExercise)}
              accessibilityRole="button"
              className="h-11 items-center justify-center rounded-full bg-accent-primary px-5 active:opacity-80"
            >
              <Text className="text-[17px] font-bold text-white">
                {t('activeWorkout.focus.exercises.add', {
                  defaultValue: 'Add exercise',
                })}
              </Text>
            </Pressable>
          </View>
          <Animated.ScrollView
            ref={scrollRef}
            onScroll={drag.scrollHandler}
            scrollEventThrottle={16}
            scrollEnabled={drag.scrollEnabled}
            style={{ flexGrow: 0 }}
          >
            {items.map((item, index) => (
              <ExercisesItem
                key={item.key}
                item={item}
                index={index}
                letter={letters[index]}
                exercisesById={exercisesById}
                completedSetIds={completedSetIds}
                selectedId={selectedId}
                groupColor={groupColor}
                drag={drag}
                onSelectExercise={handleSelect}
              />
            ))}
          </Animated.ScrollView>
          {undo != null && (
            <Pressable
              testID="focus-exercises-undo"
              onPress={closeThen(undo.onUndo)}
              accessibilityRole="button"
              accessibilityLabel={`${t('activeWorkout.focus.exercises.undo', { defaultValue: 'Undo set' })}. ${undo.detail}`}
              className="mt-1 h-14 flex-row items-center gap-3.5 rounded-full bg-raised px-5 active:opacity-70"
            >
              <Icon name="arrow-undo" size={22} color={textPrimary} />
              <View className="min-w-0 flex-1">
                <Text className="text-[17px] font-bold text-text-primary">
                  {t('activeWorkout.focus.exercises.undo', {
                    defaultValue: 'Undo set',
                  })}
                </Text>
                <Text
                  numberOfLines={1}
                  className="text-[13px] text-text-secondary"
                >
                  {undo.detail}
                </Text>
              </View>
            </Pressable>
          )}
          <View className="mt-3 flex-row gap-3">
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              className="h-14 flex-[1.6] items-center justify-center rounded-full bg-accent-primary active:opacity-80"
            >
              <Text className="text-[18px] font-bold text-white">
                {t('activeWorkout.focus.exercises.back', {
                  defaultValue: 'Back to workout',
                })}
              </Text>
            </Pressable>
            <Pressable
              onPress={closeThen(onEndWorkout)}
              accessibilityRole="button"
              className="h-14 flex-1 items-center justify-center rounded-full bg-raised active:opacity-70"
            >
              <Text
                className="text-[18px] font-bold"
                style={{ color: dangerText }}
              >
                {t('activeWorkout.focus.exercises.end', {
                  defaultValue: 'End workout',
                })}
              </Text>
            </Pressable>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

export default React.memo(FocusExercisesSheet);
