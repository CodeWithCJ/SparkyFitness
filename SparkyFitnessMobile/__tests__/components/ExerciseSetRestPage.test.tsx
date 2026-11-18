import React, { createRef } from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import ExerciseSetRestSheet, {
  type ExerciseSetRestSheetRef,
} from '../../src/components/ExerciseSetRestSheet';

function setup() {
  const ref = createRef<ExerciseSetRestSheetRef>();
  const onApply = jest.fn();
  const utils = render(
    <ExerciseSetRestSheet ref={ref} appearance="page" onApply={onApply} />
  );
  act(() =>
    ref.current?.present('Bench Press', [
      { setId: 's1', setNumber: 1, restSec: 90 },
      { setId: 's2', setNumber: 2, restSec: 90 },
      { setId: 's3', setNumber: 3, restSec: 120 },
    ])
  );
  return { ...utils, onApply };
}

describe('ExerciseSetRestSheet page appearance', () => {
  it('lists All sets and each set with its rest', () => {
    const { getByText } = setup();
    expect(getByText('Rest period')).toBeTruthy();
    expect(getByText('All sets')).toBeTruthy();
    expect(getByText('Set 3')).toBeTruthy();
    expect(getByText('2:00')).toBeTruthy();
  });

  it('steps the selected set by 15 s and applies only changes on Done', () => {
    const { getByTestId, getByLabelText, getByText, onApply } = setup();
    fireEvent.press(getByTestId('rest-row-s1'));
    fireEvent.press(getByLabelText('Add 15 seconds'));
    fireEvent.press(getByText('Done'));
    expect(onApply).toHaveBeenCalledWith([{ setId: 's1', seconds: 105 }]);
  });

  it('turns the selected set off', () => {
    const { getByTestId, getByText, onApply } = setup();
    fireEvent.press(getByTestId('rest-row-s3'));
    fireEvent.press(getByText('Off'));
    fireEvent.press(getByText('Done'));
    expect(onApply).toHaveBeenCalledWith([{ setId: 's3', seconds: 0 }]);
  });
});
