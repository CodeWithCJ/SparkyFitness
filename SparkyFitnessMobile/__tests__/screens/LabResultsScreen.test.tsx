import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import LabResultsScreen from '../../src/screens/LabResultsScreen';
import {
  useDeleteLabImports,
  useLabMarkers,
} from '../../src/hooks/useLabResults';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-toast-message', () => ({ show: jest.fn() }));
jest.mock('../../src/components/Icon', () => 'Icon');
const mockHeaderConfigs: { right: unknown }[] = [];
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: (config: { right: unknown }) => {
    mockHeaderConfigs.push(config);
    return null;
  },
}));
jest.mock('../../src/hooks/useRefetchOnFocus', () => ({
  useRefetchOnFocus: jest.fn(),
}));
jest.mock('../../src/hooks/useLabResults', () => ({
  useDeleteLabImports: jest.fn(),
  useLabMarkers: jest.fn(),
}));

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as never;
const route = { params: undefined } as never;
const mutate = jest.fn();

const marker = {
  id: 'builtin:hba1c',
  markerKey: 'hba1c',
  markerId: null,
  name: 'HbA1c',
  unit: '%',
  ref_range_low: 4,
  ref_range_high: 5.6,
  latest: {
    id: 'r1',
    user_id: 'u1',
    marker_key: 'hba1c',
    custom_marker_id: null,
    entry_date: '2026-09-12',
    value_numeric: 5.1,
    value_text: null,
    unit: '%',
    ref_range_low: null,
    ref_range_high: null,
    lab_name: null,
    notes: null,
    source: 'manual',
  },
};

describe('LabResultsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHeaderConfigs.length = 0;
    jest.mocked(useLabMarkers).mockReturnValue({
      markers: [],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as never);
    jest.mocked(useDeleteLabImports).mockReturnValue({ mutate } as never);
  });

  it('offers to import a report when there are no results, and when there are', () => {
    const empty = render(
      <LabResultsScreen navigation={navigation} route={route} />
    );
    fireEvent.press(empty.getByText('Import from a report'));
    expect(
      (navigation as { navigate: jest.Mock }).navigate
    ).toHaveBeenCalledWith('LabReportImport');
    empty.unmount();

    jest.mocked(useLabMarkers).mockReturnValue({
      markers: [marker],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as never);
    const filled = render(
      <LabResultsScreen navigation={navigation} route={route} />
    );
    expect(filled.getByText('HbA1c')).toBeTruthy();
    fireEvent.press(filled.getByText('Import from a report'));
    expect(
      (navigation as { navigate: jest.Mock }).navigate
    ).toHaveBeenLastCalledWith('LabReportImport');
  });

  it('deletes the imported results from the header menu only after confirming', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    render(<LabResultsScreen navigation={navigation} route={route} />);

    const right = mockHeaderConfigs[mockHeaderConfigs.length - 1].right as {
      kind: string;
      items?: { label: string; onPress: () => void }[];
    }[];
    const menu = right.find((item) => item.kind === 'menu')!;
    expect(menu.items![0].label).toBe('Delete imported results');

    menu.items![0].onPress();
    expect(mutate).not.toHaveBeenCalled();

    const buttons = alert.mock.calls[0][2]!;
    buttons.find((b) => b.style === 'destructive')!.onPress!();
    expect(mutate).toHaveBeenCalled();
  });
});
