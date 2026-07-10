import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import LogExerciseEntryDialog from '@/pages/Diary/LogExerciseEntryDialog';
import type { ExerciseToLog } from '@/types/workout';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      key: string,
      defaultValue?: string,
      options?: Record<string, string>
    ) => {
      const values = options ?? {};
      const translations: Record<string, string> = {
        'exercise.logExerciseEntryDialog.addSet': 'إضافة مجموعة',
        'exercise.logExerciseEntryDialog.sessionNotes': 'ملاحظات التمرين',
        'exercise.logExerciseEntryDialog.notesPlaceholder':
          'اكتب ملاحظاتك عن هالتمرين…',
        'exercise.logExerciseEntryDialog.caloriesAutoHint':
          'نحسبها تلقائيًا إذا تركتها فاضية',
        'exercise.logExerciseEntryDialog.avgHeartRateLabel':
          'متوسط النبض (نبضة/دقيقة)',
        'exercise.logExerciseEntryDialog.customActivityDetails':
          'تفاصيل إضافية للنشاط',
        'exercise.logExerciseEntryDialog.uploadImage': 'صورة التمرين',
        'exercise.logExerciseEntryDialog.cancel': 'إلغاء',
        'exercise.logExerciseEntryDialog.saveEntry': 'حفظ التمرين',
        'common.advanced': 'خيارات إضافية',
        'units.kcal': 'سعرة حرارية',
      };

      if (key === 'exercise.logExerciseEntryDialog.logExercise') {
        return `تسجيل تمرين: ${values['exerciseName']}`;
      }
      if (key === 'exercise.logExerciseEntryDialog.enterDetails') {
        return `أدخل تفاصيل تمرينك ليوم ${values['selectedDate']}.`;
      }
      if (key === 'exercise.logExerciseEntryDialog.caloriesBurnedOptional') {
        return `السعرات المحروقة (${values['unit']}، اختياري)`;
      }

      return translations[key] ?? defaultValue ?? key;
    },
  }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    loggingLevel: 'ERROR',
    weightUnit: 'kg',
    distanceUnit: 'km',
    convertDistance: (value: number) => value,
    formatDate: () => '10 يوليو 2026',
  }),
}));

jest.mock('@/hooks/Exercises/useExerciseEntries', () => ({
  useCreateExerciseEntryMutation: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
}));

jest.mock('@/components/ExerciseHistoryDisplay', () => () => null);
jest.mock('@/components/ExerciseActivityDetailsEditor', () => () => null);
jest.mock('@/pages/Exercises/SortableWorkoutSet', () => ({
  SortableSetItem: () => null,
}));
jest.mock('@/pages/Exercises/SetHeader', () => ({
  SetColumnHeaders: () => null,
}));
jest.mock('@/pages/Exercises/CardioLog', () => ({
  CardioLog: () => null,
}));

jest.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => children,
  closestCenter: jest.fn(),
  KeyboardSensor: jest.fn(),
  PointerSensor: jest.fn(),
  useSensor: jest.fn(),
  useSensors: () => [],
}));

jest.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => children,
  sortableKeyboardCoordinates: jest.fn(),
  arrayMove: (items: unknown[]) => items,
}));

jest.mock('uuid', () => ({ v4: () => 'set-1' }));

const exercise = {
  id: 'exercise-1',
  name: 'ضغط صدر',
  category: 'strength',
  sets: [],
  reps: 0,
  weight: 0,
  duration: 0,
} as unknown as ExerciseToLog;

describe('LogExerciseEntryDialog', () => {
  it('renders a Saudi Arabic exercise logging flow', () => {
    render(
      <LogExerciseEntryDialog
        isOpen
        onClose={jest.fn()}
        exercise={exercise}
        selectedDate="2026-07-10"
        onSaveSuccess={jest.fn()}
        energyUnit="kcal"
        convertEnergy={(value) => value}
        getEnergyUnitString={(unit) => unit}
      />
    );

    expect(screen.getByText('تسجيل تمرين: ضغط صدر')).toBeInTheDocument();
    expect(
      screen.getByText('أدخل تفاصيل تمرينك ليوم 10 يوليو 2026.')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'إضافة مجموعة' })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'خيارات إضافية' }));

    expect(
      screen.getByText('السعرات المحروقة (سعرة حرارية، اختياري)')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إلغاء' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'حفظ التمرين' })
    ).toBeInTheDocument();
  });
});
