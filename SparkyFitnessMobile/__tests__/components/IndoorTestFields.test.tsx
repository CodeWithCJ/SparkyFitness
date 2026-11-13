import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import IndoorTestFields, {
  type IndoorTestFieldsProps,
} from '../../src/components/recording/IndoorTestFields';

const props = (
  overrides: Partial<IndoorTestFieldsProps> = {}
): IndoorTestFieldsProps => ({
  type: 'cooper',
  unitLabel: 'km',
  timeText: '24:30',
  onTimeChange: jest.fn(),
  splitText: '',
  onSplitChange: jest.fn(),
  inclineText: '1',
  onInclineChange: jest.fn(),
  adjustForIncline: true,
  onAdjustChange: jest.fn(),
  inclineInvalid: false,
  ...overrides,
});

describe('IndoorTestFields', () => {
  it('explains that 0% understates outdoor effort and 1% is about flat', () => {
    render(<IndoorTestFields {...props()} />);
    expect(
      screen.getByText(
        /A treadmill at 0% understates outdoor effort; 1% is about/
      )
    ).toBeTruthy();
  });

  it('edits the incline, accepting only number characters', () => {
    const p = props();
    render(<IndoorTestFields {...p} />);
    fireEvent.changeText(screen.getByTestId('indoor-test-incline'), '2.5');
    expect(p.onInclineChange).toHaveBeenCalledWith('2.5');
    fireEvent.changeText(screen.getByTestId('indoor-test-incline'), 'abc');
    expect(p.onInclineChange).toHaveBeenCalledTimes(1);
  });

  it('switches the correction on and off', () => {
    const p = props();
    render(<IndoorTestFields {...p} />);
    fireEvent(screen.getByTestId('indoor-test-adjust'), 'valueChange', false);
    expect(p.onAdjustChange).toHaveBeenCalledWith(false);
  });

  it('flags an incline that is not from 0 to 15', () => {
    const { rerender } = render(<IndoorTestFields {...props()} />);
    expect(screen.queryByText('Enter an incline from 0 to 15.')).toBeNull();
    rerender(<IndoorTestFields {...props({ inclineInvalid: true })} />);
    expect(screen.getByText('Enter an incline from 0 to 15.')).toBeTruthy();
  });

  it('asks the 5K runner for the time, prefilled from the clock', () => {
    const p = props({ type: '5k' });
    render(<IndoorTestFields {...p} />);
    expect(screen.getByTestId('indoor-test-time').props.value).toBe('24:30');
    fireEvent.changeText(screen.getByTestId('indoor-test-time'), '24:10');
    expect(p.onTimeChange).toHaveBeenCalledWith('24:10');
    expect(screen.queryByTestId('indoor-test-split')).toBeNull();
  });

  it('asks the 30-minute runner for the distance at 10:00', () => {
    const p = props({ type: '30min' });
    render(<IndoorTestFields {...p} />);
    fireEvent.changeText(screen.getByTestId('indoor-test-split'), '2.1');
    expect(p.onSplitChange).toHaveBeenCalledWith('2.1');
    expect(screen.queryByTestId('indoor-test-time')).toBeNull();
    expect(
      screen.getByText(/Leave it empty to assume a steady pace/)
    ).toBeTruthy();
  });

  it('points the Cooper runner at the distance box', () => {
    render(<IndoorTestFields {...props()} />);
    expect(screen.queryByTestId('indoor-test-time')).toBeNull();
    expect(screen.queryByTestId('indoor-test-split')).toBeNull();
    expect(screen.getByText(/in the Distance box above/)).toBeTruthy();
  });
});
