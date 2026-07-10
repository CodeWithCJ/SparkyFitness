import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SortableExerciseItem } from '@/pages/Exercises/SortableExerciseItem';
import type { SortableExerciseItemData } from '@/types/workout';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      key: string,
      defaultValue?: string,
      options?: Record<string, string | number>
    ) => {
      const translations: Record<string, string> = {
        'workout.exerciseItem.dragExercise': 'تحريك تمرين {{exerciseName}}',
        'workout.exerciseItem.collapseExercise': 'طي تمرين {{exerciseName}}',
        'workout.exerciseItem.expandExercise': 'عرض تمرين {{exerciseName}}',
        'workout.exerciseItem.copyExercise': 'نسخ تمرين {{exerciseName}}',
        'workout.exerciseItem.removeExercise': 'حذف تمرين {{exerciseName}}',
        'workout.exerciseItem.addSet': 'إضافة مجموعة',
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

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({ distanceUnit: 'km' }),
}));

jest.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => children,
  useSortable: () => ({
    attributes: { 'data-sortable': 'true' },
    listeners: {},
    setNodeRef: jest.fn(),
    transform: null,
    transition: undefined,
  }),
  sortableKeyboardCoordinates: jest.fn(),
}));

jest.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => children,
  closestCenter: jest.fn(),
  KeyboardSensor: jest.fn(),
  PointerSensor: jest.fn(),
  useSensor: jest.fn(),
  useSensors: () => [],
}));

jest.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => undefined } },
}));

jest.mock('@/components/ExerciseHistoryDisplay', () => () => null);
jest.mock('@/pages/Exercises/SortableWorkoutSet', () => ({
  SortableSetItem: () => <div data-testid="set-item" />,
}));
jest.mock('@/pages/Exercises/SetHeader', () => ({
  SetColumnHeaders: () => null,
}));
jest.mock('@/pages/Exercises/CardioLog', () => ({ CardioLog: () => null }));

const exercise = {
  id: 'assignment-1',
  exercise_id: 'exercise-1',
  exercise_name: 'ضغط صدر',
  category: 'strength',
  sets: [{ id: 'set-1', set_number: 1, reps: 8, weight: 60 }],
} as SortableExerciseItemData;

describe('SortableExerciseItem', () => {
  it('localizes every exercise action and exposes the drag handle', () => {
    const onAddSet = jest.fn();

    render(
      <SortableExerciseItem
        ex={exercise}
        exerciseIndex={0}
        onRemoveExercise={jest.fn()}
        onSetChange={jest.fn()}
        onDuplicateSet={jest.fn()}
        onRemoveSet={jest.fn()}
        onAddSet={onAddSet}
        onCopyExercise={jest.fn()}
        weightUnit="kg"
      />
    );

    expect(
      screen.getByRole('button', { name: 'تحريك تمرين ضغط صدر' })
    ).toHaveAttribute('data-sortable', 'true');
    expect(
      screen.getByRole('button', { name: 'نسخ تمرين ضغط صدر' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'حذف تمرين ضغط صدر' })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'طي تمرين ضغط صدر' }));
    expect(
      screen.getByRole('button', { name: 'عرض تمرين ضغط صدر' })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'عرض تمرين ضغط صدر' }));
    fireEvent.click(screen.getByRole('button', { name: 'إضافة مجموعة' }));
    expect(onAddSet).toHaveBeenCalledWith(0);
  });
});
