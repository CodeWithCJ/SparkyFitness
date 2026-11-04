import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';

import WatchComplicationEditScreen from '../../src/screens/WatchComplicationEditScreen';
import {
  useAppPreferencesStore,
  __resetAppPreferencesStoreForTests,
} from '../../src/stores/appPreferencesStore';
import { initializeI18n } from '../../src/localization/i18n';

jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
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

jest.mock('../../src/utils/ids', () => ({ newUuid: () => 'new-id' }));

// The real picker opens a sheet; this one lists its options as buttons.
jest.mock('../../src/components/BottomSheetPicker', () => {
  const { Pressable, Text, View } = require('react-native');
  return {
    __esModule: true,
    default: ({
      value,
      options,
      onSelect,
    }: {
      value: string;
      options: { label: string; value: string }[];
      onSelect: (value: string) => void;
    }) => (
      <View>
        <Text testID="source-value">{value}</Text>
        {options.map((option) => (
          <Pressable
            key={option.value}
            testID={`source-option-${option.value}`}
            onPress={() => onSelect(option.value)}
          >
            <Text>{option.label}</Text>
          </Pressable>
        ))}
      </View>
    ),
  };
});

const navigation = { navigate: jest.fn(), goBack: jest.fn() };

const renderScreen = (params?: { complicationId?: string }) =>
  render(
    <WatchComplicationEditScreen
      {...({ navigation, route: { params } } as never)}
    />
  );

const stored = () => useAppPreferencesStore.getState().watchComplications;

describe('WatchComplicationEditScreen', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    __resetAppPreferencesStoreForTests();
  });

  test('a new complication starts as calories, with a preview', () => {
    renderScreen({});
    expect(screen.getByTestId('source-value').props.children).toBe('calories');
    expect(screen.getByDisplayValue('Calories')).toBeTruthy();
    expect(screen.getByTestId('complication-preview-circular')).toBeTruthy();
    expect(
      screen.getByTestId('complication-preview-circular-text').props.children
    ).toBe('65%');
  });

  test('saving adds it after the starters, which makes the list the wearer’s own', () => {
    renderScreen({});
    fireEvent.changeText(screen.getByDisplayValue('Calories'), '  Net kcal  ');
    fireEvent.press(screen.getByText('Save'));

    const list = stored() ?? [];
    expect(list).toHaveLength(10);
    expect(list[9]).toEqual({
      id: 'new-id',
      name: 'Net kcal',
      source: 'calories',
      format: 'percent',
      gauge: true,
      color: 'calories',
      icon: 'flame.fill',
    });
    expect(Toast.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success' })
    );
    expect(navigation.goBack).toHaveBeenCalled();
  });

  test('will not save without a name', () => {
    renderScreen({});
    fireEvent.changeText(screen.getByDisplayValue('Calories'), '   ');
    fireEvent.press(screen.getByText('Save'));
    expect(stored()).toBeNull();
    expect(navigation.goBack).not.toHaveBeenCalled();
    expect(Toast.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error' })
    );
  });

  test('choosing a source gives a new complication that source’s look and name', () => {
    renderScreen({});
    fireEvent.press(screen.getByTestId('source-option-water'));
    expect(screen.getByDisplayValue('Water')).toBeTruthy();
    fireEvent.press(screen.getByText('Save'));
    expect((stored() ?? [])[9]).toMatchObject({
      source: 'water',
      color: 'water',
      icon: 'drop.fill',
    });
  });

  test('a name the wearer typed is kept when the source changes', () => {
    renderScreen({});
    fireEvent.changeText(screen.getByDisplayValue('Calories'), 'My thing');
    fireEvent.press(screen.getByTestId('source-option-steps'));
    expect(screen.getByDisplayValue('My thing')).toBeTruthy();
  });

  test('a source with no goal can only show its value, with no gauge', () => {
    renderScreen({});
    expect(screen.getByText('Percent')).toBeTruthy();
    fireEvent.press(screen.getByTestId('source-option-weight'));
    expect(screen.queryByText('Percent')).toBeNull();
    expect(screen.queryByText('Left')).toBeNull();
    expect(
      screen.getByTestId('watch-complication-gauge-switch').props.disabled
    ).toBe(true);
    fireEvent.press(screen.getByText('Save'));
    expect((stored() ?? [])[9]).toMatchObject({
      source: 'weight',
      format: 'value',
      gauge: false,
    });
  });

  test('picking a format and a color changes the preview and what is saved', () => {
    renderScreen({});
    fireEvent.press(screen.getByText('Left'));
    expect(
      screen.getByTestId('complication-preview-circular-text').props.children
    ).toBe('660');
    fireEvent.press(screen.getByTestId('watch-complication-color-fasting'));
    fireEvent.press(screen.getByTestId('watch-complication-icon-timer'));
    fireEvent.press(screen.getByText('Save'));
    expect((stored() ?? [])[9]).toMatchObject({
      format: 'remaining',
      color: 'fasting',
      icon: 'timer',
    });
  });

  test('editing keeps the id and replaces the entry in place', () => {
    renderScreen({ complicationId: 'starter-water' });
    expect(screen.getByDisplayValue('Water')).toBeTruthy();
    fireEvent.changeText(screen.getByDisplayValue('Water'), 'Hydration');
    fireEvent.press(screen.getByTestId('watch-complication-color-steps'));
    fireEvent.press(screen.getByText('Save'));

    const list = stored() ?? [];
    expect(list).toHaveLength(9);
    const edited = list.find((d) => d.id === 'starter-water');
    expect(edited).toMatchObject({ name: 'Hydration', color: 'steps' });
    expect(list.findIndex((d) => d.id === 'starter-water')).toBe(5);
  });

  test('an existing complication keeps its look when its source changes', () => {
    renderScreen({ complicationId: 'starter-water' });
    fireEvent.press(screen.getByTestId('source-option-steps'));
    fireEvent.press(screen.getByText('Save'));
    expect(
      (stored() ?? []).find((d) => d.id === 'starter-water')
    ).toMatchObject({ source: 'steps', color: 'water', icon: 'drop.fill' });
  });

  test('nutrients shown on the watch’s Goals page can be chosen', () => {
    useAppPreferencesStore.setState({
      shownWatchNutrients: ['protein', 'dietary_fiber'],
    });
    renderScreen({});
    expect(
      screen.getByTestId('source-option-nutrient:dietary_fiber')
    ).toBeTruthy();
    // Protein has a source of its own, so it is not offered a second time.
    expect(screen.queryByTestId('source-option-nutrient:protein')).toBeNull();
  });
});
