import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { presetInventory } from '@workspace/shared';
import FocusPlateStrip from '../../src/components/FocusPlateStrip';
import { usePlateInventory } from '../../src/hooks/usePlateInventory';
import { initializeI18n } from '../../src/localization/i18n';

jest.mock('../../src/hooks/usePlateInventory', () => ({
  usePlateInventory: jest.fn(),
}));

beforeAll(async () => {
  await initializeI18n('en');
});
beforeEach(() => {
  jest.mocked(usePlateInventory).mockReturnValue({
    inventory: presetInventory('kg'),
    hasSaved: false,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof usePlateInventory>);
});

describe('FocusPlateStrip', () => {
  it('names the plates for one side and the bar, and opens the calculator', () => {
    const onOpenCalculator = jest.fn();
    render(
      <FocusPlateStrip
        targetWeight={100}
        weightUnit="kg"
        equipment={['barbell']}
        onOpenCalculator={onOpenCalculator}
      />
    );
    expect(screen.getByTestId('focus-plate-strip')).toBeTruthy();
    expect(screen.getByText('25 + 15')).toBeTruthy();
    expect(screen.getByText(/on a 20 kg bar/)).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Plate calculator'));
    expect(onOpenCalculator).toHaveBeenCalledTimes(1);
  });

  it('says so when the plates cannot make the weight, never rounding', () => {
    render(
      <FocusPlateStrip
        targetWeight={100.1}
        weightUnit="kg"
        equipment={['barbell']}
        onOpenCalculator={jest.fn()}
      />
    );
    expect(screen.getByText(/^Plates: nearest/)).toBeTruthy();
  });

  it('renders nothing without a bar or a weight', () => {
    render(
      <FocusPlateStrip
        targetWeight={null}
        weightUnit="kg"
        equipment={['barbell']}
        onOpenCalculator={jest.fn()}
      />
    );
    expect(screen.queryByTestId('focus-plate-strip')).toBeNull();
  });

  it('draws the shared bar drawing and writes lb for the lb scale', () => {
    jest.mocked(usePlateInventory).mockReturnValue({
      inventory: presetInventory('lbs'),
      hasSaved: false,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as unknown as ReturnType<typeof usePlateInventory>);
    render(
      <FocusPlateStrip
        targetWeight={225}
        weightUnit="lbs"
        equipment={['barbell']}
        onOpenCalculator={jest.fn()}
      />
    );
    expect(screen.getByLabelText('Per side: 45, 45 lb')).toBeTruthy();
    expect(screen.getByText('45 + 45')).toBeTruthy();
    expect(screen.getByText(/on a 45 lb bar/)).toBeTruthy();
  });
});
