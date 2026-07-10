import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import WorkoutPresetsManager from '@/pages/Exercises/WorkoutPresetsManager';
import type { WorkoutPreset } from '@/types/workout';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      key: string,
      defaultValue?: string | Record<string, string | number>,
      options?: Record<string, string | number>
    ) => {
      const values =
        typeof defaultValue === 'object' ? defaultValue : (options ?? {});
      const translations: Record<string, string> = {
        'exercise.databaseManager.workoutPresetsCardTitle': 'قوالب التمرين',
        'workoutPresetsManager.name': 'الاسم',
        'workoutPresetsManager.exercises': 'التمارين',
        'workoutPresetsManager.stats': 'الملخص',
        'workoutPresetsManager.exerciseCount': '{{count}} تمرين',
        'workoutPresetsManager.setCount': '{{count}} مجموعات',
        'workoutPresetsManager.openActions': 'فتح إجراءات {{templateName}}',
        'workoutPresetsManager.startWorkout': 'ابدأ التمرين',
        'workoutPresetsManager.logToDiary': 'تسجيل في يومياتي',
        'workoutPresetsManager.addPresetButton': 'إضافة قالب',
        'common.actions': 'الإجراءات',
        'common.edit': 'تعديل',
        'common.delete': 'حذف',
        'common.select': 'تحديد',
        'units.kilogram': 'كجم',
      };
      const fallback = typeof defaultValue === 'string' ? defaultValue : key;
      const template = translations[key] ?? fallback;
      return Object.entries(values).reduce(
        (value, [name, replacement]) =>
          value.replaceAll(`{{${name}}}`, String(replacement)),
        template
      );
    },
  }),
}));

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
  useLocation: () => ({ pathname: '/exercises', search: '' }),
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

jest.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({ weightUnit: 'kg' }),
}));

const mockPreset = {
  id: 'preset-1',
  user_id: 'user-1',
  name: 'قالب القوة',
  description: 'تمرين متوازن',
  exercises: [
    {
      exercise_id: 'exercise-1',
      exercise_name: 'ضغط صدر',
      sets: [
        { set_number: 1, weight: 60, reps: 8 },
        { set_number: 2, weight: 60, reps: 8 },
      ],
    },
  ],
} as WorkoutPreset;

jest.mock('@/hooks/Exercises/useWorkoutPresets', () => ({
  useWorkoutPresets: () => ({
    data: { pages: [{ presets: [mockPreset] }] },
    fetchNextPage: jest.fn(),
    hasNextPage: false,
    isLoading: false,
    isFetchingNextPage: false,
  }),
  useCreateWorkoutPresetMutation: () => ({ mutateAsync: jest.fn() }),
  useDeleteWorkoutPresetMutation: () => ({ mutateAsync: jest.fn() }),
  useUpdateWorkoutPresetMutation: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock('@/hooks/Exercises/useExerciseEntries', () => ({
  useLogWorkoutPresetMutation: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock('@/hooks/useBulkSelection', () => ({
  useBulkSelection: () => ({
    selectedIds: new Set<string>(),
    selectAll: jest.fn(),
    clearSelection: jest.fn(),
    selectedCount: 0,
    isEditMode: false,
    toggleEditMode: jest.fn(),
  }),
}));

jest.mock('@/components/ui/DataTable', () => ({
  DataTable: ({
    columns,
    data,
  }: {
    columns: Array<{
      id?: string;
      accessorKey?: string;
      cell?: (context: {
        row: {
          original: WorkoutPreset;
          getIsSelected: () => boolean;
          toggleSelected: () => void;
        };
      }) => React.ReactNode;
    }>;
    data: WorkoutPreset[];
  }) => {
    const original = data[0];
    if (!original) return null;
    const row = {
      original,
      getIsSelected: () => false,
      toggleSelected: jest.fn(),
    };
    return (
      <div>
        {columns.map((column, index) => (
          <React.Fragment key={column.id ?? column.accessorKey ?? index}>
            {column.cell
              ? column.cell({ row })
              : String(original[column.accessorKey as keyof WorkoutPreset])}
          </React.Fragment>
        ))}
      </div>
    );
  },
}));

jest.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => children,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) =>
    children,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) =>
    children,
  DropdownMenuItem: ({
    children,
    disabled,
    onClick,
  }: {
    children: React.ReactNode;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button type="button" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));

jest.mock('@/components/BulkActionToolbar', () => () => null);
jest.mock('@/components/BulkDeleteDialog', () => () => null);
jest.mock('@/pages/Exercises/WorkoutPresetForm', () => () => null);
jest.mock('@/pages/Exercises/WorkoutPresetSelector', () => () => null);

describe('WorkoutPresetsManager', () => {
  it('localizes template counts, volume, actions, and primary controls', () => {
    render(<WorkoutPresetsManager />);

    expect(
      screen.getByRole('heading', { name: 'قوالب التمرين' })
    ).toBeInTheDocument();
    expect(screen.getByText('1 تمرين')).toBeInTheDocument();
    expect(screen.getByText('2 مجموعات')).toBeInTheDocument();
    expect(screen.getByText('960 كجم')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'فتح إجراءات قالب القوة' })
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: 'ابدأ التمرين' }).length
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole('button', { name: 'إضافة قالب' })
    ).toBeInTheDocument();
  });
});
