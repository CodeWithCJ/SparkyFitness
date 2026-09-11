import React from 'react';
import { render, screen } from '@testing-library/react-native';
import CaffeineCard from '../../src/components/CaffeineCard';
import type { CaffeineActiveResponse } from '@workspace/shared';

// The global `victory-native` mock in jest.setup.js drops `CartesianChart`'s
// children and exports no `Line`, so no mark would render. Stub the chart to
// invoke its render prop and name each series, so the threshold line and the
// curve can be told apart.
jest.mock('victory-native', () => {
  const ReactModule: typeof import('react') = require('react');
  const { View }: typeof import('react-native') = require('react-native');
  return {
    CartesianChart: ({
      children,
      data,
    }: {
      children: (arg: unknown) => React.ReactNode;
      data: { t: number; mg: number; threshold: number }[];
    }) => {
      const renderArg = ReactModule.useMemo(
        () => ({
          points: {
            mg: data.map((d, i) => ({ x: i, xValue: d.t, y: 0, yValue: d.mg })),
            threshold: data.map((d, i) => ({
              x: i,
              xValue: d.t,
              y: 0,
              yValue: d.threshold,
            })),
          },
          chartBounds: { left: 0, right: 100, top: 0, bottom: 100 },
        }),
        [data]
      );
      return ReactModule.createElement(
        View,
        { testID: 'cartesian-chart' },
        children(renderArg)
      );
    },
    Line: ({ points }: { points: { yValue: number }[] }) =>
      ReactModule.createElement(View, {
        testID: 'chart-line',
        // A constant series is the threshold; a varying one is the curve.
        accessibilityLabel: points.every((p) => p.yValue === points[0]?.yValue)
          ? 'threshold'
          : 'curve',
      }),
    Scatter: () => null,
  };
});

let mockPreferences = { time_format: 'HH:mm' };

jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: mockPreferences }),
}));

const NOW = new Date('2026-09-05T14:00:00.000Z').getTime();

const baseKinetics: CaffeineActiveResponse = {
  half_life_hours: 5,
  target_bedtime: '22:30',
  bedtime_at: '2026-09-05T20:30:00.000Z',
  doses: [
    {
      at: '2026-09-05T08:00:00.000Z',
      mg: 200,
      name: 'Morning Coffee',
      is_estimated: false,
    },
  ],
  active_mg_now: 87,
  at_bedtime_mg: 36,
  latest_safe_dose_time: '17:45',
  cutoff_state: 'by',
  bedtime_headroom_mg: 64,
  cutoff_dose_mg: 200,
  threshold_mg: 100,
  has_estimated_times: false,
};

describe('CaffeineCard (mobile)', () => {
  beforeEach(() => {
    mockPreferences = { time_format: 'HH:mm' };
  });

  it('renders the curve and the threshold as separate series', () => {
    render(
      <CaffeineCard kinetics={baseKinetics} nowMs={NOW} isLoading={false} />
    );

    expect(screen.getByTestId('caffeine-chart')).toBeTruthy();
    expect(screen.getByLabelText('curve')).toBeTruthy();
    expect(screen.getByLabelText('threshold')).toBeTruthy();
  });

  it('shows the cutoff time when one is still ahead in 24h format', () => {
    mockPreferences = { time_format: 'HH:mm' };
    render(
      <CaffeineCard kinetics={baseKinetics} nowMs={NOW} isLoading={false} />
    );
    expect(screen.getByText('17:45')).toBeTruthy();
    expect(screen.getByText('At 22:30')).toBeTruthy();
  });

  it('shows the cutoff time when one is still ahead in 12h format', () => {
    mockPreferences = { time_format: 'h:mm A' };
    render(
      <CaffeineCard kinetics={baseKinetics} nowMs={NOW} isLoading={false} />
    );
    expect(screen.getByText('5:45 PM')).toBeTruthy();
    expect(screen.getByText('At 10:30 PM')).toBeTruthy();
  });

  // The web card and this one read the same cutoff_state, so "already over"
  // can never be rendered as "any time" on one platform and not the other.
  it.each([
    ['passed', 'Too late'],
    ['over', 'Over'],
    ['anytime', 'Any time'],
  ] as const)('renders its own copy for the %s cutoff state', (state, copy) => {
    render(
      <CaffeineCard
        kinetics={{ ...baseKinetics, cutoff_state: state }}
        nowMs={NOW}
        isLoading={false}
      />
    );
    expect(screen.getByText(copy)).toBeTruthy();
  });

  it('renders nothing on a day with no caffeine', () => {
    const { toJSON } = render(
      <CaffeineCard
        kinetics={{ ...baseKinetics, doses: [] }}
        nowMs={NOW}
        isLoading={false}
      />
    );
    expect(toJSON()).toBeNull();
  });

  it('renders nothing while loading, rather than an empty chart', () => {
    const { toJSON } = render(
      <CaffeineCard kinetics={undefined} nowMs={NOW} isLoading={true} />
    );
    expect(toJSON()).toBeNull();
  });

  it('notes when dose times were assumed rather than logged', () => {
    render(
      <CaffeineCard
        kinetics={{ ...baseKinetics, has_estimated_times: true }}
        nowMs={NOW}
        isLoading={false}
      />
    );
    expect(screen.getByText('Some dose times were estimated')).toBeTruthy();
  });
});
