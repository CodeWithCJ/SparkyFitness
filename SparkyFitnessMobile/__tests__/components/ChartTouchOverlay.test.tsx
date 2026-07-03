import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import ChartTouchOverlay, {
  CHART_TOUCH_LONG_PRESS_DELAY_MS,
  buildChartTouchZones,
  type ChartTouchLayout,
} from '../../src/components/ChartTouchOverlay';

const layout: ChartTouchLayout = {
  chartBounds: {
    left: 0,
    right: 60,
    top: 5,
    bottom: 45,
  },
  points: [
    { x: 10, xValue: '2026-03-01', y: 30, yValue: 1000 },
    { x: 30, xValue: '2026-03-02', y: 20, yValue: 2000 },
    { x: 50, xValue: '2026-03-03', y: 10, yValue: 3000 },
  ],
};

const createTouchEvent = (locationX: number, locationY: number) => ({
  nativeEvent: {
    changedTouches: [{ locationX, locationY }],
    touches: [{ locationX, locationY }],
    locationX,
    locationY,
  },
});

describe('ChartTouchOverlay', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('builds touch zones from the midpoints between plotted points', () => {
    expect(buildChartTouchZones(layout.points, layout.chartBounds)).toEqual([
      { index: 0, left: 0, width: 20 },
      { index: 1, left: 20, width: 20 },
      { index: 2, left: 40, width: 20 },
    ]);
  });

  it('waits for the long press delay before selecting a zone', () => {
    const onSelect = jest.fn();
    const onClear = jest.fn();
    const screen = render(
      <ChartTouchOverlay
        layout={layout}
        onSelect={onSelect}
        onClear={onClear}
        testIDPrefix="touch-overlay"
      />,
    );

    fireEvent(
      screen.getByTestId('touch-overlay'),
      'touchStart',
      createTouchEvent(25, 20),
    );

    expect(onSelect).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(CHART_TOUCH_LONG_PRESS_DELAY_MS);
    });

    expect(onSelect).toHaveBeenCalledWith(1);

    fireEvent(
      screen.getByTestId('touch-overlay'),
      'touchEnd',
      createTouchEvent(25, 20),
    );

    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('cancels activation when the touch turns into a drag before the delay', () => {
    const onSelect = jest.fn();
    const screen = render(
      <ChartTouchOverlay
        layout={layout}
        onSelect={onSelect}
        testIDPrefix="touch-overlay"
      />,
    );

    fireEvent(
      screen.getByTestId('touch-overlay'),
      'touchStart',
      createTouchEvent(25, 20),
    );
    fireEvent(
      screen.getByTestId('touch-overlay'),
      'touchMove',
      createTouchEvent(25, 35),
    );

    act(() => {
      jest.advanceTimersByTime(CHART_TOUCH_LONG_PRESS_DELAY_MS);
    });

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('updates the selected zone while dragging after activation', () => {
    const onSelect = jest.fn();
    const onClear = jest.fn();
    const screen = render(
      <ChartTouchOverlay
        layout={layout}
        onSelect={onSelect}
        onClear={onClear}
        testIDPrefix="touch-overlay"
      />,
    );

    fireEvent(
      screen.getByTestId('touch-overlay'),
      'touchStart',
      createTouchEvent(10, 20),
    );
    act(() => {
      jest.advanceTimersByTime(CHART_TOUCH_LONG_PRESS_DELAY_MS);
    });

    fireEvent(
      screen.getByTestId('touch-overlay'),
      'touchMove',
      createTouchEvent(45, 20),
    );

    expect(onSelect).toHaveBeenNthCalledWith(1, 0);
    expect(onSelect).toHaveBeenNthCalledWith(2, 2);
  });
});
