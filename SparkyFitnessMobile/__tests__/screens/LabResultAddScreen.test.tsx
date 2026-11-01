import React from 'react';
import { render } from '@testing-library/react-native';
import LabResultAddScreen from '../../src/screens/LabResultAddScreen';
import { useLabMarkers, useSaveLabResult } from '../../src/hooks/useLabResults';
import { useProfile } from '../../src/hooks/useProfile';

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
jest.mock('../../src/components/FormScreenChrome', () => ({
  FooterSaveBar: () => null,
}));
jest.mock('../../src/hooks/useLabResults', () => ({
  useLabMarkers: jest.fn(),
  useSaveLabResult: jest.fn(),
}));
jest.mock('../../src/hooks/useProfile', () => ({ useProfile: jest.fn() }));

const navigation = { goBack: jest.fn(), navigate: jest.fn() } as never;
const route = { params: { marker: 'builtin:hba1c' } } as never;

// An HbA1c result saved earlier in mmol/mol with its own range.
const hba1c = {
  id: 'builtin:hba1c',
  markerKey: 'hba1c',
  markerId: null,
  name: 'HbA1c',
  unit: 'mmol/mol',
  ref_range_low: 4,
  ref_range_high: 5.6,
  ref_range_unit: '%',
  latest: {
    id: 'r1',
    user_id: 'u1',
    marker_key: 'hba1c',
    custom_marker_id: null,
    entry_date: '2026-03-01',
    value_numeric: 38,
    value_text: null,
    unit: 'mmol/mol',
    ref_range_low: 20,
    ref_range_high: 38,
    lab_name: null,
    notes: null,
    source: 'manual',
    created_at: '2026-03-01T10:00:00.000Z',
    updated_at: '2026-03-01T10:00:00.000Z',
  },
};

const markersState = (markers: unknown[], isLoading: boolean) =>
  jest.mocked(useLabMarkers).mockReturnValue({
    markers,
    isLoading,
    isError: false,
    refetch: jest.fn(),
  } as never);

describe('LabResultAddScreen prefill', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useSaveLabResult).mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    } as never);
    jest.mocked(useProfile).mockReturnValue({
      profile: { gender: 'male' },
      isLoading: false,
    } as never);
  });

  it('waits for the markers, then fills in from the latest result', () => {
    markersState([], true);
    const { getByLabelText, rerender } = render(
      <LabResultAddScreen navigation={navigation} route={route} />
    );
    // Nothing is filled in from the bare preset while the markers load.
    expect(getByLabelText('Unit').props.value).toBe('');

    markersState([hba1c], false);
    rerender(<LabResultAddScreen navigation={navigation} route={route} />);

    expect(getByLabelText('Unit').props.value).toBe('mmol/mol');
    expect(getByLabelText('Low').props.value).toBe('20');
    expect(getByLabelText('High').props.value).toBe('38');
  });

  it('waits for the profile, so the sex-specific range is the right one', () => {
    markersState([], false);
    jest
      .mocked(useProfile)
      .mockReturnValue({ profile: undefined, isLoading: true } as never);
    const { getByLabelText, rerender } = render(
      <LabResultAddScreen navigation={navigation} route={route} />
    );
    expect(getByLabelText('Unit').props.value).toBe('');

    jest.mocked(useProfile).mockReturnValue({
      profile: { gender: 'male' },
      isLoading: false,
    } as never);
    rerender(<LabResultAddScreen navigation={navigation} route={route} />);
    expect(getByLabelText('Unit').props.value).toBe('%');
  });
});
