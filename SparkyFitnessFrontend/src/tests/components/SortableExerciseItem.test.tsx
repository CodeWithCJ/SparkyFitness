import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SortableExerciseItem } from '@/pages/Exercises/SortableExerciseItem';
import type { SortableExerciseItemData } from '@/types/workout';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue?: string) => defaultValue,
  }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({ distanceUnit: 'km' }),
}));

// Only rendered for non-cardio exercises, and its import chain initializes i18n.
jest.mock('@/components/ExerciseHistoryDisplay', () => ({
  __esModule: true,
  default: () => null,
}));

const createCardioExercise = (
  duration: number | undefined
): SortableExerciseItemData =>
  ({
    id: 'entry-1',
    exercise_id: 'exercise-1',
    exercise_name: 'Treadmill Run',
    category: 'cardio',
    sets: [{ set_number: 1, duration }],
  }) as unknown as SortableExerciseItemData;

const renderItem = (ex: SortableExerciseItemData, onSetChange = jest.fn()) => {
  render(
    <SortableExerciseItem
      ex={ex}
      exerciseIndex={0}
      onRemoveExercise={() => {}}
      onSetChange={onSetChange}
      onDuplicateSet={() => {}}
      onRemoveSet={() => {}}
      weightUnit="kg"
    />
  );
  return onSetChange;
};

const durationInput = () =>
  screen
    .getByText(/Duration \(min\)/)
    .closest('div')!
    .querySelector('input') as HTMLInputElement;

describe('SortableExerciseItem cardio duration boundary', () => {
  it('displays per-set duration seconds as minutes', () => {
    renderItem(createCardioExercise(300));

    expect(durationInput()).toHaveValue(5);
  });

  it('stores an entered minute value as seconds on set 0', () => {
    const onSetChange = renderItem(createCardioExercise(undefined));

    const input = durationInput();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '5' } });

    expect(onSetChange).toHaveBeenLastCalledWith(0, 0, 'duration', 300);
  });

  it('rounds a fractional minute entry to whole seconds', () => {
    const onSetChange = renderItem(createCardioExercise(undefined));

    const input = durationInput();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '1.25' } });

    expect(onSetChange).toHaveBeenLastCalledWith(0, 0, 'duration', 75);
  });
});
