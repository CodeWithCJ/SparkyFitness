import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useAnimatedReaction } from 'react-native-reanimated';
import MeasurementTimelineCard from '../../../src/components/reports/MeasurementTimelineCard';
import { useMeasurementTimeline } from '../../../src/hooks/useMeasurementTimeline';
import { usePreferences } from '../../../src/hooks/usePreferences';
import { useGlucoseContext } from '../../../src/hooks/useGlucoseContext';
import { initializeI18n } from '../../../src/localization/i18n';

jest.mock('../../../src/hooks/useMeasurementTimeline', () => ({
  useMeasurementTimeline: jest.fn(),
}));
jest.mock('../../../src/hooks/useGlucoseContext', () => ({
  useGlucoseContext: jest.fn(),
}));
jest.mock('../../../src/hooks/usePreferences', () => ({
  usePreferences: jest.fn(() => ({
    preferences: { timezone: 'UTC', time_format: 'HH:mm' },
  })),
}));
jest.mock('../../../src/components/BottomSheetPicker', () => {
  const { View, Pressable, Text } = require('react-native');
  return {
    __esModule: true,
    default: ({
      title,
      options,
      onSelect,
    }: {
      title: string;
      options: { value: string; label: string }[];
      onSelect: (value: string) => void;
    }) => (
      <View>
        {options.map((option) => (
          <Pressable
            key={option.value}
            accessibilityLabel={`${title}: ${option.label}`}
            onPress={() => onSelect(option.value)}
          >
            <Text>{option.label}</Text>
          </Pressable>
        ))}
      </View>
    ),
  };
});
jest.mock('@shopify/react-native-skia', () => {
  const { View } = require('react-native');
  return {
    scale: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    Rect: (props: Record<string, unknown>) => (
      <View testID="context-marker" {...props} />
    ),
  };
});
jest.mock('../../../src/components/charts/chartFormatting', () => ({
  useChartFont: () => null,
  CHART_LABEL_FONT_SIZE: 10,
  formatTooltipDate: (day: string) => day,
}));
jest.mock('victory-native', () => {
  const ReactModule: typeof import('react') = require('react');
  const { View } = require('react-native');
  const transform = {
    panActive: { value: false },
    zoomActive: { value: false },
    matrix: { value: [] },
    offset: { value: [] },
    origin: { value: { x: 0, y: 0 } },
  };
  return {
    useChartTransformState: () => ({ state: transform }),
    CartesianChart: ({
      data,
      children,
      transformState,
      transformConfig,
    }: {
      transformState?: unknown;
      transformConfig?: unknown;
      data: { minutes: number; value: number | null }[];
      children: (arg: unknown) => React.ReactNode;
    }) => {
      const arg = ReactModule.useMemo(
        () => ({
          points: {
            value: data.map((point) => ({
              x: point.minutes / 10,
              xValue: point.minutes,
              y: point.value,
              yValue: point.value,
            })),
          },
          chartBounds: { left: 0, right: 144, top: 0, bottom: 200 },
        }),
        [data]
      );
      return (
        <View
          testID="measurement-chart"
          transformState={transformState}
          transformConfig={transformConfig}
        >
          {children(arg)}
        </View>
      );
    },
    Line: (props: Record<string, unknown>) => (
      <View testID="glucose-line" {...props} />
    ),
    Scatter: () => null,
  };
});
const readings = [
  { timestamp: '2026-11-03T10:00:00Z', value: 5, source: 'dexcom-api' },
  { timestamp: '2026-11-03T10:05:00Z', value: 6, source: 'dexcom-api' },
];
const timeline = jest.mocked(useMeasurementTimeline);
const context = jest.mocked(useGlucoseContext);
beforeAll(() => initializeI18n());
beforeEach(() => {
  jest.mocked(usePreferences).mockReturnValue({
    preferences: { timezone: 'UTC', time_format: 'HH:mm' },
  } as ReturnType<typeof usePreferences>);
  timeline.mockReturnValue({
    categories: {
      data: [
        {
          id: 'custom-cgm',
          name: 'CGM import',
          measurement_type: 'mg/dL',
          data_type: 'numeric',
        },
      ],
      isError: false,
    },
    readings: { data: readings, isLoading: false, isError: false },
  } as unknown as ReturnType<typeof useMeasurementTimeline>);
  context.mockReturnValue({
    data: {
      events: [
        {
          id: 'exercise',
          kind: 'exercise',
          day: '2026-11-03',
          label: 'Walk',
          start: '2026-11-03T10:00:00Z',
          end: '2026-11-03T10:30:00Z',
        },
        {
          id: 'food',
          kind: 'meal',
          day: '2026-11-03',
          label: 'Oatmeal',
          start: '2026-11-03T09:30:00Z',
        },
      ],
      unavailable: [],
    },
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useGlucoseContext>);
});

test('renders the native chart with workout start/end and food context, and toggles a layer', () => {
  render(
    <MeasurementTimelineCard startDate="2026-11-02" endDate="2026-11-03" />
  );
  expect(screen.getByTestId('measurement-chart')).toBeTruthy();
  expect(screen.getAllByTestId('context-marker')).toHaveLength(2);
  expect(screen.getByTestId('mobile-events-in-view')).toBeTruthy();
  expect(screen.getByText(/Oatmeal/)).toBeTruthy();
  fireEvent.press(screen.getByText(/Event details/));
  expect(
    screen
      .getAllByText(/Walk/)
      .some((node) => JSON.stringify(node.props.children).includes('Walk'))
  ).toBe(true);
  expect(screen.getAllByText(/10:00.*10:30/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/Oatmeal/).length).toBeGreaterThan(0);
  fireEvent.press(screen.getByLabelText('Context layers'));
  fireEvent.press(screen.getByLabelText('Exercise'));
  expect(screen.queryByText(/Walk/)).toBeNull();
});

test('opens API custom categories and preserves recorded source data on mobile', () => {
  render(
    <MeasurementTimelineCard startDate="2026-11-02" endDate="2026-11-03" />
  );
  fireEvent.press(screen.getByLabelText('Chart options'));
  fireEvent.press(screen.getByLabelText('Measurement: CGM import'));
  expect(timeline).toHaveBeenLastCalledWith('custom-cgm', '2026-11-03');
  expect(
    screen
      .getByTestId('glucose-line')
      .props.points.filter(
        (point: { yValue: number | null }) => point.yValue !== null
      )
      .map((point: { yValue: number }) => point.yValue)
  ).toEqual([5, 6]);
});

test('keeps secondary controls closed and lets users switch from zoom to inspection', () => {
  render(
    <MeasurementTimelineCard startDate="2026-11-02" endDate="2026-11-03" />
  );
  expect(
    screen.getByTestId('measurement-chart').props.transformState
  ).toBeDefined();
  expect(
    screen.getByTestId('measurement-chart').props.transformConfig.pinch
      .dimensions
  ).toBe('x');
  const state = screen.getByTestId('measurement-chart').props
    .transformState as { matrix: { value: number[] } };
  state.matrix.value = [2];
  fireEvent.press(screen.getByText('Reset zoom'));
  expect(state.matrix.value[0]).toBe(1);
  expect(screen.queryByLabelText('Measurement: CGM import')).toBeNull();
  expect(screen.queryByLabelText('Exercise')).toBeNull();
  fireEvent.press(screen.getByText('Inspect readings'));
  expect(screen.getByText('Zoom & pan')).toBeTruthy();
  expect(
    screen.getByTestId('measurement-chart').props.transformState
  ).toBeUndefined();
  expect(screen.getByTestId('measurement-timeline-touch-overlay')).toBeTruthy();
  fireEvent.press(screen.getByText('Zoom & pan'));
  expect(screen.queryByTestId('measurement-timeline-touch-overlay')).toBeNull();
});

test('updates visible event cards after a native zoom or pan settles', () => {
  render(
    <MeasurementTimelineCard startDate="2026-11-02" endDate="2026-11-03" />
  );
  const [prepare, react] = jest.mocked(useAnimatedReaction).mock.calls.at(-1)!;
  const state = screen.getByTestId('measurement-chart').props
    .transformState as {
    panActive: { value: boolean };
    zoomActive: { value: boolean };
    matrix: { value: number[] };
  };
  state.panActive.value = false;
  state.zoomActive.value = false;
  // Plot bounds are 0..144: this transform shows 12:00..18:00.
  state.matrix.value = [4, 0, 0, -288];
  act(() => react(prepare(), null));
  expect(screen.getByText('No timed events in this window.')).toBeTruthy();
  expect(screen.queryByText(/Oatmeal/)).toBeNull();
  expect(screen.queryByText(/10:05.*6 mmol/)).toBeNull();
  // 09:00..15:00 contains the meal and workout again.
  state.matrix.value = [4, 0, 0, -216];
  state.panActive.value = true;
  expect(prepare()).toBeNull();
  state.panActive.value = false;
  act(() => react(prepare(), null));
  expect(screen.getByTestId('mobile-events-in-view')).toBeTruthy();
  expect(screen.getByText(/Oatmeal/)).toBeTruthy();
  expect(screen.getByText(/10:00.*10:30/)).toBeTruthy();
  expect(screen.getByText(/10:05.*6 mmol/)).toBeTruthy();
});

test('uses the account glucose unit and leaves custom-category units unchanged', () => {
  jest.mocked(usePreferences).mockReturnValue({
    preferences: { timezone: 'UTC', default_glucose_unit: 'mg/dL' },
  } as ReturnType<typeof usePreferences>);
  render(
    <MeasurementTimelineCard startDate="2026-11-02" endDate="2026-11-03" />
  );
  expect(screen.getByText(/108.11 mg\/dL/)).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Chart options'));
  expect(screen.queryByLabelText('Unit: mmol/L')).toBeNull();
  fireEvent.press(screen.getByLabelText('Measurement: CGM import'));
  // Custom numeric values already use the unit declared by their category.
  expect(screen.getByText(/6 mg\/dL/)).toBeTruthy();
});

test('keeps raw glucose visible when custom category metadata fails', () => {
  timeline.mockReturnValue({
    categories: { data: [], isError: true },
    readings: { data: readings, isLoading: false, isError: false },
  } as unknown as ReturnType<typeof useMeasurementTimeline>);
  render(
    <MeasurementTimelineCard startDate="2026-11-02" endDate="2026-11-03" />
  );
  expect(screen.getByTestId('measurement-chart')).toBeTruthy();
  expect(screen.queryByText('Could not load measurement readings.')).toBeNull();
});
