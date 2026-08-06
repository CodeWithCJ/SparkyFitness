import { screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { renderWithClient } from '@/tests/test-utils';
import { WorkoutSessionBreakdown } from '@/components/ExerciseCharts/WorkoutSessionBreakdown';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue?: string) => defaultValue,
  }),
  initReactI18next: {
    type: '3rdParty',
    init: jest.fn(),
  },
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({ weightUnit: 'kg' }),
}));

jest.mock('@/hooks/Exercises/useExercises', () => ({
  useBodyMapSvgQuery: () => ({ data: undefined }),
  useGroupedWorkoutSession: () => ({ data: undefined }),
}));

function makeEntry(primaryMuscles: string[] | null) {
  return {
    exercise_preset_entry_id: null,
    exercise_snapshot: {
      name: 'Cycling',
      primary_muscles: primaryMuscles,
      secondary_muscles: null,
    },
    sets: [
      {
        set_number: 1,
        reps: 0,
        weight: 0,
        duration: 611,
        rest_time: 0,
        set_type: 'Working Set',
      },
    ],
  };
}

describe('WorkoutSessionBreakdown muscle-tab gating', () => {
  it('hides the Primary Muscles tab and defaults to Sets for an entry with no muscle data (cardio)', () => {
    renderWithClient(
      <WorkoutSessionBreakdown exerciseEntry={makeEntry(null)} />
    );

    expect(
      screen.queryByRole('button', { name: /Primary Muscles/i })
    ).not.toBeInTheDocument();
    // The Sets tab is the effective default and its content renders.
    expect(screen.getByRole('button', { name: /Sets/i })).toHaveClass(
      'text-primary'
    );
  });

  it('shows the Primary Muscles tab and defaults to it for an entry with real muscle data (strength)', () => {
    renderWithClient(
      <WorkoutSessionBreakdown exerciseEntry={makeEntry(['Quadriceps'])} />
    );

    const musclesTab = screen.getByRole('button', {
      name: /Primary Muscles/i,
    });
    expect(musclesTab).toBeInTheDocument();
    expect(musclesTab).toHaveClass('text-primary');
  });
});
