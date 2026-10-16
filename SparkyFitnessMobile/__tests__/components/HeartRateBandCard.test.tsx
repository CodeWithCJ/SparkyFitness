import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import HeartRateBandCard from '../../src/components/recording/HeartRateBandCard';

const setup = (
  props: Partial<React.ComponentProps<typeof HeartRateBandCard>> = {}
) => {
  const onBandChange = jest.fn();
  const utils = render(
    <HeartRateBandCard
      enabled
      onEnabledChange={jest.fn()}
      band={{ minBpm: 140, maxBpm: 160 }}
      onBandChange={onBandChange}
      {...props}
    />
  );
  return { ...utils, onBandChange };
};

test('shows the range and moves an edge by five bpm', () => {
  const { getByTestId, onBandChange } = setup();
  expect(getByTestId('hr-min-value').props.children).toContain('140');
  fireEvent.press(getByTestId('hr-min-down'));
  expect(onBandChange).toHaveBeenCalledWith({ minBpm: 135, maxBpm: 160 });
  fireEvent.press(getByTestId('hr-max-up'));
  expect(onBandChange).toHaveBeenLastCalledWith({ minBpm: 140, maxBpm: 165 });
});

test('will not squeeze the range narrower than ten bpm', () => {
  const { getByTestId, onBandChange } = setup({
    band: { minBpm: 140, maxBpm: 149 },
  });
  fireEvent.press(getByTestId('hr-min-up'));
  expect(onBandChange).not.toHaveBeenCalled();
});

test('hides the range while the alert is off', () => {
  const { queryByTestId } = setup({ enabled: false });
  expect(queryByTestId('hr-min-value')).toBeNull();
});
