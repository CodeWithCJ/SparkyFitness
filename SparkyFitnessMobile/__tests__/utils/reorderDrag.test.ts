/**
 * Drag-preview math for the unified Meal Types reorder list (and the shared
 * WorkoutReorderList algorithm).
 *
 * These are the PURE, worklet-compatible helpers the components use inside
 * useAnimatedStyle / useDerivedValue. Unit-testing them exhaustively covers
 * the physical-device regression: during a drag the NON-active rows must
 * shift to open a live insertion gap (previously every non-active row stayed
 * visually stationary, so dragging moved only the active row).
 */

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../src/components/Icon', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: () => React.createElement(View, { testID: 'icon' }),
  };
});

import {
  computeReorderPreviewShift,
  computeReorderTargetIndex,
} from '../../src/components/WorkoutReorderList';

const ROW = 64;

function strides(n: number): number[] {
  return Array.from({ length: n }, () => ROW);
}

/** Prefix-sum offsets for n equal-stride rows. */
function offsets(n: number): number[] {
  const out: number[] = [];
  let acc = 0;
  for (let i = 0; i < n; i++) {
    out.push(acc);
    acc += ROW;
  }
  return out;
}

describe('computeReorderPreviewShift — sibling gap preview', () => {
  it('returns 0 when no drag is active (activeIndex < 0 or targetIndex < 0)', () => {
    expect(computeReorderPreviewShift(1, -1, -1, ROW)).toBe(0);
    expect(computeReorderPreviewShift(1, 1, -1, ROW)).toBe(0);
    expect(computeReorderPreviewShift(1, -1, 3, ROW)).toBe(0);
  });

  it('returns 0 for the active row itself', () => {
    expect(computeReorderPreviewShift(1, 1, 3, ROW)).toBe(0);
  });

  it('downward drag: rows strictly between active and target shift UP one stride', () => {
    // active = 1, target = 3 → rows 2 and 3 shift -stride; row 4 stays.
    expect(computeReorderPreviewShift(0, 1, 3, ROW)).toBe(0);
    expect(computeReorderPreviewShift(1, 1, 3, ROW)).toBe(0);
    expect(computeReorderPreviewShift(2, 1, 3, ROW)).toBe(-ROW);
    expect(computeReorderPreviewShift(3, 1, 3, ROW)).toBe(-ROW);
    expect(computeReorderPreviewShift(4, 1, 3, ROW)).toBe(0);
    expect(computeReorderPreviewShift(5, 1, 3, ROW)).toBe(0);
  });

  it('upward drag: rows between target and active shift DOWN one stride', () => {
    // active = 3, target = 1 → rows 1 and 2 shift +stride; row 0 stays.
    expect(computeReorderPreviewShift(0, 3, 1, ROW)).toBe(0);
    expect(computeReorderPreviewShift(1, 3, 1, ROW)).toBe(ROW);
    expect(computeReorderPreviewShift(2, 3, 1, ROW)).toBe(ROW);
    expect(computeReorderPreviewShift(3, 3, 1, ROW)).toBe(0);
    expect(computeReorderPreviewShift(4, 3, 1, ROW)).toBe(0);
  });

  it('crossing a system anchor: the anchor shifts as a passive sibling', () => {
    // Unified list [Breakfast(0), A(1), Lunch(2), B(3), Dinner(4)]; A dragged
    // past Lunch (target 2 or 3). Lunch participates in the visual gap shift
    // even though it is a fixed, non-draggable anchor in the data model.
    expect(computeReorderPreviewShift(2, 1, 2, ROW)).toBe(-ROW); // Lunch (target = 2)
    expect(computeReorderPreviewShift(2, 1, 3, ROW)).toBe(-ROW); // Lunch (target = 3)
    expect(computeReorderPreviewShift(3, 1, 3, ROW)).toBe(-ROW); // B
  });

  it('honors the given stride (custom row heights)', () => {
    expect(computeReorderPreviewShift(2, 1, 3, 72)).toBe(-72);
    expect(computeReorderPreviewShift(1, 3, 1, 80)).toBe(80);
  });
});

describe('computeReorderTargetIndex — live target changes while dragging', () => {
  // Unified list: Breakfast(0) A(1) B(2) Lunch(3) C(4) Dinner(5) Snacks(6).
  const s = strides(7);
  const o = offsets(7);

  it('target stays at the origin when the finger has not crossed anything', () => {
    expect(computeReorderTargetIndex(s, o, 1, 0)).toBe(1);
    expect(computeReorderTargetIndex(s, o, 1, 20)).toBe(1);
  });

  it('target advances LIVE with the finger (downward) before release', () => {
    // Crossing B's midpoint → target 2; crossing Lunch → 3; crossing C → 4.
    expect(computeReorderTargetIndex(s, o, 1, 65)).toBe(2);
    expect(computeReorderTargetIndex(s, o, 1, 129)).toBe(3);
    expect(computeReorderTargetIndex(s, o, 1, 193)).toBe(4);
  });

  it('target recedes LIVE with the finger (upward) before release', () => {
    // active = 4 (C, in the Lunch→Dinner gap): dragging up crosses B → 3,
    // then Lunch's midpoint → 2 (back into the Breakfast→Lunch gap).
    expect(computeReorderTargetIndex(s, o, 4, -65)).toBe(3);
    expect(computeReorderTargetIndex(s, o, 4, -129)).toBe(2);
    expect(computeReorderTargetIndex(s, o, 4, -193)).toBe(1);
  });

  it('cross-anchor drop: A to directly after Lunch implies the valid insertion', () => {
    // [Breakfast(0) A(1) Lunch(2) B(3) Dinner(4)].
    const s5 = strides(5);
    const o5 = offsets(5);
    // 100px down crosses Lunch's midpoint (160) but not B's (224) → A lands
    // between Lunch and B.
    expect(computeReorderTargetIndex(s5, o5, 1, 100)).toBe(2);
    // 150px down also crosses B → A lands after B (exact coordinate insertion).
    expect(computeReorderTargetIndex(s5, o5, 1, 150)).toBe(3);
  });

  it('cross-gap reverse: a custom dragged from Lunch→Dinner back into Breakfast→Lunch', () => {
    // active = 4 (C after Lunch). -129px crosses Breakfast and A midpoints,
    // placing C between A and B in the b_l gap (target 2).
    expect(computeReorderTargetIndex(s, o, 4, -129)).toBe(2);
    // A full gap-crossing (-193) lands C directly after Breakfast (target 1).
    expect(computeReorderTargetIndex(s, o, 4, -193)).toBe(1);
  });
});
