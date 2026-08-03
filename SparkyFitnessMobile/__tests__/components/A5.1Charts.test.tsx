import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import StepsBarChart from '../../src/components/StepsBarChart';
import NutrientBarChart from '../../src/components/NutrientBarChart';
import WeightLineChart from '../../src/components/WeightLineChart';

jest.mock('../../src/localization', () => ({
  getAppLocale: () =>
    (globalThis as typeof globalThis & { __activeWorkoutTestLocale?: string })
      .__activeWorkoutTestLocale === 'pl'
      ? 'pl-PL'
      : 'en-US',
  formatLocalizedNumber: (value: number, options?: Intl.NumberFormatOptions) =>
    value.toLocaleString(
      (globalThis as typeof globalThis & { __activeWorkoutTestLocale?: string })
        .__activeWorkoutTestLocale === 'pl'
        ? 'pl-PL'
        : 'en-US',
      options,
    ),
}));

jest.mock('../../src/components/ChartTouchOverlay', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');

  return {
    __esModule: true,
    default: ({ onSelect, testIDPrefix }: { onSelect: (index: number) => void; testIDPrefix: string }) => (
      <>
        {[0, 1, 2, 3].map(index => (
          <Pressable
            key={index}
            testID={`${testIDPrefix}-select-${index}`}
            onPress={() => onSelect(index)}
          >
            <Text>Select {index}</Text>
          </Pressable>
        ))}
      </>
    ),
    ChartLayoutReporter: () => null,
    EMPTY_CHART_TOUCH_LAYOUT: { chartBounds: null, points: [] },
    createChartTouchLayoutSignature: () => 'mock-layout',
  };
});

function setTestLocale(locale: 'en' | 'pl'): void {
  (globalThis as typeof globalThis & {
    __setTestLocale: (value: 'en' | 'pl') => void;
  }).__setTestLocale(locale);
}

const chartProps = {
  isLoading: false,
  isError: false,
  range: '7d' as const,
};

describe('A5.1 charts', () => {
  beforeEach(() => {
    setTestLocale('en');
  });

  it.each([
    [1, 'krok'],
    [2, 'kroki'],
    [5, 'kroków'],
    [22, 'kroki'],
  ] as const)('StepsBarChart renders the Polish plural form for %s steps', (steps, plural) => {
    setTestLocale('pl');
    const view = render(
      <StepsBarChart
        {...chartProps}
        data={[{ day: '2026-01-04', steps }]}
      />,
    );

    fireEvent.press(view.getByTestId('steps-touch-overlay-select-0'));

    expect(view.getByText(new RegExp(`^${steps.toLocaleString('pl-PL')} ${plural} ·`))).toBeTruthy();
  });

  it('keeps a selected tooltip and updates its language without remounting', () => {
    const data = [{ day: '2026-01-04', steps: 22 }];
    const view = render(<StepsBarChart {...chartProps} data={data} />);

    fireEvent.press(view.getByTestId('steps-touch-overlay-select-0'));
    expect(view.getByText(/22 steps ·/)).toBeTruthy();

    setTestLocale('pl');
    view.rerender(<StepsBarChart {...chartProps} data={data} />);

    expect(view.getByText(/22 kroki ·/)).toBeTruthy();
    expect(view.queryByText(/22 steps ·/)).toBeNull();
  });

  it('renders the selected NutrientBarChart tooltip', () => {
    setTestLocale('pl');
    const view = render(
      <NutrientBarChart
        {...chartProps}
        data={[{ day: '2026-01-04', value: 12.5 }]}
        nutrientLabel="Białko"
        unit="g"
      />,
    );

    fireEvent.press(view.getByTestId('nutrient-touch-overlay-select-0'));

    expect(view.getByText(/Spożyto 12,5g ·/)).toBeTruthy();
  });

  it('renders the selected WeightLineChart tooltip', () => {
    setTestLocale('pl');
    const view = render(
      <WeightLineChart
        {...chartProps}
        data={[{ day: '2026-01-04', weight: 72.5 }]}
        unit="kg"
      />,
    );

    fireEvent.press(view.getByTestId('weight-touch-overlay-select-0'));

    expect(view.getByText(/72,50 kg ·/)).toBeTruthy();
  });
});
