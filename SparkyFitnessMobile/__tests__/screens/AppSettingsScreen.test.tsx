import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import AppSettingsScreen from '../../src/screens/AppSettingsScreen';
import {
  useAppPreferencesStore,
  __resetAppPreferencesStoreForTests,
} from '../../src/stores/appPreferencesStore';

jest.mock('../../src/components/BottomSheetPicker', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../src/services/themeService', () => ({
  useThemePreference: () => 'System',
  setThemePreference: jest.fn(),
}));

jest.mock('../../src/utils/liquidGlass', () => ({
  canUseLiquidGlass: () => false,
}));

const mockNavigation = {
  goBack: jest.fn(),
  navigate: jest.fn(),
  setOptions: jest.fn(),
} as never;
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

const route = { params: {} } as never;

function renderScreen() {
  return render(<AppSettingsScreen navigation={mockNavigation} route={route} />);
}

// Switch order with the liquid glass row absent: [Haptics, Camera].
const HAPTICS_SWITCH_INDEX = 0;

describe('AppSettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetAppPreferencesStoreForTests();
  });

  it('navigates to NotificationSettings from the Notifications row', () => {
    const { getByText } = renderScreen();

    fireEvent.press(getByText('Notifications'));

    expect((mockNavigation as { navigate: jest.Mock }).navigate).toHaveBeenCalledWith(
      'NotificationSettings',
    );
  });

  it('flips the haptics preference from its switch', () => {
    const { getAllByRole } = renderScreen();

    fireEvent(getAllByRole('switch')[HAPTICS_SWITCH_INDEX], 'valueChange', false);

    expect(useAppPreferencesStore.getState().hapticsEnabled).toBe(false);
  });
});
