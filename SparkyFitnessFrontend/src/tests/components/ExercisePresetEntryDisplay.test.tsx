import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ExercisePresetEntryDisplay from '@/pages/Diary/ExercisePresetEntryDisplay';
import type { PresetSessionEntry } from '@/types/exercises';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string | number>) => {
      const translations: Record<string, string> = {
        'exerciseCard.workoutPreset': 'خطة تمرين',
        'exerciseCard.deletePresetEntry': 'حذف الخطة من يومياتك',
        'exerciseCard.duration': 'المدة',
        'exerciseCard.averageHeartRate': 'متوسط النبض',
        'common.totalSets': 'إجمالي المجموعات',
        'units.kcal': 'سعرة حرارية',
        'units.minuteValue': `${options?.['value']} د`,
      };

      if (key === 'exerciseCard.exerciseCount') {
        return `${options?.['count']} تمرين`;
      }
      if (key === 'exerciseCard.expandPreset') {
        return `عرض تمارين ${options?.['name']}`;
      }
      if (key === 'exerciseCard.collapsePreset') {
        return `إخفاء تمارين ${options?.['name']}`;
      }

      return translations[key] ?? key;
    },
  }),
}));

jest.mock('@/pages/Diary/ExerciseEntryDisplay', () => () => (
  <div>exercise entry</div>
));

const presetEntry = {
  id: 'preset-entry-1',
  name: 'تمرين الجزء العلوي',
  exercises: [
    {
      id: 'entry-1',
      calories_burned: 100,
      duration_minutes: 30,
      sets: [],
    },
  ],
} as unknown as PresetSessionEntry;

describe('ExercisePresetEntryDisplay', () => {
  it('localizes the preset summary and exposes its actions', () => {
    render(
      <ExercisePresetEntryDisplay
        presetEntry={presetEntry}
        currentUserId="user-1"
        handleDelete={jest.fn()}
        handleDeleteExerciseEntry={jest.fn()}
        handleEdit={jest.fn()}
        handleEditExerciseDatabase={jest.fn()}
        setExerciseToPlay={jest.fn()}
        setIsPlaybackModalOpen={jest.fn()}
        energyUnit="kcal"
        convertEnergy={(value) => value}
        getEnergyUnitString={(unit) => unit}
      />
    );

    expect(screen.getByText('1 تمرين')).toBeInTheDocument();
    expect(screen.getByText('سعرة حرارية')).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'حذف الخطة من يومياتك',
      })
    ).toBeInTheDocument();

    const toggle = screen.getByRole('button', {
      name: 'عرض تمارين تمرين الجزء العلوي',
    });
    fireEvent.click(toggle);

    expect(
      screen.getByRole('button', {
        name: 'إخفاء تمارين تمرين الجزء العلوي',
      })
    ).toHaveAttribute('aria-expanded', 'true');
  });
});
