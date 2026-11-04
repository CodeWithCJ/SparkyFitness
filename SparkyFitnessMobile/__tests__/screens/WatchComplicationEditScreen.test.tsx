import React from 'react';
import {
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react-native';
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

// The starter set: calories ... weight, the macros, and the sleep score.
const STARTER_COUNT = 11;

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

  test('previews the rectangular and inline sizes with the name', () => {
    renderScreen({});
    fireEvent.changeText(screen.getByDisplayValue('Calories'), 'Net kcal');
    expect(screen.getByTestId('complication-preview-rectangular')).toBeTruthy();
    // With a gauge on, the rectangular size shows the bar, not the detail line.
    expect(
      screen.queryByTestId('complication-preview-rectangular-detail')
    ).toBeNull();
    expect(
      screen.getByTestId('complication-preview-inline-text').props.children
    ).toBe('65% Net kcal');
  });

  test('the rectangular size shows the amount line when there is no gauge', () => {
    renderScreen({});
    fireEvent(
      screen.getByTestId('watch-complication-gauge-switch'),
      'valueChange',
      false
    );
    expect(
      screen.getByTestId('complication-preview-rectangular-detail').props
        .children
    ).toBe('1,240 kcal');
  });

  test('saving adds it after the starters, which makes the list the wearer’s own', () => {
    renderScreen({});
    fireEvent.changeText(screen.getByDisplayValue('Calories'), '  Net kcal  ');
    fireEvent.press(screen.getByText('Save'));

    const list = stored() ?? [];
    expect(list).toHaveLength(STARTER_COUNT + 1);
    expect(list[STARTER_COUNT]).toEqual({
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
    expect((stored() ?? [])[STARTER_COUNT]).toMatchObject({
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
    expect((stored() ?? [])[STARTER_COUNT]).toMatchObject({
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
    expect((stored() ?? [])[STARTER_COUNT]).toMatchObject({
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
    expect(list).toHaveLength(STARTER_COUNT);
    const edited = list.find((d) => d.id === 'starter-water');
    expect(edited).toMatchObject({ name: 'Hydration', color: 'steps' });
    // Water sits after Fat and the Macros starter.
    expect(list.findIndex((d) => d.id === 'starter-water')).toBe(6);
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

  describe('more values', () => {
    const extra = (index: number) =>
      within(screen.getByTestId(`watch-complication-extra-${index}`));

    test('Add another value adds a second value, and the gauge switch gives way to a note', () => {
      renderScreen({});
      expect(screen.queryByTestId('watch-complication-extra-0')).toBeNull();
      expect(
        screen.getByTestId('watch-complication-gauge-switch')
      ).toBeTruthy();

      fireEvent.press(screen.getByTestId('watch-complication-add-value'));

      expect(screen.getByTestId('watch-complication-extra-0')).toBeTruthy();
      expect(
        screen.queryByTestId('watch-complication-gauge-switch')
      ).toBeNull();
      expect(screen.getByTestId('watch-complication-rings-note')).toBeTruthy();
    });

    test('a new value starts on one that can be a ring, not on one already shown', () => {
      renderScreen({});
      fireEvent.press(screen.getByTestId('watch-complication-add-value'));
      // Calories is the first value; the next with progress after it is protein.
      expect(extra(0).getByTestId('source-value').props.children).toBe(
        'protein'
      );
    });

    test('the preview shows every value, in rows and joined on one line', () => {
      renderScreen({});
      fireEvent.press(screen.getByTestId('watch-complication-add-value'));
      expect(screen.getByTestId('complication-preview-row-0')).toBeTruthy();
      expect(screen.getByTestId('complication-preview-row-1')).toBeTruthy();
      expect(
        screen.getByTestId('complication-preview-inline-text').props.children
      ).toBe('65% · 65%');
    });

    test('is saved with the first value, in order', () => {
      renderScreen({});
      fireEvent.press(screen.getByTestId('watch-complication-add-value'));
      fireEvent.press(screen.getByText('Save'));
      expect((stored() ?? [])[STARTER_COUNT]).toMatchObject({
        source: 'calories',
        extras: [
          {
            source: 'protein',
            format: 'percent',
            color: 'protein',
            icon: 'fish.fill',
          },
        ],
      });
    });

    test('stops at three values', () => {
      renderScreen({});
      fireEvent.press(screen.getByTestId('watch-complication-add-value'));
      expect(screen.getByTestId('watch-complication-add-value')).toBeTruthy();
      fireEvent.press(screen.getByTestId('watch-complication-add-value'));
      expect(screen.getByTestId('watch-complication-extra-1')).toBeTruthy();
      expect(screen.queryByTestId('watch-complication-add-value')).toBeNull();
    });

    test('Remove takes a value away and brings the gauge switch back', () => {
      renderScreen({});
      fireEvent.press(screen.getByTestId('watch-complication-add-value'));
      fireEvent.press(screen.getByTestId('watch-complication-extra-0-remove'));
      expect(screen.queryByTestId('watch-complication-extra-0')).toBeNull();
      expect(
        screen.getByTestId('watch-complication-gauge-switch')
      ).toBeTruthy();
      fireEvent.press(screen.getByText('Save'));
      expect((stored() ?? [])[STARTER_COUNT]).not.toHaveProperty('extras');
    });

    test('changing a value’s source gives it that source’s look', () => {
      renderScreen({});
      fireEvent.press(screen.getByTestId('watch-complication-add-value'));
      fireEvent.press(extra(0).getByTestId('source-option-water'));
      fireEvent.press(screen.getByText('Save'));
      expect(((stored() ?? [])[STARTER_COUNT].extras ?? [])[0]).toEqual({
        source: 'water',
        format: 'percent',
        color: 'water',
        icon: 'drop.fill',
      });
    });

    test('a source already shown is not offered again, in either picker', () => {
      renderScreen({});
      fireEvent.press(screen.getByTestId('watch-complication-add-value'));
      // The extra can't pick the first value's source...
      expect(extra(0).queryByTestId('source-option-calories')).toBeNull();
      // ...and protein, now taken by the extra, is only in the extra's own picker.
      expect(screen.getAllByTestId('source-option-protein')).toHaveLength(1);
    });

    test('a value’s format and colour can be chosen', () => {
      renderScreen({});
      fireEvent.press(screen.getByTestId('watch-complication-add-value'));
      fireEvent.press(extra(0).getByText('Value'));
      fireEvent.press(
        screen.getByTestId('watch-complication-extra-0-color-fasting')
      );
      fireEvent.press(screen.getByText('Save'));
      expect(((stored() ?? [])[STARTER_COUNT].extras ?? [])[0]).toMatchObject({
        format: 'value',
        color: 'fasting',
      });
    });

    test('editing a complication that already has extras shows them', () => {
      renderScreen({ complicationId: 'starter-macros' });
      expect(screen.getByTestId('watch-complication-extra-0')).toBeTruthy();
      expect(screen.getByTestId('watch-complication-extra-1')).toBeTruthy();
      expect(screen.queryByTestId('watch-complication-add-value')).toBeNull();
    });
  });

  describe('sleep, heart and exercise sources', () => {
    test('a source with a score but no goal offers value and percent, not left', () => {
      renderScreen({});
      fireEvent.press(screen.getByTestId('source-option-sleepScore'));
      expect(screen.getByText('Percent')).toBeTruthy();
      expect(screen.queryByText('Left')).toBeNull();
      expect(
        screen.getByTestId('watch-complication-gauge-switch').props.disabled
      ).toBeFalsy();
    });

    test('sleep time can only be a value, with no gauge', () => {
      renderScreen({});
      fireEvent.press(screen.getByTestId('source-option-sleepDuration'));
      expect(screen.queryByText('Percent')).toBeNull();
      expect(
        screen.getByTestId('watch-complication-gauge-switch').props.disabled
      ).toBe(true);
      expect(
        screen.getByTestId('complication-preview-circular-text').props.children
      ).toBe('7:42');
    });

    test('exercise minutes have a goal, so every format is offered', () => {
      renderScreen({});
      fireEvent.press(screen.getByTestId('source-option-exerciseMinutes'));
      expect(screen.getByText('Percent')).toBeTruthy();
      expect(screen.getByText('Left')).toBeTruthy();
    });
  });
});
