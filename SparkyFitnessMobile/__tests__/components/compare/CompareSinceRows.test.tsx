import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type {
  CompareMetricKey,
  CompareSinceResponse,
  CompareSinceResult,
} from '@workspace/shared';

import CompareSinceRows from '../../../src/components/compare/CompareSinceRows';
import { initializeI18n } from '../../../src/localization/i18n';

const mockPresent = jest.fn();
jest.mock('../../../src/components/CalendarSheet', () => {
  const ReactModule: typeof import('react') = require('react');
  const { View }: typeof import('react-native') = require('react-native');
  return {
    __esModule: true,
    default: ReactModule.forwardRef(
      (props: Record<string, unknown>, ref: React.Ref<unknown>) => {
        ReactModule.useImperativeHandle(ref, () => ({
          present: mockPresent,
          dismiss: jest.fn(),
        }));
        return ReactModule.createElement(View, {
          testID: 'since-calendar',
          ...props,
        });
      }
    ),
  };
});

const TODAY = '2026-10-22';

function response(
  result: Partial<CompareSinceResult> = {},
  outcome: CompareMetricKey = 'mood'
): CompareSinceResponse {
  return {
    mode: 'since',
    habit: { key: 'meditated', values: {} },
    outcome: { key: outcome, values: {} },
    result: {
      status: 'ok',
      start: '2026-04-01',
      suggestedStart: '2026-04-01',
      line: 70,
      ...result,
    },
  };
}

const NO_START: Partial<CompareSinceResult> = {
  status: 'not_enough',
  reason: 'noStart',
  start: null,
  suggestedStart: null,
  line: 0,
};

function renderRows(
  props: Partial<React.ComponentProps<typeof CompareSinceRows>> = {}
) {
  const onStartChange = jest.fn();
  const onLineChange = jest.fn();
  const utils = render(
    <CompareSinceRows
      response={response()}
      outcome="mood"
      today={TODAY}
      habitStart={null}
      line={null}
      onStartChange={onStartChange}
      onLineChange={onLineChange}
      {...props}
    />
  );
  return { ...utils, onStartChange, onLineChange };
}

describe('CompareSinceRows', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  beforeEach(() => mockPresent.mockClear());

  it('shows the suggested start labelled as suggested and opens the calendar on it', () => {
    const { getByText, getByTestId, getByLabelText } = renderRows();
    expect(getByText('Apr 1, 2026')).toBeTruthy();
    expect(getByText('(suggested)')).toBeTruthy();
    fireEvent.press(getByLabelText('Start date: Apr 1, 2026'));
    expect(mockPresent).toHaveBeenCalled();
    const calendar = getByTestId('since-calendar');
    expect(calendar.props.selectedDate).toBe('2026-04-01');
    expect(calendar.props.minDate).toBe('2024-10-22');
    expect(calendar.props.maxDate).toBe('2026-10-21');
  });

  it('reports a picked day', () => {
    const { getByTestId, onStartChange } = renderRows();
    act(() => getByTestId('since-calendar').props.onSelectDate('2026-05-10'));
    expect(onStartChange).toHaveBeenCalledWith('2026-05-10');
  });

  it('shows a picked start without the suggested label', () => {
    const { getByText, queryByText } = renderRows({
      habitStart: '2026-05-10',
    });
    expect(getByText('May 10, 2026')).toBeTruthy();
    expect(queryByText('(suggested)')).toBeNull();
  });

  it('prompts for a date when there is no suggestion, with no line', () => {
    const { getByText, queryByText, getByTestId } = renderRows({
      response: response(NO_START),
    });
    expect(getByText('Pick a date')).toBeTruthy();
    expect(queryByText('(suggested)')).toBeNull();
    expect(queryByText(/^Line/)).toBeNull();
    expect(getByTestId('since-calendar').props.selectedDate).toBe('2026-10-21');
  });

  it('shows the line on the display scale and reports a pick in the stored one', () => {
    const { getByText, onLineChange } = renderRows();
    expect(getByText('Line: Mood ≥')).toBeTruthy();
    expect(screen.getByLabelText('Mood at or above: 7.0')).toBeTruthy();
    fireEvent.press(screen.getByRole('radio', { name: '8.0' }));
    expect(onLineChange).toHaveBeenCalledWith(80);
  });

  it('shows the line picked over the server one', () => {
    renderRows({ line: 50 });
    expect(screen.getByLabelText('Mood at or above: 5.0')).toBeTruthy();
  });

  it('reads a bedtime line as a clock time', () => {
    renderRows({
      response: response({ line: 300 }, 'bedtime'),
      outcome: 'bedtime',
    });
    expect(
      screen.getByLabelText(/^Bedtime at or above: 11:00\sPM$/)
    ).toBeTruthy();
  });

  it('has no line for a yes/no outcome', () => {
    const { queryByText } = renderRows({
      response: response({ line: 1 }, 'meditated'),
      outcome: 'meditated',
    });
    expect(queryByText(/^Line/)).toBeNull();
  });

  it('waits for an answer before offering a line', () => {
    const { getByText, queryByText } = renderRows({ response: undefined });
    expect(getByText('Pick a date')).toBeTruthy();
    expect(queryByText(/^Line/)).toBeNull();
  });
});
