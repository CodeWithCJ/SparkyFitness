import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import WorkoutPlansManager from '@/pages/Exercises/WorkoutPlansManager';
import type { WorkoutPlanTemplate } from '@/types/workout';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      key: string,
      defaultValue?: string,
      options?: Record<string, string | number>
    ) => {
      const translations: Record<string, string> = {
        'exercise.databaseManager.workoutPlansCardTitle': 'خطط التمرين',
        'workoutPlansManager.planName': 'اسم الخطة',
        'workoutPlansManager.status': 'الحالة',
        'workoutPlansManager.duration': 'مدة الخطة',
        'workoutPlansManager.activeStatus': 'مفعّلة',
        'workoutPlansManager.inactiveStatus': 'متوقفة',
        'workoutPlansManager.deactivatePlan': 'إلغاء تفعيل {{planName}}',
        'workoutPlansManager.activatePlan': 'تفعيل {{planName}}',
        'workoutPlansManager.openActions': 'فتح إجراءات {{planName}}',
        'workoutPlansManager.addPlanButton': 'إضافة خطة',
        'common.actions': 'الإجراءات',
        'common.edit': 'تعديل',
        'common.delete': 'حذف',
        'common.select': 'تحديد',
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

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));
jest.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    loggingLevel: 'error',
    formatDate: (value: string | Date) => {
      const date = new Date(value);
      return date.getUTCDate() === 1 ? '١ مايو ٢٠٢٦' : '٣١ مايو ٢٠٢٦';
    },
  }),
}));

const mockPlan = {
  id: 'plan-1',
  user_id: 'user-1',
  plan_name: 'خطة 3 أيام',
  description: 'قوة ولياقة',
  is_active: true,
  start_date: '2026-05-01',
  end_date: '2026-05-31',
  assignments: [],
} as WorkoutPlanTemplate;

jest.mock('@/hooks/Exercises/useWorkoutPlans', () => ({
  useWorkoutPlanTemplates: () => ({ data: [mockPlan] }),
  useCreateWorkoutPlanTemplateMutation: () => ({ mutateAsync: jest.fn() }),
  useDeleteWorkoutPlanTemplateMutation: () => ({ mutateAsync: jest.fn() }),
  useUpdateWorkoutPlanTemplateMutation: () => ({ mutateAsync: jest.fn() }),
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
          original: WorkoutPlanTemplate;
          getIsSelected: () => boolean;
          toggleSelected: () => void;
        };
      }) => React.ReactNode;
    }>;
    data: WorkoutPlanTemplate[];
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
              : String(
                  original[column.accessorKey as keyof WorkoutPlanTemplate]
                )}
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
  DropdownMenuItem: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));

jest.mock('@/components/BulkActionToolbar', () => () => null);
jest.mock('@/components/BulkDeleteDialog', () => () => null);
jest.mock('@/pages/Exercises/AddWorkoutPlanDialog', () => () => null);
jest.mock('@/hooks/use-toast', () => ({ toast: jest.fn() }));

describe('WorkoutPlansManager', () => {
  it('localizes plan status, dates, actions, and primary controls', () => {
    render(<WorkoutPlansManager />);

    expect(
      screen.getByRole('heading', { name: 'خطط التمرين' })
    ).toBeInTheDocument();
    expect(screen.getByText('١ مايو ٢٠٢٦')).toBeInTheDocument();
    expect(screen.getByText('٣١ مايو ٢٠٢٦')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'إلغاء تفعيل خطة 3 أيام' })
    ).toHaveTextContent('مفعّلة');
    expect(
      screen.getByRole('button', { name: 'فتح إجراءات خطة 3 أيام' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'إضافة خطة' })
    ).toBeInTheDocument();
  });
});
