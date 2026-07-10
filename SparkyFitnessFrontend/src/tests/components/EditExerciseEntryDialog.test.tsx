import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import EditExerciseEntryDialog from '@/pages/Diary/EditExerciseEntryDialog';
import type { ExerciseEntry } from '@/types/exercises';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue?: string) => {
      const translations: Record<string, string> = {
        'exercise.editExerciseEntryDialog.title': 'تعديل سجل التمرين',
        'exercise.editExerciseEntryDialog.description':
          'عدّل تفاصيل التمرين، وبعدها احفظ تغييراتك.',
        'exercise.editExerciseEntryDialog.exerciseLabel': 'التمرين',
        'exercise.editExerciseEntryDialog.addSetButton': 'إضافة مجموعة',
        'exercise.editExerciseEntryDialog.notesLabel': 'ملاحظات',
        'exercise.editExerciseEntryDialog.notesPlaceholder':
          'اكتب ملاحظاتك عن هالتمرين…',
        'exercise.editExerciseEntryDialog.caloriesBurnedOptionalLabel':
          'السعرات المحروقة (اختياري)',
        'exercise.editExerciseEntryDialog.caloriesBurnedPlaceholder':
          'نحسبها تلقائيًا إذا تركتها فاضية',
        'exercise.editExerciseEntryDialog.useAutomaticCalories':
          'استخدام الحساب التلقائي للسعرات',
        'exercise.editExerciseEntryDialog.avgHeartRateLabel':
          'متوسط النبض (نبضة/دقيقة)',
        'exercise.editExerciseEntryDialog.customActivityDetailsLabel':
          'تفاصيل إضافية للنشاط',
        'exercise.editExerciseEntryDialog.imageLabel': 'صورة التمرين',
        'common.advanced': 'خيارات إضافية',
        'common.cancel': 'إلغاء',
        'common.saveChanges': 'حفظ التغييرات',
      };

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
  }),
}));

jest.mock('@/hooks/Exercises/useExerciseEntries', () => ({
  exerciseDetailsOptions: jest.fn(),
  useUpdateExerciseEntryMutation: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ fetchQuery: jest.fn() }),
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

const entry = {
  id: 'entry-1',
  exercise_id: 'exercise-1',
  calories_burned: 120,
  duration_minutes: 30,
  sets: [],
  exercise_snapshot: {
    name: 'ضغط صدر',
    category: 'strength',
  },
} as unknown as ExerciseEntry;

describe('EditExerciseEntryDialog', () => {
  it('renders an Arabic editing flow with accessible advanced controls', () => {
    render(
      <EditExerciseEntryDialog
        entry={entry}
        open
        onOpenChange={jest.fn()}
        onSave={jest.fn()}
      />
    );

    expect(screen.getByText('تعديل سجل التمرين')).toBeInTheDocument();
    expect(
      screen.getByText('عدّل تفاصيل التمرين، وبعدها احفظ تغييراتك.')
    ).toBeInTheDocument();
    expect(screen.getByLabelText('التمرين')).toHaveValue('ضغط صدر');
    expect(
      screen.getByRole('button', { name: 'إضافة مجموعة' })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'خيارات إضافية' }));

    expect(
      screen.getByRole('button', {
        name: 'استخدام الحساب التلقائي للسعرات',
      })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إلغاء' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'حفظ التغييرات' })
    ).toBeInTheDocument();
  });
});
