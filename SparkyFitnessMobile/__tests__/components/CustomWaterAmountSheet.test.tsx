import { createRef } from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import CustomWaterAmountSheet, {
  type CustomWaterAmountSheetRef,
} from '../../src/components/CustomWaterAmountSheet';

describe('CustomWaterAmountSheet', () => {
  it('converts a typed amount to ml for the display unit before submitting', () => {
    const onSubmit = jest.fn();
    const ref = createRef<CustomWaterAmountSheetRef>();
    const { getByTestId, getByText } = render(
      <CustomWaterAmountSheet ref={ref} unit="ml" onSubmit={onSubmit} />
    );

    act(() => {
      ref.current?.present();
    });

    fireEvent.changeText(getByTestId('custom-water-amount-input'), '500');
    fireEvent.press(getByText('Log'));

    expect(onSubmit).toHaveBeenCalledWith(500);
  });

  it('converts from a non-ml display unit (oz) before submitting', () => {
    const onSubmit = jest.fn();
    const ref = createRef<CustomWaterAmountSheetRef>();
    const { getByTestId, getByText } = render(
      <CustomWaterAmountSheet ref={ref} unit="oz" onSubmit={onSubmit} />
    );

    act(() => {
      ref.current?.present();
    });

    fireEvent.changeText(getByTestId('custom-water-amount-input'), '10');
    fireEvent.press(getByText('Log'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toBeCloseTo(295.735, 2);
  });

  it('shows the unit label matching the unit prop', () => {
    const { getByText } = render(
      <CustomWaterAmountSheet unit="liter" onSubmit={jest.fn()} />
    );

    expect(getByText('L')).toBeTruthy();
  });

  it('disables the Log button while the amount is zero', () => {
    const onSubmit = jest.fn();
    const { getByText } = render(
      <CustomWaterAmountSheet unit="ml" onSubmit={onSubmit} />
    );

    fireEvent.press(getByText('Log'));

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
