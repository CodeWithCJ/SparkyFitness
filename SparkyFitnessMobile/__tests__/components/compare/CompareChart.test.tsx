import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import {
  type CompareQuestion,
  type CompareResponse,
  type CompareResult,
} from '@workspace/shared';

import CompareChart from '../../../src/components/compare/CompareChart';
import { initializeI18n } from '../../../src/localization/i18n';

// The global victory-native mock drops CartesianChart's children; render the
// render-prop with plotted points and mark each series as an identifiable View.
jest.mock('victory-native', () => {
  const ReactModule: typeof import('react') = require('react');
  const { View }: typeof import('react-native') = require('react-native');
  return {
    CartesianChart: ({
      children,
      data,
      yKeys,
    }: {
      children: (arg: unknown) => React.ReactNode;
      data: Record<string, number | null>[];
      yKeys: string[];
    }) => {
      const arg = ReactModule.useMemo(() => {
        const points: Record<string, unknown[]> = {};
        for (const key of yKeys) {
          points[key] = data.map((d, i) => ({
            x: i,
            xValue: i,
            y: 0,
            yValue: d[key],
          }));
        }
        return { points };
      }, [data, yKeys]);
      return ReactModule.createElement(
        View,
        { testID: 'cartesian-chart' },
        children(arg)
      );
    },
    Line: (props: Record<string, unknown>) =>
      ReactModule.createElement(View, { testID: 'line-mark', ...props }),
    Scatter: (props: Record<string, unknown>) =>
      ReactModule.createElement(View, { testID: 'scatter-mark', ...props }),
  };
});

jest.mock('@shopify/react-native-skia', () => ({
  DashPathEffect: () => null,
  matchFont: jest.fn(() => null),
}));

const Q: CompareQuestion = {
  a: 'meditationMinutes',
  b: 'mood',
  choice: 'sameDay',
};

function response(binary?: CompareResult['binary']): CompareResponse {
  return {
    a: {
      key: Q.a,
      values: { '2026-10-01': 10, '2026-10-02': 20, '2026-10-03': 15 },
    },
    b: {
      key: Q.b,
      values: { '2026-10-01': 58, '2026-10-02': 81, '2026-10-03': 70 },
    },
    through: '2026-10-21',
    deviations: {
      a: { '2026-10-01': -5, '2026-10-02': 5, '2026-10-03': 0 },
      b: { '2026-10-01': -12, '2026-10-02': 11, '2026-10-03': 1 },
    },
    result: {
      status: 'ok',
      n: 3,
      needed: 14,
      checks: { ownNormal: true },
      ...(binary ? { binary } : {}),
    },
  } as CompareResponse;
}

describe('CompareChart', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  it('opens on the dots with a dashed trend line for a real link', () => {
    const r = response();
    r.result = { ...r.result, linked: true };
    const { getByText, getAllByTestId, getByTestId } = render(
      <CompareChart response={r} question={Q} />
    );
    expect(getByText('Each day as a dot')).toBeTruthy();
    expect(getByText('Mood vs. your usual')).toBeTruthy();
    expect(getByText('Meditation minutes vs. your usual')).toBeTruthy();
    expect(getAllByTestId('scatter-mark')).toHaveLength(1);
    expect(getByTestId('line-mark')).toBeTruthy();
  });

  it('switches to the over-time view with display-scale ranges', () => {
    const { getByText, getAllByTestId, queryByTestId } = render(
      <CompareChart response={response()} question={Q} />
    );
    fireEvent.press(getByText('Over time'));
    expect(getAllByTestId('line-mark')).toHaveLength(2);
    expect(queryByTestId('scatter-mark')).toBeNull();
    expect(getByText('Mood 5.8–8.1')).toBeTruthy();
    expect(getByText('Meditation minutes 10–20')).toBeTruthy();
  });

  it('shows bedtime as clock times and counts without decimals in the legend', () => {
    const r = response();
    r.a = {
      key: 'bedtime',
      values: { '2026-10-01': 255, '2026-10-02': 345, '2026-10-03': 300 },
    };
    r.b = {
      key: 'steps',
      values: { '2026-10-01': 8000, '2026-10-02': 12001.6, '2026-10-03': 9000 },
    };
    const { getByText } = render(
      <CompareChart
        response={r}
        question={{ a: 'bedtime', b: 'steps', choice: 'sameWeek' }}
      />
    );
    fireEvent.press(getByText('Over time'));
    expect(getByText(/^Bedtime 10:15\sPM–11:45\sPM$/)).toBeTruthy();
    expect(getByText('Steps 8,000–12,002')).toBeTruthy();
  });

  it('reads a bedtime past midnight as an early-morning time', () => {
    const r = response();
    r.a = {
      key: 'bedtime',
      values: { '2026-10-01': 330, '2026-10-02': 420 },
    };
    r.b = { key: 'calories', values: { '2026-10-01': 1850.4 } };
    const { getByText } = render(
      <CompareChart
        response={r}
        question={{ a: 'bedtime', b: 'calories', choice: 'sameDay' }}
      />
    );
    fireEvent.press(getByText('Over time'));
    expect(getByText(/^Bedtime 11:30\sPM–1:00\sAM$/)).toBeTruthy();
    expect(getByText('Calories 1,850–1,850')).toBeTruthy();
  });

  it('says each week as a dot in week mode', () => {
    const { getByText } = render(
      <CompareChart
        response={response()}
        question={{ ...Q, choice: 'sameWeek' }}
      />
    );
    expect(getByText('Each week as a dot')).toBeTruthy();
  });

  it('shows the bars instead of dots for a binary result, but still charts over time', () => {
    const binary = {
      yesKey: 'meditated',
      yesMean: 72,
      noMean: 63,
      yesCount: 12,
      noCount: 28,
      diff: 6,
    } as const;
    const q: CompareQuestion = { a: 'meditated', b: 'mood', choice: 'sameDay' };
    const { getByTestId, queryByTestId, getByText, queryByText } = render(
      <CompareChart response={response(binary)} question={q} />
    );
    expect(getByText('Days you meditated')).toBeTruthy();
    expect(queryByTestId('scatter-mark')).toBeNull();
    fireEvent.press(getByText('Over time'));
    expect(queryByText('Days you meditated')).toBeNull();
    expect(getByTestId('cartesian-chart')).toBeTruthy();
  });

  it('still draws dots but no trend line when there is not enough data', () => {
    const r = response();
    r.result = { ...r.result, status: 'not_enough', reason: 'tooFew' };
    const { getAllByTestId, queryByTestId } = render(
      <CompareChart response={r} question={Q} />
    );
    expect(getAllByTestId('scatter-mark')).toHaveLength(1);
    expect(queryByTestId('line-mark')).toBeNull();
  });

  it('leaves the trend line out under "No clear link"', () => {
    const r = response();
    r.result = { ...r.result, method: 'pearson', linked: false };
    const { getAllByTestId, queryByTestId } = render(
      <CompareChart response={r} question={Q} />
    );
    expect(getAllByTestId('scatter-mark')).toHaveLength(1);
    expect(queryByTestId('line-mark')).toBeNull();
  });

  it('leaves the trend line out when the dots have no spread to fit', () => {
    const r = response();
    r.result = { ...r.result, linked: true };
    r.deviations.a = {
      '2026-10-01': 0,
      '2026-10-02': 0,
      '2026-10-03': 0,
    };
    const { getAllByTestId, queryByTestId } = render(
      <CompareChart response={r} question={Q} />
    );
    expect(getAllByTestId('scatter-mark')).toHaveLength(1);
    expect(queryByTestId('line-mark')).toBeNull();
  });

  it('captions a yes/no side as yes or no by the day', () => {
    const r = response();
    r.result = { ...r.result, status: 'not_enough', reason: 'tooFew' };
    const first = render(
      <CompareChart
        response={r}
        question={{ a: 'meditated', b: 'mood', choice: 'sameDay' }}
      />
    );
    expect(first.getByText('Meditated (yes or no)')).toBeTruthy();
    expect(first.getByText('Mood vs. your usual')).toBeTruthy();
    expect(first.queryByText('Meditated vs. your usual')).toBeNull();

    const second = render(
      <CompareChart
        response={r}
        question={{ a: 'mood', b: 'meditated', choice: 'nextDay' }}
      />
    );
    expect(second.getByText('Meditated (yes or no)')).toBeTruthy();
    expect(second.getByText('Mood vs. your usual')).toBeTruthy();
  });

  it('captions a yes/no side as days per week by the week', () => {
    const { getByText, queryByText } = render(
      <CompareChart
        response={response()}
        question={{ a: 'meditated', b: 'mood', choice: 'sameWeek' }}
      />
    );
    expect(getByText('Days you meditated vs. your usual')).toBeTruthy();
    expect(queryByText(/yes or no/)).toBeNull();
  });

  it('says no days or no weeks when nothing pairs up', () => {
    const r = response();
    r.deviations = { a: {}, b: {} };
    const day = render(<CompareChart response={r} question={Q} />);
    expect(day.getByText('No days with both yet')).toBeTruthy();
    const week = render(
      <CompareChart response={r} question={{ ...Q, choice: 'sameWeek' }} />
    );
    expect(week.getByText('No weeks with both yet')).toBeTruthy();
    expect(week.queryByText('No days with both yet')).toBeNull();
  });

  it('labels the over-time chart for screen readers', () => {
    const { getByText, getByLabelText } = render(
      <CompareChart response={response()} question={Q} />
    );
    fireEvent.press(getByText('Over time'));
    expect(
      getByLabelText(
        'Meditation minutes and Mood over time, each scaled to its own range'
      )
    ).toBeTruthy();
  });
});
