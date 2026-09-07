import React from 'react';
import { render } from '@testing-library/react-native';

import SleepStagesBreakdown from '../../src/components/SleepStagesBreakdown';
import { initializeI18n } from '../../src/localization/i18n';
import { buildSleepEntry } from '../helpers/sleepFixtures';

jest.mock('uniwind', () => ({
  useCSSVariable: (keys: string | string[]) =>
    Array.isArray(keys) ? keys.map(() => '#111827') : '#111827',
}));

/** Reads every rendered percentage back out as a number, for sum assertions. */
const renderedPercents = (
  queryAllByText: (m: RegExp) => { children: unknown[] }[]
): number[] =>
  queryAllByText(/^\d+%$/).map((node) =>
    parseInt(String(node.children[0]), 10)
  );

describe('SleepStagesBreakdown', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  test('renders each stage with a duration and a percentage', () => {
    const entry = buildSleepEntry({
      deep_sleep_seconds: 5400,
      light_sleep_seconds: 14400,
      rem_sleep_seconds: 7200,
      awake_sleep_seconds: 1800,
    });

    const { getByTestId, queryAllByText } = render(
      <SleepStagesBreakdown entry={entry} />
    );

    expect(getByTestId('sleep-stage-deep')).toBeTruthy();
    expect(getByTestId('sleep-stage-light')).toBeTruthy();
    expect(getByTestId('sleep-stage-rem')).toBeTruthy();
    expect(getByTestId('sleep-stage-awake')).toBeTruthy();
    expect(renderedPercents(queryAllByText)).toHaveLength(4);
    expect(queryAllByText(/^\d+h \d+m$|^\d+m$/).length).toBeGreaterThanOrEqual(
      4
    );
  });

  test('percentages sum to exactly 100 after rounding', () => {
    // Three equal thirds are the classic largest-remainder trap: naive rounding gives 99.
    const entry = buildSleepEntry({
      deep_sleep_seconds: 1000,
      light_sleep_seconds: 1000,
      rem_sleep_seconds: 1000,
      awake_sleep_seconds: null,
    });

    const { queryAllByText } = render(<SleepStagesBreakdown entry={entry} />);

    const percents = renderedPercents(queryAllByText);
    expect(percents).toHaveLength(3);
    expect(percents.reduce((sum, value) => sum + value, 0)).toBe(100);
  });

  test('renders nothing when all four stage columns are null', () => {
    const entry = buildSleepEntry({
      deep_sleep_seconds: null,
      light_sleep_seconds: null,
      rem_sleep_seconds: null,
      awake_sleep_seconds: null,
    });

    const { queryByTestId } = render(<SleepStagesBreakdown entry={entry} />);

    expect(queryByTestId('sleep-stages-breakdown')).toBeNull();
  });

  test('hides a null stage and computes percentages over the present ones only', () => {
    const entry = buildSleepEntry({
      deep_sleep_seconds: 3600,
      light_sleep_seconds: 3600,
      rem_sleep_seconds: 3600,
      awake_sleep_seconds: null,
    });

    const { queryByTestId, queryAllByText } = render(
      <SleepStagesBreakdown entry={entry} />
    );

    expect(queryByTestId('sleep-stage-awake')).toBeNull();
    const percents = renderedPercents(queryAllByText);
    expect(percents).toHaveLength(3);
    expect(percents.reduce((sum, value) => sum + value, 0)).toBe(100);
  });

  test('reports 0% rather than NaN when every stage is zero', () => {
    const entry = buildSleepEntry({
      deep_sleep_seconds: 0,
      light_sleep_seconds: 0,
      rem_sleep_seconds: 0,
      awake_sleep_seconds: 0,
    });

    const { queryAllByText, queryByText } = render(
      <SleepStagesBreakdown entry={entry} />
    );

    expect(queryByText('NaN')).toBeNull();
    expect(queryByText(/NaN/)).toBeNull();
    expect(renderedPercents(queryAllByText)).toEqual([0, 0, 0, 0]);
  });
});
