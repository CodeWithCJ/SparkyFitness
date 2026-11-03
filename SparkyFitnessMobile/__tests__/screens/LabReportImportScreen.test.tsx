import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import LabReportImportScreen from '../../src/screens/LabReportImportScreen';
import {
  useImportLabReport,
  useScanLabReport,
} from '../../src/hooks/useLabReportImport';
import { pickLabReportPdf } from '../../src/services/labReportPicker';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-toast-message', () => ({ show: jest.fn() }));
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));
jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: () => false,
}));
jest.mock('../../src/components/CalendarSheet', () => 'CalendarSheet');
jest.mock('../../src/components/FormScreenChrome', () => {
  const { Pressable, Text } = jest.requireActual('react-native');
  return {
    FooterSaveBar: ({
      onPress,
      disabled,
    }: {
      onPress: () => void;
      disabled?: boolean;
    }) => (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
      >
        <Text>save-bar</Text>
      </Pressable>
    ),
  };
});
jest.mock('../../src/hooks/useLabResults', () => ({
  useLabMarkers: () => ({ markers: [] }),
}));
jest.mock('../../src/hooks/useProfile', () => ({
  useProfile: () => ({ profile: { gender: 'male' } }),
}));
jest.mock('../../src/hooks/useLabReportImport', () => ({
  useScanLabReport: jest.fn(),
  useImportLabReport: jest.fn(),
}));
jest.mock('../../src/services/labReportPicker', () => ({
  pickLabReportPdf: jest.fn(),
  pickLabReportFromLibrary: jest.fn(),
  pickLabReportFromCamera: jest.fn(),
}));

const scanned = {
  report: {
    lab_name: 'Labcorp',
    collected_on: '2026-09-12',
    results: [
      {
        name: 'LDL',
        value: 130,
        unit: 'mg/dL',
        ref_low: null,
        ref_high: 99,
        marker_key: 'ldl',
      },
      {
        name: 'TSH',
        value: 1.69,
        unit: 'uIU/mL',
        ref_low: 0.45,
        ref_high: 4.5,
        marker_key: 'tsh',
      },
    ],
  },
};

const navigation = { goBack: jest.fn(), navigate: jest.fn() } as never;
const route = { params: undefined } as never;
const importAsync = jest.fn();

describe('LabReportImportScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useScanLabReport).mockReturnValue({
      mutateAsync: jest.fn().mockResolvedValue(scanned),
      isPending: false,
      isError: false,
      reset: jest.fn(),
    } as never);
    importAsync.mockResolvedValue({ report: { id: 'rep-1' }, results: [] });
    jest.mocked(useImportLabReport).mockReturnValue({
      mutateAsync: importAsync,
      isPending: false,
    } as never);
    jest.mocked(pickLabReportPdf).mockResolvedValue({
      status: 'ok',
      document: 'AAA',
      mimeType: 'application/pdf',
    });
  });

  const openReview = async () => {
    const utils = render(
      <LabReportImportScreen navigation={navigation} route={route} />
    );
    fireEvent.press(utils.getByText('Choose a PDF'));
    await waitFor(() => expect(utils.getByText('Date of test')).toBeTruthy());
    return utils;
  };

  it('does not warn about a TSH printed in uIU/mL', async () => {
    const { queryByText } = await openReview();
    expect(queryByText(/Units are not converted/)).toBeNull();
  });

  it('saves the whole report in one call with each result’s own unit and range', async () => {
    const { getByText } = await openReview();

    fireEvent.press(getByText('save-bar'));

    await waitFor(() => expect(importAsync).toHaveBeenCalledTimes(1));
    const body = importAsync.mock.calls[0][0];
    expect(body.lab_name).toBe('Labcorp');
    expect(body.entry_date).toBe('2026-09-12');
    expect(body.results).toEqual([
      {
        marker_key: 'ldl',
        value_numeric: 130,
        unit: 'mg/dL',
        ref_range_low: null,
        ref_range_high: 99,
      },
      {
        marker_key: 'tsh',
        value_numeric: 1.69,
        unit: 'uIU/mL',
        ref_range_low: 0.45,
        ref_range_high: 4.5,
      },
    ]);
    expect((navigation as { goBack: jest.Mock }).goBack).toHaveBeenCalled();
  });

  it('saves a value the user corrected, not the scanned one', async () => {
    const { getByLabelText, getByText } = await openReview();

    fireEvent.changeText(getByLabelText('Result for LDL Cholesterol'), '97');
    fireEvent.press(getByText('save-bar'));

    await waitFor(() => expect(importAsync).toHaveBeenCalled());
    const results = importAsync.mock.calls[0][0].results;
    expect(
      results.find((r: { marker_key: string }) => r.marker_key === 'ldl')
        .value_numeric
    ).toBe(97);
    expect(
      results.find((r: { marker_key: string }) => r.marker_key === 'tsh')
        .value_numeric
    ).toBe(1.69);
  });

  it('leaves out a row whose edited value is not a number', async () => {
    const { getByLabelText, getByText } = await openReview();

    fireEvent.changeText(getByLabelText('Result for TSH'), 'abc');
    fireEvent.press(getByText('save-bar'));

    await waitFor(() => expect(importAsync).toHaveBeenCalled());
    const keys = importAsync.mock.calls[0][0].results.map(
      (r: { marker_key: string }) => r.marker_key
    );
    expect(keys).toEqual(['ldl']);
  });

  it('keeps the review on screen and says nothing was saved when the save fails', async () => {
    importAsync.mockRejectedValue(new Error('boom'));
    const { getByText } = await openReview();

    fireEvent.press(getByText('save-bar'));

    await waitFor(() =>
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          text1: 'Could not save the report. Nothing was saved.',
        })
      )
    );
    expect((navigation as { goBack: jest.Mock }).goBack).not.toHaveBeenCalled();
    expect(getByText('Date of test')).toBeTruthy();
  });
});
