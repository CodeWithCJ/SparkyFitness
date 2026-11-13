import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
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
    // 16 padding + 5 chips of 44 + 5 gaps of 8, plus half a chip, minus half the viewport.
    expect(scrollTo).toHaveBeenLastCalledWith({
      x: 16 + 5 * 52 + 22 - 180,
      animated: false,
    });
    scrollTo.mockRestore();
  });

  it('fills the selected chip, outlines a finished one and tints the rest', () => {
    const { getByTestId } = render(
      <ActiveWorkoutFocusChips
        exercises={exercises}
        completedSetIds={{ '1': true }}
        selectedId="e0"
        supersetBorders={new Map()}
        onSelect={jest.fn()}
      />
    );
    const style = (id: string) =>
      StyleSheet.flatten(getByTestId(id).props.style);
    expect(style('focus-chip-e0').backgroundColor).toBeDefined();
    expect(style('focus-chip-e1').borderColor).not.toBe('transparent');
    expect(style('focus-chip-e2').borderColor).toBe('transparent');
    expect(style('focus-chip-e1').backgroundColor).not.toBe(
      style('focus-chip-e0').backgroundColor
    );
  });

  it('wraps a superset in one group shape and labels its members A1 and A2', () => {
    const borders = new Map([
      ['e2', { color: '#c792ea', isLast: false }],
      ['e3', { color: '#c792ea', isLast: true }],
    ]);
    const { getByTestId, getByLabelText } = render(
      <ActiveWorkoutFocusChips
        exercises={exercises}
        completedSetIds={{}}
        selectedId="e0"
        supersetBorders={borders}
        onSelect={jest.fn()}
      />
    );
    const group = getByTestId('focus-chip-group-e2');
    expect(StyleSheet.flatten(group.props.style).borderColor).toBe('#c792ea');
    // Both members sit in the one shape.
    expect(group).toContainElement(getByTestId('focus-chip-e2'));
    expect(group).toContainElement(getByTestId('focus-chip-e3'));
    expect(getByLabelText(/^Exercise 3 of 8.*superset A1$/)).toBeTruthy();
    expect(getByLabelText(/^Exercise 4 of 8.*superset A2$/)).toBeTruthy();
  });
});
