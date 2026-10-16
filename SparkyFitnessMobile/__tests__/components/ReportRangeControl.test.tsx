import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import ReportRangeControl from '../../src/components/reports/ReportRangeControl';
import { initializeI18n } from '../../src/localization/i18n';

let mockPickedFrom = '2026-09-01';
let mockPickedTo = '2026-09-20';
jest.mock('../../src/components/DateRangeSheet', () => {
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
        return <View testID="date-range-sheet" />;
      }
    ),
  };
});

describe('ReportRangeControl', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  afterEach(() => {
    mockPickedFrom = '2026-09-01';
    mockPickedTo = '2026-09-20';
  });

  it('offers the three presets and switches between them', () => {
    const onRangeChange = jest.fn();
    const { getByText, queryByText } = render(
      <ReportRangeControl range="30d" onRangeChange={onRangeChange} />
    );

    expect(queryByText('Custom')).toBeNull();
    fireEvent.press(getByText('7d'));
    expect(onRangeChange).toHaveBeenCalledWith('7d');
  });

  it('adds Custom, which picks days and then switches to them', () => {
    const onRangeChange = jest.fn();
    const onCustomRangeChange = jest.fn();
    const { getByText } = render(
      <ReportRangeControl
        range="30d"
        onRangeChange={onRangeChange}
        customRange={null}
        onCustomRangeChange={onCustomRangeChange}
      />
    );

    fireEvent.press(getByText('Custom'));

    expect(onCustomRangeChange).toHaveBeenCalledWith({
      startDate: '2026-09-01',
      endDate: '2026-09-20',
    });
    expect(onRangeChange).toHaveBeenCalledWith('custom');
  });

  it('keeps a picked range to the maximum length and to today', () => {
    mockPickedFrom = '2024-01-01';
    mockPickedTo = '2099-01-01';
    const onCustomRangeChange = jest.fn();
    const { getByText } = render(
      <ReportRangeControl
        range="30d"
        onRangeChange={jest.fn()}
        customRange={null}
        onCustomRangeChange={onCustomRangeChange}
      />
    );

    fireEvent.press(getByText('Custom'));

    const { startDate, endDate } = onCustomRangeChange.mock.calls[0][0];
    expect(endDate < '2099-01-01').toBe(true);
    expect(startDate < endDate).toBe(true);
  });

  it('shows the days picked under the control while Custom is active', () => {
    const { getByTestId, queryByTestId, rerender } = render(
      <ReportRangeControl
        range="custom"
        onRangeChange={jest.fn()}
        customRange={{ startDate: '2026-09-01', endDate: '2026-09-20' }}
        onCustomRangeChange={jest.fn()}
      />
    );
    expect(getByTestId('report-custom-range-label')).toBeTruthy();

    rerender(
      <ReportRangeControl
        range="7d"
        onRangeChange={jest.fn()}
        customRange={{ startDate: '2026-09-01', endDate: '2026-09-20' }}
        onCustomRangeChange={jest.fn()}
      />
    );
    expect(queryByTestId('report-custom-range-label')).toBeNull();
  });
});
