import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import AddWorkoutPlanDialog from '@/pages/Exercises/AddWorkoutPlanDialog';
import { toast } from '@/hooks/use-toast';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue?: string) => {
      const translations: Record<string, string> = {
        'addWorkoutPlanDialog.addTitle': 'خطة تمرين جديدة',
        'addWorkoutPlanDialog.addDescription':
          'رتّب تمارينك على أيام الأسبوع وحدد مدة الخطة.',
        'addWorkoutPlanDialog.planNameLabel': 'اسم الخطة',
        'addWorkoutPlanDialog.planNamePlaceholder': 'مثال: خطة 3 أيام',
        'addWorkoutPlanDialog.descriptionLabel': 'وصف الخطة',
        'addWorkoutPlanDialog.descriptionPlaceholder': 'وش تبي تحقق من هالخطة؟',
        'addWorkoutPlanDialog.startDateLabel': 'تاريخ البداية',
        'addWorkoutPlanDialog.endDateLabel': 'تاريخ النهاية (اختياري)',
        'addWorkoutPlanDialog.setActiveLabel': 'تفعيل الخطة من تاريخ البداية',
        'addWorkoutPlanDialog.noteTitle': 'وش يصير للتسجيلات؟',
        'addWorkoutPlanDialog.noteDescription':
          'إذا عدّلت خطة مفعّلة، نحدّث التمارين الجاية بس.',
        'addWorkoutPlanDialog.assignmentsTitle': 'جدول الأسبوع',
        'addWorkoutPlanDialog.addExerciseButtonInDay': 'إضافة تمرين',
        'addWorkoutPlanDialog.cancelButton': 'إلغاء',
        'addWorkoutPlanDialog.saveButton': 'حفظ الخطة',
        'addWorkoutPlanDialog.validationErrorTitle': 'بيانات ناقصة',
        'addWorkoutPlanDialog.validationErrorDescription':
          'اكتب اسم الخطة وحدد تاريخ البداية.',
        'common.sunday': 'الأحد',
        'common.monday': 'الاثنين',
        'common.tuesday': 'الثلاثاء',
        'common.wednesday': 'الأربعاء',
        'common.thursday': 'الخميس',
        'common.friday': 'الجمعة',
        'common.saturday': 'السبت',
      };
      return translations[key] ?? defaultValue ?? key;
    },
  }),
}));

jest.mock('@/hooks/Exercises/useWorkoutPlanAssignments', () => ({
  useWorkoutPlanAssignments: () => ({
    assignments: [],
    workoutPresets: [],
    copiedAssignment: null,
    isAddExerciseDialogOpen: false,
    setIsAddExerciseDialogOpen: jest.fn(),
    setSelectedDayForAssignment: jest.fn(),
    handleRemoveAssignment: jest.fn(),
    handleSetChangeInPlan: jest.fn(),
    handleAddSetInPlan: jest.fn(),
    handleDuplicateSetInPlan: jest.fn(),
    handleRemoveSetInPlan: jest.fn(),
    handleDragEnd: jest.fn(),
    handleAddExerciseOrPreset: jest.fn(),
    handleCopyAssignment: jest.fn(),
    handlePasteAssignment: jest.fn(),
    buildAssignmentsForSave: () => [],
  }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({ weightUnit: 'kg' }),
}));

jest.mock('@/hooks/use-toast', () => ({ toast: jest.fn() }));

jest.mock('@/pages/Exercises/AddExerciseDialog', () => () => null);
jest.mock('@/pages/Exercises/SortableExerciseItem', () => ({
  SortableExerciseItem: () => null,
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
}));

describe('AddWorkoutPlanDialog', () => {
  it('renders a natural Arabic weekly plan form and localized validation', () => {
    render(
      <AddWorkoutPlanDialog isOpen onClose={jest.fn()} onSave={jest.fn()} />
    );

    expect(
      screen.getByRole('heading', { name: 'خطة تمرين جديدة' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('اسم الخطة')).toHaveAttribute(
      'placeholder',
      'مثال: خطة 3 أيام'
    );
    expect(screen.getByLabelText('وصف الخطة')).toHaveAttribute(
      'placeholder',
      'وش تبي تحقق من هالخطة؟'
    );
    expect(screen.getByText('الأحد')).toBeInTheDocument();
    expect(screen.getByText('الجمعة')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('وش يصير للتسجيلات؟');

    fireEvent.click(screen.getByRole('button', { name: 'حفظ الخطة' }));
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'بيانات ناقصة',
        description: 'اكتب اسم الخطة وحدد تاريخ البداية.',
      })
    );
  });
});
