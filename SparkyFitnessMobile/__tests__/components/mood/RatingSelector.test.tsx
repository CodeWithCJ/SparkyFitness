import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import RatingSelector from '../../../src/components/mood/RatingSelector';

const renderSelector = (
  value: number | null,
  onChange: (value: number | null) => void = jest.fn()
) =>
  render(
    <RatingSelector
      label="Energy"
      value={value}
      onChange={onChange}
      lowLabel="Drained"
      highLabel="Energized"
    />
  );

describe('RatingSelector', () => {
  it('renders five rating buttons', () => {
    const { getAllByRole } = renderSelector(null);
    expect(getAllByRole('button')).toHaveLength(5);
  });

  it('selects a rating when pressed', () => {
    const onChange = jest.fn();
    const { getByLabelText } = renderSelector(null, onChange);
    fireEvent.press(getByLabelText('Energy 4'));
    expect(onChange).toHaveBeenCalledWith(4);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('marks the current value selected and clears it when pressed again', () => {
    const onChange = jest.fn();
    const { getByLabelText } = renderSelector(2, onChange);
    expect(getByLabelText('Energy 2').props.accessibilityState).toEqual({
      selected: true,
    });
    expect(getByLabelText('Energy 3').props.accessibilityState).toEqual({
      selected: false,
    });
    fireEvent.press(getByLabelText('Energy 2'));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('shows the heading and the low and high labels', () => {
    const { getByText } = renderSelector(null);
    expect(getByText('Energy')).toBeTruthy();
    expect(getByText('Drained')).toBeTruthy();
    expect(getByText('Energized')).toBeTruthy();
  });
});
