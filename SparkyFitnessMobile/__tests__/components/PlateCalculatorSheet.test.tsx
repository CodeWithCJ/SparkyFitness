import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import {
  nextLoadableWeight,
  plateCalcInputFor,
  presetInventory,
  suggestBar,
  type PlateInventoryConfig,
} from '@workspace/shared';
import { formatPlateWeight } from '../../src/utils/plateFormat';
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
  it('asks for a weight when the set has none', () => {
    renderSheet({ targetWeight: null });
    expect(screen.getByText('Enter a weight for the set first.')).toBeTruthy();
    expect(screen.queryByText(/per side/)).toBeNull();
  });

  it('is a bottom sheet with a Done pill that closes it, like the workout menu', () => {
    const onClose = jest.fn();
    renderSheet({ onClose });
    expect(screen.getByText('Plate calculator')).toBeTruthy();
    expect(screen.getByTestId('focus-sheet')).toBeTruthy();
    expect(screen.getByTestId('plate-calculator-drawing')).toBeTruthy();
    fireEvent.press(screen.getByText('Done'));
    fireEvent.press(screen.getByTestId('focus-sheet-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('offers Use only when the caller can write the weight', () => {
    renderSheet();
    expect(screen.queryByTestId('plate-use-weight')).toBeNull();
  });

  describe('appearance', () => {
    it('shows the target, the plates per side and the inventory link', () => {
      renderSheet({
        targetWeight: 100,
        exerciseName: 'Bench Press',
        setNumber: 2,
      });
      expect(screen.getByText('100 kg')).toBeTruthy();
      expect(
        screen.getByText('Target weight · Bench Press · set 2')
      ).toBeTruthy();
      expect(screen.getByText(/per side$/)).toBeTruthy();
      expect(screen.getByText('One side of the bar')).toBeTruthy();
      expect(screen.queryByText('Plates you own')).toBeNull();
      expect(screen.getByText('Edit plate inventory')).toBeTruthy();
    });

    it('names the nearest loadable weights when the target cannot be made', () => {
      mockInventory({
        ...presetInventory('kg'),
        plates: [{ weight: 20, pairs: 1 }],
      });
      renderSheet({ targetWeight: 70 });
      expect(screen.getByText("When the weight can't be made")).toBeTruthy();
      expect(screen.getByText(/Nearest below: 60 kg/)).toBeTruthy();
    });

    it('summarises the load in kg under the drawing', () => {
      renderSheet({ targetWeight: 82.5 });
      expect(
        screen.getByText('25 + 5 + 1.25 · 31.25 kg per side')
      ).toBeTruthy();
      expect(
        screen.getByText(/20 kg bar \+ 62\.5 kg of plates\./)
      ).toBeTruthy();
      expect(screen.getByText('82.5 kg')).toBeTruthy();
      expect(screen.getByLabelText('Per side: 25, 5, 1.25 kg')).toBeTruthy();
    });

    it('summarises the load in lb, never writing lbs', () => {
      mockInventory({
        ...presetInventory('lbs'),
        plates: [
          { weight: 45, pairs: 2 },
          { weight: 10, pairs: 2 },
        ],
      });
      renderSheet({ targetWeight: 225, weightUnit: 'lbs' });
      expect(screen.getByText('45 + 45 · 90 lb per side')).toBeTruthy();
      expect(screen.getByText(/45 lb bar \+ 180 lb of plates\./)).toBeTruthy();
      expect(screen.getByText('225 lb')).toBeTruthy();
      expect(screen.getByLabelText('Per side: 45, 45 lb')).toBeTruthy();
    });

    it('switches bars from the chips under the drawing', () => {
      renderSheet({ targetWeight: 82.5 });
      expect(screen.getByText('Barbell 20 kg')).toBeTruthy();
      fireEvent.press(screen.getByText("Women's bar 15 kg"));
      expect(
        screen.getByText(/15 kg bar \+ 67\.5 kg of plates\./)
      ).toBeTruthy();
      fireEvent.press(screen.getByText('Trap bar 25 kg'));
      expect(
        screen.getByText(/25 kg bar \+ 57\.5 kg of plates\./)
      ).toBeTruthy();
    });

    it('shows no bar chips when there is only one bar', () => {
      const inventory = presetInventory('kg');
      mockInventory({ ...inventory, bars: inventory.bars.slice(0, 1) });
      renderSheet({ targetWeight: 82.5 });
      expect(screen.queryByRole('radiogroup')).toBeNull();
    });

    describe('stepping the target and using it', () => {
      it('steps to the next loadable weights and offers to use the result', () => {
        const onUseWeight = jest.fn();
        renderSheet({ targetWeight: 82.5, onUseWeight });
        expect(screen.getByText('82 kg')).toBeTruthy();
        expect(screen.getByText('83.5 kg')).toBeTruthy();
        // Use is there for the set's own weight too.
        expect(screen.getByText('Use 82.5 kg')).toBeTruthy();

        fireEvent.press(screen.getByLabelText('Next weight'));
        expect(screen.getByTestId('plate-target-weight')).toHaveTextContent(
          '83.5 kg'
        );
        expect(
          screen.getByText(/20 kg bar \+ 63\.5 kg of plates\./)
        ).toBeTruthy();
        fireEvent.press(screen.getByText('Use 83.5 kg'));
        expect(onUseWeight).toHaveBeenCalledWith(83.5);

        fireEvent.press(screen.getByLabelText('Previous weight'));
        fireEvent.press(screen.getByLabelText('Previous weight'));
        expect(screen.getByTestId('plate-target-weight')).toHaveTextContent(
          '82 kg'
        );
      });

      it('shows the set weight as the target with its neighbouring loadable weights', () => {
        renderSheet({ targetWeight: 85 });
        expect(screen.getByTestId('plate-target-weight')).toHaveTextContent(
          '85 kg'
        );
        const input = plateCalcInputFor(
          presetInventory('kg'),
          suggestBar(['barbell'], presetInventory('kg').bars)!,
          85,
          'kg'
        );
        const lighter = nextLoadableWeight(input, 'down');
        const heavier = nextLoadableWeight(input, 'up');
        expect(
          screen.getByText(`${formatPlateWeight(lighter!)} kg`)
        ).toBeTruthy();
        expect(
          screen.getByText(`${formatPlateWeight(heavier!)} kg`)
        ).toBeTruthy();
      });

      it('moves the target with the nearby weight buttons', () => {
        const onUseWeight = jest.fn();
        renderSheet({ targetWeight: 82.5, onUseWeight });
        fireEvent.press(screen.getByText('82 kg'));
        expect(screen.getByTestId('plate-target-weight')).toHaveTextContent(
          '82 kg'
        );
        fireEvent.press(screen.getByText('Use 82 kg'));
        expect(onUseWeight).toHaveBeenCalledWith(82);
      });

      it('stops at the bar and at the heaviest load', () => {
        mockInventory({
          ...presetInventory('kg'),
          plates: [{ weight: 20, pairs: 1 }],
        });
        renderSheet({ targetWeight: 20 });
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
          targetWeight: 225,
          weightUnit: 'lbs',
          onUseWeight,
        });
        expect(screen.getByText('175 lb')).toBeTruthy();
        expect(screen.getByText('245 lb')).toBeTruthy();
        fireEvent.press(screen.getByLabelText('Next weight'));
        fireEvent.press(screen.getByText('Use 245 lb'));
        expect(onUseWeight).toHaveBeenCalledWith(245);
      });

      it('shows nearest below and above, not nearby weights, for a weight that cannot be made', () => {
        mockInventory({
          ...presetInventory('kg'),
          plates: [{ weight: 20, pairs: 1 }],
        });
        renderSheet({ targetWeight: 70 });
        expect(screen.queryByText('Nearby weights you can load')).toBeNull();
        expect(screen.getByText("When the weight can't be made")).toBeTruthy();
      });
    });
  });
});
