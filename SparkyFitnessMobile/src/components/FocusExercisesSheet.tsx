import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  Pressable,
  Text,
  View,
  type AccessibilityActionEvent,
} from 'react-native';
import {
  GestureHandlerRootView,
  GestureDetector,
} from 'react-native-gesture-handler';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import type { PresetSessionResponse } from '@workspace/shared';

import Icon from './Icon';
import type { SupersetBorder } from './ActiveWorkoutRail';
import { supersetPageSupports } from './FocusSupersetPage';
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
    // The gap under the header counts too, so the last row keeps its bottom pad.
    n * GROUP_INNER_GAP
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
  /** Per-superset colours, the same map the top strip draws with. */
  supersetBorders: Map<string, SupersetBorder>;
  onSelectExercise: (entryId: string) => void;
  onMoveItem: (fromItemIndex: number, toItemIndex: number) => void;
  onAddExercise: () => void;
  onEndWorkout: () => void;
  onClose: () => void;
}

interface ItemProps {
  item: ExerciseReorderItem;
  index: number;
  /** Index of the last item, so a move stays inside the list. */
  lastIndex: number;
  letter: string | null;
  exercisesById: Map<string, Exercise>;
  /** 1-based position of an entry in the workout. */
  exerciseNumber: (entryId: string) => number;
  completedSetIds: CompletedSetMap;
  selectedId: string | null;
  supersetBorders: Map<string, SupersetBorder>;
  drag: ReorderDrag;
  onSelectExercise: (entryId: string) => void;
  onMoveItem: (fromItemIndex: number, toItemIndex: number) => void;
}

/**
 * One row's drag handle. Each handle makes its own gesture: a superset draws
 * one handle per member, and a gesture instance may sit on one detector only.
 * Either handle drags the whole item, since they share its index.
 */
function ExercisesDragHandle({
  entryId,
  index,
  drag,
}: {
  entryId: string;
  index: number;
  drag: ReorderDrag;
}) {
  const textMuted = useCSSVariable('--color-text-muted') as string;
  const { gesture } = useReorderItemDrag(index, drag);
  return (
    <GestureDetector gesture={gesture}>
      <View
        testID={`focus-exercise-handle-${entryId}`}
        className="h-full w-12 items-center justify-center"
      >
        <Icon name="reorder-handle" size={22} color={textMuted} />
      </View>
    </GestureDetector>
  );
}

function ExercisesItem({
  item,
  index,
  lastIndex,
  letter,
  exercisesById,
  exerciseNumber,
  completedSetIds,
  selectedId,
  supersetBorders,
  drag,
  onSelectExercise,
  onMoveItem,
}: ItemProps) {
  const { t } = useTranslation();
  const [accent, borderStrong, defaultGroupColor] = useCSSVariable([
    '--color-accent-primary',
    '--color-border-strong',
    '--color-superset',
  ]) as [string, string, string];
  // Each superset keeps the colour the strip gives it.
  const groupColor =
    supersetBorders.get(item.entryIds[0])?.color ?? defaultGroupColor;
  const { animatedStyle } = useReorderItemDrag(index, drag);
  const isGroup = item.groupId != null;

  // The row is one accessible element, so the handle inside it is not
  // reachable on its own: the row carries the reorder actions, and a screen
  // reader can move the item without a long-press drag.
  const reorderActions = [
    ...(index > 0
      ? [
          {
            name: 'decrement',
            label: t('workoutReorder.moveUp', { defaultValue: 'Move up' }),
          },
        ]
      : []),
    ...(index < lastIndex
      ? [
          {
            name: 'increment',
            label: t('workoutReorder.moveDown', { defaultValue: 'Move down' }),
          },
        ]
      : []),
  ];
  const handleAccessibilityAction = (event: AccessibilityActionEvent) => {
    const { actionName } = event.nativeEvent;
    if (actionName === 'decrement' && index > 0) onMoveItem(index, index - 1);
    if (actionName === 'increment' && index < lastIndex) {
      onMoveItem(index, index + 1);
    }
  };

  // A superset whose members share one round page is one button: either member
  // opens the same page, so only the group is tappable.
  const groupOpensOnePage =
    isGroup &&
    item.entryIds.every((id) => {
      const member = exercisesById.get(id);
      return member != null && supersetPageSupports(member);
    });
  const groupTarget =
    item.entryIds.find((id) => id === selectedId) ?? item.entryIds[0];

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
    const rowProps = groupOpensOnePage
      ? ({ accessible: false } as const)
      : {
          onPress: () => onSelectExercise(entryId),
          accessibilityRole: 'button' as const,
          accessibilityState: { selected: current },
          accessibilityActions: reorderActions,
          onAccessibilityAction: handleAccessibilityAction,
          accessibilityLabel: `${name}, ${progress}${badge ? `, ${t('activeWorkout.focus.exercises.supersetMember', { defaultValue: 'superset {{badge}}', badge })}` : ''}`,
        };
    return (
      <Pressable
        key={entryId}
        testID={`focus-exercise-row-${entryId}`}
        disabled={groupOpensOnePage}
        {...rowProps}
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
          {finished ? (
            <Icon name="checkmark" size={14} color="#fff" />
          ) : current ? (
            <Icon name="play" size={12} color={accent} />
          ) : (
            <Text className="text-[13px] font-bold text-text-secondary">
              {exerciseNumber(entryId)}
            </Text>
          )}
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
        <ExercisesDragHandle entryId={entryId} index={index} drag={drag} />
      </Pressable>
    );
  });

  return (
    <Animated.View
      testID={`focus-exercise-item-${item.key}`}
      style={[{ marginBottom: ROW_GAP }, animatedStyle]}
    >
      {isGroup ? (
        <Pressable
          testID={`focus-exercise-group-${item.key}`}
          disabled={!groupOpensOnePage}
          onPress={() => onSelectExercise(groupTarget)}
          {...(groupOpensOnePage
            ? {
                accessibilityRole: 'button' as const,
                accessibilityActions: reorderActions,
                onAccessibilityAction: handleAccessibilityAction,
                accessibilityLabel: item.entryIds
                  .map((id) => {
                    const member = exercisesById.get(id);
                    return (
                      member?.exercise_snapshot?.name ??
                      t('workout.exercise', { defaultValue: 'Exercise' })
                    );
                  })
                  .join(', '),
              }
            : null)}
          className="rounded-[22px] px-2 pb-2"
          style={{
            borderWidth: 1,
            borderColor: withAlpha(groupColor, 0.28),
            backgroundColor: withAlpha(groupColor, 0.08),
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
        </Pressable>
      ) : (
        rows
      )}
    </Animated.View>
  );
}

/**
 * The focus view's Exercises sheet (Phone-Exercises board): every exercise with
 * its progress, supersets in a group coloured as in the strip with A1 / A2 badges, drag handles
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
  supersetBorders,
  onSelectExercise,
  onMoveItem,
  onAddExercise,
  onEndWorkout,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [dangerText, textPrimary] = useCSSVariable([
    '--color-icon-danger',
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
  const exerciseNumber = useCallback(
    (entryId: string) => exercises.findIndex((e) => e.id === entryId) + 1,
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
                lastIndex={items.length - 1}
                letter={letters[index]}
                exercisesById={exercisesById}
                exerciseNumber={exerciseNumber}
                completedSetIds={completedSetIds}
                selectedId={selectedId}
                supersetBorders={supersetBorders}
                drag={drag}
                onSelectExercise={handleSelect}
                onMoveItem={onMoveItem}
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
