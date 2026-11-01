import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { presetInventory } from '@workspace/shared';
import PlateInventoryScreen from '../../src/screens/PlateInventoryScreen';
import {
  usePlateInventory,
  usePlateInventoryMutations,
} from '../../src/hooks/usePlateInventory';
import { initializeI18n } from '../../src/localization/i18n';
import type { RootStackScreenProps } from '../../src/types/navigation';

jest.mock('../../src/hooks/usePlateInventory', () => ({
  usePlateInventory: jest.fn(),
  usePlateInventoryMutations: jest.fn(),
}));
// Renders the header's primary action as a plain Save button.
jest.mock('../../src/hooks/useScreenHeader', () => {
  const { Pressable, Text } = require('react-native');
  return {
    useScreenHeader: (config: {
      right?: { label?: string; onPress: () => void; disabled?: boolean }[];
    }) => {
      const action = config.right?.[0];
      return action ? (
        <Pressable
          onPress={action.onPress}
          disabled={action.disabled}
          accessibilityRole="button"
        >
          <Text>{action.label}</Text>
        </Pressable>
      ) : null;
    },
  };
});
jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: () => false,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { default_weight_unit: 'kg' } }),
}));
jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
}));

const save = jest.fn();
const reset = jest.fn();

const renderScreen = (hasSaved = false) => {
  jest.mocked(usePlateInventory).mockReturnValue({
    inventory: presetInventory('kg'),
    hasSaved,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof usePlateInventory>);
  const goBack = jest.fn();
  render(
    <PlateInventoryScreen
      {...({
        navigation: { goBack },
        route: { params: undefined },
      } as unknown as RootStackScreenProps<'PlateInventory'>)}
    />
  );
  return { goBack };
};

beforeAll(async () => {
  await initializeI18n();
});
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(usePlateInventoryMutations).mockReturnValue({
    saveMutation: { mutate: save, isPending: false },
    resetMutation: { mutate: reset, isPending: false },
  } as unknown as ReturnType<typeof usePlateInventoryMutations>);
});

describe('PlateInventoryScreen', () => {
  it('saves the standard kg set untouched', () => {
    renderScreen();
    fireEvent.press(screen.getByText('Save'));
    expect(save).toHaveBeenCalledTimes(1);
    const body = save.mock.calls[0][0];
    expect(body.weight_unit).toBe('kg');
    expect(body.plates.map((p: { weight: number }) => p.weight)).toEqual([
      25, 20, 15, 10, 5, 2.5, 1.25, 0.5,
    ]);
    expect(body.bars[0].weight).toBe(20);
    expect(body.collars_enabled).toBe(false);
  });

  it('changes the pairs of a plate', () => {
    renderScreen();
    fireEvent.press(screen.getByLabelText('More pairs of 25'));
    fireEvent.press(screen.getByLabelText('More pairs of 25'));
    fireEvent.press(screen.getByLabelText('Fewer pairs of 20'));
    fireEvent.press(screen.getByText('Save'));
    const body = save.mock.calls[0][0];
    expect(body.plates[0]).toEqual({ weight: 25, pairs: 4 });
    expect(body.plates[1]).toEqual({ weight: 20, pairs: 1 });
  });

  it('adds an odd plate', () => {
    renderScreen();
    fireEvent.press(screen.getByText('Add plate'));
    const weights = screen.getAllByLabelText('Weight');
    fireEvent.changeText(weights[weights.length - 1]!, '0.25');
    fireEvent.press(screen.getByText('Save'));
    const body = save.mock.calls[0][0];
    expect(body.plates.at(-1)).toEqual({ weight: 0.25, pairs: 1 });
    // Saved heaviest first.
    expect(body.plates[0].weight).toBe(25);
  });

  it('switches to the pound preset', () => {
    renderScreen();
    fireEvent.press(screen.getByText('Use lb plates'));
    fireEvent.press(screen.getByText('Save'));
    const body = save.mock.calls[0][0];
    expect(body.weight_unit).toBe('lbs');
    expect(body.bars[0].weight).toBe(45);
  });

  it('turns collars on and sends their weight', () => {
    renderScreen();
    fireEvent(screen.getByLabelText('Collars count'), 'valueChange', true);
    fireEvent.changeText(
      screen.getByLabelText('Weight of one collar (kg)'),
      '1.25'
    );
    fireEvent.press(screen.getByText('Save'));
    const body = save.mock.calls[0][0];
    expect(body.collars_enabled).toBe(true);
    expect(body.collar_weight).toBe(1.25);
  });

  it('does not save a plate size listed twice', () => {
    renderScreen();
    fireEvent.press(screen.getByText('Add plate'));
    const weights = screen.getAllByLabelText('Weight');
    fireEvent.changeText(weights[weights.length - 1]!, '25');
    fireEvent.press(screen.getByText('Save'));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByText(/Check the weights and pairs/)).toBeTruthy();
  });

  it('numbers each bar so several of the same type stay distinguishable', () => {
    renderScreen();
    fireEvent.press(screen.getByText('Add bar'));
    fireEvent.press(screen.getByText('Add bar'));
    expect(screen.getByText('5. Other bar')).toBeTruthy();
    expect(screen.getByText('6. Other bar')).toBeTruthy();
    fireEvent.changeText(screen.getAllByLabelText('Name')[5]!, 'Test 2');
    expect(screen.getByText('6. Test 2')).toBeTruthy();
  });

  it('offers a reset only when something is saved', () => {
    renderScreen(false);
    expect(screen.queryByText('Reset to standard')).toBeNull();
  });
});
