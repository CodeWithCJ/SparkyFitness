import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import MiniNutritionTrends from '@/pages/Diary/MiniNutritionTrends';

let mockIsLoading = false;
let mockChartData: Array<Record<string, number | string>> = [];

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      key: string,
      defaultValue?: string | Record<string, string>,
      options?: Record<string, string>
    ) => {
      const values =
        typeof defaultValue === 'object' ? defaultValue : (options ?? {});
      const translations: Record<string, string> = {
        'diary.trends.loading': 'جارٍ تجهيز رسوم التغذية…',
        'diary.trends.empty': 'ما عندك بيانات كافية لآخر 14 يوم للحين.',
        'diary.trends.title': 'اتجاهات التغذية خلال 14 يوم',
        'nutrition.calories': 'السعرات',
        'units.kcal': 'سعرة حرارية',
      };

      if (key === 'diary.trends.chartLabel') {
        return `${values['nutrient']}: ${values['value']} ${values['unit']}`;
      }

      return (
        translations[key] ??
        (typeof defaultValue === 'string' ? defaultValue : key)
      );
    },
  }),
  initReactI18next: {
    type: '3rdParty',
    init: jest.fn(),
  },
}));

jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) =>
    children,
  LineChart: ({ children }: { children: React.ReactNode }) => children,
  Line: () => null,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({ activeUserId: 'user-1' }),
}));

jest.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    formatDateInUserTimezone: (_date: Date, pattern: string) =>
      pattern === 'yyyy-MM-dd' ? '2026-07-10' : '10 يوليو',
    nutrientDisplayPreferences: [
      {
        view_group: 'summary',
        platform: 'desktop',
        visible_nutrients: ['calories'],
      },
    ],
    energyUnit: 'kcal',
    convertEnergy: (value: number) => value,
    showNetCarbs: false,
  }),
}));

jest.mock('@/hooks/Foods/useFoods', () => ({
  useMiniNutritionTrendData: () => ({
    data: mockChartData,
    isLoading: mockIsLoading,
  }),
}));

describe('MiniNutritionTrends', () => {
  beforeEach(() => {
    mockIsLoading = false;
    mockChartData = [];
  });

  it('shows a localized loading state', () => {
    mockIsLoading = true;

    render(<MiniNutritionTrends selectedDate="2026-07-10" />);

    expect(
      screen.getByRole('status', { name: 'جارٍ تجهيز رسوم التغذية…' })
    ).toBeInTheDocument();
  });

  it('shows a useful Arabic empty state', () => {
    render(<MiniNutritionTrends selectedDate="2026-07-10" />);

    expect(
      screen.getByText('ما عندك بيانات كافية لآخر 14 يوم للحين.')
    ).toBeInTheDocument();
  });

  it('localizes the title, energy unit, and chart description', () => {
    mockChartData = [{ date: '2026-07-10', calories: 1850 }];

    render(<MiniNutritionTrends selectedDate="2026-07-10" />);

    expect(screen.getByText('اتجاهات التغذية خلال 14 يوم')).toBeInTheDocument();
    expect(screen.getByText('1850 سعرة حرارية')).toBeInTheDocument();
    expect(
      screen.getByRole('img', {
        name: 'السعرات: 1850 سعرة حرارية',
      })
    ).toBeInTheDocument();
  });
});
