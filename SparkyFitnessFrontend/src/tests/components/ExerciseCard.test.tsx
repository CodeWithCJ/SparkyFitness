import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ExerciseCard from '@/pages/Diary/ExerciseCard';

const mockUseExerciseEntries = jest.fn();

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue?: string) => {
      const translations: Record<string, string> = {
        'exerciseCard.title': 'النشاط والتمارين',
        'exerciseCard.loadingExercises': 'جارٍ تحميل تمارينك…',
        'exerciseCard.startWorkout': 'ابدأ تمرينك',
        'exerciseCard.addExercise': 'أضف تمرين',
        'exerciseCard.noEntries': 'ما سجلت أي تمرين لهاليوم.',
        'units.kcal': 'سعرة حرارية',
      };

      return translations[key] ?? defaultValue ?? key;
    },
  }),
}));

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({ activeUserId: 'user-1' }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    loggingLevel: 'ERROR',
    energyUnit: 'kcal',
    convertEnergy: (value: number) => value,
    getEnergyUnitString: (unit: string) => unit,
  }),
}));

jest.mock('@/hooks/Exercises/useExerciseEntries', () => ({
  useExerciseEntries: (...args: unknown[]) => mockUseExerciseEntries(...args),
  useDeleteExerciseEntryMutation: () => ({ mutateAsync: jest.fn() }),
  useDeleteExercisePresetEntryMutation: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ fetchQuery: jest.fn() }),
}));

jest.mock('@workspace/shared', () => ({
  resolveExerciseCalories: () => ({ calories: 0 }),
}));

jest.mock('@/hooks/Exercises/useExercises', () => ({
  exerciseByIdOptions: jest.fn(),
}));

jest.mock('@/utils/workoutPlayback', () => ({
  createWorkoutPlaybackRouteState: jest.fn(),
}));

jest.mock('@/pages/Diary/EditExerciseEntryDialog', () => () => null);
jest.mock('@/pages/Diary/ExercisePlaybackModal', () => () => null);
jest.mock('@/pages/Diary/ExerciseEntryDisplay', () => () => null);
jest.mock('@/pages/Diary/ExercisePresetEntryDisplay', () => () => null);
jest.mock('@/pages/Diary/EditExerciseDatabaseDialog', () => () => null);
jest.mock('@/pages/Exercises/AddExerciseDialog', () => () => null);
jest.mock('@/pages/Diary/LogExerciseEntryDialog', () => () => null);

describe('ExerciseCard', () => {
  it('shows a localized accessible loading state', () => {
    mockUseExerciseEntries.mockReturnValue({
      data: undefined,
      isLoading: true,
    });

    render(
      <ExerciseCard selectedDate="2026-07-10" onExercisesLogged={jest.fn()} />
    );

    expect(
      screen.getByRole('status', { name: 'جارٍ تحميل تمارينك…' })
    ).toBeInTheDocument();
  });

  it('gives the icon-only workout actions Arabic accessible names', () => {
    mockUseExerciseEntries.mockReturnValue({ data: [], isLoading: false });

    render(
      <ExerciseCard selectedDate="2026-07-10" onExercisesLogged={jest.fn()} />
    );

    expect(
      screen.getByRole('button', { name: 'ابدأ تمرينك' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'أضف تمرين' })
    ).toBeInTheDocument();
    expect(screen.getByText('ما سجلت أي تمرين لهاليوم.')).toBeInTheDocument();
  });
});
