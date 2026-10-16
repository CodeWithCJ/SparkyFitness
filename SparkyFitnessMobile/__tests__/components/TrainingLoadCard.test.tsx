import React from 'react';
import { render, screen } from '@testing-library/react-native';
import type { TrainingLoad } from '@workspace/shared';
import TrainingLoadCard from '../../src/components/exerciseStats/TrainingLoadCard';
import { initializeI18n } from '../../src/localization/i18n';

const load = (overrides: Partial<TrainingLoad> = {}): TrainingLoad => ({
  weeks: [
    { start: '2026-09-17', load: 120 },
    { start: '2026-09-24', load: 150 },
    { start: '2026-10-01', load: 130 },
    { start: '2026-10-08', load: 400 },
  ],
  acute: 400,
  chronic: 200,
  ratio: 2,
  status: 'spike',
  restDays: 0,
  recovery: 'takeRest',
  ...overrides,
});

beforeAll(async () => {
  await initializeI18n('en');
});

test('shows this week against the usual, the verdict and a rest nudge', () => {
  render(<TrainingLoadCard data={load()} isLoading={false} isError={false} />);
  expect(screen.getByText('400')).toBeTruthy();
  expect(screen.getByText('this week · usual 200')).toBeTruthy();
  expect(screen.getByText(/risk of injury/)).toBeTruthy();
  expect(screen.getByText(/Take a rest day/)).toBeTruthy();
  expect(screen.getAllByTestId('training-load-bar')).toHaveLength(4);
});

test('says you are rested after a light stretch', () => {
  render(
    <TrainingLoadCard
      data={load({ status: 'low', recovery: 'ready', acute: 40 })}
      isLoading={false}
      isError={false}
    />
  );
  expect(screen.getByText(/rested and ready/)).toBeTruthy();
});

test('explains there is nothing to compare yet', () => {
  render(
    <TrainingLoadCard
      data={load({ status: 'noData', recovery: 'ok', acute: 0, chronic: 0 })}
      isLoading={false}
      isError={false}
    />
  );
  expect(screen.getByText(/No workouts logged/)).toBeTruthy();
  expect(screen.queryByText(/Take a rest day/)).toBeNull();
});

test('shows a failure when nothing loaded', () => {
  render(
    <TrainingLoadCard data={undefined} isLoading={false} isError={true} />
  );
  expect(screen.getByText('Could not load your training load.')).toBeTruthy();
});
