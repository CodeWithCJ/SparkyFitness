import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { ExerciseEntryResponse } from '@workspace/shared';
import WorkoutReorderList, {
  computeReorderTargetIndex,
  REORDER_ROW_HEIGHT,
  REORDER_ITEM_GAP,
} from '../../src/components/WorkoutReorderList';
import { moveSessionExerciseItem } from '../../src/utils/workoutSession';
import type { WorkoutCardExercise } from '../../src/utils/workoutSession';

const insets = { top: 47, bottom: 34, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

const getImageSource = jest.fn(() => ({ uri: 'mock' }));

function makeCard(
  id: string,
  setCount: number,
  group: number | null = null,
): WorkoutCardExercise {
  return {
    id,
    exercise_id: `ex-${id}`,
    superset_group: group,
    exercise_snapshot: { name: id.toUpperCase(), category: 'Strength', images: [] },
    sets: Array.from({ length: setCount }, (_, i) => ({
      id: `${id}-s${i}`,
      set_number: i + 1,
      weight: null,
      reps: null,
    })),
  };
}

function renderList(exercises: WorkoutCardExercise[], overrides?: Partial<Parameters<typeof WorkoutReorderList>[0]>) {
  const onMoveItem = jest.fn();
  const onDone = jest.fn();
  const utils = render(
    <SafeAreaProvider initialMetrics={{ insets, frame }}>
      <WorkoutReorderList
        visible
        exercises={exercises}
        getImageSource={getImageSource}
        onMoveItem={onMoveItem}
        onDone={onDone}
        {...overrides}
      />
    </SafeAreaProvider>,
  );
  return { ...utils, onMoveItem, onDone };
}

describe('WorkoutReorderList', () => {
  // A(3), B(2, g1), C(4, g1), D(1) → items [A], [B,C run], [D].
  const exercises = [makeCard('a', 3), makeCard('b', 2, 1), makeCard('c', 4, 1), makeCard('d', 1)];

  it('renders one row per exercise', () => {
    const { getAllByTestId } = renderList(exercises);
    expect(getAllByTestId(/^reorder-row-/)).toHaveLength(4);
  });

  it('renders one drag handle per item (run members share the run handle)', () => {
    const { getAllByTestId, getByTestId } = renderList(exercises);
    expect(getAllByTestId(/^reorder-handle-/)).toHaveLength(3);
    // Run handle is keyed by the run's first member id.
    expect(getByTestId('reorder-handle-b')).toBeTruthy();
  });

  it('renders a superset rail for the run only', () => {
    const { getAllByTestId, getByTestId } = renderList(exercises);
    expect(getAllByTestId(/^reorder-superset-rail-/)).toHaveLength(1);
    expect(getByTestId('reorder-superset-rail-b')).toBeTruthy();
  });

  it('shows the per-row set count', () => {
    const { getByText } = renderList(exercises);
    expect(getByText('3 sets')).toBeTruthy();
    expect(getByText('2 sets')).toBeTruthy();
    expect(getByText('4 sets')).toBeTruthy();
    expect(getByText('1 set')).toBeTruthy();
  });

  it('invokes onDone when Done is pressed', () => {
    const { getByText, onDone } = renderList(exercises);
    fireEvent.press(getByText('Done'));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  describe('computeReorderTargetIndex', () => {
    // Member counts [1, 3, 1] → mixed strides.
    const strides = [1, 3, 1].map((n) => n * REORDER_ROW_HEIGHT + REORDER_ITEM_GAP);
    // strides = [72, 200, 72]; offsets = [0, 72, 272].
    const offsets = [0, 72, 272];

    it('is a no-op (returns activeIndex) with no displacement', () => {
      expect(computeReorderTargetIndex(strides, offsets, 1, 0)).toBe(1);
    });

    it('moves a top solo down past one item then past both', () => {
      expect(computeReorderTargetIndex(strides, offsets, 0, 150)).toBe(1);
      expect(computeReorderTargetIndex(strides, offsets, 0, 300)).toBe(2);
    });

    it('moves a bottom solo up past one item then past both', () => {
      expect(computeReorderTargetIndex(strides, offsets, 2, -150)).toBe(1);
      expect(computeReorderTargetIndex(strides, offsets, 2, -300)).toBe(0);
    });

    it('clamps to the ends for extreme displacement', () => {
      expect(computeReorderTargetIndex(strides, offsets, 0, 100_000)).toBe(2);
      expect(computeReorderTargetIndex(strides, offsets, 2, -100_000)).toBe(0);
    });
  });

  describe('convention agrees with moveSessionExerciseItem', () => {
    // exercises: [A solo, B/C/D run(g1), E solo] → member counts [1, 3, 1].
    const sEntry = (id: string, group: number | null): ExerciseEntryResponse =>
      ({ id, superset_group: group }) as unknown as ExerciseEntryResponse;
    const session = [
      sEntry('A', null),
      sEntry('B', 1),
      sEntry('C', 1),
      sEntry('D', 1),
      sEntry('E', null),
    ];
    const strides = [1, 3, 1].map((n) => n * REORDER_ROW_HEIGHT + REORDER_ITEM_GAP);
    const offsets = [0, 72, 272];

    it('drops the top solo below the run (down)', () => {
      const to = computeReorderTargetIndex(strides, offsets, 0, 150);
      const moved = moveSessionExerciseItem(session, 0, to);
      expect(moved.map((e) => e.id)).toEqual(['B', 'C', 'D', 'A', 'E']);
    });

    it('drops the bottom solo above the run (up)', () => {
      const to = computeReorderTargetIndex(strides, offsets, 2, -150);
      const moved = moveSessionExerciseItem(session, 2, to);
      expect(moved.map((e) => e.id)).toEqual(['A', 'E', 'B', 'C', 'D']);
    });
  });
});
