import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ExerciseEntryDisplay from '@/pages/Diary/ExerciseEntryDisplay';
import type { ExerciseEntry } from '@/types/exercises';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string | number>) => {
      const translations: Record<string, string> = {
        'exerciseCard.customSource': 'مخصص',
        'exerciseCard.playInstructions': 'تشغيل الإرشادات',
        'exerciseCard.editEntry': 'تعديل السجل',
        'exerciseCard.editExerciseInDatabase':
          'تعديل التمرين في قاعدة البيانات',
        'exerciseCard.deleteEntry': 'حذف السجل',
        'exerciseCard.primaryMusclesLabel': 'العضلات الأساسية',
        'exerciseCard.equipmentLabel': 'الأدوات',
        'units.kcal': 'سعرة حرارية',
      };

      if (key === 'exerciseCard.setsCount') {
        return `${options?.['count']} مجموعة`;
      }
      if (key === 'exerciseCard.repsCount') {
        return `${options?.['count']} تكرارات`;
      }
      if (key === 'exerciseCard.effortRating') {
        return `الجهد ${options?.['value']}`;
      }

      return translations[key] ?? key;
    },
  }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({ weightUnit: 'kg' }),
}));

const exerciseEntry = {
  id: 'entry-1',
  exercise_id: 'exercise-1',
  calories_burned: 120,
  duration_minutes: 30,
  sets: [{ reps: 3, weight: 20, rpe: 7 }],
  exercise_snapshot: {
    id: 'exercise-1',
    name: 'ضغط صدر',
    category: 'strength',
    is_custom: true,
    user_id: 'user-1',
    instructions: ['ادفع الوزن للأعلى'],
    primary_muscles: ['الصدر'],
    equipment: ['بار'],
  },
} as unknown as ExerciseEntry;

describe('ExerciseEntryDisplay', () => {
  it('localizes exercise metadata, units, and record actions', () => {
    render(
      <ExerciseEntryDisplay
        exerciseEntry={exerciseEntry}
        currentUserId="user-1"
        handleEdit={jest.fn()}
        handleDelete={jest.fn()}
        handleEditExerciseDatabase={jest.fn()}
        setExerciseToPlay={jest.fn()}
        setIsPlaybackModalOpen={jest.fn()}
        energyUnit="kcal"
        convertEnergy={(value) => value}
        getEnergyUnitString={(unit) => unit}
      />
    );

    expect(screen.getByText('120 سعرة حرارية')).toBeInTheDocument();
    expect(screen.getByText('1 مجموعة')).toBeInTheDocument();
    expect(screen.getByText(/3 تكرارات/)).toBeInTheDocument();
    expect(screen.getByText(/الجهد 7/)).toBeInTheDocument();
    expect(screen.getByText('مخصص')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'تشغيل الإرشادات' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'تعديل السجل' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'تعديل التمرين في قاعدة البيانات' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'حذف السجل' })
    ).toBeInTheDocument();
  });
});
