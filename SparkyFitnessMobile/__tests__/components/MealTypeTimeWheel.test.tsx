import React from 'react';
import { act, render } from '@testing-library/react-native';
import MealTypeTimeWheel, {
  TIME_WHEEL_CONTAINER_HEIGHT,
  TIME_WHEEL_WRAPPER_HEIGHT,
} from '../../src/components/MealTypeTimeWheel';

// jest.setup.js mocks react-native-ui-datepicker as a View that spreads ALL
// picker props (testID 'date-picker'). That lets these tests assert the REAL
// props + layout contract the shared wheel passes.
//
// Physical-Android lesson: simply checking "DateTimePicker exists +
// containerHeight=220 + timePicker=true" passed while the wheel was STILL
// invisible. The invisible-wheel root cause is LAYOUT: the library's wheel
// columns are `flex:1` children that inherit their width from the parent, so
// an `alignItems:'center'` (shrink-to-content) wrapper collapses their width
// to ~0 — the wheel renders an empty region. These tests therefore pin the
// FULL-WIDTH STRETCH contract that makes it visible, plus the 24-hour format.

function pickerProps(queries: { getByTestId: (id: string) => any }) {
  return queries.getByTestId('date-picker').props;
}

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes(),
  ).padStart(2, '0')}`;
}

describe('MealTypeTimeWheel — visible large wheel (physical-Android bugfix)', () => {
  it('owns a deterministic FULL-WIDTH stretchable layout (no alignItems:center shrink wrapper)', () => {
    const queries = render(
      <MealTypeTimeWheel value="17:30" onChange={jest.fn()} testID="wheel" />,
    );
    const wrapper = queries.getByTestId('wheel');
    // The shared wheel root must be full-width + stretchable so the picker's
    // wheel columns (flex:1 children inheriting width) get real horizontal
    // space — the exact thing that was missing on device.
    expect(wrapper.props.style.width).toBe('100%');
    expect(wrapper.props.style.alignSelf).toBe('stretch');
    // NO shrink-to-content wrapper that would collapse the wheel columns.
    expect(wrapper.props.style.alignItems).not.toBe('center');
    expect(wrapper.props.style.justifyContent).not.toBe('center');
    expect(wrapper.props.style.height).toBe(TIME_WHEEL_WRAPPER_HEIGHT);
    // No transform scale hack.
    expect(wrapper.props.style).not.toHaveProperty('transform');
  });

  it('passes a full-width stretchable style to the picker itself (mirrors TimeSheet under BottomSheetView)', () => {
    const queries = render(
      <MealTypeTimeWheel value="17:30" onChange={jest.fn()} />,
    );
    const picker = pickerProps(queries);
    expect(picker.style.width).toBe('100%');
    expect(picker.style.alignSelf).toBe('stretch');
  });

  it('renders the picker with the supported sizing props', () => {
    const queries = render(
      <MealTypeTimeWheel value="17:30" onChange={jest.fn()} />,
    );
    const picker = pickerProps(queries);
    expect(picker.mode).toBe('single');
    expect(picker.timePicker).toBe(true);
    expect(picker.initialView).toBe('time');
    expect(picker.hideHeader).toBe(true);
    expect(picker.containerHeight).toBe(TIME_WHEEL_CONTAINER_HEIGHT);
  });

  it('uses 24-hour presentation (no use12Hours) so 17 and 23 remain representable', () => {
    const queries = render(
      <MealTypeTimeWheel value="23:59" onChange={jest.fn()} />,
    );
    const picker = pickerProps(queries);
    // No AM/PM third column: use12Hours must be absent/false.
    expect(picker.use12Hours).toBeFalsy();
  });

  it('seeds 17:30 and 23:59 correctly (24h values survive through the Date)', () => {
    const p17 = render(<MealTypeTimeWheel value="17:30" onChange={jest.fn()} />);
    const d17 = pickerProps(p17).date as Date;
    expect(d17.getHours()).toBe(17);
    expect(d17.getMinutes()).toBe(30);

    const p23 = render(<MealTypeTimeWheel value="23:59" onChange={jest.fn()} />);
    const d23 = pickerProps(p23).date as Date;
    expect(d23.getHours()).toBe(23);
    expect(d23.getMinutes()).toBe(59);
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

  it('converts a wheel change back to canonical HH:MM (hour change)', () => {
    const onChange = jest.fn();
    const queries = render(
      <MealTypeTimeWheel value="17:30" onChange={onChange} />,
    );
    act(() => {
      pickerProps(queries).onChange({ date: new Date(2026, 7, 9, 18, 30) });
    });
    expect(onChange).toHaveBeenCalledWith('18:30');
  });

  it('converts a wheel change back to canonical HH:MM (minute change)', () => {
    const onChange = jest.fn();
    const queries = render(
      <MealTypeTimeWheel value="17:30" onChange={onChange} />,
    );
    act(() => {
      pickerProps(queries).onChange({ date: new Date(2026, 7, 9, 17, 45) });
    });
    expect(onChange).toHaveBeenCalledWith('17:45');
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
