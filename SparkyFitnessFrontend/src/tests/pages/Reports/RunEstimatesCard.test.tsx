import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { RunningEstimatesResponse } from '@workspace/shared';
import RunEstimatesCard from '@/pages/Reports/RunEstimatesCard';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      key: string,
      options?:
        string | { defaultValue?: string; count?: number; perKg?: string }
    ) => {
      if (typeof options === 'string') return options;
      return (options?.defaultValue ?? key)
        .replace('{{count}}', String(options?.count ?? ''))
        .replace('{{perKg}}', options?.perKg ?? '');
    },
  }),
}));

const DATA: RunningEstimatesResponse = {
  vo2Max: { value: 52.4, runs: 3, from: '2026-09-20', to: '2026-10-10' },
  power: {
    averageWatts: 243,
    wattsPerKg: 3.5,
    runs: [{ day: '2026-10-10', watts: 243 }],
  },
};

describe('RunEstimatesCard', () => {
  it('shows both estimates, labelled as estimates', () => {
    render(<RunEstimatesCard data={DATA} />);
    expect(screen.getByText('≈ 52.4')).toBeInTheDocument();
    expect(screen.getByText('≈ 243 W')).toBeInTheDocument();
    expect(screen.getByText('Running power (3.5 W/kg)')).toBeInTheDocument();
    expect(screen.getByText(/Not a measurement/)).toBeInTheDocument();
  });

  it('shows only the estimate it has', () => {
    render(<RunEstimatesCard data={{ ...DATA, vo2Max: null }} />);
    expect(screen.queryByTestId('run-estimate-vo2')).not.toBeInTheDocument();
    expect(screen.getByTestId('run-estimate-power')).toBeInTheDocument();
  });

  it('renders nothing without data or without any estimate', () => {
    const { container, rerender } = render(
      <RunEstimatesCard data={undefined} />
    );
    expect(container).toBeEmptyDOMElement();
    rerender(<RunEstimatesCard data={{ vo2Max: null, power: null }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
