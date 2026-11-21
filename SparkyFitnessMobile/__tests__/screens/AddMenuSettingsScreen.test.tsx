import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react-native';

import AddMenuSettingsScreen from '../../src/screens/AddMenuSettingsScreen';
import BottomSheetPicker from '../../src/components/BottomSheetPicker';
import { ADD_MENU_ITEM_KEYS } from '../../src/constants/addMenuItems';
import {
  useAppPreferencesStore,
  __resetAppPreferencesStoreForTests,
} from '../../src/stores/appPreferencesStore';
import { rowKeys } from '../../src/utils/addMenu';
import { initializeI18n } from '../../src/localization/i18n';

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

const mockCycle = {
  enabled: false,
  mode: 'standard' as string,
  discreetMode: false,
};
jest.mock('../../src/hooks/useCycleMode', () => ({
  useCycleMode: () => mockCycle,
}));
jest.mock('../../src/hooks/useMobileFeatures', () => ({
  useMobileFeatures: () => ({
    isEnabled: (key: string) => key === 'cycle' && mockCycle.enabled,
  }),
}));
jest.mock('../../src/hooks/useDiscreetMode', () => ({
  useDiscreetMode: () => ({ discreetMode: mockCycle.discreetMode }),
}));
let mockConnected = true;
jest.mock('../../src/hooks', () => ({
  useServerConnection: () => ({ isConnected: mockConnected }),
}));

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <View testID={`icon-${name}`} />,
  };
});

const navigation = { navigate: jest.fn(), goBack: jest.fn() };

const renderScreen = () =>
  render(
    <AddMenuSettingsScreen
      {...({ navigation, route: { params: {} } } as never)}
    />
  );

const orderedRowKeys = (): string[] =>
  screen
    .queryAllByTestId(/^add-menu-row-/)
    .map((row) => String(row.props.testID).replace('add-menu-row-', ''));

describe('AddMenuSettingsScreen', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    __resetAppPreferencesStoreForTests();
    Object.assign(mockCycle, {
      enabled: false,
      mode: 'standard',
      discreetMode: false,
    });
    mockConnected = true;
  });

  test('lists every row in the saved order, adding ones it lacks', () => {
    Object.assign(mockCycle, { enabled: true });
    useAppPreferencesStore.setState({
      addMenuOrder: ['syncHealth', 'askSparky'],
    });

    renderScreen();

    const keys = orderedRowKeys();
    // Ordered within the group the sheet draws them in.
    expect(keys.indexOf('syncHealth')).toBeLessThan(keys.indexOf('askSparky'));
    // Everything except the four cards is a row.
    expect(keys).toHaveLength(ADD_MENU_ITEM_KEYS.length - 4);
    expect(keys).not.toContain('food');
  });

  test('groups the rows the way the sheet draws them', () => {
    renderScreen();

    // "List" is also a style option on every row's picker.
    expect(screen.getAllByText('List').length).toBeGreaterThan(0);
    expect(screen.getByText('Pairs')).toBeTruthy();
    expect(screen.getByText('Buttons')).toBeTruthy();
    // List rows, then the pair, then the footer buttons.
    const keys = orderedRowKeys();
    expect(keys.indexOf('symptoms')).toBeLessThan(keys.indexOf('mood'));
    expect(keys.indexOf('mindfulness')).toBeLessThan(keys.indexOf('askSparky'));
  });

  test('each row says how it is shown, and a choice moves it', () => {
    renderScreen();

    expect(
      screen.getByTestId('add-menu-style-mood').props.accessibilityLabel
    ).toBe('Show as Pair');

    // A block body: the store's setter can return a promise, which would make
    // act wait asynchronously.
    act(() => {
      useAppPreferencesStore.getState().setAddMenuRowStyle('mood', 'action');
    });

    expect(
      screen.getByTestId('add-menu-style-mood').props.accessibilityLabel
    ).toBe('Show as Button');
    const keys = orderedRowKeys();
    expect(keys.indexOf('mindfulness')).toBeLessThan(keys.indexOf('mood'));
  });

  test('shows a preview and which line each pair and button is on', () => {
    act(() => {
      useAppPreferencesStore
        .getState()
        .setAddMenuRowStyle('checkIn', 'compact');
    });
    renderScreen();

    // Hidden from screen readers: the rows below say the same.
    expect(
      screen.getByTestId('add-menu-preview', { includeHiddenElements: true })
    ).toBeTruthy();
    // Check-In comes first, so it shares line 1 with Mood and Mindfulness is
    // alone on line 2.
    expect(
      within(screen.getByTestId('add-menu-row-checkIn')).getByText('Line 1')
    ).toBeTruthy();
    expect(
      within(screen.getByTestId('add-menu-row-mood')).getByText('Line 1')
    ).toBeTruthy();
    expect(
      within(screen.getByTestId('add-menu-row-mindfulness')).getByText('Line 2')
    ).toBeTruthy();
  });

  describe('items of a feature turned off', () => {
    test('are left out, take no line, and the screen says so once', () => {
      act(() => {
        useAppPreferencesStore
          .getState()
          .setAddMenuRowStyle('wellness', 'compact');
      });
      renderScreen();

      expect(screen.queryByTestId('add-menu-row-wellness')).toBeNull();
      // Mood and Mindfulness pair up on line 1: the missing item takes no
      // slot, so Mindfulness is not pushed to line 2.
      const mood = screen.getByTestId('add-menu-row-mood');
      expect(within(mood).getByText('Line 1')).toBeTruthy();
      const mindfulness = screen.getByTestId('add-menu-row-mindfulness');
      expect(within(mindfulness).getByText('Line 1')).toBeTruthy();
      expect(screen.getAllByText('Some features are turned off')).toHaveLength(
        1
      );
      // Its style is kept for when it comes back.
      expect(useAppPreferencesStore.getState().addMenuRowStyles.wellness).toBe(
        'compact'
      );
    });

    test('never include Check-In, which needs no setting', () => {
      act(() => {
        useAppPreferencesStore
          .getState()
          .setAddMenuRowStyle('checkIn', 'compact');
      });
      renderScreen();

      const checkIn = screen.getByTestId('add-menu-row-checkIn');
      expect(within(checkIn).getByText('Line 1')).toBeTruthy();
    });

    test('are shown normally once the feature is on', () => {
      Object.assign(mockCycle, { enabled: true });
      renderScreen();

      expect(screen.getByTestId('add-menu-row-wellness')).toBeTruthy();
      expect(screen.queryByTestId('features-off-notice')).toBeNull();
    });

    test('keep their place when the rows around them move', () => {
      renderScreen();

      // Wellness sits between Progress Photos and Symptoms, and is off.
      fireEvent(
        screen.getByTestId('add-menu-drag-handle-symptoms'),
        'accessibilityAction',
        { nativeEvent: { actionName: 'decrement' } }
      );

      const state = useAppPreferencesStore.getState();
      expect(
        rowKeys(state.addMenuOrder, state.addMenuCards).slice(0, 4)
      ).toEqual(['checkIn', 'symptoms', 'wellness', 'progressPhotos']);
    });

    test('leave their tile empty, and are not offered for one', () => {
      useAppPreferencesStore
        .getState()
        .setAddMenuCards(['wellness', 'exercise', 'measurements', 'scanFood']);
      renderScreen();

      expect(
        screen.getByTestId('add-menu-slot-0').props.accessibilityLabel
      ).toBe('Tile 1: Empty');
      expect(screen.getByTestId('add-menu-slot-0-empty')).toBeTruthy();
      expect(useAppPreferencesStore.getState().addMenuCards[0]).toBe(
        'wellness'
      );
      // No tile's picker offers it.
      const tilePickers = screen
        .UNSAFE_getAllByType(BottomSheetPicker)
        .filter((picker) => picker.props.title === 'Choose a tile');
      expect(tilePickers).toHaveLength(4);
      tilePickers.forEach((picker) =>
        expect(
          picker.props.options.map(({ value }: { value: string }) => value)
        ).not.toContain('wellness')
      );
    });

    test('open Features from the line while connected', () => {
      renderScreen();

      fireEvent.press(screen.getByTestId('features-off-manage'));
      expect(navigation.navigate).toHaveBeenCalledWith('FeatureSettings');
    });

    test('offer no way to Features while offline', () => {
      mockConnected = false;
      renderScreen();

      expect(screen.getByTestId('features-off-notice')).toBeTruthy();
      expect(screen.queryByTestId('features-off-manage')).toBeNull();
    });
  });

  test('reset clears the style choices', () => {
    useAppPreferencesStore.getState().setAddMenuRowStyle('mood', 'list');
    renderScreen();

    fireEvent.press(screen.getByTestId('add-menu-reset'));

    expect(useAppPreferencesStore.getState().addMenuRowStyles).toEqual({});
  });

  test('leaves out a group with nothing in it', () => {
    useAppPreferencesStore
      .getState()
      .setAddMenuCards(['askSparky', 'syncHealth', 'food', 'exercise']);
    renderScreen();

    expect(screen.queryByText('Buttons')).toBeNull();
  });

  test('toggling a row hides and shows it', () => {
    renderScreen();

    const moodSwitch = screen.getByTestId('add-menu-switch-mood');
    fireEvent(moodSwitch, 'valueChange', false);
    expect(useAppPreferencesStore.getState().hiddenAddMenuItems).toEqual([
      'mood',
    ]);

    fireEvent(moodSwitch, 'valueChange', true);
    expect(useAppPreferencesStore.getState().hiddenAddMenuItems).toEqual([]);
  });

  test('reordering a row updates the saved order', () => {
    Object.assign(mockCycle, { enabled: true });
    renderScreen();

    fireEvent(
      screen.getByTestId('add-menu-drag-handle-progressPhotos'),
      'accessibilityAction',
      { nativeEvent: { actionName: 'increment' } }
    );

    const state = useAppPreferencesStore.getState();
    expect(rowKeys(state.addMenuOrder, state.addMenuCards).slice(0, 3)).toEqual(
      ['checkIn', 'wellness', 'progressPhotos']
    );
  });

  test('a card slot shows its item and the rest are rows', () => {
    renderScreen();

    expect(screen.getByTestId('add-menu-slot-0').props.accessibilityLabel).toBe(
      'Tile 1: Food'
    );
    expect(screen.getByTestId('add-menu-slot-3').props.accessibilityLabel).toBe(
      'Tile 4: Scan Food'
    );
    expect(orderedRowKeys()).not.toContain('scanFood');
  });

  test('a card slot uses the short name the sheet shows', () => {
    renderScreen();

    expect(screen.getByText('Scan')).toBeTruthy();
    expect(screen.getByText('Measure')).toBeTruthy();
    expect(screen.getAllByText('Sync Health').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Symptoms & Health').length).toBeGreaterThan(0);
  });

  test('putting a row item on a card sends the old card to the rows', () => {
    useAppPreferencesStore
      .getState()
      .setAddMenuCards(['mood', 'exercise', 'measurements', 'scanFood']);
    renderScreen();

    expect(orderedRowKeys()).toContain('food');
    expect(orderedRowKeys()).not.toContain('mood');
  });

  test('giving a hidden row a card shows it again', () => {
    useAppPreferencesStore.setState({ hiddenAddMenuItems: ['mood'] });
    useAppPreferencesStore
      .getState()
      .setAddMenuCards(['mood', 'exercise', 'measurements', 'scanFood']);

    expect(useAppPreferencesStore.getState().hiddenAddMenuItems).toEqual([]);
  });

  test('reset puts the order and hidden rows back', () => {
    useAppPreferencesStore.setState({
      addMenuOrder: ['syncHealth'],
      hiddenAddMenuItems: ['mood'],
    });
    renderScreen();

    fireEvent.press(screen.getByTestId('add-menu-reset'));

    const state = useAppPreferencesStore.getState();
    expect(state.addMenuOrder).toEqual([...ADD_MENU_ITEM_KEYS]);
    expect(state.addMenuCards).toEqual([
      'food',
      'exercise',
      'measurements',
      'scanFood',
    ]);
    expect(state.hiddenAddMenuItems).toEqual([]);
  });
});
