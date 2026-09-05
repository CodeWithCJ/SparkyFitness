import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CaffeineCard } from '@/pages/Diary/CaffeineCard';
import { useActiveCaffeineQuery } from '@/hooks/Diary/useCaffeineKinetics';

jest.mock('@/hooks/Diary/useCaffeineKinetics', () => ({
  useActiveCaffeineQuery: jest.fn(),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
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
});
