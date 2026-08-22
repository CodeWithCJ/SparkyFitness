import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import WeekdaySheet from '../../../src/components/medications/WeekdaySheet';

describe('WeekdaySheet', () => {
  it('adds a tapped day and emits the selection sorted', () => {
    const onChange = jest.fn();
    const screen = render(<WeekdaySheet value={[3]} onChange={onChange} />);

    fireEvent.press(screen.getByLabelText('Monday, not selected'));

    expect(onChange).toHaveBeenCalledWith([1, 3]);
  });

  it('removes a tapped day that was already selected', () => {
    const onChange = jest.fn();
    const screen = render(<WeekdaySheet value={[1, 3]} onChange={onChange} />);

    fireEvent.press(screen.getByLabelText('Wednesday, selected'));

    expect(onChange).toHaveBeenCalledWith([1]);
  });

  it('exposes selection through accessibilityState', () => {
    const screen = render(<WeekdaySheet value={[3]} onChange={jest.fn()} />);

    expect(screen.getByLabelText('Wednesday, selected').props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText('Monday, not selected').props.accessibilityState.selected).toBe(false);
  });
});
