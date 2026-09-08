import React from 'react';
import { render, screen } from '@testing-library/react-native';
import HydrationGauge from '../../src/components/HydrationGauge';
import { initializeI18n } from '../../src/localization/i18n';

// The global Skia mock's PathBuilder has no `cubicTo`, which the bottle outline needs.
// The drawing is irrelevant here — only the headline totals are under test.
jest.mock('@shopify/react-native-skia', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  const pathBuilder = {
    moveTo: jest.fn().mockReturnThis(),
    lineTo: jest.fn().mockReturnThis(),
    cubicTo: jest.fn().mockReturnThis(),
    close: jest.fn().mockReturnThis(),
    build: jest.fn().mockReturnValue(null),
  };
  return {
    Canvas: ({ children, style }: { children?: unknown; style?: unknown }) =>
      ReactModule.createElement(
        View,
        { style, testID: 'skia-canvas' },
        children
      ),
    Group: ({ children }: { children?: unknown }) => children,
    Path: () => null,
    Rect: () => null,
    Skia: {
      PathBuilder: { Make: () => pathBuilder },
      Path: { Rect: jest.fn(() => null) },
      XYWHRect: jest.fn(() => ({})),
    },
    matchFont: jest.fn(() => null),
  };
});

// Guards the volume-helper extraction: the gauge now formats through `volumeFromMl` /
// `formatVolumeForUnit`, so its headline totals must read exactly as they did before.
describe('HydrationGauge', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  test('renders consumed and goal in millilitres with no decimals', () => {
    render(<HydrationGauge consumed={1500} goal={2000} unit="ml" />);

    expect(screen.getByText('1,500 ml')).toBeTruthy();
    expect(screen.getByText('of 2,000 ml')).toBeTruthy();
  });

  test('renders the converted value and label in fluid ounces', () => {
    render(<HydrationGauge consumed={1500} goal={2000} unit="oz" />);

    expect(screen.getByText('50.7 oz')).toBeTruthy();
    expect(screen.getByText('of 67.6 oz')).toBeTruthy();
  });
});
