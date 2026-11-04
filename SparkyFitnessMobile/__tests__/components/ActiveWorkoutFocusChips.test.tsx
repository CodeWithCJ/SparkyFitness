import React from 'react';
import { ScrollView } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import ActiveWorkoutFocusChips from '../../src/components/ActiveWorkoutFocusChips';

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <View testID={`icon-${name}`} />,
  };
});

const exercises = Array.from({ length: 8 }, (_, i) => ({
  id: `e${i}`,
  exercise_snapshot: { name: `Exercise ${i}` },
  sets: [{ id: i }],
})) as never;

describe('ActiveWorkoutFocusChips', () => {
  it('centres the selected chip allowing for the row padding', () => {
    const scrollTo = jest
      .spyOn(ScrollView.prototype, 'scrollTo')
      .mockImplementation(() => {});
    const { UNSAFE_getByType } = render(
      <ActiveWorkoutFocusChips
        exercises={exercises}
        completedSetIds={{}}
        selectedId="e5"
        supersetBorders={new Map()}
        onSelect={jest.fn()}
      />
    );
    fireEvent(UNSAFE_getByType(ScrollView), 'layout', {
      nativeEvent: { layout: { width: 360, height: 60, x: 0, y: 0 } },
    });
    // 12 padding + 5 chips of 44 + 5 gaps of 8, plus half a chip, minus half the viewport.
    expect(scrollTo).toHaveBeenLastCalledWith({
      x: 12 + 5 * 52 + 22 - 180,
      animated: false,
    });
    scrollTo.mockRestore();
  });
});
