import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import * as Reanimated from 'react-native-reanimated';
import { AnimatedStripBox } from '../../src/components/AnimatedStripBox';

describe('AnimatedStripBox', () => {
  let withTiming: jest.SpyInstance;

  beforeEach(() => {
    withTiming = jest
      .spyOn(Reanimated, 'withTiming')
      .mockImplementation(((toValue: number) => toValue) as never);
  });

  afterEach(() => withTiming.mockRestore());

  it('places the box at the given top without animating on first render', () => {
    const { getByTestId } = render(
      <AnimatedStripBox top={98} layoutKey="466x951:true" testID="box" />
    );
    expect(StyleSheet.flatten(getByTestId('box').props.style).top).toBe(98);
    expect(withTiming).not.toHaveBeenCalled();
  });

  it('slides to a new top in the same layout', () => {
    const { rerender } = render(
      <AnimatedStripBox top={54} layoutKey="951x669:true" testID="box" />
    );
    rerender(
      <AnimatedStripBox top={155} layoutKey="951x669:true" testID="box" />
    );
    expect(withTiming).toHaveBeenCalledTimes(1);
    expect(withTiming).toHaveBeenCalledWith(155, expect.any(Object));
  });

  it('does not slide when the layout changes', () => {
    const { rerender } = render(
      <AnimatedStripBox top={155} layoutKey="951x669:true" testID="box" />
    );
    rerender(
      <AnimatedStripBox top={98} layoutKey="466x951:true" testID="box" />
    );
    expect(withTiming).not.toHaveBeenCalled();
  });

  it('does not slide when the first measurement replaces the guess', () => {
    const { rerender } = render(
      <AnimatedStripBox top={54} layoutKey="951x669:false" testID="box" />
    );
    rerender(
      <AnimatedStripBox top={155} layoutKey="951x669:true" testID="box" />
    );
    expect(withTiming).not.toHaveBeenCalled();
  });
});
