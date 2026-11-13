import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ShoeResponse } from '@workspace/shared';
import ShoesScreen from '../../src/screens/ShoesScreen';
import { useShoeMutations, useShoes } from '../../src/hooks/useShoes';
import { initializeI18n } from '../../src/localization/i18n';
import type { RootStackScreenProps } from '../../src/types/navigation';

jest.mock('../../src/hooks/useShoes', () => ({
  useShoes: jest.fn(),
  useShoeMutations: jest.fn(),
}));
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));
jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: () => false,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { default_distance_unit: 'km' } }),
}));
jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
}));

const mockUpdate = jest.fn();
const shoe = (overrides: Partial<ShoeResponse>) =>
  ({
    id: 'shoe-1',
    name: 'Trainer',
    brand: null,
    model: null,
    nickname: null,
    retirement_distance_km: 800,
    total_distance_km: 120,
    run_count: 12,
    last_used_date: null,
    status: 'active',
    is_default: false,
    is_worn_out: false,
    ...overrides,
  }) as ShoeResponse;

const renderScreen = () =>
  render(
    <ShoesScreen
      {...({
        navigation: { navigate: jest.fn() },
      } as unknown as RootStackScreenProps<'Shoes'>)}
    />
  );

beforeAll(async () => {
  await initializeI18n();
});
beforeEach(() => {
  jest.clearAllMocks();
  (useShoeMutations as jest.Mock).mockReturnValue({
    updateMutation: { mutate: mockUpdate },
  });
});

describe('ShoesScreen retire prompt', () => {
  it('offers to retire a worn-out active pair', () => {
    (useShoes as jest.Mock).mockReturnValue({
      shoes: [shoe({ total_distance_km: 812, is_worn_out: true })],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    renderScreen();

    expect(screen.getByText(/has reached its limit/i)).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Retire'));
    expect(mockUpdate).toHaveBeenCalledWith({
      id: 'shoe-1',
      data: { status: 'retired' },
    });
  });

  it('does not prompt for a pair under its limit or already retired', () => {
    (useShoes as jest.Mock).mockReturnValue({
      shoes: [
        shoe({}),
        shoe({ id: 'shoe-2', status: 'retired', is_worn_out: true }),
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    renderScreen();

    expect(screen.queryByText(/has reached its limit/i)).toBeNull();
  });
});
