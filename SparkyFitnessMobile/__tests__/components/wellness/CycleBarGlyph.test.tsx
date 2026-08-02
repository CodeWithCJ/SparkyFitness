import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import CycleBarGlyph from '../../../src/components/wellness/CycleBarGlyph';

const trackWidth = (screen: ReturnType<typeof render>) =>
  StyleSheet.flatten(screen.getByTestId('cycle-bar-track').props.style).width;

const periodWidth = (screen: ReturnType<typeof render>) =>
  StyleSheet.flatten(screen.getByTestId('cycle-bar-period').props.style).width;

describe('CycleBarGlyph', () => {
  it('scales the track against the longest cycle in the list', () => {
    const screen = render(<CycleBarGlyph cycleLength={15} periodLength={5} maxLength={30} />);
    expect(trackWidth(screen)).toBe('50%');
  });

  it('renders the longest cycle at full width', () => {
    const screen = render(<CycleBarGlyph cycleLength={30} periodLength={5} maxLength={30} />);
    expect(trackWidth(screen)).toBe('100%');
  });

  it('sizes the period segment relative to its own cycle, not the max', () => {
    const screen = render(<CycleBarGlyph cycleLength={20} periodLength={5} maxLength={40} />);
    expect(periodWidth(screen)).toBe('25%');
  });

  it('never exceeds full width when maxLength is smaller than the cycle', () => {
    const screen = render(<CycleBarGlyph cycleLength={30} periodLength={5} maxLength={0} />);
    expect(trackWidth(screen)).toBe('100%');
  });
});
