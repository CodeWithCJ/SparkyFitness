import type { SharedValue } from 'react-native-reanimated';

// The global gesture-handler mock in jest.setup.js is a Proxy that swallows every
// handler it is given, so the drag callbacks cannot be reached through it. Capture them
// instead: the pan's `onEnd` decides whether a move commits, which is logic rather than
// device behaviour and belongs under test.
const capturedHandlers: {
  onStart?: () => void;
  onUpdate?: (event: { translationY: number }) => void;
  onEnd?: (event: unknown, success: boolean) => void;
} = {};

jest.mock('react-native-gesture-handler', () => {
  const { View } = require('react-native');
  const makePan = () => {
    const gesture = {
      activateAfterLongPress: () => gesture,
      onStart: (fn: () => void) => {
        capturedHandlers.onStart = fn;
        return gesture;
      },
      onUpdate: (fn: (event: { translationY: number }) => void) => {
        capturedHandlers.onUpdate = fn;
        return gesture;
      },
      onEnd: (fn: (event: unknown, success: boolean) => void) => {
        capturedHandlers.onEnd = fn;
        return gesture;
      },
    };
    return gesture;
  };
  return {
    Gesture: { Pan: makePan },
    GestureDetector: ({ children }: { children: unknown }) => children,
    GestureHandlerRootView: View,
  };
});

import {
  createReorderRowPanGesture,
  REORDER_ROW_HEIGHT,
} from '../../src/components/WorkoutReorderList';

const sharedValue = (value: number) => ({ value }) as SharedValue<number>;

/**
 * Drives one row's pan from its resting state through a drag that crosses the row below
 * it, then ends the gesture the way the caller asks. Returns the shared values so a test
 * can assert on the preview state the drag left behind.
 */
const dragRowAcrossOneTarget = ({
  succeeds,
}: {
  succeeds: boolean;
}): {
  onMove: jest.Mock;
  activeDragIndex: SharedValue<number>;
  panY: SharedValue<number>;
  committingTranslate: SharedValue<number>;
} => {
  const activeDragIndex = sharedValue(-1);
  const panY = sharedValue(0);
  const committingTranslate = sharedValue(0);
  // Held at 1 the way `useDerivedValue` would while the finger sits over the next row.
  const targetIndex = sharedValue(1);
  const onMove = jest.fn();

  createReorderRowPanGesture({
    index: 0,
    activeDragIndex,
    panY,
    committingTranslate,
    targetIndex,
    onMove,
  });

  capturedHandlers.onStart?.();
  capturedHandlers.onUpdate?.({ translationY: REORDER_ROW_HEIGHT });
  capturedHandlers.onEnd?.({}, succeeds);

  return { onMove, activeDragIndex, panY, committingTranslate };
};

describe('createReorderRowPanGesture', () => {
  beforeEach(() => {
    delete capturedHandlers.onStart;
    delete capturedHandlers.onUpdate;
    delete capturedHandlers.onEnd;
  });

  it('commits the move when the drag is dropped on a new target', () => {
    const { onMove, committingTranslate } = dragRowAcrossOneTarget({
      succeeds: true,
    });

    expect(onMove).toHaveBeenCalledWith(0, 1);
    // The active row keeps its final translate until the reordered list renders.
    expect(committingTranslate.value).toBe(REORDER_ROW_HEIGHT);
  });

  // gesture-handler calls `onEnd` with success false when an ACTIVE pan is cancelled or
  // fails, so ignoring that argument reordered the list — and persisted it — on a drag
  // the user never dropped.
  it('commits nothing when the drag is cancelled over a new target', () => {
    const { onMove, activeDragIndex, panY, committingTranslate } =
      dragRowAcrossOneTarget({ succeeds: false });

    expect(onMove).not.toHaveBeenCalled();
    // and the frozen preview is released rather than left floating
    expect(activeDragIndex.value).toBe(-1);
    expect(panY.value).toBe(0);
    expect(committingTranslate.value).toBe(0);
  });
});
