import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import ExerciseHeartRateChip from '../../src/components/ExerciseHeartRateChip';

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name, color }: { name: string; color: string }) => (
      <View testID={`icon-${name}`} accessibilityHint={color} />
    ),
  };
});

describe('ExerciseHeartRateChip', () => {
  it('shows the reading with bpm and its label', () => {
    const { getByLabelText, getByText } = render(
      <ExerciseHeartRateChip
        text="141"
        color="#ef4444"
        accessibilityLabel="Current heart rate for Bench Press"
      />
    );
    expect(getByLabelText('Current heart rate for Bench Press')).toBeTruthy();
    expect(getByText('141 bpm')).toBeTruthy();
  });

  it('colors the icon, and the number only when asked to', () => {
    const plain = render(
      <ExerciseHeartRateChip
        text="141"
        color="#111111"
        accessibilityLabel="x"
      />
    );
    expect(plain.getByTestId('icon-heart-rate').props.accessibilityHint).toBe(
      '#111111'
    );
    expect(
      StyleSheet.flatten(plain.getByText('141 bpm').props.style).color
    ).toBeUndefined();
    plain.unmount();

    const zoned = render(
      <ExerciseHeartRateChip
        text="141"
        color="#22c55e"
        valueColor="#22c55e"
        accessibilityLabel="x"
      />
    );
    expect(zoned.getByTestId('icon-heart-rate').props.accessibilityHint).toBe(
      '#22c55e'
    );
    expect(
      StyleSheet.flatten(zoned.getByText('141 bpm').props.style).color
    ).toBe('#22c55e');
  });
});
