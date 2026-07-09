import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StatusBar, Text, View } from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  measure,
  runOnJS,
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';
import { ExerciseThumb } from './ActiveWorkoutExerciseCard';
import { fireSelectionHaptic } from '../services/haptics';
import {
  buildExerciseReorderItems,
  buildSupersetColorMap,
  getSupersetRuns,
  SUPERSET_PALETTE_VARS,
  type ExerciseReorderItem,
  type WorkoutCardExercise,
} from '../utils/workoutSession';
import type { GetImageSource } from '../hooks/useExerciseImageSource';

/** Fixed height of a single exercise (member) row. */
export const REORDER_ROW_HEIGHT = 64;
/** Vertical gap between draggable items, carried as in-item bottom margin. */
export const REORDER_ITEM_GAP = 8;

const LONG_PRESS_MS = 150;
const AUTO_SCROLL_EDGE = 80;
const AUTO_SCROLL_SPEED = 8;

interface WorkoutReorderListProps {
  visible: boolean;
  /** Session `ExerciseEntryResponse[]` satisfies this structurally. */
  exercises: WorkoutCardExercise[];
  getImageSource: GetImageSource;
  onMoveItem: (fromItemIndex: number, toItemIndex: number) => void;
  onDone: () => void;
}

/**
 * Target item index for a drag, in **remove-then-insert** convention: the
 * returned value is where the dragged item lands in the array *after* it has
 * been removed — exactly what `moveSessionExerciseItem`/`moveDraftExerciseItem`
 * expect as their `to` argument. Runs as a worklet on the UI thread during a
 * drag and as plain JS under Jest.
 *
 * The floating block's centre (its original centre plus `translationY`) is
 * walked against every *other* item's static midpoint; the count of midpoints
 * it has passed is the insertion index. Output is inherently clamped to
 * `[0, items.length - 1]` because there are `items.length - 1` other items.
 */
export function computeReorderTargetIndex(
  strides: number[],
  offsets: number[],
  activeIndex: number,
  translationY: number,
): number {
  'worklet';
  const activeCenter = offsets[activeIndex] + strides[activeIndex] / 2 + translationY;
  let target = 0;
  for (let j = 0; j < strides.length; j++) {
    if (j === activeIndex) continue;
    const mid = offsets[j] + strides[j] / 2;
    if (activeCenter > mid) target += 1;
  }
  return target;
}

interface ReorderItemRowProps {
  item: ExerciseReorderItem;
  index: number;
  exercisesById: Map<string, WorkoutCardExercise>;
  railColor: string | null;
  getImageSource: GetImageSource;
  strides: number[];
  activeIndex: SharedValue<number>;
  committing: SharedValue<boolean>;
  ty: SharedValue<number>;
  targetIndex: SharedValue<number>;
  panY: SharedValue<number>;
  pointerAbsY: SharedValue<number>;
  scrollY: SharedValue<number>;
  dragStartScrollY: SharedValue<number>;
  onCommit: (fromItemIndex: number, toItemIndex: number) => void;
  setScrollEnabled: (enabled: boolean) => void;
}

function ReorderItemRow({
  item,
  index,
  exercisesById,
  railColor,
  getImageSource,
  strides,
  activeIndex,
  committing,
  ty,
  targetIndex,
  panY,
  pointerAbsY,
  scrollY,
  dragStartScrollY,
  onCommit,
  setScrollEnabled,
}: ReorderItemRowProps) {
  const textMuted = String(useCSSVariable('--color-text-muted'));
  const isRun = item.groupId != null;

  const animatedStyle = useAnimatedStyle(() => {
    const active = activeIndex.value;
    if (active === index) {
      // The floating dragged block: follows the finger (pan + auto-scroll
      // delta), lifts above its neighbours, and grows slightly.
      return {
        transform: [{ translateY: ty.value }, { scale: 1.03 }],
        zIndex: 10,
        elevation: 8,
        shadowColor: '#000',
        shadowOpacity: 0.18,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
      };
    }
    if (active < 0) {
      return { transform: [{ translateY: 0 }, { scale: 1 }], zIndex: 0 };
    }
    // Others open a gap for the drag by springing exactly one dragged-stride:
    // items between the origin and the current target shift toward the origin.
    const t = targetIndex.value;
    const stride = strides[active];
    let shift = 0;
    if (active < index && index <= t) shift = -stride;
    else if (t <= index && index < active) shift = stride;
    return {
      transform: [{ translateY: withSpring(shift, { damping: 44, stiffness: 960 }) }, { scale: 1 }],
      zIndex: 0,
    };
  });

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(LONG_PRESS_MS)
        .onStart(() => {
          'worklet';
          activeIndex.value = index;
          committing.value = false;
          dragStartScrollY.value = scrollY.value;
          panY.value = 0;
          runOnJS(setScrollEnabled)(false);
        })
        .onUpdate((event) => {
          'worklet';
          panY.value = event.translationY;
          pointerAbsY.value = event.absoluteY;
        })
        .onEnd(() => {
          'worklet';
          const from = activeIndex.value;
          const to = targetIndex.value;
          // A real move keeps the drag transforms frozen at the drop layout; the
          // post-commit effect clears them once the reordered rows have rendered,
          // so the finger's preview hands off seamlessly instead of snapping back
          // to the pre-drag order for a frame while the JS state update lands.
          committing.value = from >= 0 && to >= 0 && from !== to;
          runOnJS(onCommit)(from, to);
        })
        .onFinalize(() => {
          'worklet';
          runOnJS(setScrollEnabled)(true);
          if (committing.value) return;
          activeIndex.value = -1;
          panY.value = 0;
        }),
    [
      index,
      activeIndex,
      committing,
      dragStartScrollY,
      scrollY,
      panY,
      pointerAbsY,
      targetIndex,
      onCommit,
      setScrollEnabled,
    ],
  );

  const rows = item.entryIds.map((entryId) => {
    const exercise = exercisesById.get(entryId);
    const name = exercise?.exercise_snapshot?.name ?? 'Exercise';
    const setCount = exercise?.sets.length ?? 0;
    return (
      <View
        key={entryId}
        testID={`reorder-row-${entryId}`}
        style={{ height: REORDER_ROW_HEIGHT }}
        className="flex-row items-center gap-3 px-3"
      >
        {exercise ? (
          <ExerciseThumb exercise={exercise} getImageSource={getImageSource} size={40} />
        ) : null}
        <View className="flex-1">
          <Text numberOfLines={1} className="text-base text-text-primary">
            {name}
          </Text>
          <Text className="text-sm text-text-muted">
            {setCount} set{setCount === 1 ? '' : 's'}
          </Text>
        </View>
      </View>
    );
  });

  return (
    <Animated.View
      style={[{ marginBottom: REORDER_ITEM_GAP, paddingLeft: isRun ? 10 : 0 }, animatedStyle]}
    >
      {isRun && railColor ? (
        <View
          testID={`reorder-superset-rail-${item.key}`}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 3,
            backgroundColor: railColor,
            borderRadius: 2,
          }}
        />
      ) : null}
      <View className="flex-row items-center bg-surface rounded-xl">
        <View className="flex-1">{rows}</View>
        <GestureDetector gesture={gesture}>
          <View
            testID={`reorder-handle-${item.key}`}
            className="px-4 py-2 justify-center"
            accessibilityLabel="Drag to reorder"
            accessibilityRole="adjustable"
          >
            <Icon name="reorder-handle" size={24} color={textMuted} />
          </View>
        </GestureDetector>
      </View>
    </Animated.View>
  );
}

/**
 * Full-screen reorder overlay for the active-workout and form exercise lists.
 * Each draggable item is a solo exercise or a whole superset run (its members
 * drag as one block, per {@link buildExerciseReorderItems}); a release commits
 * the move through `onMoveItem`. Self-hosts its own `Animated.ScrollView` so
 * the four calling surfaces don't need to plumb scroll refs.
 */
function WorkoutReorderList({
  visible,
  exercises,
  getImageSource,
  onMoveItem,
  onDone,
}: WorkoutReorderListProps) {
  const insets = useSafeAreaInsets();
  const accent = String(useCSSVariable('--color-accent-primary'));
  const palette = useCSSVariable(SUPERSET_PALETTE_VARS) as string[];

  const items = useMemo(
    () =>
      buildExerciseReorderItems(
        exercises.map((e) => ({ id: e.id, superset_group: e.superset_group ?? null })),
      ),
    [exercises],
  );

  const exercisesById = useMemo(
    () => new Map(exercises.map((e) => [e.id, e])),
    [exercises],
  );

  const railColorByItemKey = useMemo(() => {
    const runs = getSupersetRuns(
      exercises.map((e) => ({ id: e.id, superset_group: e.superset_group ?? null })),
    );
    const colorMap = buildSupersetColorMap(runs, palette);
    const map = new Map<string, string>();
    for (const item of items) {
      if (item.groupId == null) continue;
      const color = colorMap.get(item.entryIds[0]);
      if (color != null) map.set(item.key, color);
    }
    return map;
  }, [exercises, items, palette]);

  // Item strides (row-block height + gap) and their prefix-sum offsets drive
  // the drag target math. Kept as plain memoized arrays so the worklets can
  // capture them.
  const strides = useMemo(
    () => items.map((item) => item.entryIds.length * REORDER_ROW_HEIGHT + REORDER_ITEM_GAP),
    [items],
  );
  const offsets = useMemo(() => {
    const out: number[] = [];
    let acc = 0;
    for (const stride of strides) {
      out.push(acc);
      acc += stride;
    }
    return out;
  }, [strides]);
  const contentHeight = useMemo(() => strides.reduce((sum, s) => sum + s, 0), [strides]);

  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const activeIndex = useSharedValue(-1);
  // True between a committing drop and the reordered rows rendering: keeps the
  // drag transforms frozen at the drop layout so the handoff to the new order is
  // seamless (see the row gesture's onEnd/onFinalize and the reset effect below).
  const committing = useSharedValue(false);
  const panY = useSharedValue(0);
  const scrollY = useSharedValue(0);
  const dragStartScrollY = useSharedValue(0);
  const pointerAbsY = useSharedValue(0);

  // Effective displacement of the dragged block: pan plus any auto-scroll that
  // happened since the drag began, so target math tracks auto-scroll for free.
  const ty = useDerivedValue(() => panY.value + (scrollY.value - dragStartScrollY.value));
  const targetIndex = useDerivedValue(() =>
    activeIndex.value < 0
      ? -1
      : computeReorderTargetIndex(strides, offsets, activeIndex.value, ty.value),
  );

  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  const [scrollEnabled, setScrollEnabled] = useState(true);
  const setScrollEnabledJS = useCallback((enabled: boolean) => setScrollEnabled(enabled), []);

  // Set when a committing drop fires; cleared by the reset effect once the new
  // order has rendered. Guards the effect so it only releases the frozen drag
  // transforms on the render that actually applies the reorder.
  const pendingReset = useRef(false);
  const handleCommit = useCallback(
    (fromItemIndex: number, toItemIndex: number) => {
      if (fromItemIndex >= 0 && toItemIndex >= 0 && fromItemIndex !== toItemIndex) {
        pendingReset.current = true;
        onMoveItem(fromItemIndex, toItemIndex);
      }
    },
    [onMoveItem],
  );

  // Release the frozen drag transforms only after the reordered `items` have
  // rendered. Because the drag preview already lays rows out at their post-move
  // positions, resetting translateY to 0 here is a no-op visually — the rows are
  // already where the new array order places them, so there is no snap-back.
  useEffect(() => {
    if (!pendingReset.current) return;
    pendingReset.current = false;
    committing.value = false;
    // Writing Reanimated shared values from an effect is the supported API; the
    // compiler's immutability rule flags it as a mutation regardless.
    // eslint-disable-next-line react-hooks/immutability
    activeIndex.value = -1;
    panY.value = 0;
  }, [items, committing, activeIndex, panY]);

  // One selection tick each time the drop target changes, guarded so the
  // reset-to-idle (-1) transition on release doesn't fire a phantom tick.
  useAnimatedReaction(
    () => targetIndex.value,
    (curr, prev) => {
      if (activeIndex.value >= 0 && curr >= 0 && prev != null && curr !== prev) {
        runOnJS(fireSelectionHaptic)();
      }
    },
  );

  // Auto-scroll while the pointer is near a viewport edge during a drag.
  useFrameCallback(() => {
    'worklet';
    if (activeIndex.value < 0 || committing.value) return;
    const frame = measure(scrollRef);
    if (frame === null) return;
    const pointer = pointerAbsY.value;
    let delta = 0;
    if (pointer < frame.pageY + AUTO_SCROLL_EDGE) delta = -AUTO_SCROLL_SPEED;
    else if (pointer > frame.pageY + frame.height - AUTO_SCROLL_EDGE) delta = AUTO_SCROLL_SPEED;
    if (delta === 0) return;
    const maxScroll = Math.max(0, contentHeight - frame.height);
    const next = Math.min(maxScroll, Math.max(0, scrollY.value + delta));
    scrollTo(scrollRef, 0, next, false);
  });

  const headerTopPad =
    Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) + 8 : insets.top + 8;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onDone}
    >
      <GestureHandlerRootView className="flex-1 bg-background">
        <View
          className="flex-row items-center justify-between px-4 pb-3 border-b border-border-subtle"
          style={{ paddingTop: headerTopPad }}
        >
          <Text className="text-lg font-semibold text-text-primary">Reorder exercises</Text>
          <Pressable
            onPress={onDone}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Done reordering"
          >
            <Text className="text-base font-semibold" style={{ color: accent }}>
              Done
            </Text>
          </Pressable>
        </View>

        <Animated.ScrollView
          ref={scrollRef}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          scrollEnabled={scrollEnabled}
          contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 24 }}
        >
          {items.map((item, index) => (
            <ReorderItemRow
              key={item.key}
              item={item}
              index={index}
              exercisesById={exercisesById}
              railColor={railColorByItemKey.get(item.key) ?? null}
              getImageSource={getImageSource}
              strides={strides}
              activeIndex={activeIndex}
              committing={committing}
              ty={ty}
              targetIndex={targetIndex}
              panY={panY}
              pointerAbsY={pointerAbsY}
              scrollY={scrollY}
              dragStartScrollY={dragStartScrollY}
              onCommit={handleCommit}
              setScrollEnabled={setScrollEnabledJS}
            />
          ))}
        </Animated.ScrollView>
      </GestureHandlerRootView>
    </Modal>
  );
}

export default React.memo(WorkoutReorderList);
