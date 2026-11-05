import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { StrengthSummaryResponse } from '@workspace/shared';
import { StrengthBalanceCard } from '@/components/ExerciseCharts/StrengthBalanceCard';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      _key: string,
      fallback?: string | { defaultValue: string; value?: string }
    ) =>
      typeof fallback === 'string'
        ? fallback
        : (fallback?.defaultValue ?? '').replace(
            '{{value}}',
            fallback?.value ?? ''
          ),
  }),
}));

const lift = (exerciseName: string, estimatedOneRMKg: number) => ({
  exerciseId: null,
  exerciseName,
  estimatedOneRMKg,
  weightKg: estimatedOneRMKg,
  reps: 1,
  achievedAt: '2026-10-01',
});

const summary = (
  bodyweightKg: number | null,
  lifts = [lift('Back Squat', 100), lift('Bench Press', 90)]
): StrengthSummaryResponse => ({
  lifetime: {
    volumeKg: 12000,
    sets: 120,
    reps: 600,
    sessions: 20,
    firstDate: '2026-01-01',
  },
  bodyweightKg,
  lifts,
});

describe('StrengthBalanceCard', () => {
  it('shows key lifts against body weight and flags an off ratio', () => {
    render(<StrengthBalanceCard summary={summary(80)} weightUnit="kg" />);
    expect(screen.getByText('Squat')).toBeInTheDocument();
    expect(screen.getByText('1.25× body weight')).toBeInTheDocument();
    // Bench at 0.90 of squat is above the 0.65–0.85 range.
    expect(screen.getByText('0.90')).toBeInTheDocument();
    expect(screen.getByText('Above range')).toBeInTheDocument();
  });

  it('asks for a body weight when none is logged', () => {
    render(<StrengthBalanceCard summary={summary(null)} weightUnit="kg" />);
    expect(screen.queryByText(/body weight$/)).not.toBeInTheDocument();
    expect(
      screen.getByText('Log your body weight to see lifts as a multiple of it.')
    ).toBeInTheDocument();
  });

  it('explains what to log when no key lift is there', () => {
    render(
      <StrengthBalanceCard
        summary={summary(80, [lift('Bicep Curl', 30)])}
        weightUnit="kg"
      />
    );
    expect(screen.getByText(/Log a squat/)).toBeInTheDocument();
  });
});
