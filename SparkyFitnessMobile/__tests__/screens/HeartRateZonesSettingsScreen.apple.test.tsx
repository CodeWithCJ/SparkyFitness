import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { HeartRateZonesResponse } from '@workspace/shared';
import Toast from 'react-native-toast-message';
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

const mockRead = jest.fn();
jest.mock('../../src/services/appleHeartZones', () => ({
  appleHeartZonesAvailable: () => true,
  readAppleHeartRateZones: (...args: unknown[]) => mockRead(...args),
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
  overrides: Partial<HeartRateZonesResponse['settings']> = {}
): HeartRateZonesResponse => ({
  settings: {
    max_heart_rate: 180,
    resting_heart_rate: null,
    method: 'percent_max',
    custom_floors: null,
    display_zones: 5,
    ...overrides,
  },
  resolved: {
    max_hr: 180,
    max_hr_source: 'user',
    resting_hr: null,
    method: 'percent_max',
    effective_method: 'percent_max',
    zones: [
      { zone: 1, lower_bpm: 90, upper_bpm: 107 },
      { zone: 2, lower_bpm: 108, upper_bpm: 125 },
      { zone: 3, lower_bpm: 126, upper_bpm: 143 },
      { zone: 4, lower_bpm: 144, upper_bpm: 161 },
      { zone: 5, lower_bpm: 162, upper_bpm: null },
    ],
  },
});

const renderScreen = () =>
  render(
    <HeartRateZonesSettingsScreen
      navigation={mockNavigation}
      route={{ params: undefined } as any}
    />
  );

describe('HeartRateZonesSettingsScreen Apple Health import', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseHeartRateZones.mockReturnValue({
      zones: response(),
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
  });

  it('fills custom floors from Apple Health and leaves max heart rate alone', async () => {
    mockRead.mockResolvedValue({
      floors: [30, 114, 133, 152, 171],
      restingHeartRate: 52,
    });
    const { getByTestId, getByText } = renderScreen();
    await waitFor(() =>
      expect(getByTestId('heart-rate-zones-apple')).toBeTruthy()
    );
    fireEvent.press(getByTestId('heart-rate-zones-apple'));
    await waitFor(() =>
      expect(getByTestId('heart-rate-zones-floor-1').props.value).toBe('30')
    );
    expect(getByTestId('heart-rate-zones-floor-5').props.value).toBe('171');
    expect(getByTestId('heart-rate-zones-max-input').props.value).toBe('180');
    expect(getByTestId('heart-rate-zones-resting-input').props.value).toBe(
      '52'
    );
    expect(mockRead).toHaveBeenCalledWith({ includeRestingHeartRate: true });
    expect(
      getByText(
        'Set the bpm where each zone starts. Time below zone 1 is not counted.'
      )
    ).toBeTruthy();
    expect(Toast.show).toHaveBeenCalledWith(
      expect.objectContaining({
        text1: 'Apple Health zones filled in. Save to keep them.',
      })
    );
  });

  it('does not replace a resting heart rate the person already entered', async () => {
    mockUseHeartRateZones.mockReturnValue({
      zones: response({ resting_heart_rate: 48 }),
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockRead.mockResolvedValue({
      floors: [90, 110, 130, 150, 170],
      restingHeartRate: 60,
    });
    const { getByTestId } = renderScreen();
    fireEvent.press(getByTestId('heart-rate-zones-apple'));
    await waitFor(() =>
      expect(getByTestId('heart-rate-zones-floor-1').props.value).toBe('90')
    );
    expect(getByTestId('heart-rate-zones-resting-input').props.value).toBe(
      '48'
    );
    expect(mockRead).toHaveBeenCalledWith({ includeRestingHeartRate: false });
  });

  it('says when Apple Health did not share five zones', async () => {
    mockRead.mockResolvedValue(null);
    const { getByTestId, queryByTestId } = renderScreen();
    fireEvent.press(getByTestId('heart-rate-zones-apple'));
    await waitFor(() =>
      expect(getByTestId('heart-rate-zones-error')).toBeTruthy()
    );
    expect(queryByTestId('heart-rate-zones-floor-1')).toBeNull();
  });
});
