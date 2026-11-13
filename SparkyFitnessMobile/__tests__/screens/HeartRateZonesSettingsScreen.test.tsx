import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { HeartRateZonesResponse } from '@workspace/shared';
import HeartRateZonesSettingsScreen from '../../src/screens/HeartRateZonesSettingsScreen';

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));

const mockUseHeartRateZones = jest.fn();
const mockMutate = jest.fn();
jest.mock('../../src/hooks/useHeartRateZones', () => ({
  useHeartRateZones: () => mockUseHeartRateZones(),
  useUpdateHeartRateZones: () => ({ mutate: mockMutate, isPending: false }),
}));

const mockNavigation = { goBack: jest.fn(), setOptions: jest.fn() } as any;
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

const response = (
  overrides: Partial<HeartRateZonesResponse['settings']> = {},
  resolved: Partial<HeartRateZonesResponse['resolved']> = {}
): HeartRateZonesResponse => ({
  settings: {
    max_heart_rate: null,
    resting_heart_rate: null,
    method: 'percent_max',
    custom_floors: null,
    display_zones: 5,
    ...overrides,
  },
  resolved: {
    max_hr: 188,
    max_hr_source: 'age',
    resting_hr: null,
    method: 'percent_max',
    effective_method: 'percent_max',
    zones: [
      { zone: 1, lower_bpm: 94, upper_bpm: 112 },
      { zone: 2, lower_bpm: 113, upper_bpm: 131 },
      { zone: 3, lower_bpm: 132, upper_bpm: 149 },
      { zone: 4, lower_bpm: 150, upper_bpm: 168 },
      { zone: 5, lower_bpm: 169, upper_bpm: null },
    ],
    ...resolved,
  },
});

const renderScreen = () =>
  render(
    <HeartRateZonesSettingsScreen
      navigation={mockNavigation}
      route={{ params: undefined } as any}
    />
  );

const loaded = (data: HeartRateZonesResponse) =>
  mockUseHeartRateZones.mockReturnValue({
    zones: data,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  });

describe('HeartRateZonesSettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the five zones with their bpm ranges and where the max came from', async () => {
    loaded(response());
    const { getByTestId, getByText } = renderScreen();
    await waitFor(() => expect(getByTestId('heart-rate-zone-1')).toBeTruthy());
    expect(getByText('94–112 bpm')).toBeTruthy();
    expect(getByText('169+ bpm')).toBeTruthy();
    expect(getByTestId('heart-rate-zones-max-source').props.children).toContain(
      'From your date of birth'
    );
  });

  it('shows four tiers, with zones 1 and 2 merged, when chosen', async () => {
    loaded(response({ display_zones: 4 }));
    const { getByTestId, getByText, queryByTestId } = renderScreen();
    await waitFor(() => expect(getByTestId('heart-rate-zone-1')).toBeTruthy());
    expect(getByText('Light')).toBeTruthy();
    expect(getByText('94–131 bpm')).toBeTruthy();
    expect(getByText('Peak')).toBeTruthy();
    expect(getByText('169+ bpm')).toBeTruthy();
    expect(queryByTestId('heart-rate-zone-5')).toBeNull();
  });

  it('says when the person set the max heart rate themselves', async () => {
    loaded(
      response({ max_heart_rate: 180 }, { max_hr: 180, max_hr_source: 'user' })
    );
    const { getByTestId } = renderScreen();
    await waitFor(() =>
      expect(getByTestId('heart-rate-zones-max-input').props.value).toBe('180')
    );
    expect(getByTestId('heart-rate-zones-max-source').props.children).toContain(
      'You set it'
    );
  });

  it('resets to the defaults', async () => {
    loaded(response({ max_heart_rate: 180 }, { max_hr_source: 'user' }));
    const { getByTestId } = renderScreen();
    await waitFor(() =>
      expect(getByTestId('heart-rate-zones-reset')).toBeTruthy()
    );
    fireEvent.press(getByTestId('heart-rate-zones-reset'));
    expect(mockMutate).toHaveBeenCalledWith(
      { reset: true },
      expect.any(Object)
    );
  });

  it('explains when the chosen method fell back to percent of max', async () => {
    loaded(
      response(
        { method: 'heart_rate_reserve' },
        { method: 'heart_rate_reserve', effective_method: 'percent_max' }
      )
    );
    const { getByTestId } = renderScreen();
    await waitFor(() =>
      expect(getByTestId('heart-rate-zones-fallback')).toBeTruthy()
    );
  });

  it('offers a retry when the zones fail to load', () => {
    mockUseHeartRateZones.mockReturnValue({
      zones: undefined,
      isLoading: false,
      isError: true,
      refetch: jest.fn(),
    });
    const { getByTestId } = renderScreen();
    expect(getByTestId('heart-rate-zones-retry')).toBeTruthy();
  });
});
