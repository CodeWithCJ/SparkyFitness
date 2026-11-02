import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import LabResultDetailScreen from '../../src/screens/LabResultDetailScreen';
import {
  useDeleteLabResult,
  useLabHistory,
  useLabMarkers,
} from '../../src/hooks/useLabResults';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-toast-message', () => ({ show: jest.fn() }));
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));
jest.mock('../../src/hooks/useRefetchOnFocus', () => ({
  useRefetchOnFocus: jest.fn(),
}));
jest.mock('../../src/components/labs/LabHistoryChart', () => 'LabHistoryChart');
jest.mock('../../src/hooks/useLabResults', () => ({
  useDeleteLabResult: jest.fn(),
  useLabHistory: jest.fn(),
  useLabMarkers: jest.fn(),
}));

const marker = {
  id: 'builtin:hba1c',
  markerKey: 'hba1c',
  markerId: null,
  name: 'HbA1c',
  unit: '%',
  ref_range_low: 4,
  ref_range_high: 5.6,
  latest: null,
};

// The shape GET /api/v2/lab-results/entries answers with, newest first.
const result = (overrides: Record<string, unknown>) => ({
  id: 'e1',
  user_id: 'u1',
  marker_key: 'hba1c',
  custom_marker_id: null,
  entry_date: '2026-03-01',
  value_numeric: 5.1,
  value_text: null,
  unit: '%',
  ref_range_low: null,
  ref_range_high: null,
  lab_name: null,
  notes: null,
  source: 'manual',
  ...overrides,
});

const rows = [
  result({
    id: 'e2',
    entry_date: '2026-09-12',
    value_numeric: 6.1,
    notes: 'fasting',
  }),
  result({ id: 'e1' }),
];

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as never;
const route = { params: { marker: 'builtin:hba1c' } } as never;
const mutate = jest.fn();

describe('LabResultDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useLabMarkers).mockReturnValue({ markers: [marker] } as never);
    jest.mocked(useLabHistory).mockReturnValue({
      data: rows,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as never);
    jest.mocked(useDeleteLabResult).mockReturnValue({ mutate } as never);
  });

  it('shows the latest result, its status and every result', () => {
    const { getAllByText, getByText } = render(
      <LabResultDetailScreen navigation={navigation} route={route} />
    );

    // The latest value shows in the summary and again in the list.
    expect(getAllByText('6.1 %', { exact: false })).toHaveLength(2);
    expect(getAllByText('High')).toHaveLength(2);
    expect(getByText('5.1 %')).toBeTruthy();
    expect(getByText(/fasting/)).toBeTruthy();
  });

  it('says how many results are left off the chart for being in another unit', () => {
    jest.mocked(useLabHistory).mockReturnValue({
      data: [
        result({ id: 'n1', entry_date: '2026-09-12', value_numeric: 6.1 }),
        result({
          id: 'n2',
          entry_date: '2026-06-01',
          value_numeric: 43,
          unit: 'mmol/mol',
        }),
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as never);
    const { getByText } = render(
      <LabResultDetailScreen navigation={navigation} route={route} />
    );
    expect(getByText('1 result in another unit is not plotted.')).toBeTruthy();
  });

  it('draws the reference band from the newest plotted result, not an excluded latest', () => {
    jest.mocked(useLabMarkers).mockReturnValue({
      markers: [
        {
          ...marker,
          unit: 'mg/dL',
          ref_range_low: 70,
          ref_range_high: 99,
          ref_range_unit: 'mg/dL',
        },
      ],
    } as never);
    jest.mocked(useLabHistory).mockReturnValue({
      data: [
        // Newest: no unit, with bounds in a unit nobody recorded.
        result({
          id: 'n1',
          entry_date: '2026-09-12',
          value_numeric: 2.6,
          unit: '',
          ref_range_low: 1,
          ref_range_high: 3,
        }),
        result({
          id: 'n2',
          entry_date: '2026-06-01',
          value_numeric: 90,
          unit: 'mg/dL',
        }),
        result({
          id: 'n3',
          entry_date: '2026-03-01',
          value_numeric: 95,
          unit: 'mg/dL',
        }),
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as never);
    const { UNSAFE_root } = render(
      <LabResultDetailScreen navigation={navigation} route={route} />
    );
    const chart = UNSAFE_root.findByType('LabHistoryChart' as never);
    expect(chart.props.refRangeLow).toBe(70);
    expect(chart.props.refRangeHigh).toBe(99);
  });

  it('leaves the reference band off when nothing plotted has compatible bounds', () => {
    jest.mocked(useLabMarkers).mockReturnValue({
      markers: [{ ...marker, unit: 'mg/dL', ref_range_unit: 'mg/dL' }],
    } as never);
    jest.mocked(useLabHistory).mockReturnValue({
      data: [
        result({
          id: 'n1',
          entry_date: '2026-09-12',
          value_numeric: 2.6,
          unit: '',
          ref_range_low: 1,
          ref_range_high: 3,
        }),
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as never);
    const { UNSAFE_root } = render(
      <LabResultDetailScreen navigation={navigation} route={route} />
    );
    const chart = UNSAFE_root.findByType('LabHistoryChart' as never);
    expect(chart.props.refRangeLow).toBeNull();
    expect(chart.props.refRangeHigh).toBeNull();
  });

  it('says nothing when every result shares the unit', () => {
    const { queryByText } = render(
      <LabResultDetailScreen navigation={navigation} route={route} />
    );
    expect(queryByText(/not plotted/)).toBeNull();
  });

  it('confirms before deleting a result by its id', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { getAllByLabelText } = render(
      <LabResultDetailScreen navigation={navigation} route={route} />
    );

    fireEvent.press(getAllByLabelText('Delete')[0]);
    const buttons = alert.mock.calls[0][2]!;
    buttons.find((b) => b.style === 'destructive')!.onPress!();

    // Newest first, so the first Delete is the 2026-09-12 result.
    expect(mutate).toHaveBeenCalledWith('e2', expect.anything());
  });
});
