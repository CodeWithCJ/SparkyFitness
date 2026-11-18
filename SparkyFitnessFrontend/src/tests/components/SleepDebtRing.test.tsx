import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { SleepDebtData } from '@workspace/shared';
import SleepDebtRing from '@/pages/Reports/SleepScience/SleepDebtRing';

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

const debt = (currentDebt: number): SleepDebtData => ({
  currentDebt,
  debtCategory: 'low',
  sleepNeed: 8,
  last14Days: [],
  trend: { direction: 'stable', change7d: 0 },
  paybackTime: 0,
});

describe('SleepDebtRing', () => {
  it('shows a sleep surplus instead of a negative debt', () => {
    render(<SleepDebtRing data={debt(-1 / 3)} />);
    expect(screen.getByText('20m')).toBeInTheDocument();
    expect(screen.getByText('Sleep Surplus')).toBeInTheDocument();
    expect(screen.getByText('Surplus')).toBeInTheDocument();
    expect(screen.queryByText('-20m')).not.toBeInTheDocument();
    expect(screen.queryByText('Sleep Debt')).not.toBeInTheDocument();
  });

  it('shows a positive debt as sleep debt', () => {
    render(<SleepDebtRing data={debt(1.5)} />);
    expect(screen.getByText('1h 30m')).toBeInTheDocument();
    expect(screen.getByText('Sleep Debt')).toBeInTheDocument();
    expect(screen.getByText('Low')).toBeInTheDocument();
  });
});
