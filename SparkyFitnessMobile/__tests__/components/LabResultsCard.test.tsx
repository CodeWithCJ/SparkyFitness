import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import LabResultsCard from '../../src/components/labs/LabResultsCard';
import { useLabMarkers } from '../../src/hooks/useLabResults';

jest.mock('../../src/components/Icon', () => 'Icon');
jest.mock('uniwind', () => ({
  useCSSVariable: jest.fn(() => ['#000']),
}));
jest.mock('../../src/hooks/useLabResults', () => ({
  useLabMarkers: jest.fn(),
}));

const marker = (
  id: string,
  name: string,
  high: number | null,
  latest: { value: number; date: string } | null
) => ({
  id,
  markerKey: null,
  markerId: id,
  name,
  unit: 'mg/dL',
  ref_range_low: null,
  ref_range_high: high,
  latest: latest && {
    id: `r-${id}`,
    user_id: 'u1',
    marker_key: null,
    custom_marker_id: id,
    entry_date: latest.date,
    value_numeric: latest.value,
    value_text: null,
    unit: 'mg/dL',
    ref_range_low: null,
    ref_range_high: null,
    lab_name: null,
    notes: null,
    source: 'manual',
  },
});

const navigation = { navigate: jest.fn() } as never;

describe('LabResultsCard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders nothing when the user has no lab markers', () => {
    jest.mocked(useLabMarkers).mockReturnValue({ markers: [] } as never);
    const { toJSON } = render(<LabResultsCard navigation={navigation} />);
    expect(toJSON()).toBeNull();
  });

  it('shows the newest results with status and opens the lab list', () => {
    jest.mocked(useLabMarkers).mockReturnValue({
      markers: [
        marker('a', 'LDL', 100, { value: 130, date: '2026-09-20' }),
        marker('b', 'HDL', null, { value: 55, date: '2026-09-01' }),
      ],
    } as never);
    const { getByText, queryByText } = render(
      <LabResultsCard navigation={navigation} />
    );
    expect(getByText('LDL')).toBeTruthy();
    expect(getByText('130 mg/dL')).toBeTruthy();
    expect(getByText('High')).toBeTruthy();
    expect(queryByText(/outside the reference range/)).toBeTruthy();

    fireEvent.press(getByText('Lab results'));
    expect(
      (navigation as { navigate: jest.Mock }).navigate
    ).toHaveBeenCalledWith('LabResults');
  });

  it('counts only low and high results as outside the range', () => {
    jest.mocked(useLabMarkers).mockReturnValue({
      markers: [
        marker('a', 'LDL', 100, { value: 130, date: '2026-09-20' }),
        marker('b', 'HDL', null, { value: 55, date: '2026-09-01' }),
      ],
    } as never);
    const { getByText } = render(<LabResultsCard navigation={navigation} />);
    expect(getByText(/^1 outside the reference range/)).toBeTruthy();
  });

  it('shows no outside-range count when no result has a range to miss', () => {
    jest.mocked(useLabMarkers).mockReturnValue({
      markers: [marker('b', 'HDL', null, { value: 55, date: '2026-09-01' })],
    } as never);
    const { queryByText } = render(<LabResultsCard navigation={navigation} />);
    expect(queryByText(/outside the reference range/)).toBeNull();
  });

  it('prompts to add a result when markers exist but none has a value', () => {
    jest.mocked(useLabMarkers).mockReturnValue({
      markers: [marker('a', 'LDL', 100, null)],
    } as never);
    const { getByText } = render(<LabResultsCard navigation={navigation} />);
    expect(getByText('No results yet. Tap to add one.')).toBeTruthy();
  });
});
