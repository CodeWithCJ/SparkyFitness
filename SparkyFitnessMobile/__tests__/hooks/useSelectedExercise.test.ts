import { renderHook } from '@testing-library/react-native';
import { useSelectedExercise } from '../../src/hooks/useSelectedExercise';
import type { Exercise } from '../../src/types/exercise';

const makeExercise = (overrides?: Partial<Exercise>): Exercise => ({
  id: 'ex-1',
  name: 'Bench Press',
  category: 'Strength',
  equipment: ['barbell'],
  primary_muscles: ['chest'],
  secondary_muscles: ['triceps'],
  calories_per_hour: 400,
  source: 'system',
  images: [],
  tags: [],
  ...overrides,
});

describe('useSelectedExercise', () => {
  it('calls onSelect when selectedExercise and nonce are provided', () => {
    const onSelect = jest.fn();
    const exercise = makeExercise();

    renderHook(() =>
      useSelectedExercise({ selectedExercise: exercise, selectionNonce: 1 }, onSelect),
    );

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(exercise);
  });

  it('does not call onSelect when params are undefined', () => {
    const onSelect = jest.fn();

    renderHook(() => useSelectedExercise(undefined, onSelect));

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('does not call onSelect when selectedExercise is undefined', () => {
    const onSelect = jest.fn();

    renderHook(() =>
      useSelectedExercise({ selectedExercise: undefined, selectionNonce: 1 }, onSelect),
    );

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('does not call onSelect when selectionNonce is undefined', () => {
    const onSelect = jest.fn();
    const exercise = makeExercise();

    renderHook(() =>
      useSelectedExercise({ selectedExercise: exercise, selectionNonce: undefined }, onSelect),
    );

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('does not call onSelect again for the same nonce', () => {
    const onSelect = jest.fn();
    const exercise = makeExercise();

    const { rerender } = renderHook(
      ({ params, onSelectFn }) => useSelectedExercise(params, onSelectFn),
      {
        initialProps: {
          params: { selectedExercise: exercise, selectionNonce: 1 },
          onSelectFn: onSelect,
        },
      },
    );

    expect(onSelect).toHaveBeenCalledTimes(1);

    // Rerender with same nonce
    rerender({
      params: { selectedExercise: exercise, selectionNonce: 1 },
      onSelectFn: onSelect,
    });

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('calls onSelect again when nonce changes', () => {
    const onSelect = jest.fn();
    const exercise1 = makeExercise({ id: 'ex-1', name: 'Bench' });
    const exercise2 = makeExercise({ id: 'ex-2', name: 'Squat' });

    const { rerender } = renderHook(
      ({ params, onSelectFn }) => useSelectedExercise(params, onSelectFn),
      {
        initialProps: {
          params: { selectedExercise: exercise1, selectionNonce: 1 },
          onSelectFn: onSelect,
        },
      },
    );

    expect(onSelect).toHaveBeenCalledTimes(1);

    rerender({
      params: { selectedExercise: exercise2, selectionNonce: 2 },
      onSelectFn: onSelect,
    });

    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onSelect).toHaveBeenLastCalledWith(exercise2);
  });
});
