import { screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { WeeklyAlcoholCard } from '@/pages/Reports/WeeklyAlcoholCard';
import { renderWithClient } from '../test-utils';

const mockUseAlcoholWeekReport = jest.fn();

jest.mock('@/hooks/Reports/useReports', () => ({
  useAlcoholWeekReport: (date: string, userId?: string | null) =>
    mockUseAlcoholWeekReport(date, userId),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, second?: unknown) => {
      if (typeof second === 'string') return second;
      const opts = second as
        { defaultValue?: string; count?: number } | undefined;
      const template = opts?.defaultValue ?? key;
      return opts?.count !== undefined
        ? template.replace('{{count}}', String(opts.count))
        : template;
    },
  }),
}));

function week(overrides: Record<string, unknown> = {}) {
  const days = [
    { date: '2026-09-06', alcohol_g: 43.95, standard_drinks: 3.14 },
    ...['07', '08', '09', '10', '11', '12'].map((d) => ({
      date: `2026-09-${d}`,
      alcohol_g: 0,
      standard_drinks: 0,
    })),
  ];
  return {
    week_start: '2026-09-06',
    week_end: '2026-09-12',
    total_g: 43.95,
    standard_drinks: 3.14,
    limit_g: 28,
    limit_standard_drinks: 2,
    over_limit: true,
    days,
    ...overrides,
  };
}

describe('WeeklyAlcoholCard', () => {
  beforeEach(() => jest.clearAllMocks());

  // Both the bar and its label used to clamp at 100%, so 157% of a limit read
  // exactly like landing on it -- and "0 drinks remaining" was the only thing
  // said about an overshoot.
  it('states how far over the limit the week actually is', () => {
    mockUseAlcoholWeekReport.mockReturnValue({
      data: week(),
      isLoading: false,
    });

    renderWithClient(<WeeklyAlcoholCard date="2026-09-06" userId="user-1" />);

    expect(screen.getByText('157%')).toBeInTheDocument();
    expect(screen.getByText('1.1 drinks over')).toBeInTheDocument();
    expect(screen.queryByText(/remaining/)).not.toBeInTheDocument();
  });

  it('counts down the remaining drinks while still under the limit', () => {
    mockUseAlcoholWeekReport.mockReturnValue({
      data: week({ standard_drinks: 0.5, total_g: 7, over_limit: false }),
      isLoading: false,
    });

    renderWithClient(<WeeklyAlcoholCard date="2026-09-06" userId="user-1" />);

    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(screen.getByText('1.5 drinks remaining')).toBeInTheDocument();
  });

  // A week always has 7 cells, but the days after the one being viewed have
  // not happened. Showing them exactly like a dry day claimed six days of
  // abstinence the user had not lived through yet.
  it('separates a dry day from a day that has not happened', () => {
    mockUseAlcoholWeekReport.mockReturnValue({
      data: week({
        days: [
          { date: '2026-09-06', alcohol_g: 43.95, standard_drinks: 3.14 },
          { date: '2026-09-07', alcohol_g: 0, standard_drinks: 0 },
          { date: '2026-09-08', alcohol_g: 0, standard_drinks: 0 },
        ],
      }),
      isLoading: false,
    });

    // Viewing the 7th: the 6th is logged, the 7th is a real dry day, the 8th
    // is still to come.
    renderWithClient(<WeeklyAlcoholCard date="2026-09-07" userId="user-1" />);

    // The headline also reads 3.14, so assert on the strip's own cells.
    expect(screen.getAllByText('3.14')).toHaveLength(2);
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('·')).toBeInTheDocument();
    expect(screen.getByTitle('Not yet')).toBeInTheDocument();
  });

  it('shows no bar at all when no weekly limit is set', () => {
    mockUseAlcoholWeekReport.mockReturnValue({
      data: week({
        limit_g: null,
        limit_standard_drinks: null,
        over_limit: false,
      }),
      isLoading: false,
    });

    renderWithClient(<WeeklyAlcoholCard date="2026-09-06" userId="user-1" />);

    expect(screen.getByText('No weekly limit set')).toBeInTheDocument();
    expect(screen.queryByText(/drinks over|remaining/)).not.toBeInTheDocument();
  });
});
