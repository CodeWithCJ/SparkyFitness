import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { summarizeOralCareRange } from '@workspace/shared';
import OralCareReport from '@/pages/Reports/OralCareReport';

const mockUseHistory = jest.fn();
jest.mock('@/hooks/CheckIn/useOralCare', () => ({
  useOralCareHistory: (...args: unknown[]) => mockUseHistory(...args),
}));
jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    formatDateInUserTimezone: (date: string) => date,
  }),
}));

const day = (date: string, brushing_count: number, goal_met: boolean) => ({
  date,
  brushing_count,
  brushing_seconds: brushing_count * 120,
  goal_met,
  other_count: 1,
});

describe('summarizeOralCareRange', () => {
  it('counts goal days and averages over the whole range', () => {
    expect(
      summarizeOralCareRange([
        day('2026-11-06', 2, true),
        day('2026-11-07', 1, false),
        day('2026-11-08', 3, true),
      ])
    ).toEqual({
      totalDays: 3,
      goalDays: 2,
      goalPercent: 67,
      brushesPerDay: 2,
      minutesPerDay: 4,
      other: 3,
    });
  });

  it('is all zero for an empty range', () => {
    expect(summarizeOralCareRange([]).goalPercent).toBe(0);
  });
});

describe('OralCareReport', () => {
  it('shows the goal days and streaks', () => {
    mockUseHistory.mockReturnValue({
      isLoading: false,
      data: {
        settings: { daily_target: 2, target_seconds: 120 },
        days: [day('2026-11-07', 2, true), day('2026-11-08', 1, false)],
        streak: 1,
        best_streak: 5,
        recent_custom_labels: [],
      },
    });
    render(<OralCareReport startDate="2026-11-07" endDate="2026-11-08" />);
    expect(screen.getByText('1 of 2 days')).toBeInTheDocument();
    expect(screen.getByText('Best: 5 days')).toBeInTheDocument();
    expect(mockUseHistory).toHaveBeenCalledWith('2026-11-07', '2026-11-08');
  });

  it('asks for at most 366 days', () => {
    mockUseHistory.mockReturnValue({ isLoading: true, data: undefined });
    render(<OralCareReport startDate="2020-01-01" endDate="2026-11-08" />);
    expect(mockUseHistory).toHaveBeenCalledWith('2025-11-08', '2026-11-08');
  });

  it('renders error state and retries on failure', () => {
    const mockRefetch = jest.fn();
    mockUseHistory.mockReturnValue({
      isLoading: false,
      isError: true,
      data: undefined,
      refetch: mockRefetch,
    });
    render(<OralCareReport startDate="2026-11-07" endDate="2026-11-08" />);
    expect(
      screen.getByText('Failed to load oral care report.')
    ).toBeInTheDocument();
    screen.getByRole('button', { name: /retry/i }).click();
    expect(mockRefetch).toHaveBeenCalled();
  });
});
