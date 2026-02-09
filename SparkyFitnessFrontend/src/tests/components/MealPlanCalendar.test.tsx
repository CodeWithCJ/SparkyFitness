import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import MealPlanCalendar from '../../pages/Foods/MealPlanCalendar';

// Mock react-i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValueOrOpts?: string | Record<string, unknown>) => {
      if (typeof defaultValueOrOpts === 'string') return defaultValueOrOpts;
      if (defaultValueOrOpts && typeof defaultValueOrOpts === 'object' && 'defaultValue' in defaultValueOrOpts) {
        return defaultValueOrOpts.defaultValue as string;
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
  usePreferences: () => ({ loggingLevel: 'debug', foodDisplayLimit: 100 }),
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
jest.mock('@/services/mealPlanTemplateService', () => ({
  getMealPlanTemplates: (...args: unknown[]) => mockGetMealPlanTemplates(...args),
  createMealPlanTemplate: jest.fn(),
  updateMealPlanTemplate: jest.fn(),
  deleteMealPlanTemplate: jest.fn(),
}));

// Mock MealPlanTemplateForm sub-component
jest.mock('../../components/MealPlanTemplateForm', () => {
  return function MockMealPlanTemplateForm() {
    return <div data-testid="meal-plan-template-form">MealPlanTemplateForm</div>;
  };
});

describe('MealPlanCalendar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders heading', async () => {
    mockGetMealPlanTemplates.mockResolvedValue([]);

    render(<MealPlanCalendar />);

    // Title uses t('mealPlanCalendar.title') with no fallback, so mock returns the key
    expect(screen.getByText('mealPlanCalendar.title')).toBeInTheDocument();
  });

  it('shows empty state after loading', async () => {
    mockGetMealPlanTemplates.mockResolvedValue([]);

    render(<MealPlanCalendar />);

    await waitFor(() => {
      expect(screen.getByText('mealPlanCalendar.noMealPlansFound')).toBeInTheDocument();
    });
  });
});
