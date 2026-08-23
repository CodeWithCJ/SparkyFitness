import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import i18n, { initializeI18n } from '../../src/localization/i18n';
import CalorieSettingsScreen from '../../src/screens/CalorieSettingsScreen';

const mockMutate = jest.fn();
let mockPreferences: Record<string, unknown> = {};

jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: mockPreferences }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    cancelQueries: jest.fn(),
    getQueryData: jest.fn(),
    setQueryData: jest.fn(),
    invalidateQueries: jest.fn(),
  }),
  useMutation: () => ({ mutate: mockMutate }),
}));

jest.mock('../../src/components/BottomSheetPicker', () => {
  const ReactModule = require('react');
  const { Pressable: MockPressable, Text: MockText } = require('react-native');
  return {
    __esModule: true,
    default: ({
      options,
      onSelect,
    }: {
      options: { label: string; value: string }[];
      onSelect: (value: string) => void;
    }) =>
      ReactModule.createElement(
        ReactModule.Fragment,
        null,
        ...options.map((option: { label: string; value: string }) =>
          ReactModule.createElement(
            MockPressable,
            { key: option.value, onPress: () => onSelect(option.value) },
            ReactModule.createElement(MockText, null, option.label),
          ),
        ),
      ),
  };
});

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
}));

jest.mock('../../src/components/HealthSourceLabel', () => ({
  __esModule: true,
  default: () => null,
  healthSourceName: 'Health Connect',
}));

jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: () => false,
}));

jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('uniwind', () => ({
  useCSSVariable: () => ['#22c55e'],
}));

const navigation = { goBack: jest.fn(), setOptions: jest.fn() } as never;
const route = { params: {} } as never;

describe('CalorieSettingsScreen safety floor', () => {
  beforeEach(async () => {
    await act(async () => {
      await initializeI18n('en');
    await i18n.changeLanguage('en');
    });
    jest.clearAllMocks();
    mockPreferences = {
      calorie_goal_adjustment_mode: 'adaptive',
      calorie_safety_floor_mode: 'standard',
      calorie_safety_floor_value: 1200,
    };
  });

  it('offers standard, custom, and disabled safety floor modes', () => {
    const { getByText } = render(
      <CalorieSettingsScreen navigation={navigation} route={route} />,
    );

    expect(getByText('Safety Floor')).toBeTruthy();
    expect(getByText('Standard')).toBeTruthy();
    expect(getByText('Custom')).toBeTruthy();
    expect(getByText('Disabled')).toBeTruthy();
  });

  it('saves a selected safety floor mode', () => {
    const { getByText } = render(
      <CalorieSettingsScreen navigation={navigation} route={route} />,
    );

    fireEvent.press(getByText('Disabled'));
    expect(mockMutate).toHaveBeenCalledWith({
      calorie_safety_floor_mode: 'disabled',
    });
  });

  it('saves a custom safety floor value', () => {
    mockPreferences.calorie_safety_floor_mode = 'custom';
    const { getByDisplayValue } = render(
      <CalorieSettingsScreen navigation={navigation} route={route} />,
    );
    const input = getByDisplayValue('1200');

    fireEvent.changeText(input, '1150');
    fireEvent(input, 'blur');

    expect(mockMutate).toHaveBeenCalledWith({
      calorie_safety_floor_value: 1150,
    });
  });

  it('restores the saved value without persisting when the custom input is blank', () => {
    mockPreferences.calorie_safety_floor_mode = 'custom';
    const { getByDisplayValue } = render(
      <CalorieSettingsScreen navigation={navigation} route={route} />,
    );
    const input = getByDisplayValue('1200');

    fireEvent.changeText(input, '');
    fireEvent(input, 'blur');

    expect(getByDisplayValue('1200')).toBeTruthy();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it.each([
    ['799', 800],
    ['5001', 5000],
  ])('clamps custom floor %s to %s kcal', (inputValue, expectedValue) => {
    mockPreferences.calorie_safety_floor_mode = 'custom';
    const { getByDisplayValue } = render(
      <CalorieSettingsScreen navigation={navigation} route={route} />,
    );
    const input = getByDisplayValue('1200');

    fireEvent.changeText(input, inputValue);
    fireEvent(input, 'blur');

    expect(mockMutate).toHaveBeenCalledWith({
      calorie_safety_floor_value: expectedValue,
    });
  });
  it('renders the shipped Polish safety floor labels, descriptions, custom minimum, and keeps raw values', async () => {
    await act(async () => {
      await i18n.changeLanguage('pl');
    });
    const cases = [
      ['standard', 'Używa wyższej z wartości: szacowane PPM lub minimum kliniczne.'],
      ['custom', 'Zastępuje standardowe minimum wybraną przez Ciebie wartością. Zalecenia zdrowotne pozostają widoczne.'],
      ['disabled', 'Wyłącza automatyczne ograniczanie celu. Ostrzeżenia zdrowotne pozostają widoczne.'],
    ] as const;
    const screen = render(<CalorieSettingsScreen navigation={navigation} route={route} />);
    expect(screen.getByText('Bezpieczne minimum')).toBeTruthy();
    expect(screen.getByText('Standardowe')).toBeTruthy();
    expect(screen.getByText('Własne')).toBeTruthy();
    expect(screen.getByText('Wyłączone')).toBeTruthy();
    for (const [mode, description] of cases) {
      mockPreferences.calorie_safety_floor_mode = mode;
      screen.rerender(<CalorieSettingsScreen navigation={navigation} route={route} />);
      expect(screen.getByText(description)).toBeTruthy();
      if (mode === 'custom') {
        expect(screen.getByText('Własne minimum (kcal)')).toBeTruthy();
      }
    }
    fireEvent.press(screen.getByText('Standardowe'));
    fireEvent.press(screen.getByText('Własne'));
    fireEvent.press(screen.getByText('Wyłączone'));
    expect(mockMutate).toHaveBeenNthCalledWith(1, { calorie_safety_floor_mode: 'standard' });
    expect(mockMutate).toHaveBeenNthCalledWith(2, { calorie_safety_floor_mode: 'custom' });
    expect(mockMutate).toHaveBeenNthCalledWith(3, { calorie_safety_floor_mode: 'disabled' });
  });

  it('updates labels on the same mounted instance when language changes', async () => {
    const screen = render(<CalorieSettingsScreen navigation={navigation} route={route} />);
    expect(screen.getByText('Safety Floor')).toBeTruthy();
    await act(async () => { await i18n.changeLanguage('pl'); });
    expect(screen.getByText('Bezpieczne minimum')).toBeTruthy();
    await act(async () => { await initializeI18n('en');
    await i18n.changeLanguage('en'); });
    expect(screen.getByText('Safety Floor')).toBeTruthy();
  });

});
