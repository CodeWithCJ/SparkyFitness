import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
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
  beforeEach(() => {
    jest.clearAllMocks();
    mockPreferences = {
      calorie_goal_adjustment_mode: 'adaptive',
      calorie_safety_floor_mode: 'standard',
    };
  });

  it('offers the standard and clinical-minimum safety floor modes', () => {
    const { getByText, queryByText } = render(
      <CalorieSettingsScreen navigation={navigation} route={route} />,
    );

    expect(getByText('Safety Floor')).toBeTruthy();
    expect(getByText('Standard')).toBeTruthy();
    expect(getByText('Clinical minimum only')).toBeTruthy();
    // The retired modes must not come back: the clinical minimum is not opt-out.
    expect(queryByText('Custom')).toBeNull();
    expect(queryByText('Disabled')).toBeNull();
  });

  it('saves a selected safety floor mode', () => {
    const { getByText } = render(
      <CalorieSettingsScreen navigation={navigation} route={route} />,
    );

    fireEvent.press(getByText('Clinical minimum only'));
    expect(mockMutate).toHaveBeenCalledWith({
      calorie_safety_floor_mode: 'clinical_minimum',
    });
  });

  it('explains what each mode clamps at', () => {
    const { getByText } = render(
      <CalorieSettingsScreen navigation={navigation} route={route} />,
    );

    expect(
      getByText(/higher of your estimated RMR and the clinical minimum/),
    ).toBeTruthy();
  });
});
