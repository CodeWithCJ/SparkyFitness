import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import FastingSettingsScreen from '../../src/screens/FastingSettingsScreen';
import { useEnergyUnit } from '../../src/hooks/useEnergyUnit';

jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));

jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: () => false,
}));

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockMutate = jest.fn();
jest.mock('../../src/hooks/useFasting', () => ({
  useFastingPreferences: () => ({
    data: {
      id: 'prefs',
      auto_calculate: false,
      default_protocol: '16:8 Leangains',
      target_fasting_hours: 16,
      target_eating_hours: 8,
      calorie_threshold: 50,
      pre_end_alert_minutes: 30,
      eating_window_alert: false,
    },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
  useUpdateFastingPreferences: () => ({ mutate: mockMutate, isPending: false }),
}));

const renderScreen = () =>
  render(
    <FastingSettingsScreen
      {...({ navigation: {}, route: { params: {} } } as never)}
    />
  );

describe('FastingSettingsScreen energy unit', () => {
  beforeEach(() => {
    mockMutate.mockClear();
    jest.mocked(useEnergyUnit).mockReturnValue('kJ');
  });

  afterEach(() => {
    jest.mocked(useEnergyUnit).mockReturnValue('kcal');
  });

  it('shows the threshold in kJ and saves an untouched one unchanged', () => {
    renderScreen();
    expect(screen.getByText('Calorie threshold (kJ)')).toBeTruthy();
    expect(screen.getByDisplayValue('209')).toBeTruthy();

    fireEvent.press(screen.getByText('Save fasting settings'));

    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({ calorie_threshold: 50 }),
      expect.anything()
    );
  });

  it('saves a kJ entry as whole kcal', () => {
    renderScreen();
    fireEvent.changeText(screen.getByDisplayValue('209'), '418');
    fireEvent.press(screen.getByText('Save fasting settings'));

    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({ calorie_threshold: 100 }),
      expect.anything()
    );
  });

  it('refuses a value above the server limit', () => {
    renderScreen();
    fireEvent.changeText(screen.getByDisplayValue('209'), '2200');
    expect(
      screen.getByText('Enter a whole number from 0 to 2092.')
    ).toBeTruthy();
  });
});
