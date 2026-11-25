import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';

import WatchComplicationsScreen from '../../src/screens/WatchComplicationsScreen';
import {
  useAppPreferencesStore,
  __resetAppPreferencesStoreForTests,
} from '../../src/stores/appPreferencesStore';
import { initializeI18n } from '../../src/localization/i18n';
import { exportComplications } from '../../src/utils/watchComplications';

let mockHeader: {
  right: { items?: { label: string; onPress: () => void }[] }[];
} | null = null;

jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: (config: typeof mockHeader) => {
    mockHeader = config;
    return null;
  },
}));

jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: () => false,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../src/components/WatchSymbol', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View /> };
});

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <View testID={`icon-${name}`} />,
  };
});

jest.mock('../../src/services/watchComplicationSync', () => ({
  sendComplicationsToWatch: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../src/services/watchComplicationFile', () => ({
  __esModule: true,
  ComplicationFileTooLargeError: class extends Error {},
  pickComplicationsFile: jest.fn(),
  shareComplicationsFile: jest.fn(() => Promise.resolve(true)),
}));

const files = jest.requireMock('../../src/services/watchComplicationFile') as {
  pickComplicationsFile: jest.Mock;
  shareComplicationsFile: jest.Mock;
};

const sync = jest.requireMock('../../src/services/watchComplicationSync') as {
  sendComplicationsToWatch: jest.Mock;
};

const navigation = { navigate: jest.fn(), goBack: jest.fn() };

const renderScreen = () =>
  render(
    <WatchComplicationsScreen
      {...({ navigation, route: { params: undefined } } as never)}
    />
  );

const storedNames = () =>
  (useAppPreferencesStore.getState().watchComplications ?? []).map(
    (d) => d.name
  );

const menuItem = (label: string) =>
  mockHeader?.right
    .flatMap((item) => item.items ?? [])
    .find((item) => item.label === label);

/** Presses the alert button with this label. */
const pressAlertButton = (alert: jest.SpyInstance, label: string) => {
  const buttons = alert.mock.calls[alert.mock.calls.length - 1][2] as {
    text: string;
    onPress?: () => void;
  }[];
  act(() => {
    buttons.find((b) => b.text === label)?.onPress?.();
  });
};

describe('WatchComplicationsScreen', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockHeader = null;
    __resetAppPreferencesStoreForTests();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => alertSpy.mockRestore());

  test('Reload sends the list to the watch and asks it to refresh', async () => {
    renderScreen();
    await act(async () => {
      fireEvent.press(screen.getByTestId('watch-complications-reload'));
    });
    expect(sync.sendComplicationsToWatch).toHaveBeenCalledTimes(1);
    const [list, options] = sync.sendComplicationsToWatch.mock.calls[0];
    expect(list.length).toBeGreaterThan(0);
    expect(options).toEqual({ reload: true, builtIns: {} });
    expect(Toast.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success' })
    );
  });

  test('lists the built-in complications and opens one to change it', () => {
    renderScreen();
    expect(screen.getByTestId('watch-built-in-row-proteinGoal')).toBeTruthy();
    expect(screen.getByTestId('watch-built-in-row-steps')).toBeTruthy();
    expect(screen.queryByTestId('watch-built-in-steps-color-heart')).toBeNull();
    fireEvent.press(screen.getByLabelText('Change Steps'));
    expect(screen.getByTestId('watch-built-in-steps-color-heart')).toBeTruthy();
  });

  test('saves a built-in’s colour and icon, and puts them back', () => {
    renderScreen();
    fireEvent.press(screen.getByLabelText('Change Steps'));
    fireEvent.press(screen.getByTestId('watch-built-in-steps-color-heart'));
    fireEvent.press(screen.getByTestId('watch-built-in-steps-icon-bolt.fill'));
    expect(useAppPreferencesStore.getState().watchBuiltInStyles).toEqual({
      steps: { color: 'heart', icon: 'bolt.fill' },
    });
    fireEvent.press(screen.getByTestId('watch-built-in-steps-reset'));
    expect(useAppPreferencesStore.getState().watchBuiltInStyles).toEqual({});
  });

  test('Daily Energy Goal has a colour for each part, and they can be put back', () => {
    renderScreen();
    expect(screen.getByTestId('watch-built-in-row-dailyEnergy')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Change Daily Energy Goal'));
    fireEvent.press(
      screen.getByTestId('watch-built-in-energyProtein-color-heart')
    );
    fireEvent.press(screen.getByTestId('watch-built-in-energyFat-color-water'));
    expect(useAppPreferencesStore.getState().watchBuiltInStyles).toEqual({
      energyProtein: { color: 'heart' },
      energyFat: { color: 'water' },
    });
    fireEvent.press(screen.getByTestId('watch-built-in-dailyEnergy-reset'));
    expect(useAppPreferencesStore.getState().watchBuiltInStyles).toEqual({});
  });

  test('Reload sends the built-in styles too', async () => {
    renderScreen();
    fireEvent.press(screen.getByLabelText('Change Steps'));
    fireEvent.press(screen.getByTestId('watch-built-in-steps-color-heart'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('watch-complications-reload'));
    });
    expect(sync.sendComplicationsToWatch.mock.calls[0][1]).toEqual({
      reload: true,
      builtIns: { steps: { color: 'heart' } },
    });
  });

  test('Reload says so when the send fails', async () => {
    sync.sendComplicationsToWatch.mockRejectedValueOnce(new Error('boom'));
    renderScreen();
    await act(async () => {
      fireEvent.press(screen.getByTestId('watch-complications-reload'));
    });
    expect(Toast.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error' })
    );
  });

  test('shows the starter set with a note until the list is the wearer’s own', () => {
    renderScreen();
    expect(
      screen.getByTestId('watch-complication-row-starter-caloriesRemaining')
    ).toBeTruthy();
    expect(screen.getByTestId('watch-complications-starter-note')).toBeTruthy();
    expect(useAppPreferencesStore.getState().watchComplications).toBeNull();
  });

  test('deleting asks first, then saves a list without it', () => {
    renderScreen();
    fireEvent.press(screen.getByLabelText('Delete Weight'));
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(storedNames()).toEqual([]);

    pressAlertButton(alertSpy, 'Delete');
    expect(storedNames()).not.toContain('Weight');
    expect(storedNames()).toContain('Macros');
    expect(screen.queryByTestId('watch-complications-starter-note')).toBeNull();
  });

  test('moves a row down', () => {
    renderScreen();
    fireEvent.press(screen.getByLabelText('Move Calories left down'));
    expect(storedNames().slice(0, 2)).toEqual(['Macros', 'Calories left']);
  });

  test('the first row cannot move up and the last cannot move down', () => {
    renderScreen();
    fireEvent.press(screen.getByLabelText('Move Calories left up'));
    fireEvent.press(screen.getByLabelText('Move Sleep score down'));
    expect(useAppPreferencesStore.getState().watchComplications).toBeNull();
  });

  test('Add opens the editor with no complication chosen', () => {
    renderScreen();
    fireEvent.press(screen.getByText('Add complication'));
    expect(navigation.navigate).toHaveBeenCalledWith(
      'WatchComplicationEdit',
      {}
    );
  });

  test('lists a complication with several values by name', () => {
    renderScreen();
    expect(screen.getByText('Protein + Carbs + Fat')).toBeTruthy();
  });

  test('says how a single value is written', () => {
    renderScreen();
    expect(screen.getByText('Sleep score • Percent • Gauge')).toBeTruthy();
    expect(screen.getByText('Weight • Value')).toBeTruthy();
  });

  test('tapping a row edits that complication', () => {
    renderScreen();
    fireEvent.press(screen.getByLabelText('Edit Weight'));
    expect(navigation.navigate).toHaveBeenCalledWith('WatchComplicationEdit', {
      complicationId: 'starter-weight',
    });
  });

  test('the menu exports the current list', async () => {
    renderScreen();
    await act(async () => {
      menuItem('Export')?.onPress();
    });
    expect(files.shareComplicationsFile).toHaveBeenCalledTimes(1);
    expect(files.shareComplicationsFile.mock.calls[0][0]).toHaveLength(4);
  });

  test('a failed export says so', async () => {
    files.shareComplicationsFile.mockRejectedValueOnce(new Error('nope'));
    renderScreen();
    await act(async () => {
      menuItem('Export')?.onPress();
    });
    expect(Toast.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error' })
    );
  });

  test('importing a file offers to add to the list or replace it', async () => {
    files.pickComplicationsFile.mockResolvedValue(
      exportComplications([
        {
          id: 'x',
          name: 'Sodium',
          source: 'nutrient:sodium',
          format: 'percent',
          gauge: true,
          color: 'neutral',
          icon: 'fork.knife',
        },
        {
          id: 'y',
          name: 'Fibre',
          source: 'nutrient:dietary_fiber',
          format: 'value',
          gauge: false,
          color: 'carbs',
          icon: 'leaf.fill',
        },
      ])
    );
    renderScreen();
    await act(async () => {
      menuItem('Import')?.onPress();
    });
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy.mock.calls[0][1]).toContain('2 complications');

    pressAlertButton(alertSpy, 'Add');
    expect(storedNames()).toHaveLength(6);
    expect(storedNames().slice(-2)).toEqual(['Sodium', 'Fibre']);
  });

  test('importing can replace the whole list', async () => {
    files.pickComplicationsFile.mockResolvedValue(
      exportComplications([
        {
          id: 'x',
          name: 'Only one',
          source: 'water',
          format: 'percent',
          gauge: true,
          color: 'water',
          icon: 'drop.fill',
        },
      ])
    );
    renderScreen();
    await act(async () => {
      menuItem('Import')?.onPress();
    });
    expect(alertSpy.mock.calls[0][1]).toContain('1 complication');
    pressAlertButton(alertSpy, 'Replace');
    expect(storedNames()).toEqual(['Only one']);
  });

  test('a file that is not a complications file is turned away', async () => {
    files.pickComplicationsFile.mockResolvedValue('not what we wrote');
    renderScreen();
    await act(async () => {
      menuItem('Import')?.onPress();
    });
    expect(alertSpy).not.toHaveBeenCalled();
    expect(Toast.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error' })
    );
    expect(useAppPreferencesStore.getState().watchComplications).toBeNull();
  });

  test('closing the picker changes nothing', async () => {
    files.pickComplicationsFile.mockResolvedValue(null);
    renderScreen();
    await act(async () => {
      menuItem('Import')?.onPress();
    });
    expect(alertSpy).not.toHaveBeenCalled();
    expect(Toast.show).not.toHaveBeenCalled();
  });

  test('Reset to starters appears once the list is the wearer’s own, and restores it', () => {
    renderScreen();
    expect(menuItem('Reset to starters')).toBeUndefined();

    fireEvent.press(screen.getByLabelText('Move Calories left down'));
    expect(storedNames()).not.toHaveLength(0);
    screen.rerender(
      <WatchComplicationsScreen
        {...({ navigation, route: { params: undefined } } as never)}
      />
    );
    act(() => {
      menuItem('Reset to starters')?.onPress();
    });
    pressAlertButton(alertSpy, 'Reset');
    expect(useAppPreferencesStore.getState().watchComplications).toBeNull();
  });

  test('an empty list says so instead of showing rows', () => {
    useAppPreferencesStore.getState().setWatchComplications([]);
    renderScreen();
    expect(screen.getByText('No complications yet')).toBeTruthy();
    expect(screen.queryByTestId(/^watch-complication-row-/)).toBeNull();
  });
});
