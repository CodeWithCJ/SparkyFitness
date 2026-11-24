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
        getImageSource={() => null}
        onSelect={jest.fn()}
      />
    );
    fireEvent(UNSAFE_getByType(ScrollView), 'layout', {
      nativeEvent: { layout: { width: 360, height: 60, x: 0, y: 0 } },
    });
    // 16 padding + 5 tiles of 72 + 5 gaps of 10, plus half a tile, minus half the viewport.
    expect(scrollTo).toHaveBeenLastCalledWith({
      x: 16 + 5 * 82 + 36 - 180,
      animated: false,
    });
    scrollTo.mockRestore();
  });

  it('rings the shown tile, badges the active one and ticks a finished one', () => {
    const { getByTestId, queryByTestId, getByText } = render(
      <ActiveWorkoutFocusChips
        exercises={exercises}
        completedSetIds={{ '1': true }}
        selectedId="e0"
        activeId="e0"
        supersetBorders={new Map()}
        getImageSource={() => null}
        onSelect={jest.fn()}
        onAdd={jest.fn()}
      />
    );
    const ring = (id: string) =>
      StyleSheet.flatten(getByTestId(`focus-chip-ring-${id}`).props.style);
    expect(ring('e0').borderColor).not.toBe('transparent');
    expect(ring('e2').borderColor).toBe('transparent');
    expect(getByTestId('focus-chip-play-e0')).toBeTruthy();
    expect(getByTestId('focus-chip-done-e1')).toBeTruthy();
    expect(queryByTestId('focus-chip-play-e2')).toBeNull();
    // The name sits below the picture, and the strip ends with Add.
    expect(getByText('Exercise 2')).toBeTruthy();
    expect(getByTestId('focus-chip-add')).toBeTruthy();
  });

  it('rings a tile other than the active one in the text colour', () => {
    const { getByTestId } = render(
      <ActiveWorkoutFocusChips
        exercises={exercises}
        completedSetIds={{}}
        selectedId="e3"
        activeId="e0"
        supersetBorders={new Map()}
        getImageSource={() => null}
        onSelect={jest.fn()}
      />
    );
    const color = (id: string) =>
      StyleSheet.flatten(getByTestId(`focus-chip-ring-${id}`).props.style)
        .borderColor;
    expect(color('e3')).not.toBe('transparent');
    expect(color('e3')).not.toBe(color('e0'));
  });

  it('puts a superset on one bar behind its pictures and labels its members A1 and A2', () => {
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
        getImageSource={() => null}
        onSelect={jest.fn()}
      />
    );
    const group = getByTestId('focus-chip-group-e2');
    expect(
      StyleSheet.flatten(getByTestId('focus-chip-bar-e2').props.style)
        .backgroundColor
    ).toMatch(/^rgba\(199, ?146, ?234/);
    // Both members sit in the one group.
    expect(group).toContainElement(getByTestId('focus-chip-e2'));
    expect(group).toContainElement(getByTestId('focus-chip-e3'));
    expect(getByLabelText(/^Exercise 3 of 8.*superset A1$/)).toBeTruthy();
    expect(getByLabelText(/^Exercise 4 of 8.*superset A2$/)).toBeTruthy();
  });
});
