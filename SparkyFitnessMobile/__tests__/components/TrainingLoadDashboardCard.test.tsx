import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { TrainingLoad } from '@workspace/shared';
import TrainingLoadDashboardCard from '../../src/components/TrainingLoadDashboardCard';
import { useTrainingLoad } from '../../src/hooks/useTrainingLoad';

jest.mock('../../src/hooks/useTrainingLoad', () => ({
  useTrainingLoad: jest.fn(),
}));

const load = (overrides: Partial<TrainingLoad> = {}): TrainingLoad => ({
  weeks: [
    { start: '2026-09-16', load: 100 },
    { start: '2026-09-23', load: 120 },
    { start: '2026-09-30', load: 110 },
    { start: '2026-10-07', load: 240 },
  ],
  acute: 240,
  chronic: 143,
  ratio: 1.68,
  status: 'spike',
  restDays: 0,
  recovery: 'takeRest',
  ...overrides,
});

const navigation = { navigate: jest.fn() } as never;

const mockLoad = (data: TrainingLoad | undefined, isError = false) =>
  jest.mocked(useTrainingLoad).mockReturnValue({
    load: data,
    isLoading: false,
    isError,
  });

describe('TrainingLoadDashboardCard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows the week, the verdict and a rest nudge, and opens the statistics', () => {
    mockLoad(load());
    render(<TrainingLoadDashboardCard navigation={navigation} />);

    expect(screen.getByText('Training Load')).toBeTruthy();
    expect(screen.getByText('A big jump: ease off')).toBeTruthy();
    expect(
      screen.getByText('Take a rest day or an easy session.')
    ).toBeTruthy();
    expect(screen.getAllByTestId('training-load-dashboard-bar')).toHaveLength(
      4
    );

    fireEvent.press(screen.getByTestId('training-load-dashboard-card'));
    expect(
      (navigation as unknown as { navigate: jest.Mock }).navigate
    ).toHaveBeenCalledWith('ExerciseStatistics');
  });

  it('shows nothing before any workout is logged', () => {
    mockLoad(load({ status: 'noData' }));
    render(<TrainingLoadDashboardCard navigation={navigation} />);
    expect(screen.queryByTestId('training-load-dashboard-card')).toBeNull();
  });

  it('shows nothing while the load is not known', () => {
    mockLoad(undefined);
    render(<TrainingLoadDashboardCard navigation={navigation} />);
    expect(screen.queryByTestId('training-load-dashboard-card')).toBeNull();
  });

  it('says so when the first request fails', () => {
    mockLoad(undefined, true);
    render(<TrainingLoadDashboardCard navigation={navigation} />);
    expect(
      screen.getByTestId('training-load-dashboard-card-error')
    ).toBeTruthy();
    expect(screen.getByText('Could not load your training load.')).toBeTruthy();
  });

  it('keeps showing the cached load when a refetch fails', () => {
    mockLoad(load(), true);
    render(<TrainingLoadDashboardCard navigation={navigation} />);
    expect(screen.getByTestId('training-load-dashboard-card')).toBeTruthy();
    expect(
      screen.queryByTestId('training-load-dashboard-card-error')
    ).toBeNull();
  });
});
