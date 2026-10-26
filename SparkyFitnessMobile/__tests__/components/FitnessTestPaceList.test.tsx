import React from 'react';
import { render, screen, within } from '@testing-library/react-native';
import { comparePaces } from '@workspace/shared';
import FitnessTestPaceList from '../../src/components/recording/FitnessTestPaceList';
import { fitnessTest } from '../helpers/fitnessTestFixture';

const test = fitnessTest();

it('lists the five zones, easy to hard, with their ranges', () => {
  render(<FitnessTestPaceList paces={test.paces} unit="km" />);
  for (const [id, name] of [
    ['easy', 'Easy'],
    ['steady', 'Steady'],
    ['threshold', 'Threshold'],
    ['interval', 'Interval'],
    ['repetition', 'Repetition'],
  ]) {
    const row = screen.getByTestId(`fitness-pace-zone-${id}`);
    expect(within(row).getByText(name)).toBeTruthy();
    expect(within(row).getByText(/\d:\d\d–\d:\d\d\/km/)).toBeTruthy();
  }
  expect(
    screen.getByText(/Tempo .* · Marathon pace .* · Strides /)
  ).toBeTruthy();
});

it('shows the ranges per mile for a runner who uses miles', () => {
  render(<FitnessTestPaceList paces={test.paces} unit="miles" />);
  expect(
    within(screen.getByTestId('fitness-pace-zone-easy')).getByText(/\/mi/)
  ).toBeTruthy();
});

it('shows how each zone moved since the last test', () => {
  const faster = fitnessTest({
    measurement: { type: '5k', distanceMeters: 5000, durationSeconds: 1440 },
  });
  render(
    <FitnessTestPaceList
      paces={faster.paces}
      unit="km"
      change={comparePaces(test.paces, faster.paces)}
    />
  );
  expect(screen.getByTestId('fitness-pace-change-easy')).toBeTruthy();
  expect(
    within(screen.getByTestId('fitness-pace-change-threshold')).getByText(
      /s\/km faster/
    )
  ).toBeTruthy();
});

it('shows no change line without an earlier test', () => {
  render(<FitnessTestPaceList paces={test.paces} unit="km" change={null} />);
  expect(screen.queryByTestId('fitness-pace-change-easy')).toBeNull();
});
