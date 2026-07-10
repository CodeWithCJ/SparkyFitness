import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import WorkoutPresetForm from '@/pages/Exercises/WorkoutPresetForm';

const handleSubmit = jest.fn();

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue?: string) => {
      const translations: Record<string, string> = {
        'workoutPresetForm.createTitle': 'قالب تمرين جديد',
        'workoutPresetForm.createDescription':
          'احفظ مجموعة تمارين ومجموعاتها عشان تبدأها بسرعة بأي يوم.',
        'workoutPresetForm.nameLabel': 'اسم القالب',
        'workoutPresetForm.namePlaceholder': 'مثال: تمارين الجزء العلوي',
        'workoutPresetForm.shareWithPublicLabel': 'مشاركة القالب مع المجتمع',
        'workoutPresetForm.publicSharingHelp':
          'يقدر مستخدمون آخرون يشوفونه ويستخدمونه، بدون ما يغيرون نسختك.',
        'workoutPresetForm.descriptionLabel': 'وصف القالب',
        'workoutPresetForm.descriptionPlaceholder': 'وش يشمل هالقالب؟',
        'workoutPresetForm.exercisesLabel': 'تمارين القالب',
        'workoutPresetForm.addExerciseButton': 'إضافة تمرين',
        'workoutPresetForm.emptyExercises': 'ابدأ بإضافة أول تمرين للقالب.',
        'workoutPresetForm.createPresetButton': 'حفظ القالب',
        'common.cancel': 'إلغاء',
      };
      return translations[key] ?? defaultValue ?? key;
    },
  }),
}));

jest.mock('@/hooks/Exercises/useWorkoutPresetForm', () => ({
  useWorkoutPresetForm: () => ({
    name: '',
    description: '',
    isPublic: false,
    exercises: [],
    isAddExerciseDialogOpen: false,
    sensors: [],
    setName: jest.fn(),
    setDescription: jest.fn(),
    setIsPublic: jest.fn(),
    setIsAddExerciseDialogOpen: jest.fn(),
    handleAddExercise: jest.fn(),
    handleRemoveExercise: jest.fn(),
    handleSetChange: jest.fn(),
    handleAddSet: jest.fn(),
    handleDuplicateSet: jest.fn(),
    handleRemoveSet: jest.fn(),
    handleReorderSets: jest.fn(),
    handleDragEnd: jest.fn(),
    handleSubmit,
  }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({ weightUnit: 'kg' }),
}));

jest.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => children,
  closestCenter: jest.fn(),
}));

jest.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/pages/Exercises/AddExerciseDialog', () => () => null);
jest.mock('@/pages/Exercises/SortableExerciseItem', () => ({
  SortableExerciseItem: () => null,
}));

describe('WorkoutPresetForm', () => {
  beforeEach(() => handleSubmit.mockReset());

  it('explains the Arabic workout-template flow and its sharing impact', () => {
    render(<WorkoutPresetForm isOpen onClose={jest.fn()} onSave={jest.fn()} />);

    expect(
      screen.getByRole('heading', { name: 'قالب تمرين جديد' })
    ).toBeInTheDocument();
    expect(screen.getByText(/احفظ مجموعة تمارين/)).toBeInTheDocument();
    expect(screen.getByLabelText('اسم القالب')).toHaveAttribute(
      'placeholder',
      'مثال: تمارين الجزء العلوي'
    );
    expect(screen.getByLabelText('وصف القالب')).toHaveAttribute(
      'placeholder',
      'وش يشمل هالقالب؟'
    );
    expect(screen.getByText(/يقدر مستخدمون آخرون/)).toBeInTheDocument();
    expect(
      screen.getByText('ابدأ بإضافة أول تمرين للقالب.')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'حفظ القالب' }));
    expect(handleSubmit).toHaveBeenCalledTimes(1);
  });
});
