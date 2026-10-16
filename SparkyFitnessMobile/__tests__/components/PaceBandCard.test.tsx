import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import PaceBandCard from '../../src/components/recording/PaceBandCard';

const setup = (
  props: Partial<React.ComponentProps<typeof PaceBandCard>> = {}
) => {
  const onEnabledChange = jest.fn();
  const onBandChange = jest.fn();
  const utils = render(
    <PaceBandCard
      enabled
      onEnabledChange={onEnabledChange}
      band={{ fastest: 300, slowest: 330 }}
      onBandChange={onBandChange}
      unit="km"
      {...props}
    />
  );
  return { ...utils, onEnabledChange, onBandChange };
};

test('shows the range per unit and moves an edge by five seconds', () => {
  const { getByTestId, onBandChange } = setup();
  expect(getByTestId('pace-fastest-value').props.children).toContain('5:00');
  fireEvent.press(getByTestId('pace-fastest-down'));
  expect(onBandChange).toHaveBeenCalledWith({ fastest: 295, slowest: 330 });
  fireEvent.press(getByTestId('pace-slowest-up'));
  expect(onBandChange).toHaveBeenLastCalledWith({ fastest: 300, slowest: 335 });
});

test('will not squeeze the band narrower than the GPS can tell apart', () => {
  const { getByTestId, onBandChange } = setup({
    band: { fastest: 300, slowest: 316 },
  });
  fireEvent.press(getByTestId('pace-fastest-up'));
  expect(onBandChange).not.toHaveBeenCalled();
});

test('hides the range while the alert is off', () => {
  const { queryByTestId } = setup({ enabled: false });
  expect(queryByTestId('pace-fastest-value')).toBeNull();
});
