import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import type { TrainingConsistency } from '@workspace/shared';

import TrainingConsistencyCard from '../../src/components/exerciseStats/TrainingConsistencyCard';
import { initializeI18n } from '../../src/localization/i18n';

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <View testID={`icon-${name}`} />,
  };
});

jest.mock('uniwind', () => ({
  useCSSVariable: (keys: string | string[]) =>
    Array.isArray(keys) ? keys.map(() => '#111827') : '#111827',
}));

const DATA: TrainingConsistency = {
  today: '2026-10-02',
  firstDayOfWeek: 1,
  weeks: [
    { weekStart: '2026-09-21', workoutDays: 2 },
    { weekStart: '2026-09-28', workoutDays: 1 },
  ],
  trainingDays: ['2026-09-22', '2026-09-24', '2026-10-01'],
  weeklyStreak: { current: 2, longest: 5 },
  muscleSets: {
    thisWeek: { Chest: 8 },
    lastWeek: { Chest: 10, Back: 6 },
  },
};

describe('TrainingConsistencyCard', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  it('shows the weekly streak, this week and the muscle comparison', () => {
    const { getByText, getAllByTestId } = render(
      <TrainingConsistencyCard data={DATA} isLoading={false} isError={false} />
    );

    expect(getByText('Training Consistency')).toBeTruthy();
    expect(getByText('2 weeks')).toBeTruthy();
    expect(getByText('5 weeks')).toBeTruthy();
    expect(getByText('1 day')).toBeTruthy();
    expect(getAllByTestId('consistency-trained')).toHaveLength(3);
    expect(getByText('Chest')).toBeTruthy();
    expect(getByText('Back')).toBeTruthy();
  });

  it('sizes every square and every weekday label row to the same pitch', () => {
    const { getByLabelText, getAllByTestId, getByText } = render(
      <TrainingConsistencyCard data={DATA} isLoading={false} isError={false} />
    );
    // Two weeks across 200 points: each column is 100 wide.
    fireEvent(getByLabelText(/Training calendar/), 'layout', {
      nativeEvent: { layout: { width: 200, height: 0, x: 0, y: 0 } },
    });

    const square = StyleSheet.flatten(
      getAllByTestId('consistency-trained')[0].props.style
    );
    expect(square.width).toBe(98);
    expect(square.height).toBe(98);
    // A square plus its gap is one row, and the label rows are that tall too,
    // so "Tue" and "Thu" sit beside their own rows.
    expect(square.height + square.marginBottom).toBe(100);
    let row = getByText('Tue').parent;
    while (row && StyleSheet.flatten(row.props.style)?.height === undefined) {
      row = row.parent;
    }
    const labelRow = StyleSheet.flatten(row?.props.style);
    expect(labelRow.height).toBe(100);
  });

  it('says when no sets were logged this week or last', () => {
    const { getByText } = render(
      <TrainingConsistencyCard
        data={{ ...DATA, muscleSets: { thisWeek: {}, lastWeek: {} } }}
        isLoading={false}
        isError={false}
      />
    );
    expect(getByText('No sets logged this week or last.')).toBeTruthy();
  });

  it('shows an error line when nothing loaded', () => {
    const { getByText } = render(
      <TrainingConsistencyCard data={undefined} isLoading={false} isError />
    );
    expect(getByText('Could not load your training consistency.')).toBeTruthy();
  });
  it('names the week start in the subtitle and labels the grid', () => {
    const { getByText, getByTestId } = render(
      <TrainingConsistencyCard data={DATA} isLoading={false} isError={false} />
    );
    expect(getByText('Last 2 weeks, Monday to Sunday')).toBeTruthy();
    // Monday-first: the 2nd, 4th and 6th rows are Tue, Thu and Sat.
    expect(getByText('Tue')).toBeTruthy();
    expect(getByText('Thu')).toBeTruthy();
    expect(getByText('Sat')).toBeTruthy();
    expect(getByText('Sep')).toBeTruthy();
    expect(getByText('Workout day')).toBeTruthy();
    expect(getByText('No workout')).toBeTruthy();
    expect(
      getByText('Each square is a day and each column is a week.')
    ).toBeTruthy();
    expect(getByTestId('consistency-legend')).toBeTruthy();
  });

  it('follows the first day of the week the server used', () => {
    const { getByText } = render(
      <TrainingConsistencyCard
        data={{ ...DATA, firstDayOfWeek: 0 }}
        isLoading={false}
        isError={false}
      />
    );
    expect(getByText('Last 2 weeks, Sunday to Saturday')).toBeTruthy();
    // Sunday-first: the 2nd, 4th and 6th rows are Mon, Wed and Fri.
    expect(getByText('Mon')).toBeTruthy();
    expect(getByText('Wed')).toBeTruthy();
    expect(getByText('Fri')).toBeTruthy();
  });
});
