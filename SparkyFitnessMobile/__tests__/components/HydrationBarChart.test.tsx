import React from 'react';
import { render, screen } from '@testing-library/react-native';
import i18n, { initializeI18n } from '../../src/localization/i18n';
import HydrationBarChart, {
  buildHydrationTooltipText,
} from '../../src/components/HydrationBarChart';
import { volumeFromMl } from '../../src/utils/unitConversions';
import type { HydrationDataPoint } from '../../src/types/healthTrends';

// `buildHydrationTooltipText` takes an ALREADY-converted point — the component owns the
// millilitres boundary — so each case converts with the same helper the component uses.
const pointFor = (milliliters: number, unit: string) => ({
  day: '2026-06-03',
  volume: volumeFromMl(milliliters, unit),
});

describe('HydrationBarChart buildHydrationTooltipText', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  afterAll(async () => {
    await i18n.changeLanguage('en');
  });

  test('states the volume, the unit label and the date', () => {
    const text = buildHydrationTooltipText(pointFor(500, 'ml'), 'ml', i18n.t);

    expect(text).toContain('500');
    expect(text).toContain('ml');
    expect(text).toContain('Jun');
  });

  test('reads a 500 ml point in the display unit, not in millilitres', () => {
    const text = buildHydrationTooltipText(pointFor(500, 'oz'), 'oz', i18n.t);

    expect(text).toContain('16.9');
    expect(text).toContain('oz');
    expect(text).not.toContain('500');
  });

  test('uses the WATER_UNIT_LABELS label rather than the raw key', () => {
    const text = buildHydrationTooltipText(
      pointFor(1500, 'liter'),
      'liter',
      i18n.t
    );

    expect(text).toContain('L');
    expect(text).not.toContain('liter');
  });

  test('follows the active locale', async () => {
    const englishText = buildHydrationTooltipText(
      pointFor(500, 'oz'),
      'oz',
      i18n.t
    );

    await i18n.changeLanguage('pl');
    const polishText = buildHydrationTooltipText(
      pointFor(500, 'oz'),
      'oz',
      i18n.t
    );

    // PL groups decimals with a comma, so the same point cannot read as it did in EN.
    expect(polishText).toContain('16,9');
    expect(polishText).not.toBe(englishText);
  });
});

/**
 * The plot itself is exercised through `TrendBarChart`'s own suite; these cases render the
 * real `TrendBarChart` to prove HydrationBarChart converts its goal out of millilitres
 * before the line reaches it, the same boundary already proven for the plotted bars above.
 */
jest.mock('victory-native', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  return {
    CartesianChart: ({
      children,
      data,
    }: {
      children: (arg: {
        points: { value: unknown[] };
        chartBounds: {
          left: number;
          right: number;
          top: number;
          bottom: number;
        };
        yScale: (value: number) => number;
      }) => React.ReactNode;
      data: { day: string; value: number }[];
    }) => {
      const points = data.map((point, index) => ({
        x: 10 + index * 20,
        y: 0,
        xValue: point.day,
        yValue: point.value,
      }));
      const chartBounds = {
        left: 0,
        right: 20 * data.length,
        top: 0,
        bottom: 100,
      };
      const yScale = (value: number) => value;
      return ReactModule.createElement(
        View,
        { testID: 'cartesian-chart' },
        children({ points: { value: points }, chartBounds, yScale })
      );
    },
    Bar: () => null,
  };
});

jest.mock('@shopify/react-native-skia', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  return {
    Line: ({ children, ...props }: Record<string, unknown>) =>
      ReactModule.createElement(
        View,
        { testID: 'goal-line', ...props },
        children
      ),
    DashPathEffect: () => null,
    matchFont: jest.fn(() => null),
  };
});

describe('HydrationBarChart goal line', () => {
  const data: HydrationDataPoint[] = [
    { day: '2026-06-01', milliliters: 500 },
    { day: '2026-06-02', milliliters: 750 },
  ];

  test('converts a millilitre goal into the display unit before it reaches the line', () => {
    render(
      <HydrationBarChart
        data={data}
        isLoading={false}
        isError={false}
        range="7d"
        unit="oz"
        goal={2500}
      />
    );

    const expectedGoalInOz = volumeFromMl(2500, 'oz');
    expect(screen.getByTestId('goal-line').props.p1.y).toBeCloseTo(
      expectedGoalInOz
    );
  });

  test('renders no goal line when no goal is supplied', () => {
    render(
      <HydrationBarChart
        data={data}
        isLoading={false}
        isError={false}
        range="7d"
        unit="ml"
      />
    );

    expect(screen.queryByTestId('goal-line')).toBeNull();
  });
});
