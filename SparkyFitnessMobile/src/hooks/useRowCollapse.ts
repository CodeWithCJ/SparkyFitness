import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';

const ROW_COLLAPSE_DURATION = 300;

/**
 * Collapses a list row to zero height after a delete, then fires `onCollapsed`
 * (e.g. cache invalidation) once the animation lands. Attach `handleLayout`
 * and `animatedStyle` to the row's outer Animated.View and call `collapse()`
 * on delete success.
 */
export function useRowCollapse(onCollapsed: () => void) {
  const rowHeight = useSharedValue<number | null>(null);
  const isRemoving = useSharedValue(false);

  const collapse = () => {
    isRemoving.value = true;
    rowHeight.value = withTiming(0, { duration: ROW_COLLAPSE_DURATION }, (finished) => {
      if (finished) {
        runOnJS(onCollapsed)();
      }
    });
  };

  // Declared before useAnimatedStyle so the rowHeight mutation here is not seen
  // as modifying a value already consumed by a hook (a React compiler bailout).
  const handleLayout = (event: { nativeEvent: { layout: { height: number } } }) => {
    if (rowHeight.value === null) {
      rowHeight.value = event.nativeEvent.layout.height;
    }
  };

  const animatedStyle = useAnimatedStyle(() => {
    if (!isRemoving.value || rowHeight.value === null) {
      return {};
    }
    return {
      height: rowHeight.value,
      overflow: 'hidden' as const,
    };
  });

  return { collapse, handleLayout, animatedStyle };
}
