import React from 'react';
import { ActivityIndicator } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ShoeResponse } from '@workspace/shared';
import ShoeFormScreen from '../../src/screens/ShoeFormScreen';
import { useShoes } from '../../src/hooks/useShoes';
import { initializeI18n } from '../../src/localization/i18n';
import type { RootStackScreenProps } from '../../src/types/navigation';

jest.mock('../../src/hooks/useShoes', () => ({
  useShoes: jest.fn(),
  useShoeMutations: () => ({
    createMutation: {},
    updateMutation: {},
    deleteMutation: {},
  }),
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
jest.mock('../../src/components/CalendarSheet', () => ({
  __esModule: true,
  default: () => null,
}));

const refetch = jest.fn();
const shoe = {
  id: 'shoe-1',
  name: 'Trainer',
  starting_distance_km: 12,
  retirement_distance_km: 800,
  status: 'active',
} as ShoeResponse;
const renderScreen = (shoeId: string | undefined = 'shoe-1') =>
  render(
    <ShoeFormScreen
      {...({
        navigation: { goBack: jest.fn() },
        route: { params: { shoeId } },
      } as unknown as RootStackScreenProps<'ShoeForm'>)}
    />
  );

beforeAll(async () => {
  await initializeI18n();
});
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useShoes).mockReturnValue({
    shoes: [],
    isLoading: false,
    isError: false,
    refetch,
  } as unknown as ReturnType<typeof useShoes>);
});

it('shows loading while fetching an existing shoe', () => {
  jest.mocked(useShoes).mockReturnValue({
    shoes: [],
    isLoading: true,
    isError: false,
    refetch,
  } as unknown as ReturnType<typeof useShoes>);
  const view = renderScreen();
  expect(view.UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
  expect(screen.queryByText('Save')).toBeNull();
});

it('shows a missing-shoe error with retry', () => {
  renderScreen();
  expect(screen.getByText('Shoe not found.')).toBeTruthy();
  fireEvent.press(screen.getByText('Retry'));
  expect(refetch).toHaveBeenCalledTimes(1);
});

it('shows a failed-query error with retry even if a shoe is cached', () => {
  jest.mocked(useShoes).mockReturnValue({
    shoes: [shoe],
    isLoading: false,
    isError: true,
    refetch,
  } as unknown as ReturnType<typeof useShoes>);
  renderScreen();
  expect(screen.getByText('Could not load your shoes.')).toBeTruthy();
  fireEvent.press(screen.getByText('Retry'));
  expect(refetch).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Save')).toBeNull();
});

it('mounts the form after the shoe loads', () => {
  jest.mocked(useShoes).mockReturnValue({
    shoes: [shoe],
    isLoading: false,
    isError: false,
    refetch,
  } as unknown as ReturnType<typeof useShoes>);
  renderScreen();
  expect(screen.getByDisplayValue('Trainer')).toBeTruthy();
  expect(screen.getByText('Save')).toBeTruthy();
});

it('renders a new-shoe form without waiting for the list', () => {
  jest.mocked(useShoes).mockReturnValue({
    shoes: [],
    isLoading: true,
    isError: false,
    refetch,
  } as unknown as ReturnType<typeof useShoes>);
  renderScreen('');
  expect(screen.getByText('Save')).toBeTruthy();
});
