import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Pressable,
  ScrollView,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { ExerciseEntryResponse } from '@workspace/shared';
import type { SupersetBorder } from './ActiveWorkoutRail';
import type { CompletedSetMap } from '../stores/activeWorkoutStore';
import { withAlpha } from '../utils/colors';

const CHIP_SIZE = 44;
const CHIP_GAP = 8;
/** Gap between the members of a superset group. */
const GROUP_GAP = 6;
/** Group shape: 3 of padding plus the 2 point outline on each side. */
const GROUP_INSET = 5;
// The row's `px-4` leading padding, which the chip offsets start after.
const CONTENT_PADDING_X = 16;

interface Props {
  exercises: ExerciseEntryResponse[];
  completedSetIds: CompletedSetMap;
  selectedId: string | null;
  supersetBorders: Map<string, SupersetBorder>;
  onSelect: (entryId: string) => void;
}

interface ChipGroup {
  /** Set for a superset run; a lone exercise has none. */
  border: SupersetBorder | null;
  indexes: number[];
}

/** Adjacent superset members become one group, everything else stands alone. */
function buildGroups(
  exercises: ExerciseEntryResponse[],
  supersetBorders: Map<string, SupersetBorder>
): ChipGroup[] {
  const groups: ChipGroup[] = [];
  let open: ChipGroup | null = null;
  exercises.forEach((exercise, index) => {
    const border = supersetBorders.get(exercise.id) ?? null;
    if (border == null) {
      open = null;
      groups.push({ border: null, indexes: [index] });
      return;
    }
    if (open == null) {
      open = { border, indexes: [] };
      groups.push(open);
    }
    open.indexes.push(index);
    if (border.isLast) open = null;
  });
  return groups;
}

/**
 * The focus view's exercise pager: one numbered circle per exercise (the
 * selected one filled with the accent, a finished one outlined, one in
 * progress tinted), with each superset wrapped in a single tinted group shape
 * in its colour. Keeps the selected chip centred.
 */
function ActiveWorkoutFocusChips({
  exercises,
  completedSetIds,
  selectedId,
  supersetBorders,
  onSelect,
}: Props) {
  const { t } = useTranslation();
  const [accentPrimary, textPrimary, textSecondary, borderStrong] =
    useCSSVariable([
      '--color-accent-primary',
      '--color-text-primary',
      '--color-text-secondary',
      '--color-border-strong',
    ]) as [string, string, string, string];
  const scrollRef = useRef<ScrollView>(null);
  const viewportWidthRef = useRef(0);

  const groups = useMemo(
    () => buildGroups(exercises, supersetBorders),
    [exercises, supersetBorders]
  );
  // Left edge of every chip, walking the groups with their own spacing.
  const chipOffsets = useMemo(() => {
    const offsets: number[] = [];
    let x = CONTENT_PADDING_X;
    groups.forEach((group, groupIndex) => {
      if (groupIndex > 0) x += CHIP_GAP;
      const inGroup = group.border != null;
      if (inGroup) x += GROUP_INSET;
      group.indexes.forEach((exerciseIndex, i) => {
        if (i > 0) x += GROUP_GAP;
        offsets[exerciseIndex] = x;
        x += CHIP_SIZE;
      });
      if (inGroup) x += GROUP_INSET;
    });
    return offsets;
  }, [groups]);

  const scrollToIndex = useCallback(
    (index: number, animated: boolean) => {
      const center = (chipOffsets[index] ?? 0) + CHIP_SIZE / 2;
      scrollRef.current?.scrollTo({
        x: Math.max(0, center - viewportWidthRef.current / 2),
        animated,
      });
    },
    [chipOffsets]
  );

  const selectedIndex = exercises.findIndex((e) => e.id === selectedId);
  useEffect(() => {
    if (selectedIndex >= 0) scrollToIndex(selectedIndex, true);
  }, [selectedIndex, scrollToIndex]);

  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      viewportWidthRef.current = e.nativeEvent.layout.width;
      if (selectedIndex >= 0) scrollToIndex(selectedIndex, false);
    },
    [selectedIndex, scrollToIndex]
  );

  const renderChip = (
    exercise: ExerciseEntryResponse,
    index: number,
    groupLetter: string | null,
    memberNumber: number
  ) => {
    const name =
      exercise.exercise_snapshot?.name ??
      t('workout.exercise', { defaultValue: 'Exercise' });
    const doneCount = exercise.sets.filter(
      (s) => completedSetIds[String(s.id)]
    ).length;
    const isDone =
      exercise.sets.length > 0 && doneCount === exercise.sets.length;
    const status = isDone ? 'done' : doneCount > 0 ? 'inProgress' : 'todo';
    const isSelected = exercise.id === selectedId;
    const statusLabel =
      status === 'done'
        ? t('activeWorkout.focus.chips.done', { defaultValue: 'done' })
        : status === 'inProgress'
          ? t('activeWorkout.focus.chips.inProgress', {
              defaultValue: 'in progress',
            })
          : t('activeWorkout.focus.chips.todo', {
              defaultValue: 'not started',
            });
    const label = t('activeWorkout.focus.chips.label', {
      defaultValue: 'Exercise {{number}} of {{total}}, {{name}}, {{status}}',
      number: index + 1,
      total: exercises.length,
      name,
      status: statusLabel,
    });

    return (
      <Pressable
        key={exercise.id}
        testID={`focus-chip-${exercise.id}`}
        onPress={() => onSelect(exercise.id)}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
        accessibilityLabel={
          groupLetter != null
            ? t('activeWorkout.focus.chips.supersetLabel', {
                defaultValue: '{{label}}, superset {{letter}}{{member}}',
                label,
                letter: groupLetter,
                member: memberNumber,
              })
            : label
        }
        className="items-center justify-center rounded-full"
        style={{
          width: CHIP_SIZE,
          height: CHIP_SIZE,
          // The ring is the chip: filled when selected, outlined when done.
          borderWidth: 2,
          borderColor: isSelected
            ? accentPrimary
            : isDone
              ? borderStrong
              : 'transparent',
          backgroundColor: isSelected
            ? accentPrimary
            : status === 'inProgress'
              ? withAlpha(accentPrimary, 0.18)
              : withAlpha(textSecondary, 0.14),
        }}
      >
        <View testID={`focus-chip-ring-${exercise.id}`} pointerEvents="none">
          <Text
            className="text-base font-bold"
            style={{
              color: isSelected
                ? '#ffffff'
                : isDone
                  ? textPrimary
                  : status === 'inProgress'
                    ? accentPrimary
                    : textSecondary,
            }}
          >
            {index + 1}
          </Text>
        </View>
      </Pressable>
    );
  };

  let supersetLetterCode = 65;
  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      onLayout={handleLayout}
      className="grow-0"
      contentContainerClassName="items-center gap-2 px-4 py-2"
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
    >
      {groups.map((group) => {
        if (group.border == null) {
          const index = group.indexes[0];
          return renderChip(exercises[index], index, null, 0);
        }
        const letter = String.fromCharCode(supersetLetterCode++);
        const border = group.border;
        return (
          <View
            key={`group-${exercises[group.indexes[0]].id}`}
            testID={`focus-chip-group-${exercises[group.indexes[0]].id}`}
            accessibilityRole="none"
            className="flex-row items-center"
            style={{
              gap: GROUP_GAP,
              padding: GROUP_INSET - 2,
              borderWidth: 2,
              borderRadius: 28,
              borderColor: border.color,
              backgroundColor: withAlpha(border.color, 0.14),
            }}
          >
            {group.indexes.map((index, i) =>
              renderChip(exercises[index], index, letter, i + 1)
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

export default React.memo(ActiveWorkoutFocusChips);
