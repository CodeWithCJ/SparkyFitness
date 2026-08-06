import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import FoodsLibraryScreen from '../../src/screens/FoodsLibraryScreen';
import {
  useFavorites,
  useFoodsLibrary,
  useProfile,
  useServerConnection,
} from '../../src/hooks';
import type { FoodItem } from '../../src/types/foods';
import {
  useAppPreferencesStore,
  __resetAppPreferencesStoreForTests,
} from '../../src/stores/appPreferencesStore';
import {
  findHeaderItemByAccessibilityLabel,
  findHeaderMenuAction,
  pressHeaderMenuAction,
} from './helpers/nativeHeaderTestUtils';

jest.mock('../../src/hooks', () => ({
  useFoodsLibrary: jest.fn(),
  useFavorites: jest.fn(),
  useServerConnection: jest.fn(),
  useProfile: jest.fn(),
}));

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: jest.fn(() => 0),
}));

// Mutable so individual tests can drop to the custom-header path, where the
// filter menu renders as an AnchoredMenu instead of a native UIMenu.
let mockNativeHeadersActive = true;
jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: () => mockNativeHeadersActive,
  useNativeIOSTabsActive: () => false,
}));

const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  setOptions: jest.fn(),
} as any;
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

const mockUseFoodsLibrary = useFoodsLibrary as jest.MockedFunction<typeof useFoodsLibrary>;
const mockUseFavorites = useFavorites as jest.MockedFunction<typeof useFavorites>;
const mockUseServerConnection = useServerConnection as jest.MockedFunction<typeof useServerConnection>;
const mockUseProfile = useProfile as jest.MockedFunction<typeof useProfile>;

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

function createFood(overrides: Partial<FoodItem> = {}): FoodItem {
  return {
    id: 'food-1',
    name: 'Grilled Chicken',
    brand: 'House',
    user_id: 'user-1',
    shared_with_public: false,
    default_variant: {
      id: 'variant-1',
      serving_size: 100,
      serving_unit: 'g',
      calories: 200,
      protein: 30,
      carbs: 0,
      fat: 8,
    },
    ...overrides,
  } as unknown as FoodItem;
}

describe('FoodsLibraryScreen', () => {
  const navigation = mockNavigation;
  const route = {
    key: 'FoodsLibrary-key',
    name: 'FoodsLibrary' as const,
    params: undefined,
  };

  const renderScreen = () =>
    render(
      <SafeAreaProvider initialMetrics={{ insets, frame }}>
        <FoodsLibraryScreen navigation={navigation} route={route} />
      </SafeAreaProvider>,
    );

  function mockFoods(foods: FoodItem[]) {
    mockUseFoodsLibrary.mockReturnValue({
      foods,
      isLoading: false,
      isSearching: false,
      isError: false,
      isFetchNextPageError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      loadMore: jest.fn(),
      refetch: jest.fn(),
    } as any);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    __resetAppPreferencesStoreForTests();
    mockNativeHeadersActive = true;
    mockUseServerConnection.mockReturnValue({
      isConnected: true,
      isLoading: false,
    } as any);
    mockUseProfile.mockReturnValue({ profile: { id: 'user-1' }, isLoading: false } as any);
    mockUseFavorites.mockReturnValue({ favoriteFoods: [], favoriteMeals: [] } as any);
    mockFoods([]);
  });

  it('lists foods and navigates to FoodDetail when a food is pressed', () => {
    mockFoods([
      createFood(),
      createFood({ id: 'food-2', name: 'Oatmeal' } as Partial<FoodItem>),
    ]);

    const screen = renderScreen();

    expect(screen.getByText('Grilled Chicken')).toBeTruthy();
    expect(screen.getByText('Oatmeal')).toBeTruthy();

    fireEvent.press(screen.getByText('Grilled Chicken'));
    expect(navigation.navigate).toHaveBeenCalledWith(
      'FoodDetail',
      expect.objectContaining({ item: expect.objectContaining({ id: 'food-1' }) }),
    );
  });

  it('persists an ownership filter chosen from the native menu and filters the list', () => {
    mockFoods([
      createFood(),
      createFood({ id: 'food-2', name: 'Family Stew', user_id: 'user-2' } as Partial<FoodItem>),
    ]);

    const screen = renderScreen();
    expect(screen.getByText('Family Stew')).toBeTruthy();

    pressHeaderMenuAction(navigation, 'Mine');

    expect(useAppPreferencesStore.getState().foodsLibraryOwnershipFilter).toBe('mine');
    expect(screen.getByText('Grilled Chicken')).toBeTruthy();
    expect(screen.queryByText('Family Stew')).toBeNull();
  });

  it('checkmarks the active filter and badges the menu button', () => {
    useAppPreferencesStore.setState({ foodsLibraryOwnershipFilter: 'mine' });

    renderScreen();

    expect(findHeaderMenuAction(navigation, 'Mine')?.state).toBe('on');
    expect(findHeaderMenuAction(navigation, 'All')?.state).toBe('off');
    const button = findHeaderItemByAccessibilityLabel(
      navigation,
      'Filter foods, filtered to Mine',
    );
    // Dot badge: bullet glyph with foreground matched to background.
    expect(button?.badge?.value).toBe('•');
  });

  it('names the filter and offers Show All when it empties the list', () => {
    useAppPreferencesStore.setState({ foodsLibraryOwnershipFilter: 'public' });
    mockFoods([createFood()]);

    const screen = renderScreen();

    expect(screen.getByText('No foods in Public')).toBeTruthy();

    fireEvent.press(screen.getByText('Show All'));

    expect(useAppPreferencesStore.getState().foodsLibraryOwnershipFilter).toBe('all');
    expect(screen.getByText('Grilled Chicken')).toBeTruthy();
  });

  it('opens the filter menu as an AnchoredMenu on the custom-header path', () => {
    mockNativeHeadersActive = false;
    mockFoods([
      createFood(),
      createFood({ id: 'food-2', name: 'Family Stew', user_id: 'user-2' } as Partial<FoodItem>),
    ]);

    const screen = renderScreen();

    fireEvent.press(screen.getByLabelText('Filter foods'));
    // The menu is open: the Show group label and the filter options render.
    expect(screen.getByText('Show')).toBeTruthy();

    fireEvent.press(screen.getByText('Mine'));

    expect(useAppPreferencesStore.getState().foodsLibraryOwnershipFilter).toBe('mine');
    expect(screen.queryByText('Family Stew')).toBeNull();
    // Selecting an option closed the menu.
    expect(screen.queryByText('Show')).toBeNull();
  });
});
