import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import CompareSpanControl from '../../../src/components/compare/CompareSpanControl';
import { getTodayDate } from '../../../src/utils/dateUtils';
import { initializeI18n } from '../../../src/localization/i18n';

let mockPickedFrom = '2026-09-01';
let mockPickedTo = '2026-09-20';
jest.mock('../../../src/components/DateRangeSheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: React.forwardRef(
      (
        props: { onConfirm: (from: string, to: string) => void },
        ref: unknown
      ) => {
        React.useImperativeHandle(ref, () => ({
          present: () => props.onConfirm(mockPickedFrom, mockPickedTo),
          dismiss: () => undefined,
        }));
        return <View />;
      }
    ),
  };
});

describe('CompareSpanControl', () => {
  beforeEach(() => {
    mockPickedFrom = '2026-09-01';
    mockPickedTo = '2026-09-20';
  });

  beforeAll(async () => {
    await initializeI18n('en');
  });

  it('offers 30/60/90 days and Custom in day mode', () => {
    const onSpanChange = jest.fn();
    const { getByText, queryByText } = render(
      <CompareSpanControl
        mode="day"
        span="90d"
        custom={null}
        onSpanChange={onSpanChange}
        onCustomChange={jest.fn()}
      />
    );
    expect(getByText('30 days')).toBeTruthy();
    expect(getByText('90 days')).toBeTruthy();
    expect(getByText('Custom')).toBeTruthy();
    expect(queryByText('1 year')).toBeNull();
    fireEvent.press(getByText('60 days'));
    expect(onSpanChange).toHaveBeenCalledWith('60d');
  });

  it('offers 6 months, 1 year and Custom in week mode', () => {
    const { getByText, queryByText } = render(
      <CompareSpanControl
        mode="week"
        span="6m"
        custom={null}
        onSpanChange={jest.fn()}
        onCustomChange={jest.fn()}
      />
    );
    expect(getByText('6 months')).toBeTruthy();
    expect(getByText('1 year')).toBeTruthy();
    expect(queryByText('30 days')).toBeNull();
  });

  it('passes a picked range on, ordered and not after today', () => {
    mockPickedFrom = '2099-01-01';
    mockPickedTo = '2026-09-20';
    const onSpanChange = jest.fn();
    const onCustomChange = jest.fn();
    const { getByText } = render(
      <CompareSpanControl
        mode="day"
        span="90d"
        custom={null}
        onSpanChange={onSpanChange}
        onCustomChange={onCustomChange}
      />
    );
    fireEvent.press(getByText('Custom'));
    const picked = onCustomChange.mock.calls[0][0];
    expect(picked.startDate <= picked.endDate).toBe(true);
    expect(picked.endDate <= getTodayDate()).toBe(true);
    expect(onSpanChange).toHaveBeenCalledWith('custom');
  });

  it('lets week mode keep up to 366 days but day mode only 180', () => {
    mockPickedFrom = '2025-01-01';
    mockPickedTo = '2026-01-01';
    const onWeek = jest.fn();
    const week = render(
      <CompareSpanControl
        mode="week"
        span="6m"
        custom={null}
        onSpanChange={jest.fn()}
        onCustomChange={onWeek}
      />
    );
    fireEvent.press(week.getByText('Custom'));
    expect(onWeek).toHaveBeenCalledWith({
      startDate: '2025-01-01',
      endDate: '2026-01-01',
    });

    const onDay = jest.fn();
    const day = render(
      <CompareSpanControl
        mode="day"
        span="90d"
        custom={null}
        onSpanChange={jest.fn()}
        onCustomChange={onDay}
      />
    );
    fireEvent.press(day.getByText('Custom'));
    expect(onDay.mock.calls[0][0].startDate).toBe('2025-07-06');
  });
});
