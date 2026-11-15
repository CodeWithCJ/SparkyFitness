import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import type { BloodAlcoholResponse } from '@workspace/shared';
import { BloodAlcoholCard } from '@/pages/Diary/BloodAlcoholCard';
import { useBloodAlcoholQuery } from '@/hooks/Diary/useBloodAlcohol';

jest.mock('@/hooks/Diary/useBloodAlcohol', () => ({
  useBloodAlcoholQuery: jest.fn(),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, second?: unknown) => {
      if (typeof second === 'string') return second;
      const opts = second as Record<string, unknown> | undefined;
      const template = (opts?.['defaultValue'] as string) ?? key;
      return template.replace(/\{\{(\w+)\}\}/g, (_m, name: string) =>
        String(opts?.[name] ?? '')
      );
    },
  }),
}));
jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}));
// Same stubs as the caffeine card: the chart frame is shared, so these test
// ids describe what each card hands it.
jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AreaChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bac-chart">{children}</div>
  ),
  Area: () => null,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  ReferenceLine: ({ y }: { y?: number; x?: number }) => (
    <div data-testid={y !== undefined ? 'ref-line-y' : 'ref-line-x'} />
  ),
  ReferenceDot: ({ strokeDasharray }: { strokeDasharray?: string }) => (
    <div
      data-testid={
        strokeDasharray && strokeDasharray !== '0'
          ? 'dose-dot-estimated'
          : 'dose-dot'
      }
    />
  ),
}));

const mockQuery = useBloodAlcoholQuery as jest.MockedFunction<
  typeof useBloodAlcoholQuery
>;

const okData: BloodAlcoholResponse = {
  status: 'ok',
  missing_inputs: [],
  formula: 'watson',
  fell_back_from: null,
  display_unit: 'permille',
  elimination_rate: 0.15,
  distribution_factor: 0.7,
  weight_kg: 80,
  doses: [{ at: '2026-09-05T18:00:00.000Z', grams: 20, name: 'Beer' }],
  estimated_now_permille: 0.2,
  peak: { at: '2026-09-05T18:45:00.000Z', permille: 0.31 },
  has_estimated_times: false,
};

const DISCLAIMER =
  'Rough estimate only. Your real blood alcohol can differ by 20% or more. Never use it to decide whether you are fit to drive.';

const renderCard = (
  data: BloodAlcoholResponse | undefined,
  isLoading = false,
  isError = false
) => {
  mockQuery.mockReturnValue({ data, isLoading, isError } as never);
  return render(
    <MemoryRouter>
      <BloodAlcoholCard date="2026-09-05" />
    </MemoryRouter>
  );
};

// The estimate must never read as fitness to drive or as a time to wait for.
const expectNoSoberTime = (container: HTMLElement) => {
  expect(container.textContent).not.toMatch(
    /sober|safe to drive|back to zero|zero at|under .* from|okay to drive/i
  );
};

describe('BloodAlcoholCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-05T19:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows the current estimate, the peak and the curve on the day being viewed', () => {
    const { container } = renderCard(okData);

    expect(screen.getByText('Estimated now')).toBeInTheDocument();
    expect(screen.getByText('Estimated peak')).toBeInTheDocument();
    expect(screen.getByText('0.31')).toBeInTheDocument();
    expect(screen.getByTestId('bac-chart')).toBeInTheDocument();
    expect(screen.getAllByTestId('dose-dot')).toHaveLength(1);
    expect(screen.getAllByTestId('ref-line-x')).toHaveLength(1);
    expect(screen.getByText('Beer:')).toBeInTheDocument();
    expect(screen.getByText('20 g alcohol')).toBeInTheDocument();
    expect(screen.getByText(DISCLAIMER)).toBeInTheDocument();
    // No limit lines: a legal limit on the plot would invite the comparison.
    expect(screen.queryByTestId('ref-line-y')).not.toBeInTheDocument();
    expectNoSoberTime(container);
  });

  it('shows the value in the chosen display unit', () => {
    renderCard({ ...okData, display_unit: 'percent' });

    expect(screen.getByText('0.031')).toBeInTheDocument();
    expect(screen.getAllByText('%').length).toBeGreaterThan(0);
  });

  it('shows only the peak on a past day, without a "now" marker', () => {
    // The server leaves out the current value on any day but today.
    const { container } = renderCard({
      ...okData,
      estimated_now_permille: null,
    });

    expect(screen.queryByText('Estimated now')).not.toBeInTheDocument();
    expect(screen.getByText('Estimated peak')).toBeInTheDocument();
    expect(screen.queryByTestId('ref-line-x')).not.toBeInTheDocument();
    expect(screen.getByText(DISCLAIMER)).toBeInTheDocument();
    expectNoSoberTime(container);
  });

  it('names the missing profile data and where to set it, without guessing', () => {
    const { container } = renderCard({
      ...okData,
      status: 'missing_inputs',
      missing_inputs: ['sex', 'weight'],
      distribution_factor: null,
      weight_kg: null,
      estimated_now_permille: null,
      peak: null,
    });

    expect(
      screen.getByText(
        'To estimate your blood alcohol, add your sex, weight. There is no estimate until then.'
      )
    ).toBeInTheDocument();
    // Only the profile input that is missing is named on the button.
    expect(
      screen.getByRole('link', { name: 'Set your sex in your profile' })
    ).toHaveAttribute('href', '/settings?section=profile-information');
    expect(
      screen.getByRole('link', { name: 'Log weight and height in Check-In' })
    ).toHaveAttribute('href', '/checkin');
    expect(screen.queryByTestId('bac-chart')).not.toBeInTheDocument();
    expect(screen.queryByText('Estimated now')).not.toBeInTheDocument();
    expect(screen.getByText(DISCLAIMER)).toBeInTheDocument();
    expectNoSoberTime(container);
  });

  it('only links to the place that holds what is missing', () => {
    renderCard({
      ...okData,
      status: 'missing_inputs',
      missing_inputs: ['height'],
      distribution_factor: null,
      weight_kg: null,
    });

    expect(
      screen.queryByRole('link', { name: /in your profile/ })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Log weight and height in Check-In' })
    ).toBeInTheDocument();
  });

  it('names both profile inputs on the button when both are missing', () => {
    renderCard({
      ...okData,
      status: 'missing_inputs',
      missing_inputs: ['sex', 'age'],
      distribution_factor: null,
      estimated_now_permille: null,
      peak: null,
    });

    expect(
      screen.getByRole('link', {
        name: 'Set your sex, date of birth in your profile',
      })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /Check-In/ })
    ).not.toBeInTheDocument();
  });

  it('explains implausible profile data instead of drawing a curve', () => {
    renderCard({
      ...okData,
      status: 'implausible_inputs',
      distribution_factor: null,
      estimated_now_permille: null,
      peak: null,
    });

    expect(
      screen.getByText(/do not give a plausible body/)
    ).toBeInTheDocument();
    expect(screen.queryByTestId('bac-chart')).not.toBeInTheDocument();
    expect(screen.getByText(DISCLAIMER)).toBeInTheDocument();
  });

  it('reports an empty day and still shows the disclaimer', () => {
    renderCard({ ...okData, doses: [], peak: null });

    expect(
      screen.getByText('No alcohol logged for this day.')
    ).toBeInTheDocument();
    expect(screen.getByText(DISCLAIMER)).toBeInTheDocument();
  });

  it('says the estimate failed to load instead of reporting an empty day', () => {
    renderCard(undefined, false, true);

    expect(
      screen.getByText('Failed to load the blood alcohol estimate.')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('No alcohol logged for this day.')
    ).not.toBeInTheDocument();
    expect(screen.getByText(DISCLAIMER)).toBeInTheDocument();
  });

  it('says when the chosen formula does not fit and Watson is used', () => {
    const { container } = renderCard({ ...okData, fell_back_from: 'seidl' });

    expect(
      screen.getByText(
        'The Seidl formula does not fit your body measurements, so this estimate uses Watson.'
      )
    ).toBeInTheDocument();
    expect(screen.getByTestId('bac-chart')).toBeInTheDocument();
    expectNoSoberTime(container);
  });

  it('shows no formula note when the chosen formula was used', () => {
    renderCard(okData);
    expect(
      screen.queryByText(/does not fit your body measurements/)
    ).not.toBeInTheDocument();
  });

  it('shows the disclaimer while loading', () => {
    renderCard(undefined, true);
    expect(screen.getByText(DISCLAIMER)).toBeInTheDocument();
  });

  it("keeps the viewed day's evening drinks in view after a carried-over night", () => {
    // Local times, because the card frames the viewed day in local time.
    const local = (day: number, hour: number) =>
      new Date(2026, 8, day, hour).toISOString();
    jest.setSystemTime(new Date(2026, 8, 5, 21));
    renderCard({
      ...okData,
      doses: [
        { at: local(4, 18), grams: 20, name: 'Beer' },
        { at: local(5, 1), grams: 20, name: 'Beer' },
        { at: local(5, 20), grams: 20, name: 'Wine' },
      ],
      peak: { at: local(5, 20), permille: 0.3 },
    });

    expect(screen.getByText('Wine:')).toBeInTheDocument();
    // Last evening's drink stays in view: the chart reaches 12 h back.
    expect(screen.getAllByTestId('dose-dot')).toHaveLength(3);
    expect(screen.getAllByTestId('ref-line-x')).toHaveLength(1);
  });

  it('draws a drink with an assumed time hollow and says so', () => {
    renderCard({
      ...okData,
      doses: [{ ...okData.doses[0]!, is_estimated: true }],
      has_estimated_times: true,
    });

    expect(screen.getAllByTestId('dose-dot-estimated')).toHaveLength(1);
    expect(screen.getByText('Estimated times')).toBeInTheDocument();
    expect(screen.getByText('Assumed time')).toBeInTheDocument();
  });
});
