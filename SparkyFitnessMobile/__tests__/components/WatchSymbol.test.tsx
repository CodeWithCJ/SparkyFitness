import React from 'react';
import { Platform } from 'react-native';
import { render } from '@testing-library/react-native';
import WatchSymbol from '../../src/components/WatchSymbol';
import { COMPLICATION_ICONS } from '../../src/utils/watchComplications';

jest.mock('expo-symbols', () => {
  const { View } = require('react-native');
  return {
    SymbolView: (props: Record<string, unknown>) => (
      <View testID="sf-symbol" {...props} />
    ),
  };
});

jest.mock('@expo/vector-icons', () => {
  const { View } = require('react-native');
  return {
    Ionicons: (props: Record<string, unknown>) => (
      <View testID="ionicon" {...props} />
    ),
    MaterialCommunityIcons: (props: Record<string, unknown>) => (
      <View testID="mci-icon" {...props} />
    ),
  };
});

describe('WatchSymbol', () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', {
      value: originalOS,
      configurable: true,
    });
  });

  test('renders SF SymbolView on iOS', () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
    const { getByTestId } = render(
      <WatchSymbol name="flame.fill" size={20} color="#8992DC" />
    );
    const el = getByTestId('sf-symbol');
    expect(el.props.name).toBe('flame.fill');
    expect(el.props.tintColor).toBe('#8992DC');
  });

  test('renders matching vector glyphs on Android for every COMPLICATION_ICONS entry and fallback', () => {
    Object.defineProperty(Platform, 'OS', {
      value: 'android',
      configurable: true,
    });
    for (const icon of COMPLICATION_ICONS) {
      const { queryByTestId } = render(
        <WatchSymbol name={icon} size={20} color="#64D2FF" />
      );
      const rendered = queryByTestId('ionicon') ?? queryByTestId('mci-icon');
      expect(rendered).toBeTruthy();
      expect(rendered?.props.color).toBe('#64D2FF');
      expect(rendered?.props.size).toBe(20);
    }

    const { getByTestId } = render(
      <WatchSymbol name="unknown.symbol" size={18} color="#FFFFFF" />
    );
    expect(getByTestId('ionicon').props.name).toBe('speedometer');
  });
});
