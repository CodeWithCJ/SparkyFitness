import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import PaceReferenceCard from '../../src/components/recording/PaceReferenceCard';

const type = (key: 'hours' | 'minutes' | 'seconds', value: string) =>
  fireEvent.changeText(screen.getByTestId(`pace-reference-${key}`), value);

describe('PaceReferenceCard', () => {
  it('saves a 5K time as kilometres and seconds', () => {
    const onSave = jest.fn();
    render(<PaceReferenceCard race={null} onSave={onSave} />);
    expect(screen.queryByTestId('pace-reference-clear')).toBeNull();
    type('minutes', '25');
    type('seconds', '0');
    fireEvent.press(screen.getByTestId('pace-reference-save'));
    expect(onSave).toHaveBeenCalledWith({ distanceKm: 5, seconds: 1500 });
  });

  it('saves a half marathon with hours', () => {
    const onSave = jest.fn();
    render(<PaceReferenceCard race={null} onSave={onSave} />);
    fireEvent.press(screen.getByText('Half'));
    type('hours', '1');
    type('minutes', '55');
    type('seconds', '30');
    fireEvent.press(screen.getByTestId('pace-reference-save'));
    expect(onSave).toHaveBeenCalledWith({
      distanceKm: 21.0975,
      seconds: 6930,
    });
  });

  it('keeps only digits in the time boxes', () => {
    render(<PaceReferenceCard race={null} onSave={jest.fn()} />);
    type('minutes', '2a5');
    expect(screen.getByTestId('pace-reference-minutes').props.value).toBe('25');
  });

  it('explains a time that cannot be right and saves nothing', () => {
    const onSave = jest.fn();
    render(<PaceReferenceCard race={null} onSave={onSave} />);
    type('minutes', '3');
    fireEvent.press(screen.getByTestId('pace-reference-save'));
    expect(screen.getByTestId('pace-reference-error')).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();

    // Nothing typed at all is not a time either.
    type('minutes', '');
    fireEvent.press(screen.getByTestId('pace-reference-save'));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows the saved race, fills the boxes and clears it', () => {
    const onSave = jest.fn();
    render(
      <PaceReferenceCard
        race={{ distanceKm: 10, seconds: 3125 }}
        onSave={onSave}
      />
    );
    expect(screen.getByTestId('pace-reference-saved').props.children).toBe(
      'Saved: 10K in 52:05.'
    );
    expect(screen.getByTestId('pace-reference-minutes').props.value).toBe('52');
    expect(screen.getByTestId('pace-reference-seconds').props.value).toBe('5');
    fireEvent.press(screen.getByTestId('pace-reference-clear'));
    expect(onSave).toHaveBeenCalledWith(null);
    expect(screen.getByTestId('pace-reference-minutes').props.value).toBe('');
  });

  it('offers the Apple Watch switch only with a saved race and a watch', () => {
    const onChange = jest.fn();
    const { rerender } = render(
      <PaceReferenceCard
        race={null}
        onSave={jest.fn()}
        watch={{ value: false, onChange }}
      />
    );
    expect(screen.queryByTestId('pace-reference-watch')).toBeNull();

    rerender(
      <PaceReferenceCard
        race={{ distanceKm: 5, seconds: 1500 }}
        onSave={jest.fn()}
        watch={{ value: false, onChange }}
      />
    );
    fireEvent(screen.getByTestId('pace-reference-watch'), 'valueChange', true);
    expect(onChange).toHaveBeenCalledWith(true);

    rerender(
      <PaceReferenceCard
        race={{ distanceKm: 5, seconds: 1500 }}
        onSave={jest.fn()}
      />
    );
    expect(screen.queryByTestId('pace-reference-watch')).toBeNull();
  });
});
