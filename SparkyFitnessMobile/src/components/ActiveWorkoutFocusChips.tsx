import React, { useCallback, useEffect, useRef } from 'react';
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
const CIRCLE_SIZE = 36;
/** contentContainer gap-2: non-last superset bars extend across it. */
const CHIP_GAP = 8;
// The row's `px-3` leading padding, which the chip offsets start after.
const CONTENT_PADDING_X = 12;

interface Props {
  exercises: ExerciseEntryResponse[];
  completedSetIds: CompletedSetMap;
  selectedId: string | null;
  supersetBorders: Map<string, SupersetBorder>;
  onSelect: (entryId: string) => void;
}

/**
 * The focus view's exercise pager: one numbered circle per exercise (done =
 * green tinted and outlined, still numbered so it can be told apart; in progress = tinted, selected = accent ring), superset members tied
 * together by a bar in the group colour. Keeps the selected chip centred.
 */
function ActiveWorkoutFocusChips({
  exercises,
  completedSetIds,
  selectedId,
  supersetBorders,
  onSelect,
}: Props) {
  const { t } = useTranslation();
  const [accentPrimary, textPrimary, textSecondary, success] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-primary',
    '--color-text-secondary',
    '--color-icon-success',
  ]) as [string, string, string, string];
  const scrollRef = useRef<ScrollView>(null);
  const viewportWidthRef = useRef(0);

  const scrollToIndex = useCallback((index: number, animated: boolean) => {
    const center =
      CONTENT_PADDING_X + index * (CHIP_SIZE + CHIP_GAP) + CHIP_SIZE / 2;
    scrollRef.current?.scrollTo({
      x: Math.max(0, center - viewportWidthRef.current / 2),
      animated,
    });
  }, []);

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

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      onLayout={handleLayout}
      className="grow-0 border-b border-border-subtle bg-background"
      contentContainerClassName="px-3 py-2 gap-2"
    >
      {exercises.map((exercise, index) => {
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
        const supersetBorder = supersetBorders.get(exercise.id) ?? null;

        return (
          <Pressable
            key={exercise.id}
            testID={`focus-chip-${exercise.id}`}
            onPress={() => onSelect(exercise.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={t('activeWorkout.focus.chips.label', {
              defaultValue:
                'Exercise {{number}} of {{total}}, {{name}}, {{status}}',
              number: index + 1,
              total: exercises.length,
              name,
              status:
                status === 'done'
                  ? t('activeWorkout.focus.chips.done', {
                      defaultValue: 'done',
                    })
                  : status === 'inProgress'
                    ? t('activeWorkout.focus.chips.inProgress', {
                        defaultValue: 'in progress',
                      })
                    : t('activeWorkout.focus.chips.todo', {
                        defaultValue: 'not started',
                      }),
            })}
            className="items-center justify-center"
            style={{ width: CHIP_SIZE, height: CHIP_SIZE }}
          >
            <View
              testID={`focus-chip-ring-${exercise.id}`}
              className="items-center justify-center rounded-full"
              style={{
                width: CIRCLE_SIZE,
                height: CIRCLE_SIZE,
                borderWidth: 2,
                borderColor: isSelected
                  ? accentPrimary
                  : isDone
                    ? success
                    : 'transparent',
                backgroundColor:
                  status === 'inProgress'
                    ? withAlpha(accentPrimary, 0.18)
                    : isDone
                      ? withAlpha(success, 0.2)
                      : withAlpha(textSecondary, 0.14),
              }}
            >
              <Text
                className="text-sm font-semibold"
                style={{
                  color: isDone
                    ? textPrimary
                    : isSelected || status === 'inProgress'
                      ? accentPrimary
                      : textSecondary,
                }}
              >
                {index + 1}
              </Text>
            </View>
            {supersetBorder && (
              <View
                testID={`focus-chip-superset-${exercise.id}`}
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 4,
                  right: supersetBorder.isLast ? 4 : -(CHIP_GAP + 4),
                  height: 3,
                  backgroundColor: supersetBorder.color,
                }}
              />
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export default React.memo(ActiveWorkoutFocusChips);
