import React from 'react';
import { fireEvent, render, within } from '@testing-library/react-native';
import FocusSetOptionsPage from '../../src/components/FocusSetOptionsPage';

function setup(
  overrides: Partial<Parameters<typeof FocusSetOptionsPage>[0]> = {}
) {
  const props = {
    visible: true,
    setId: '5',
    setNumber: 2,
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
    expect(getByText('Set 2 options')).toBeTruthy();
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
    const { getByText, getByTestId, queryByText, props, rerender } = setup();
    expect(queryByText('RIR')).toBeNull();
    fireEvent.press(getByTestId('focus-set-options-metric'));
    fireEvent.press(getByText('RIR'));
    expect(props.onSelectMetric).toHaveBeenCalledWith('rir');
    fireEvent.press(getByText('1RM'));
    expect(props.onSelectMetric).toHaveBeenCalledWith('e1rm');
    rerender(<FocusSetOptionsPage {...props} clampedToRpe />);
    expect(queryByText('1RM')).toBeNull();
  });

  it('marks the current set type and closes from Done', () => {
    const { getByTestId, props } = setup({ currentType: 'drop' });
    expect(
      getByTestId('focus-set-options-type-drop').props.accessibilityState
    ).toEqual({ selected: true });
    expect(
      getByTestId('focus-set-options-type-normal').props.accessibilityState
    ).toEqual({ selected: false });
    fireEvent.press(getByTestId('focus-set-options-done'));
    expect(props.onClose).toHaveBeenCalled();
  });

  it('saves a typed set note on blur', () => {
    const { getByPlaceholderText, getByTestId, queryByPlaceholderText, props } =
      setup();
    expect(queryByPlaceholderText('Add a note for this set…')).toBeNull();
    fireEvent.press(getByTestId('focus-set-options-notes'));
    const field = getByPlaceholderText('Add a note for this set…');
    fireEvent.changeText(field, '  Felt easy ');
    fireEvent(field, 'blur');
    expect(props.onCommitField).toHaveBeenCalledWith('5', {
      notes: 'Felt easy',
    });
  });
});

describe('FocusSetOptionsPage set types', () => {
  it('explains each set type from the type card', () => {
    const { getByText, getByTestId, queryByText } = render(
      <FocusSetOptionsPage
        visible
        setId="5"
        setNumber={2}
        currentType="normal"
        note={null}
        metricColumn="rpe"
        clampedToRpe={false}
        onSelectType={jest.fn()}
        onSelectMetric={jest.fn()}
        onCommitField={jest.fn()}
        onDelete={jest.fn()}
        onClose={jest.fn()}
      />
    );
    expect(queryByText(/Only normal sets are numbered/)).toBeNull();
    fireEvent.press(getByTestId('focus-set-options-types'));
    expect(getByText(/Only normal sets are numbered/)).toBeTruthy();
    expect(getByText(/lighter set right after a working set/)).toBeTruthy();
    expect(getByText('In the table')).toBeTruthy();
    expect(getByTestId('focus-set-types-example')).toBeTruthy();
    expect(
      within(getByTestId('focus-set-types-example')).getByText('kg')
    ).toBeTruthy();
    fireEvent.press(getByTestId('focus-set-types-done'));
    expect(queryByText(/Only normal sets are numbered/)).toBeNull();
  });
});
