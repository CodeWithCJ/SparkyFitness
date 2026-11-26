import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Pressable,
  ScrollView,
  Text,
  View,
  type LayoutChangeEvent,
  type ScrollViewInstance,
} from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { ExerciseEntryResponse } from '@workspace/shared';
import type { SupersetBorder } from './ActiveWorkoutRail';
import type { CompletedSetMap } from '../stores/activeWorkoutStore';
import { withAlpha } from '../utils/colors';
import type { GetImageSource } from '../hooks/useExerciseImageSource';
import { CATEGORY_ICON_MAP } from '../utils/workoutSession';
import SafeImage from './SafeImage';
import Icon from './Icon';
import CompletionCheck from './CompletionCheck';

const TILE_WIDTH = 72;
const IMAGE_SIZE = 64;
const TILE_GAP = 10;
/** The done check and the play badge share one size and corner of the picture. */
const BADGE_SIZE = 20;
const BADGE_OFFSET = -2;
/** The selected tile's ring, drawn around the picture. */
const RING_WIDTH = 3;
/** How far a superset's tinted bar reaches past its two pictures. */
const GROUP_BAR_PAD = 5;
// The row's `px-4` leading padding, which the tile offsets start after.
const CONTENT_PADDING_X = 16;

interface Props {
  exercises: ExerciseEntryResponse[];
  completedSetIds: CompletedSetMap;
  selectedId: string | null;
  /** The exercise holding the active set; it carries the play badge. */
  activeId?: string | null;
  supersetBorders: Map<string, SupersetBorder>;
  getImageSource: GetImageSource;
  onSelect: (entryId: string) => void;
  /** Adds an exercise; the strip ends with an Add tile when given. */
  onAdd?: () => void;
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
 * The focus view's exercise strip: one picture tile per exercise with its name
 * below, ending with an Add tile. The exercise holding the active set carries
 * a play badge, a finished one a green check, both in the picture's bottom-right corner; the shown exercise is ringed in
 * the accent (in the text colour when it is not the active one). A superset
 * sits on one tinted bar behind just its pictures. Keeps the shown tile in view.
 */
function ActiveWorkoutFocusChips({
  exercises,
  completedSetIds,
  selectedId,
  activeId = null,
  supersetBorders,
  getImageSource,
  onSelect,
  onAdd,
}: Props) {
  const { t } = useTranslation();
  const [accentPrimary, textPrimary, textSecondary, accentOn] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-primary',
    '--color-text-secondary',
    '--color-accent-text',
  ]) as [string, string, string, string | undefined];
  const scrollRef = useRef<ScrollViewInstance>(null);
  const viewportWidthRef = useRef(0);

  const groups = useMemo(
    () => buildGroups(exercises, supersetBorders),
    [exercises, supersetBorders]
  );
  // Left edge of every tile, walking the groups with their own spacing.
  const tileOffsets = useMemo(() => {
    const offsets: number[] = [];
    let x = CONTENT_PADDING_X;
    groups.forEach((group) => {
      group.indexes.forEach((exerciseIndex) => {
        offsets[exerciseIndex] = x;
        x += TILE_WIDTH + TILE_GAP;
      });
    });
    return offsets;
  }, [groups]);

  const scrollToIndex = useCallback(
    (index: number, animated: boolean) => {
      const center = (tileOffsets[index] ?? 0) + TILE_WIDTH / 2;
      scrollRef.current?.scrollTo({
        x: Math.max(0, center - viewportWidthRef.current / 2),
        animated,
      });
    },
    [tileOffsets]
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

  const renderTile = (
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
    const isActive = exercise.id === activeId;
    const image = exercise.exercise_snapshot?.images?.[0] ?? null;
    const fallbackIcon =
      (exercise.exercise_snapshot?.category &&
        CATEGORY_ICON_MAP[exercise.exercise_snapshot.category]) ||
      'exercise-weights';
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
    const ringColor = isSelected
      ? isActive
        ? accentPrimary
        : textPrimary
      : 'transparent';

    const tileProps =
      groupLetter != null
        ? // A superset is one button (the group); its tiles only draw.
          { accessible: false as const }
        : {
            onPress: () => onSelect(exercise.id),
            accessibilityRole: 'button' as const,
            accessibilityState: { selected: isSelected },
            accessibilityLabel: label,
          };
    const Tile = groupLetter != null ? View : Pressable;

    return (
      <Tile
        key={exercise.id}
        testID={`focus-chip-${exercise.id}`}
        {...tileProps}
        className="items-center"
        style={{ width: TILE_WIDTH }}
      >
        <View
          testID={`focus-chip-ring-${exercise.id}`}
          className="items-center justify-center"
          style={{
            width: IMAGE_SIZE + RING_WIDTH * 2,
            height: IMAGE_SIZE + RING_WIDTH * 2,
            marginTop: -RING_WIDTH,
            borderWidth: RING_WIDTH,
            borderRadius: 20,
            borderColor: ringColor,
          }}
        >
          <View
            className="overflow-hidden"
            style={{
              width: IMAGE_SIZE,
              height: IMAGE_SIZE,
              borderRadius: 16,
              backgroundColor: withAlpha(textSecondary, 0.14),
              opacity: isDone && !isSelected ? 0.55 : 1,
            }}
          >
            <SafeImage
              source={image ? getImageSource(image) : null}
              style={{ width: IMAGE_SIZE, height: IMAGE_SIZE }}
              fallback={
                <View
                  className="items-center justify-center"
                  style={{ width: IMAGE_SIZE, height: IMAGE_SIZE }}
                >
                  <Icon name={fallbackIcon} size={26} color={textSecondary} />
                </View>
              }
            />
          </View>
          {isDone || isActive ? (
            <View
              testID={
                isDone
                  ? `focus-chip-done-${exercise.id}`
                  : `focus-chip-play-${exercise.id}`
              }
              className="absolute items-center justify-center"
              style={{
                right: BADGE_OFFSET,
                bottom: BADGE_OFFSET,
                width: BADGE_SIZE,
                height: BADGE_SIZE,
              }}
            >
              {isDone ? (
                <CompletionCheck size={BADGE_SIZE} iconSize={12} />
              ) : (
                <View
                  className="h-full w-full items-center justify-center rounded-full"
                  style={{ backgroundColor: accentPrimary }}
                >
                  <Icon name="play" size={10} color={accentOn ?? '#ffffff'} />
                </View>
              )}
            </View>
          ) : null}
        </View>
        <Text
          numberOfLines={2}
          className="mt-1 text-center text-xs font-semibold"
          style={{
            color: isSelected ? textPrimary : textSecondary,
            lineHeight: 14,
          }}
        >
          {name}
        </Text>
      </Tile>
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
      contentContainerClassName="items-start px-4 pb-2 pt-[6px]"
      contentContainerStyle={{ flexGrow: 1, columnGap: TILE_GAP }}
    >
      {groups.map((group) => {
        if (group.border == null) {
          const index = group.indexes[0];
          return renderTile(exercises[index], index, null, 0);
        }
        const letter = String.fromCharCode(supersetLetterCode++);
        const border = group.border;
        return (
          <Pressable
            key={`group-${exercises[group.indexes[0]].id}`}
            testID={`focus-chip-group-${exercises[group.indexes[0]].id}`}
            onPress={() => onSelect(exercises[group.indexes[0]].id)}
            accessibilityRole="button"
            accessibilityLabel={group.indexes
              .map(
                (index) =>
                  exercises[index].exercise_snapshot?.name ??
                  t('workout.exercise', { defaultValue: 'Exercise' })
              )
              .join(' + ')}
            accessibilityState={{
              selected: group.indexes.some(
                (index) => exercises[index].id === selectedId
              ),
            }}
            className="flex-row items-start"
            style={{ columnGap: TILE_GAP }}
          >
            <View
              pointerEvents="none"
              testID={`focus-chip-bar-${exercises[group.indexes[0]].id}`}
              className="absolute"
              style={{
                left: -GROUP_BAR_PAD,
                right: -GROUP_BAR_PAD,
                top: -GROUP_BAR_PAD,
                height: IMAGE_SIZE + GROUP_BAR_PAD * 2,
                borderRadius: 20,
                backgroundColor: withAlpha(border.color, 0.2),
              }}
            />
            {group.indexes.map((index, i) =>
              renderTile(exercises[index], index, letter, i + 1)
            )}
          </Pressable>
        );
      })}
      {onAdd ? (
        <Pressable
          testID="focus-chip-add"
          onPress={onAdd}
          accessibilityRole="button"
          accessibilityLabel={t('activeWorkout.focus.chips.addExercise', {
            defaultValue: 'Add exercise',
          })}
          className="items-center"
          style={{ width: TILE_WIDTH }}
        >
          <View
            className="items-center justify-center"
            style={{
              width: IMAGE_SIZE,
              height: IMAGE_SIZE,
              borderRadius: 16,
              borderWidth: 1.5,
              borderStyle: 'dashed',
              borderColor: textSecondary,
            }}
          >
            <Icon name="add" size={24} color={textSecondary} />
          </View>
          <Text
            className="mt-1 text-center text-xs font-semibold"
            style={{ color: textSecondary, lineHeight: 14 }}
          >
            {t('activeWorkout.focus.chips.add', { defaultValue: 'Add' })}
          </Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

export default React.memo(ActiveWorkoutFocusChips);
