import { screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import MealManagement from '@/pages/Foods/MealManagement';
import { renderWithClient } from '../test-utils';

// mock i18 directly for calls outside of hooks
jest.mock('@/i18n', () => ({
  __esModule: true, // Dies behebt den "default.t is not a function" Fehler
  default: {
    t: (key: string, fallback?: string) => fallback || key,
    use: jest.fn().mockReturnThis(),
    init: jest.fn(),
  },
}));

// Mock react-i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      key: string,
      defaultValueOrOpts?: string | Record<string, string>,
      options?: Record<string, string>
    ) => {
      const values =
        typeof defaultValueOrOpts === 'object'
          ? defaultValueOrOpts
          : (options ?? {});
      const translations: Record<string, string> = {
        'mealManagement.manageMeals': 'مكتبة الوجبات',
        'mealManagement.createNewMeal': 'إنشاء وجبة',
        'mealManagement.searchMealsPlaceholder': 'ابحث في الوجبات…',
        'mealManagement.all': 'الكل',
        'mealManagement.noMealsFound':
          'ما عندك وجبات محفوظة. أنشئ وجبتك الأولى.',
        'mealManagement.noDescription': 'بدون وصف',
        'mealManagement.public': 'عامة',
        'mealManagement.openMealActions': 'فتح إجراءات {{mealName}}',
        'common.select': 'تحديد',
        'common.actions': 'الإجراءات',
        'common.kcalUnit': 'سعرة حرارية',
        'units.gram': 'غ',
      };
      const fallback =
        typeof defaultValueOrOpts === 'string'
          ? defaultValueOrOpts
          : ((defaultValueOrOpts?.['defaultValue'] as string) ?? key);
      const template = translations[key] ?? fallback;
      return Object.entries(values).reduce(
        (value, [name, replacement]) =>
          value.replaceAll(`{{${name}}}`, replacement),
        template
      );
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
    nutrientDisplayPreferences: [
      {
        view_group: 'quick_info',
        platform: 'desktop',
        visible_nutrients: ['calories', 'protein', 'carbs', 'fat'],
      },
    ],
    energyUnit: 'kcal' as const,
    convertEnergy: (value: number) => value,
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
const mockGetMeals = jest.fn();
jest.mock('@/api/Foods/meals', () => ({
  getMeals: (...args: unknown[]) => mockGetMeals(...args),
  deleteMeal: jest.fn(),
  getMealById: jest.fn(),
  getMealDeletionImpact: jest.fn(),
  updateMeal: jest.fn(),
}));

// Mock MealBuilder sub-component
jest.mock('@/components/MealBuilder', () => {
  return function MockMealBuilder() {
    return <div data-testid="meal-builder">MealBuilder</div>;
  };
});

describe('MealManagement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders title and empty state when no meals exist', async () => {
    mockGetMeals.mockResolvedValue([]);

    renderWithClient(<MealManagement />);

    expect(screen.getByText('مكتبة الوجبات')).toBeInTheDocument();

    await waitFor(() => {
      expect(
        screen.getByText('ما عندك وجبات محفوظة. أنشئ وجبتك الأولى.')
      ).toBeInTheDocument();
    });
  });

  it('renders meal list when meals are returned', async () => {
    mockGetMeals.mockResolvedValue([
      {
        id: 'meal1',
        name: 'وعاء الفطور',
        description: 'بداية خفيفة',
        is_public: false,
        foods: [],
      },
      {
        id: 'meal2',
        name: 'مشروب البروتين',
        description: '',
        is_public: true,
        foods: [],
      },
    ]);

    renderWithClient(<MealManagement />);

    await waitFor(() => {
      expect(screen.getAllByText('وعاء الفطور').length).toBeGreaterThan(0);
      expect(screen.getAllByText('مشروب البروتين').length).toBeGreaterThan(0);
      expect(
        screen.getAllByRole('button', { name: 'فتح إجراءات وعاء الفطور' })
          .length
      ).toBeGreaterThan(0);
    });
  });
});
