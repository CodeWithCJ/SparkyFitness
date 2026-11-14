import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { presetInventory, type PlateInventoryConfig } from '@workspace/shared';
import PlateCalculatorSheet from '../../src/components/PlateCalculatorSheet';
import { usePlateInventory } from '../../src/hooks/usePlateInventory';
import { initializeI18n } from '../../src/localization/i18n';

jest.mock('../../src/hooks/usePlateInventory', () => ({
  usePlateInventory: jest.fn(),
}));

const mockInventory = (inventory: PlateInventoryConfig) =>
  jest.mocked(usePlateInventory).mockReturnValue({
    inventory,
    hasSaved: true,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof usePlateInventory>);

const renderSheet = (
  props: Partial<React.ComponentProps<typeof PlateCalculatorSheet>> = {}
) =>
  render(
    <PlateCalculatorSheet
      visible
      onClose={jest.fn()}
      targetWeight={100}
      weightUnit="kg"
      equipment={['barbell']}
      {...props}
    />
  );

beforeAll(async () => {
  await initializeI18n('en');
});
beforeEach(() => {
  mockInventory(presetInventory('kg'));
});

describe('PlateCalculatorSheet', () => {
  it('shows the plates for each side of the bar', () => {
    renderSheet();
    expect(screen.getByText('Target weight: 100 kg')).toBeTruthy();
    expect(screen.getByLabelText('40 kg per side on a 20 kg bar')).toBeTruthy();
    expect(screen.getByText('40 kg per side · 100 kg total')).toBeTruthy();
  });

  it('names the nearest loadable weights instead of rounding', () => {
    mockInventory({
      ...presetInventory('kg'),
      plates: [{ weight: 20, pairs: 1 }],
    });
    renderSheet({ targetWeight: 70 });
    expect(
      screen.getByText('Your plates cannot make exactly 70 kg.')
    ).toBeTruthy();
    expect(screen.getByText(/Nearest below: 60 kg/)).toBeTruthy();
    expect(screen.getByText(/10 kg short of the target/)).toBeTruthy();
    expect(
      screen.getByText('The target is heavier than your plates can load.')
    ).toBeTruthy();
  });

  it('switches bars', () => {
    renderSheet({ targetWeight: 95 });
    // 20 kg bar: 37.5 per side. Women's 15 kg bar: 40 per side.
    expect(
      screen.getByLabelText('37.5 kg per side on a 20 kg bar')
    ).toBeTruthy();
    fireEvent.press(screen.getByText(/Women's bar/));
    expect(screen.getByLabelText('40 kg per side on a 15 kg bar')).toBeTruthy();
  });

  it('asks for a weight when the set has none', () => {
    renderSheet({ targetWeight: null });
    expect(screen.getByText('Enter a weight for the set first.')).toBeTruthy();
    expect(screen.queryByText(/per side/)).toBeNull();
  });

  it('works in pounds', () => {
    mockInventory(presetInventory('lbs'));
    renderSheet({ targetWeight: 225, weightUnit: 'lbs' });
    expect(
      screen.getByLabelText('90 lbs per side on a 45 lbs bar')
    ).toBeTruthy();
  });

  it('lists the plates and bars that are owned', () => {
    renderSheet();
    expect(screen.getByText('Plates (kg)')).toBeTruthy();
    expect(screen.getByText('Bar (kg)')).toBeTruthy();
    expect(screen.getByText('Manage')).toBeTruthy();
    expect(screen.getByText(/Barbell \(20 kg\)/)).toBeTruthy();
  });

  it('closes from the backdrop', () => {
    const onClose = jest.fn();
    renderSheet({ onClose });
    fireEvent.press(screen.getByLabelText('Close plate calculator'));
    expect(onClose).toHaveBeenCalled();
  });

  describe('page appearance', () => {
    it('shows the target, the plates per side and the plates you own', () => {
      renderSheet({
        page: true,
        targetWeight: 100,
        exerciseName: 'Bench Press',
        setNumber: 2,
      });
      expect(screen.getByText('100 kg')).toBeTruthy();
      expect(
        screen.getByText('Target weight · Bench Press · set 2')
      ).toBeTruthy();
      expect(screen.getByText(/per side$/)).toBeTruthy();
      expect(screen.getByText('Plates you own')).toBeTruthy();
      expect(screen.getByText('Edit plate inventory')).toBeTruthy();
    });

    it('names the nearest loadable weights when the target cannot be made', () => {
      mockInventory({
        ...presetInventory('kg'),
        plates: [{ weight: 20, pairs: 1 }],
      });
      renderSheet({ page: true, targetWeight: 70 });
      expect(screen.getByText("When the weight can't be made")).toBeTruthy();
      expect(screen.getByText(/Nearest below: 60 kg/)).toBeTruthy();
    });

    it('summarises the load in kg under the drawing', () => {
      renderSheet({ page: true, targetWeight: 82.5 });
      expect(screen.getByText('25 + 5 + 1.25 per side')).toBeTruthy();
      expect(screen.getByText('bar 20 kg · 62.5 kg of plates')).toBeTruthy();
      expect(screen.getByText('82.5 kg')).toBeTruthy();
      expect(screen.getByLabelText('Per side: 25, 5, 1.25 kg')).toBeTruthy();
      expect(screen.getByText('others grey')).toBeTruthy();
    });

    it('summarises the load in lb, never writing lbs', () => {
      mockInventory({
        ...presetInventory('lbs'),
        plates: [
          { weight: 45, pairs: 2 },
          { weight: 10, pairs: 2 },
        ],
      });
      renderSheet({ page: true, targetWeight: 225, weightUnit: 'lbs' });
      expect(screen.getByText('45 + 45 per side')).toBeTruthy();
      expect(screen.getByText('bar 45 lb · 180 lb of plates')).toBeTruthy();
      expect(screen.getByText('225 lb')).toBeTruthy();
      expect(screen.getByLabelText('Per side: 45, 45 lb')).toBeTruthy();
      expect(screen.getByText('45 · 10 lb')).toBeTruthy();
    });

    it('switches bars from the segmented control and from More bars', () => {
      renderSheet({ page: true, targetWeight: 82.5 });
      expect(screen.getByText('Barbell 20 kg')).toBeTruthy();
      fireEvent.press(screen.getByText("Women's bar 15 kg"));
      expect(screen.getByText('bar 15 kg · 67.5 kg of plates')).toBeTruthy();
      fireEvent.press(screen.getByLabelText('More bars'));
      fireEvent.press(screen.getByText('Trap bar 25 kg'));
      expect(screen.getByText('bar 25 kg · 57.5 kg of plates')).toBeTruthy();
    });

    describe('stepping the target and using it', () => {
      it('steps to the next loadable weights and offers to use the result', () => {
        const onUseWeight = jest.fn();
        renderSheet({ page: true, targetWeight: 82.5, onUseWeight });
        expect(screen.getByText('− 82 kg · + 83.5 kg')).toBeTruthy();
        expect(screen.queryByTestId('plate-use-weight')).toBeNull();
        expect(screen.getByText('Done')).toBeTruthy();

        fireEvent.press(screen.getByLabelText('Next weight'));
        expect(screen.getByTestId('plate-target-weight')).toHaveTextContent(
          '83.5 kg'
        );
        expect(screen.getByText('bar 20 kg · 63.5 kg of plates')).toBeTruthy();
        fireEvent.press(screen.getByText('Use 83.5 kg'));
        expect(onUseWeight).toHaveBeenCalledWith(83.5);

        fireEvent.press(screen.getByLabelText('Previous weight'));
        fireEvent.press(screen.getByLabelText('Previous weight'));
        expect(screen.getByTestId('plate-target-weight')).toHaveTextContent(
          '82 kg'
        );
      });

      it('goes back to Done when stepped back to the set weight', () => {
        renderSheet({ page: true, targetWeight: 82.5, onUseWeight: jest.fn() });
        fireEvent.press(screen.getByLabelText('Next weight'));
        fireEvent.press(screen.getByLabelText('Previous weight'));
        expect(screen.queryByTestId('plate-use-weight')).toBeNull();
      });

      it('stops at the bar and at the heaviest load', () => {
        mockInventory({
          ...presetInventory('kg'),
          plates: [{ weight: 20, pairs: 1 }],
        });
        renderSheet({ page: true, targetWeight: 20 });
        expect(
          screen.getByLabelText('Previous weight').props.accessibilityState
            .disabled
        ).toBe(true);
        fireEvent.press(screen.getByLabelText('Next weight'));
        expect(screen.getByTestId('plate-target-weight')).toHaveTextContent(
          '60 kg'
        );
        expect(
          screen.getByLabelText('Next weight').props.accessibilityState.disabled
        ).toBe(true);
      });

      it('steps in lb', () => {
        mockInventory({
          ...presetInventory('lbs'),
          plates: [
            { weight: 45, pairs: 2 },
            { weight: 10, pairs: 2 },
          ],
        });
        const onUseWeight = jest.fn();
        renderSheet({
          page: true,
          targetWeight: 225,
          weightUnit: 'lbs',
          onUseWeight,
        });
        expect(screen.getByText('− 175 lb · + 245 lb')).toBeTruthy();
        fireEvent.press(screen.getByLabelText('Next weight'));
        fireEvent.press(screen.getByText('Use 245 lb'));
        expect(onUseWeight).toHaveBeenCalledWith(245);
      });

      it('shows nearest below and above, not nearby weights, for a weight that cannot be made', () => {
        mockInventory({
          ...presetInventory('kg'),
          plates: [{ weight: 20, pairs: 1 }],
        });
        renderSheet({ page: true, targetWeight: 70 });
        expect(screen.queryByText('Nearby weights you can load')).toBeNull();
        expect(screen.getByText("When the weight can't be made")).toBeTruthy();
      });
    });
  });
});
