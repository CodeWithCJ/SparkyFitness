import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import WorkoutPlaybackExercisesList from '@/pages/Diary/WorkoutPlaybackExercisesList';
import type { WorkoutPlaybackExerciseDraft } from '@/utils/workoutPlayback';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      key: string,
      defaultValue?: string,
      options?: Record<string, string | number>
    ) => {
      const translations: Record<string, string> = {
        'exercise.workoutPlaybackPage.completedSets':
          '{{completed}} من {{total}} مجموعة',
        'exercise.workoutPlaybackPage.completed': 'مكتمل',
        'exercise.workoutPlaybackPage.collapseExercise':
          'طي تمرين {{exerciseName}}',
        'exercise.workoutPlaybackPage.expandExercise':
          'عرض تمرين {{exerciseName}}',
        'exercise.workoutPlaybackPage.addSetForExercise':
          'إضافة مجموعة لتمرين {{exerciseName}}',
        'exercise.workoutPlaybackPage.addSet': 'إضافة مجموعة',
      };
      const template = translations[key] ?? defaultValue ?? key;
      return Object.entries(options ?? {}).reduce(
        (value, [name, replacement]) =>
          value.replaceAll(`{{${name}}}`, String(replacement)),
        template
      );
    },
  }),
}));

jest.mock('@/pages/Diary/WorkoutPlaybackSetRow', () => () => (
  <div data-testid="set-row" />
));

const exercises = [
  {
    exercise_id: 'exercise-1',
    exercise_name: 'ضغط صدر',
    sets: [
      {
        set_number: 1,
        completed: true,
        reps: 8,
        weight: 60,
        rest_time: 60,
      },
    ],
  },
] as WorkoutPlaybackExerciseDraft[];

describe('WorkoutPlaybackExercisesList', () => {
  it('uses natural Arabic progress and localized exercise actions', () => {
    render(
      <WorkoutPlaybackExercisesList
        exercises={exercises}
        setNotesVisibility={{}}
        onToggleSetNotesVisibility={jest.fn()}
        onSelectSet={jest.fn()}
        onCompleteSet={jest.fn()}
        onUncompleteSet={jest.fn()}
        onSetFieldChange={jest.fn()}
        onOpenRestEditor={jest.fn()}
        onRemoveSet={jest.fn()}
        onAddSet={jest.fn()}
        weightUnit="kg"
      />
    );

    expect(screen.getByText('1 من 1 مجموعة')).toBeInTheDocument();
    const expandButton = screen.getByRole('button', {
      name: 'عرض تمرين ضغط صدر',
    });
    expect(expandButton.querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true'
    );

    fireEvent.click(expandButton);
    expect(
      screen.getByRole('button', { name: 'طي تمرين ضغط صدر' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'إضافة مجموعة لتمرين ضغط صدر',
      })
    ).toHaveTextContent('إضافة مجموعة');
  });
});
