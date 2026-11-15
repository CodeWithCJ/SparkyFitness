import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { bloodAlcoholChartWindow } from '@workspace/shared';
import type { BloodAlcoholResponse } from '@workspace/shared';
import BloodAlcoholCard from '../../src/components/BloodAlcoholCard';

// The global `victory-native` mock drops `CartesianChart`'s children; stub it
// to run the render prop so the curve mark renders.
jest.mock('victory-native', () => {
  const ReactModule: typeof import('react') = require('react');
  const { View }: typeof import('react-native') = require('react-native');
  return {
    CartesianChart: ({
      children,
      data,
    }: {
      children: (arg: unknown) => React.ReactNode;
      data: { t: number; value: number }[];
    }) =>
      ReactModule.createElement(
        View,
        { testID: 'cartesian-chart' },
        children({
          points: {
            value: data.map((d, i) => ({
              x: i,
              xValue: d.t,
              y: 0,
              yValue: d.value,
            })),
          },
        })
      ),
    Line: () => ReactModule.createElement(View, { testID: 'chart-line' }),
    Scatter: () => null,
  };
});

// Spy on the chart window so a test can check the day bounds it receives.
jest.mock('@workspace/shared', () => {
  const actual = jest.requireActual('@workspace/shared');
  return {
    ...actual,
    bloodAlcoholChartWindow: jest.fn(actual.bloodAlcoholChartWindow),
  };
});

let mockPreferences: { time_format: string; timezone?: string } = {
  time_format: 'HH:mm',
};
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: mockPreferences }),
}));

const DISCLAIMER =
  'Rough estimate only. The real value can differ by 20% or more. Never use it to decide whether you are fit to drive.';

const FIRST_DRINK = new Date('2026-09-05T19:00:00.000Z').getTime();
const NOW = FIRST_DRINK + 90 * 60 * 1000;
const localDay = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const DATE = localDay(FIRST_DRINK);

const okEstimate: BloodAlcoholResponse = {
  status: 'ok',
  missing_inputs: [],
  formula: 'watson',
  fell_back_from: null,
  display_unit: 'permille',
  elimination_rate: 0.15,
  distribution_factor: 0.7,
  weight_kg: 80,
  doses: [
    { at: '2026-09-05T19:00:00.000Z', grams: 20, name: 'Beer' },
    { at: '2026-09-05T19:45:00.000Z', grams: 20, name: 'Beer' },
  ],
  estimated_now_permille: 0.5,
  peak: { at: '2026-09-05T20:30:00.000Z', permille: 0.58 },
  has_estimated_times: false,
};

const noEstimate = {
  distribution_factor: null,
  weight_kg: null,
  estimated_now_permille: null,
  peak: null,
};

const renderCard = (
  estimate: BloodAlcoholResponse | undefined,
  nowMs: number = NOW
) =>
  render(
    <BloodAlcoholCard
      date={DATE}
      estimate={estimate}
      nowMs={nowMs}
      isLoading={false}
    />
  );

describe('BloodAlcoholCard', () => {
  afterEach(() => {
    mockPreferences = { time_format: 'HH:mm' };
  });

  it('shows the estimate, the peak and the curve in per mille', () => {
    renderCard(okEstimate);

    expect(screen.getByText('Estimated Blood Alcohol')).toBeTruthy();
    expect(screen.getByText('Estimated now')).toBeTruthy();
    expect(screen.getByText(/^Peak at /)).toBeTruthy();
    expect(screen.getByText(/^0\.58/)).toBeTruthy();
    expect(screen.getAllByText(/‰/).length).toBeGreaterThan(0);
    expect(screen.getByTestId('blood-alcohol-chart')).toBeTruthy();
    expect(screen.getByText(DISCLAIMER)).toBeTruthy();
  });

  it('shows values in percent when that is the display unit', () => {
    renderCard({ ...okEstimate, display_unit: 'percent' });

    expect(screen.getByText(/^0\.058/)).toBeTruthy();
    expect(screen.getAllByText(/^\s*%$/).length).toBeGreaterThan(0);
  });

  it('names each missing input and where to set it, with no estimate', () => {
    renderCard({
      ...okEstimate,
      ...noEstimate,
      status: 'missing_inputs',
      missing_inputs: ['sex', 'weight'],
    });

    expect(screen.getByTestId('blood-alcohol-missing-inputs')).toBeTruthy();
    expect(screen.getByText(/Sex: set it in your profile/)).toBeTruthy();
    expect(screen.getByText(/Weight: log it in Measurements/)).toBeTruthy();
    expect(screen.queryByText(/Height:/)).toBeNull();
    expect(screen.queryByTestId('blood-alcohol-chart')).toBeNull();
    expect(screen.queryByText('Estimated now')).toBeNull();
    expect(screen.getByText(DISCLAIMER)).toBeTruthy();
  });

  it('explains implausible inputs instead of estimating', () => {
    renderCard({ ...okEstimate, ...noEstimate, status: 'implausible_inputs' });

    expect(screen.getByTestId('blood-alcohol-implausible-inputs')).toBeTruthy();
    expect(screen.queryByTestId('blood-alcohol-chart')).toBeNull();
    expect(screen.getByText(DISCLAIMER)).toBeTruthy();
  });

  it('leaves out the current value on a day that is not today', () => {
    // A past day whose curve still covers this instant: the server sends no
    // current value, because that day's response leaves out today's drinks.
    renderCard({ ...okEstimate, estimated_now_permille: null });

    expect(screen.queryByText('Estimated now')).toBeNull();
    expect(screen.getByText(/^0\.58/)).toBeTruthy();
  });

  it('bounds the chart by the day in the profile time zone', () => {
    mockPreferences = { time_format: 'HH:mm', timezone: 'Pacific/Kiritimati' };
    const windowSpy = jest.mocked(bloodAlcoholChartWindow);
    windowSpy.mockClear();

    renderCard(okEstimate);

    // Kiritimati is UTC+14 all year, so its midnight is 10:00 UTC the day before.
    const [year, month, day] = DATE.split('-').map(Number);
    const startMs = Date.UTC(year, month - 1, day - 1, 10);
    expect(windowSpy).toHaveBeenCalledWith(
      okEstimate.doses,
      expect.anything(),
      { startMs, endMs: startMs + 24 * 60 * 60 * 1000 },
      NOW
    );
  });

  it('says when the chosen formula did not fit and Watson was used', () => {
    renderCard({ ...okEstimate, fell_back_from: 'seidl' });

    expect(screen.getByTestId('blood-alcohol-formula-fallback')).toBeTruthy();
    expect(screen.getByText(/so the Watson formula is used/)).toBeTruthy();
  });

  it('shows no formula note when the chosen formula was used', () => {
    renderCard(okEstimate);

    expect(screen.queryByTestId('blood-alcohol-formula-fallback')).toBeNull();
  });

  it('never states when the estimate reaches zero', () => {
    renderCard(okEstimate);

    expect(
      screen.queryByText(/sober|safe to drive|back to zero|zero at|until/i)
    ).toBeNull();
  });

  it('renders nothing while loading or on a day without drinks', () => {
    const { toJSON, rerender } = render(
      <BloodAlcoholCard
        date={DATE}
        estimate={undefined}
        nowMs={NOW}
        isLoading={true}
      />
    );
    expect(toJSON()).toBeNull();

    rerender(
      <BloodAlcoholCard
        date={DATE}
        estimate={{ ...okEstimate, doses: [], peak: null }}
        nowMs={NOW}
        isLoading={false}
      />
    );
    expect(toJSON()).toBeNull();
  });
});
