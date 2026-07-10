import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SortableSetItem } from '@/pages/Exercises/SortableWorkoutSet';
import type { SortableSetData } from '@/types/workout';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      key: string,
      defaultValue?: string,
      options?: Record<string, string | number>
    ) => {
      const translations: Record<string, string> = {
        'workout.setType.Working Set': 'مجموعة عمل',
        'workout.setItem.dragSet': 'تحريك المجموعة {{setNumber}}',
        'workout.setItem.typeSet': 'نوع المجموعة {{setNumber}}',
        'workout.setItem.repsSet': 'تكرارات المجموعة {{setNumber}}',
        'workout.setItem.weightSet': 'وزن المجموعة {{setNumber}}',
        'workout.setItem.rpeSet': 'درجة جهد المجموعة {{setNumber}}',
        'workout.setItem.durationSet': 'مدة المجموعة {{setNumber}} بالدقائق',
        'workout.setItem.restSet': 'راحة المجموعة {{setNumber}} بالثواني',
        'workout.setItem.toggleNotes':
          'إظهار أو إخفاء ملاحظات المجموعة {{setNumber}}',
        'workout.setItem.duplicateSet': 'نسخ المجموعة {{setNumber}}',
        'workout.setItem.removeSet': 'حذف المجموعة {{setNumber}}',
        'workout.setItem.notesSet': 'نص ملاحظات المجموعة {{setNumber}}',
        'workout.notesPlaceholder': 'أضف ملاحظة لهالمجموعة…',
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

jest.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: { 'data-sortable': 'true' },
    listeners: {},
    setNodeRef: jest.fn(),
    transform: null,
    transition: undefined,
  }),
}));

jest.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => undefined } },
}));

jest.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => children,
  SelectTrigger: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLDivElement>) => (
    <div role="button" {...props}>
      {children}
    </div>
  ),
  SelectValue: () => null,
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

const set = {
  id: 'set-1',
  set_number: 1,
  set_type: 'Working Set',
  reps: 8,
  weight: 60,
  rpe: 7,
  duration: 1,
  rest_time: 90,
  notes: '',
} as SortableSetData;

describe('SortableSetItem', () => {
  it('localizes set values and exposes every row action', () => {
    render(
      <SortableSetItem
        id="set-1"
        set={set}
        exerciseIndex={0}
        setIndex={0}
        onSetChange={jest.fn()}
        onDuplicateSet={jest.fn()}
        onRemoveSet={jest.fn()}
        weightUnit="kg"
      />
    );

    expect(
      screen.getByRole('button', { name: 'تحريك المجموعة 1' })
    ).toHaveAttribute('data-sortable', 'true');
    expect(screen.getAllByText('مجموعة عمل').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('تكرارات المجموعة 1')).toHaveValue(8);
    expect(screen.getByLabelText('وزن المجموعة 1')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'نسخ المجموعة 1' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'حذف المجموعة 1' })
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'إظهار أو إخفاء ملاحظات المجموعة 1',
      })
    );
    expect(screen.getByLabelText('نص ملاحظات المجموعة 1')).toHaveAttribute(
      'placeholder',
      'أضف ملاحظة لهالمجموعة…'
    );
  });
});
