import React from 'react';
import { render } from '@testing-library/react-native';
import RunningFormCard from '../../../src/components/exerciseStats/RunningFormCard';
import { initializeI18n } from '../../../src/localization';
import type { RunFormTrend } from '../../../src/utils/runningForm';

const trend = (overrides: Partial<RunFormTrend> = {}): RunFormTrend => ({
  points: [],
  cadence: {
    latest: 172,
    average: 168,
    change: 6,
    values: [160, 166, 172],
  },
  stride: {
    latest: 112.5,
    average: 110,
    change: -2,
    values: [108, 110, 112.5],
  },
  ...overrides,
});

describe('RunningFormCard', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  it('shows the latest cadence and stride with the average and change', () => {
    const screen = render(
      <RunningFormCard trend={trend()} distanceUnit="km" />
    );

    expect(screen.getByText('Running form')).toBeTruthy();
    expect(screen.getByText('172 spm')).toBeTruthy();
    expect(screen.getByText('1.13 m')).toBeTruthy();
    expect(
      screen.getByText('Average 168 spm · +6 spm vs earlier runs')
    ).toBeTruthy();
    expect(screen.getByText(/−/)).toBeTruthy();
  });

  it('shows stride in feet with the miles setting', () => {
    const screen = render(
      <RunningFormCard trend={trend()} distanceUnit="miles" />
    );

    expect(screen.getByText('3.69 ft')).toBeTruthy();
  });

  it('shows cadence alone when no run has a stride', () => {
    const screen = render(
      <RunningFormCard trend={trend({ stride: null })} distanceUnit="km" />
    );

    expect(screen.getByTestId('running-form-cadence')).toBeTruthy();
    expect(screen.queryByTestId('running-form-stride')).toBeNull();
  });

  it('leaves out the change when the newest run matches the earlier ones', () => {
    const screen = render(
      <RunningFormCard
        trend={trend({
          cadence: { latest: 168, average: 168, change: 0.4, values: [168] },
        })}
        distanceUnit="km"
      />
    );

    expect(screen.getByText('Average 168 spm')).toBeTruthy();
  });

  it('renders nothing without any measured run', () => {
    const screen = render(
      <RunningFormCard
        trend={trend({ cadence: null, stride: null })}
        distanceUnit="km"
      />
    );

    expect(screen.queryByText('Running form')).toBeNull();
  });
});
