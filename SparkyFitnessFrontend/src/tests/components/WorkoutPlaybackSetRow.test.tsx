import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import WorkoutPlaybackSetRow from '@/pages/Diary/WorkoutPlaybackSetRow';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      key: string,
      defaultValue?: string,
      options?: Record<string, string | number>
    ) => {
      const values = options ?? {};
      const labels: Record<string, string> = {
        'common.reps': 'التكرارات',
        'common.weight': 'الوزن',
        'workout.notesPlaceholder': 'أضف ملاحظة لهالمجموعة…',
      };

      const actions: Record<string, string> = {
        completeSet: 'إكمال المجموعة',
        selectSet: 'اختيار المجموعة',
        typeSet: 'نوع المجموعة',
        repsSet: 'تكرارات المجموعة',
        weightSet: 'وزن المجموعة',
        editRest: 'تعديل راحة المجموعة',
        toggleNotes: 'إظهار أو إخفاء ملاحظات المجموعة',
        removeSet: 'حذف المجموعة',
        notesSet: 'ملاحظات المجموعة',
      };

      const action = key.split('.').at(-1) ?? '';
      if (action === 'selectSet') {
        return `اختيار المجموعة ${values['setNumber']} لتمرين ${values['exerciseName']}`;
      }
      if (action === 'removeSet') {
        return `حذف المجموعة ${values['setNumber']} من تمرين ${values['exerciseName']}`;
      }
      if (actions[action]) {
        return `${actions[action]} ${values['setNumber']}`;
      }

      if (key === 'exercise.workoutPlaybackDialog.setRow') {
        return `المجموعة ${values['setNumber']}`;
      }

      return labels[key] ?? defaultValue ?? key;
    },
  }),
}));

jest.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => children,
  SelectTrigger: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  SelectValue: () => <span>مجموعة عمل</span>,
  SelectContent: ({ children }: { children: React.ReactNode }) => children,
  SelectItem: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

jest.mock('@/components/ui/UnitInput', () => ({
  UnitInput: ({ 'aria-label': ariaLabel }: { 'aria-label': string }) => (
    <input aria-label={ariaLabel} />
  ),
}));

describe('WorkoutPlaybackSetRow', () => {
  it('localizes every set control and uses a neutral rest clock', () => {
    render(
      <WorkoutPlaybackSetRow
        exerciseName="ضغط صدر"
        exerciseKey="exercise-1"
        exerciseIndex={0}
        setIndex={0}
        setNumber={1}
        setType="Working Set"
        reps={8}
        weight={60}
        restTime={45}
        notes=""
        completed={false}
        isNotesVisible
        onToggleNotesVisibility={jest.fn()}
        onSelectSet={jest.fn()}
        onCompleteSet={jest.fn()}
        onUncompleteSet={jest.fn()}
        onSetFieldChange={jest.fn()}
        onOpenRestEditor={jest.fn()}
        onRemoveSet={jest.fn()}
        canRemove
        weightUnit="kg"
      />
    );

    expect(
      screen.getByRole('checkbox', { name: 'إكمال المجموعة 1' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'اختيار المجموعة 1 لتمرين ضغط صدر',
      })
    ).toHaveTextContent('المجموعة 1');
    expect(screen.getByLabelText('تكرارات المجموعة 1')).toHaveValue(8);
    expect(screen.getByLabelText('وزن المجموعة 1')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'تعديل راحة المجموعة 1' })
    ).toHaveTextContent('0:45');
    expect(screen.getByLabelText('ملاحظات المجموعة 1')).toHaveAttribute(
      'placeholder',
      'أضف ملاحظة لهالمجموعة…'
    );
  });
});
