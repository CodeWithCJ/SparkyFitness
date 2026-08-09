import React from 'react';
import { act, render } from '@testing-library/react-native';
import MealTypeTimeWheel, {
  TIME_WHEEL_CONTAINER_HEIGHT,
  TIME_WHEEL_WRAPPER_HEIGHT,
} from '../../src/components/MealTypeTimeWheel';

// jest.setup.js mocks react-native-ui-datepicker as a View that spreads ALL
// picker props (testID 'date-picker'). That lets these tests assert the REAL
// props the shared wheel passes — the device bug was that the wheel was
// wrapped in a transform-scale hack and rendered blank on physical Android;
// the fix renders the picker directly with the library's supported sizing
// API, which is exactly what these props pin down.

function pickerProps(queries: { getByTestId: (id: string) => any }) {
  return queries.getByTestId('date-picker').props;
}

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes(),
  ).padStart(2, '0')}`;
}

describe('MealTypeTimeWheel — visible large wheel (physical-Android bugfix)', () => {
  it('renders the picker directly with the supported sizing API (no transform scale hack)', () => {
    const queries = render(
      <MealTypeTimeWheel value="17:30" onChange={jest.fn()} testID="wheel" />,
    );
    const picker = pickerProps(queries);
    // The props the wheel MUST pass for a visible, device-proven wheel:
    expect(picker.mode).toBe('single');
    expect(picker.timePicker).toBe(true);
    expect(picker.initialView).toBe('time');
    expect(picker.hideHeader).toBe(true);
    expect(picker.use12Hours).toBe(true);
    // Explicit supported picker container height (full five-row wheel).
    expect(picker.containerHeight).toBe(TIME_WHEEL_CONTAINER_HEIGHT);
    // The old implementation wrapped the picker in a scale-transformed View,
    // which blanked the wheel on Android. The wrapper must NOT scale.
    const wrapper = queries.getByTestId('wheel');
    expect(wrapper.props.style).not.toHaveProperty('transform');
    expect(wrapper.props.style.height).toBe(TIME_WHEEL_WRAPPER_HEIGHT);
  });

  it('seeds the wheel with an existing 17:30 value', () => {
    const queries = render(
      <MealTypeTimeWheel value="17:30" onChange={jest.fn()} />,
    );
    const d = pickerProps(queries).date as Date;
    expect(d.getHours()).toBe(17);
    expect(d.getMinutes()).toBe(30);
  });

  it('seeds the wheel with the current visible time when the value is unset', () => {
    const before = new Date();
    const queries = render(
      <MealTypeTimeWheel value={null} onChange={jest.fn()} />,
    );
    const d = pickerProps(queries).date as Date;
    const after = new Date();
    // The wheel must show the CURRENT time when no value exists (Save without
    // scrolling commits exactly what the user sees).
    expect(hhmm(d)).toMatch(/^\d{2}:\d{2}$/);
    expect(d.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
    expect(d.getTime()).toBeLessThanOrEqual(after.getTime() + 60_000);
  });

  it('converts a wheel change back to canonical HH:MM', () => {
    const onChange = jest.fn();
    const queries = render(
      <MealTypeTimeWheel value="17:30" onChange={onChange} />,
    );
    act(() => {
      pickerProps(queries).onChange({ date: new Date(2026, 7, 9, 18, 45) });
    });
    expect(onChange).toHaveBeenCalledWith('18:45');
  });

  it('ignores empty onChange payloads (no commit of an undefined time)', () => {
    const onChange = jest.fn();
    const queries = render(
      <MealTypeTimeWheel value="17:30" onChange={onChange} />,
    );
    act(() => {
      pickerProps(queries).onChange({ date: null });
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('uses the picker-specific style keys with a prominent 28pt time label', () => {
    const queries = render(
      <MealTypeTimeWheel value="17:30" onChange={jest.fn()} />,
    );
    const styles = pickerProps(queries).styles;
    expect(styles.time_label.fontSize).toBe(28);
    expect(styles.time_selector_label).toBeDefined();
    expect(styles.time_selected_indicator).toBeDefined();
  });
});
