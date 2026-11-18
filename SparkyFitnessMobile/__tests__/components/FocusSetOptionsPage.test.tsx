import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import FocusSetOptionsPage from '../../src/components/FocusSetOptionsPage';

function setup(
  overrides: Partial<Parameters<typeof FocusSetOptionsPage>[0]> = {}
) {
  const props = {
    visible: true,
    setId: '5',
    setNumber: 2,
    exerciseName: 'Bench Press',
    currentType: 'normal',
    note: null,
    metricColumn: 'rpe' as const,
    clampedToRpe: false,
    onSelectType: jest.fn(),
    onSelectMetric: jest.fn(),
    onCommitField: jest.fn(),
    onGenerateDropSets: jest.fn(),
    onOpenPlateCalculator: jest.fn(),
    onDelete: jest.fn(),
    onClose: jest.fn(),
    ...overrides,
  };
  return { ...render(<FocusSetOptionsPage {...props} />), props };
}

describe('FocusSetOptionsPage', () => {
  it('names the set and offers every set action', () => {
    const { getByText, props } = setup();
    expect(getByText('Set 2 · Bench Press')).toBeTruthy();
    fireEvent.press(getByText('Warm-up'));
    expect(props.onSelectType).toHaveBeenCalledWith('warmup');
    fireEvent.press(getByText('Plate calculator'));
    expect(props.onOpenPlateCalculator).toHaveBeenCalled();
    fireEvent.press(getByText(/Add 3 drop sets/));
    expect(props.onGenerateDropSets).toHaveBeenCalled();
    fireEvent.press(getByText('Delete set'));
    expect(props.onDelete).toHaveBeenCalled();
  });

  it('hides the plate calculator and drop sets when they do not apply', () => {
    const { queryByText } = setup({
      onGenerateDropSets: undefined,
      onOpenPlateCalculator: undefined,
    });
    expect(queryByText('Plate calculator')).toBeNull();
    expect(queryByText(/Add 3 drop sets/)).toBeNull();
  });

  it('switches the metric column, hiding weight metrics for timed sets', () => {
    const { getByText, queryByText, props, rerender } = setup();
    fireEvent.press(getByText('RIR'));
    expect(props.onSelectMetric).toHaveBeenCalledWith('rir');
    fireEvent.press(getByText('1RM'));
    expect(props.onSelectMetric).toHaveBeenCalledWith('e1rm');
    rerender(<FocusSetOptionsPage {...props} clampedToRpe />);
    expect(queryByText('1RM')).toBeNull();
  });

  it('saves a typed set note on blur', () => {
    const { getByPlaceholderText, props } = setup();
    const field = getByPlaceholderText('Add a note for this set…');
    fireEvent.changeText(field, '  Felt easy ');
    fireEvent(field, 'blur');
    expect(props.onCommitField).toHaveBeenCalledWith('5', {
      notes: 'Felt easy',
    });
  });
});
