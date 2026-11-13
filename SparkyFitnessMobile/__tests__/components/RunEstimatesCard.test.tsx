import React from 'react';
import { render, screen } from '@testing-library/react-native';
import type { RunningEstimatesResponse } from '@workspace/shared';
import RunEstimatesCard from '../../src/components/exerciseStats/RunEstimatesCard';
import { initializeI18n } from '../../src/localization/i18n';

const data = (
  overrides: Partial<RunningEstimatesResponse> = {}
): RunningEstimatesResponse => ({
  vo2Max: { value: 52.4, runs: 3, from: '2026-09-20', to: '2026-10-10' },
  power: {
    averageWatts: 243,
    wattsPerKg: 3.5,
    runs: [{ day: '2026-10-10', watts: 243 }],
  },
  ...overrides,
});

beforeAll(async () => {
  await initializeI18n('en');
});

test('shows both estimates, labelled as estimates', () => {
  render(<RunEstimatesCard data={data()} isLoading={false} isError={false} />);
  expect(screen.getByText('≈ 52.4')).toBeTruthy();
  expect(screen.getByText('From 3 runs in the last 6 weeks')).toBeTruthy();
  expect(screen.getByText('≈ 243 W')).toBeTruthy();
  expect(screen.getByText('Running power (3.5 W/kg)')).toBeTruthy();
  expect(screen.getByText('Average of 1 run in the last 4 weeks')).toBeTruthy();
  expect(screen.getByText(/Not a measurement/)).toBeTruthy();
});

test('shows only the estimate it has', () => {
  render(
    <RunEstimatesCard
      data={data({ vo2Max: null })}
      isLoading={false}
      isError={false}
    />
  );
  expect(screen.queryByTestId('run-estimate-vo2')).toBeNull();
  expect(screen.getByTestId('run-estimate-power')).toBeTruthy();
});

test('shows nothing when there is no run to estimate from', () => {
  render(
    <RunEstimatesCard
      data={data({ vo2Max: null, power: null })}
      isLoading={false}
      isError={false}
    />
  );
  expect(screen.queryByText('Running Estimates')).toBeNull();
});

test('reports a failed load', () => {
  render(
    <RunEstimatesCard data={undefined} isLoading={false} isError={true} />
  );
  expect(
    screen.getByText('Could not load your running estimates.')
  ).toBeTruthy();
});
