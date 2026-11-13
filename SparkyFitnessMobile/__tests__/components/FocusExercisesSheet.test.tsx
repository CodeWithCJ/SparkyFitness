import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { PresetSessionResponse } from '@workspace/shared';
import FocusExercisesSheet, {
  exercisesItemHeight,
  EXERCISES_ROW_HEIGHT,
} from '../../src/components/FocusExercisesSheet';

const insets = { top: 47, bottom: 34, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

type Exercise = PresetSessionResponse['exercises'][number];

function makeExercise(
  id: string,
  setCount: number,
  group: number | null = null
): Exercise {
  return {
    id,
    exercise_id: `ex-${id}`,
    superset_group: group,
    exercise_snapshot: {
      name: id.toUpperCase(),
      category: 'Strength',
      images: [],
    },
    sets: Array.from({ length: setCount }, (_, i) => ({
      id: `${id}-s${i}`,
      set_number: i + 1,
      weight: null,
      reps: null,
    })),
  } as unknown as Exercise;
}

function renderSheet(
  overrides: Partial<Parameters<typeof FocusExercisesSheet>[0]> = {}
) {
  const props = {
    visible: true,
    exercises: [
      makeExercise('bench', 2),
      makeExercise('tri', 2, 1),
      makeExercise('lat', 2, 1),
    ],
    completedSetIds: { 'bench-s0': 1, 'bench-s1': 2 },
    selectedId: 'bench',
    undo: { detail: 'BENCH · 80 kg × 8', onUndo: jest.fn() },
    groupColor: '#c9a0f0',
    onSelectExercise: jest.fn(),
    onMoveItem: jest.fn(),
    onAddExercise: jest.fn(),
    onEndWorkout: jest.fn(),
    onClose: jest.fn(),
    ...overrides,
  };
  const utils = render(
    <SafeAreaProvider initialMetrics={{ insets, frame }}>
      <FocusExercisesSheet {...props} />
    </SafeAreaProvider>
  );
  return { ...utils, props };
}

describe('FocusExercisesSheet', () => {
  it('lists exercises with progress and superset badges', () => {
    const { getByText, getAllByText } = renderSheet();
    expect(getByText('BENCH')).toBeTruthy();
    expect(getByText('2/2 sets')).toBeTruthy();
    expect(getByText('A1')).toBeTruthy();
    expect(getByText('A2')).toBeTruthy();
    expect(getAllByText('Superset').length).toBeGreaterThan(0);
  });

  it('sizes a superset item around its members', () => {
    expect(
      exercisesItemHeight({ key: 'a', entryIds: ['x'], groupId: null })
    ).toBe(EXERCISES_ROW_HEIGHT);
    expect(
      exercisesItemHeight({ key: 'g', entryIds: ['x', 'y'], groupId: 1 })
    ).toBeGreaterThan(2 * EXERCISES_ROW_HEIGHT);
  });

  it('selects an exercise and closes', () => {
    const { getByTestId, props } = renderSheet();
    fireEvent.press(getByTestId('focus-exercise-row-lat'));
    expect(props.onClose).toHaveBeenCalled();
    expect(props.onSelectExercise).toHaveBeenCalledWith('lat');
  });

  it('undoes the last logged set, adds an exercise and ends the workout', () => {
    const { getByTestId, getByText, props } = renderSheet();
    fireEvent.press(getByTestId('focus-exercises-undo'));
    expect(props.undo?.onUndo).toHaveBeenCalled();
    fireEvent.press(getByText('Add exercise'));
    expect(props.onAddExercise).toHaveBeenCalled();
    fireEvent.press(getByText('End workout'));
    expect(props.onEndWorkout).toHaveBeenCalled();
    fireEvent.press(getByText('Back to workout'));
    expect(props.onClose).toHaveBeenCalled();
  });

  it('hides Undo set until a set is logged', () => {
    const { queryByTestId } = renderSheet({ undo: null });
    expect(queryByTestId('focus-exercises-undo')).toBeNull();
  });
});
