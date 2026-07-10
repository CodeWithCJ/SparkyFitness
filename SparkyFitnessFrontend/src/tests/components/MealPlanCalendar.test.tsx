import { screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import MealPlanCalendar from '../../pages/Foods/MealPlanCalendar';
import { renderWithClient } from '../test-utils';

const mockTranslations: Record<string, string> = {
  'mealPlanCalendar.title': 'خطط الوجبات',
  'mealPlanCalendar.ongoingStatus': 'مستمرة',
  'mealPlanCalendar.openPlanActions': 'فتح إجراءات {{planName}}',
  'common.noResults': 'ما فيه نتائج.',
};

// Mock react-i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValueOrOpts?: string | Record<string, unknown>) => {
      if (
        key === 'mealPlanCalendar.openPlanActions' &&
        typeof defaultValueOrOpts === 'object'
      ) {
        return `فتح إجراءات ${String(defaultValueOrOpts.planName)}`;
      }
      if (mockTranslations[key]) return mockTranslations[key];
      if (typeof defaultValueOrOpts === 'string') return defaultValueOrOpts;
      if (
        defaultValueOrOpts &&
        typeof defaultValueOrOpts === 'object' &&
        'defaultValue' in defaultValueOrOpts
      ) {
        return defaultValueOrOpts['defaultValue'] as string;
      }
      return key;
    },
  }),
}));

// Mock contexts
jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({ activeUserId: 'test-user-id' }),
}));
jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    loggingLevel: 'debug',
    foodDisplayLimit: 100,
    formatDate: (date: string | Date) => `تاريخ:${String(date).slice(0, 10)}`,
  }),
}));

// Mock toast
jest.mock('@/hooks/use-toast', () => ({
  toast: jest.fn(),
}));

// Mock logging
jest.mock('@/utils/logging', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// Mock services
const mockGetMealPlanTemplates = jest.fn();
jest.mock('@/api/Foods/mealPlanTemplate', () => ({
  getMealPlanTemplates: (...args: unknown[]) =>
    mockGetMealPlanTemplates(...args),
  createMealPlanTemplate: jest.fn(),
  updateMealPlanTemplate: jest.fn(),
  deleteMealPlanTemplate: jest.fn(),
}));

// Mock MealPlanTemplateForm sub-component
jest.mock('@/pages/Foods/MealPlanTemplateForm', () => {
  return function MockMealPlanTemplateForm() {
    return (
      <div data-testid="meal-plan-template-form">MealPlanTemplateForm</div>
    );
  };
});

describe('MealPlanCalendar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders heading', async () => {
    mockGetMealPlanTemplates.mockResolvedValue([]);

    renderWithClient(<MealPlanCalendar />);

    expect(screen.getByText('خطط الوجبات')).toBeInTheDocument();
  });

  it('shows empty state after loading', async () => {
    mockGetMealPlanTemplates.mockResolvedValue([]);

    renderWithClient(<MealPlanCalendar />);

    await waitFor(() => {
      expect(screen.getByText('ما فيه نتائج.')).toBeInTheDocument();
    });
  });

  it('uses the Saudi date preference and localizes ongoing plans', async () => {
    mockGetMealPlanTemplates.mockResolvedValue([
      {
        id: 'plan-1',
        plan_name: 'وجبات الدوام',
        description: '',
        start_date: '2026-07-01',
        end_date: null,
        is_active: true,
        assignments: [],
      },
    ]);

    renderWithClient(<MealPlanCalendar />);

    await waitFor(() => {
      expect(screen.getAllByText('وجبات الدوام').length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText('تاريخ:2026-07-01').length).toBeGreaterThan(0);
    expect(screen.getAllByText('مستمرة').length).toBeGreaterThan(0);
  });
});
