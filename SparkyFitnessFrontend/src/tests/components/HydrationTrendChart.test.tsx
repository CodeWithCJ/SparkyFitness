import { screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import HydrationTrendChart from '@/pages/Reports/HydrationTrendChart';
import { useHydrationNutritionRange } from '@/hooks/Reports/useReports';
import { renderWithClient } from '../test-utils';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
  initReactI18next: {
    type: '3rdParty',
    init: jest.fn(),
  },
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    water_display_unit: 'ml',
    formatDateInUserTimezone: (date: Date) => date.toISOString().slice(5, 10),
  }),
}));

jest.mock('@/hooks/Reports/useReports', () => ({
  useHydrationNutritionRange: jest.fn(),
}));

// recharts' ResponsiveContainer needs a real layout to render children in
// jsdom; stub the chart internals so this test exercises the wrapping
// card/average logic instead of chart geometry.
jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
}));

describe('HydrationTrendChart (#2348)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing while there is no data and none is loading', () => {
    (useHydrationNutritionRange as jest.Mock).mockReturnValue({
      data: { days: [] },
      isLoading: false,
    });

    const { container } = renderWithClient(
      <HydrationTrendChart startDate="2026-09-01" endDate="2026-09-03" />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the average in the display unit', () => {
    (useHydrationNutritionRange as jest.Mock).mockReturnValue({
      data: {
        days: [
          { date: '2026-09-01', water_ml: 1000, caffeine_mg: 0, alcohol_g: 0 },
          { date: '2026-09-02', water_ml: 2000, caffeine_mg: 0, alcohol_g: 0 },
        ],
      },
      isLoading: false,
    });

    renderWithClient(
      <HydrationTrendChart startDate="2026-09-01" endDate="2026-09-02" />
    );

    // (1000 + 2000) / 2 = 1500 ml, 0 decimals for 'ml'
    expect(screen.getByText(/Avg: 1500 ml/)).toBeInTheDocument();
  });
});
