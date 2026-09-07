import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CaffeineCard } from '@/pages/Diary/CaffeineCard';
import { useActiveCaffeineQuery } from '@/hooks/Diary/useCaffeineKinetics';

jest.mock('@/hooks/Diary/useCaffeineKinetics', () => ({
  useActiveCaffeineQuery: jest.fn(),
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

// recharts' ResponsiveContainer needs a real layout to render children in
// jsdom; stub the chart internals so this test exercises the card's own logic
// rather than chart geometry. The dose markers are kept visible as test ids so
// the estimated/logged distinction can still be asserted.
jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AreaChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="caffeine-chart">{children}</div>
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

const mockUseActiveCaffeineQuery =
  useActiveCaffeineQuery as jest.MockedFunction<typeof useActiveCaffeineQuery>;

describe('CaffeineCard Component', () => {
  const baseData = {
    half_life_hours: 5,
    target_bedtime: '22:30',
    bedtime_at: '2026-09-05T20:30:00.000Z',
    doses: [
      {
        at: '2026-09-05T08:00:00.000Z',
        mg: 100,
        name: 'Morning Coffee',
        is_estimated: false,
      },
    ],
    active_mg_now: 100,
    at_bedtime_mg: 18,
    latest_safe_dose_time: '17:45',
    cutoff_state: 'by',
    bedtime_headroom_mg: 82,
    cutoff_dose_mg: 200,
    threshold_mg: 100,
    has_estimated_times: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-05T08:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders loading skeleton when loading', () => {
    mockUseActiveCaffeineQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as never);

    const { container } = render(<CaffeineCard date="2026-09-05" />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders nothing when no data or doses', () => {
    mockUseActiveCaffeineQuery.mockReturnValue({
      data: { ...baseData, doses: [] },
      isLoading: false,
    } as never);

    const { container } = render(<CaffeineCard date="2026-09-05" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders active caffeine, bedtime residual, and cutoff time', () => {
    mockUseActiveCaffeineQuery.mockReturnValue({
      data: baseData,
      isLoading: false,
    } as never);

    render(<CaffeineCard date="2026-09-05" />);

    expect(screen.getByText('Active Caffeine')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument(); // 100 mg active at 08:00
    expect(screen.getByText('18')).toBeInTheDocument(); // 18 mg at bedtime
    expect(screen.getByText('17:45')).toBeInTheDocument(); // Cutoff time
  });

  it('recalculates decaying figure as clock advances without refetching', () => {
    mockUseActiveCaffeineQuery.mockReturnValue({
      data: baseData,
      isLoading: false,
    } as never);

    render(<CaffeineCard date="2026-09-05" />);

    // Initially at 08:00: 100 mg
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(mockUseActiveCaffeineQuery).toHaveBeenCalledTimes(1);

    // Advance time by 5 hours (1 half-life) to 13:00
    act(() => {
      jest.advanceTimersByTime(5 * 60 * 60 * 1000);
    });

    // Should decay to 50 mg as time advances
    expect(screen.getByText('50')).toBeInTheDocument();
  });

  it('renders estimated times badge when has_estimated_times is true', () => {
    mockUseActiveCaffeineQuery.mockReturnValue({
      data: {
        ...baseData,
        has_estimated_times: true,
      },
      isLoading: false,
    } as never);

    render(<CaffeineCard date="2026-09-05" />);
    expect(screen.getByText('Estimated times')).toBeInTheDocument();
  });

  // The cutoff used to be a time or the word "Any time", which could not say
  // "you are already over" -- and printed "Any time" beside a red bedtime
  // badge when it was.
  it.each([
    ['passed', 'Too late for another'],
    ['over', 'Already over for tonight'],
    ['anytime', 'Any time'],
  ])('renders its own copy for the %s cutoff state', (state, copy) => {
    mockUseActiveCaffeineQuery.mockReturnValue({
      data: {
        ...baseData,
        cutoff_state: state,
        latest_safe_dose_time: state === 'passed' ? '06:10' : null,
      },
      isLoading: false,
    } as never);

    render(<CaffeineCard date="2026-09-05" />);
    expect(screen.getByText(copy)).toBeInTheDocument();
  });

  it('names the dose the cutoff was computed for, rather than a fixed 200mg', () => {
    mockUseActiveCaffeineQuery.mockReturnValue({
      data: { ...baseData, cutoff_dose_mg: 80 },
      isLoading: false,
    } as never);

    render(<CaffeineCard date="2026-09-05" />);
    expect(screen.getByText('For a 80mg dose')).toBeInTheDocument();
  });

  it('draws the curve with a marker per dose', () => {
    mockUseActiveCaffeineQuery.mockReturnValue({
      data: baseData,
      isLoading: false,
    } as never);

    render(<CaffeineCard date="2026-09-05" />);
    expect(screen.getByTestId('caffeine-chart')).toBeInTheDocument();
    expect(screen.getAllByTestId('dose-dot')).toHaveLength(1);
    // Threshold line plus the bedtime, now and cutoff markers.
    expect(screen.getByTestId('ref-line-y')).toBeInTheDocument();
    expect(screen.getAllByTestId('ref-line-x')).toHaveLength(3);
  });

  it('distinguishes a dose whose time was assumed from one that was logged', () => {
    mockUseActiveCaffeineQuery.mockReturnValue({
      data: {
        ...baseData,
        doses: [
          ...baseData.doses,
          {
            at: '2026-09-05T12:00:00.000Z',
            mg: 60,
            name: 'Lunch tea',
            is_estimated: true,
          },
        ],
        has_estimated_times: true,
      },
      isLoading: false,
    } as never);

    render(<CaffeineCard date="2026-09-05" />);
    expect(screen.getAllByTestId('dose-dot')).toHaveLength(1);
    expect(screen.getAllByTestId('dose-dot-estimated')).toHaveLength(1);
  });

  it('says when the curve drops back under the threshold', () => {
    mockUseActiveCaffeineQuery.mockReturnValue({
      data: {
        ...baseData,
        doses: [{ at: '2026-09-05T08:00:00.000Z', mg: 200, name: 'Double' }],
      },
      isLoading: false,
    } as never);

    render(<CaffeineCard date="2026-09-05" />);
    // 200 mg halves to 100 mg after exactly one 5 h half-life.
    expect(screen.getByText(/Back under 100mg from/)).toBeInTheDocument();
  });

  // In-plot labels were clipped by the chart's top margin, and the "now" line
  // never had one at all, so the marks are named beneath the plot instead.
  it('names every mark on the plot', () => {
    mockUseActiveCaffeineQuery.mockReturnValue({
      data: baseData,
      isLoading: false,
    } as never);

    render(<CaffeineCard date="2026-09-05" />);
    expect(screen.getByText('Active caffeine')).toBeInTheDocument();
    expect(screen.getByText('100mg sleep threshold')).toBeInTheDocument();
    expect(screen.getByText('Bedtime 22:30')).toBeInTheDocument();
    expect(screen.getByText('Now')).toBeInTheDocument();
    expect(screen.getByText('Logged dose')).toBeInTheDocument();
    // Only explained when there is an assumed dose to explain.
    expect(screen.queryByText('Assumed time')).not.toBeInTheDocument();
  });

  it('explains the hollow marker only when a dose time was assumed', () => {
    mockUseActiveCaffeineQuery.mockReturnValue({
      data: { ...baseData, has_estimated_times: true },
      isLoading: false,
    } as never);

    render(<CaffeineCard date="2026-09-05" />);
    expect(screen.getByText('Assumed time')).toBeInTheDocument();
  });

  // The cutoff is a moment on the same timeline as everything else, so it
  // belongs on the plot rather than only in a tile above it.
  it('marks the cutoff on the chart and names it in the legend', () => {
    mockUseActiveCaffeineQuery.mockReturnValue({
      data: baseData,
      isLoading: false,
    } as never);

    render(<CaffeineCard date="2026-09-05" />);
    // Threshold (y) plus bedtime, now and cutoff (x).
    expect(screen.getAllByTestId('ref-line-x')).toHaveLength(3);
    expect(screen.getByText(/Last 200mg dose/)).toBeInTheDocument();
  });

  it('omits the cutoff marker when no dose fits at all', () => {
    mockUseActiveCaffeineQuery.mockReturnValue({
      data: {
        ...baseData,
        // 400 mg an hour before bed leaves no room under the threshold.
        doses: [{ at: '2026-09-05T19:30:00.000Z', mg: 400 }],
      },
      isLoading: false,
    } as never);

    render(<CaffeineCard date="2026-09-05" />);
    expect(screen.getAllByTestId('ref-line-x')).toHaveLength(2);
    expect(screen.queryByText(/Last 200mg dose/)).not.toBeInTheDocument();
  });

  // A long half-life against a small headroom pushes the cutoff a day or more
  // into the past. The marker is outside the plot and hidden; the legend used
  // to keep printing its bare HH:MM, which reads as a time today.
  it('drops the cutoff from the legend when it falls outside the plotted day', () => {
    mockUseActiveCaffeineQuery.mockReturnValue({
      data: {
        ...baseData,
        half_life_hours: 8,
        // ~97 mg projected at the 20:30Z bedtime leaves ~3 mg of headroom, so
        // a 200 mg dose would have had to be taken about two days earlier.
        doses: [
          { at: '2026-09-05T16:20:00.000Z', mg: 126, name: 'Double Espresso' },
          { at: '2026-09-05T12:00:00.000Z', mg: 20, name: 'Ice Coffe' },
        ],
        at_bedtime_mg: 97,
        cutoff_state: 'passed',
      },
      isLoading: false,
    } as never);

    render(<CaffeineCard date="2026-09-05" />);
    expect(screen.queryByText(/Last 200mg dose/)).not.toBeInTheDocument();
    // Bedtime and now remain; the cutoff marker does not.
    expect(screen.getAllByTestId('ref-line-x')).toHaveLength(2);
  });
});
