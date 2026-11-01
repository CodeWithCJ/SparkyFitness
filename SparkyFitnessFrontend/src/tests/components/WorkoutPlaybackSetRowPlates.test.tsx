import { fireEvent, render, screen } from '@testing-library/react';
import WorkoutPlaybackSetRow from '@/pages/Diary/WorkoutPlaybackSetRow';

const renderRow = (
  props: Partial<React.ComponentProps<typeof WorkoutPlaybackSetRow>> = {}
) => {
  const onOpenPlateCalculator = jest.fn();
  render(
    <WorkoutPlaybackSetRow
      exerciseName="Back Squat"
      exerciseKey="ex-1-0"
      exerciseIndex={0}
      setIndex={2}
      setNumber={3}
      setType="Working Set"
      isTimedExercise={false}
      reps={5}
      weight={100}
      duration={null}
      timerStartedAtMs={null}
      restTime={90}
      notes={null}
      completed={false}
      isNotesVisible={false}
      onToggleNotesVisibility={jest.fn()}
      onSelectSet={jest.fn()}
      onCompleteSet={jest.fn()}
      onUncompleteSet={jest.fn()}
      onSetFieldChange={jest.fn()}
      onOpenRestEditor={jest.fn()}
      onRemoveSet={jest.fn()}
      canRemove
      weightUnit="kg"
      onOpenPlateCalculator={onOpenPlateCalculator}
      {...props}
    />
  );
  return { onOpenPlateCalculator };
};

describe('WorkoutPlaybackSetRow plate calculator action', () => {
  it('opens the calculator for the set of a barbell exercise', () => {
    const { onOpenPlateCalculator } = renderRow({ canCalculatePlates: true });
    fireEvent.click(
      screen.getByRole('button', { name: 'Plate calculator for set 3' })
    );
    expect(onOpenPlateCalculator).toHaveBeenCalledWith({
      exerciseIndex: 0,
      setIndex: 2,
    });
  });

  it('has no plate action for other exercises or timed sets', () => {
    renderRow();
    expect(
      screen.queryByRole('button', { name: /Plate calculator/ })
    ).toBeNull();
  });

  it('has no plate action on a timed set', () => {
    renderRow({ canCalculatePlates: true, isTimedExercise: true });
    expect(
      screen.queryByRole('button', { name: /Plate calculator/ })
    ).toBeNull();
  });
});
