import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { pressAction } from './helpers/nativeHeaderTestUtils';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import FoodDetailScreen from '../../src/screens/FoodDetailScreen';
import { useDeleteFood, useFoodVariants, useProfile, useServerConnection } from '../../src/hooks';

jest.mock('../../src/hooks', () => ({
  useDeleteFood: jest.fn(),
  useFoodVariants: jest.fn(),
  useProfile: jest.fn(),
  useServerConnection: jest.fn(),
  usePreferences: jest.fn(() => ({ preferences: undefined, isLoading: false, isError: false, refetch: jest.fn() })),
  useCustomNutrients: jest.fn(() => ({ customNutrients: [], isLoading: false, isError: false, refetch: jest.fn() })),
}));

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: jest.fn(() => 0),
}));

jest.mock('../../src/components/MacroCompositionRing', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: () => <View testID="macro-composition-ring" />,
  };
});

jest.mock('uniwind', () => ({
  useCSSVariable: (keys: string | string[]) =>
    Array.isArray(keys) ? keys.map(() => '#111827') : '#111827',
}));

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: (props: any) => <View testID={`icon-${props.name}`} />,
  };
});

jest.mock('../../src/components/BottomSheetPicker', () => {
  const React = require('react');
  const { View, Text, Pressable } = require('react-native');
  return {
    __esModule: true,
    default: ({ options, onSelect, renderTrigger, value }: any) => (
      <View>
        {renderTrigger?.({
          onPress: () => {},
          selectedOption: options.find((option: any) => option.value === value),
        })}
        {options.map((option: any) => (
          <Pressable key={option.value} onPress={() => onSelect(option.value)}>
            <Text>{option.label}</Text>
          </Pressable>
        ))}
      </View>
    ),
  };
});

const mockNavigation = {
  setOptions: jest.fn(),
  goBack: jest.fn(),
  navigate: jest.fn(),
  setParams: jest.fn(),
} as any;
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

const mockUseFoodVariants = useFoodVariants as jest.MockedFunction<typeof useFoodVariants>;
const mockUseDeleteFood = useDeleteFood as jest.MockedFunction<typeof useDeleteFood>;
const mockUseProfile = useProfile as jest.MockedFunction<typeof useProfile>;
const mockUseServerConnection = useServerConnection as jest.MockedFunction<typeof useServerConnection>;
const mockConfirmAndDelete = jest.fn();

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

describe('FoodDetailScreen', () => {
  const navigation = mockNavigation;

  const baseItem = {
    id: 'food-1',
    name: 'Greek Yogurt',
    brand: 'Sparky',
    userId: 'user-1',
    sharedWithPublic: false,
    servingSize: 1,
    servingUnit: 'cup',
    calories: 100,
    protein: 15,
    carbs: 6,
    fat: 0,
    customNutrients: null,
    variantId: 'variant-1',
    source: 'local' as const,
    originalItem: {
      id: 'food-1',
      name: 'Greek Yogurt',
    },
  };

  const buildRoute = (itemOverrides: Record<string, unknown> = {}) => ({
    key: 'FoodDetail-key',
    name: 'FoodDetail' as const,
    params: {
      item: {
        ...baseItem,
        ...itemOverrides,
      },
    },
  });

  const buildRouteWithParams = (
    paramsOverrides: Record<string, unknown> = {},
    itemOverrides: Record<string, unknown> = {},
  ) => ({
    key: 'FoodDetail-key',
    name: 'FoodDetail' as const,
    params: {
      item: {
        ...baseItem,
        ...itemOverrides,
      },
      ...paramsOverrides,
    },
  });

  const renderScreen = (itemOverrides: Record<string, unknown> = {}) =>
    render(
      <SafeAreaProvider initialMetrics={{ insets, frame }}>
        <FoodDetailScreen navigation={navigation} route={buildRoute(itemOverrides) as any} />
      </SafeAreaProvider>,
    );

  const renderScreenWithParams = (
    paramsOverrides: Record<string, unknown> = {},
    itemOverrides: Record<string, unknown> = {},
  ) =>
    render(
      <SafeAreaProvider initialMetrics={{ insets, frame }}>
        <FoodDetailScreen
          navigation={navigation}
          route={buildRouteWithParams(paramsOverrides, itemOverrides) as any}
        />
      </SafeAreaProvider>,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseProfile.mockReturnValue({
      profile: { id: 'user-1' } as any,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });
    mockUseServerConnection.mockReturnValue({
      isConnected: true,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });
    mockUseDeleteFood.mockReturnValue({
      confirmAndDelete: mockConfirmAndDelete,
      invalidateCaches: jest.fn(),
      isPending: false,
    });
    mockUseFoodVariants.mockReturnValue({
      variants: [
        {
          id: 'variant-1',
          food_id: 'food-1',
          serving_size: 1,
          serving_unit: 'cup',
          calories: 100,
          protein: 15,
          carbs: 6,
          fat: 0,
        },
        {
          id: 'variant-2',
          food_id: 'food-1',
          serving_size: 2,
          serving_unit: 'cup',
          calories: 200,
          protein: 30,
          carbs: 12,
          fat: 0,
        },
      ] as any,
      isLoading: false,
      isError: false,
    });
  });

  it('updates the displayed nutrition when the selected serving changes and logs the selected variant', async () => {
    const screen = renderScreen();

    expect(screen.getByText('Greek Yogurt')).toBeTruthy();
    expect(screen.getByText('١٠٠')).toBeTruthy();

    fireEvent.press(screen.getAllByText('٢ كوب (٢٠٠ سعرة)')[0]);

    await waitFor(() => {
      expect(screen.getByText('٢٠٠')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('تسجيل الصنف'));

    expect(navigation.navigate).toHaveBeenCalledWith(
      'FoodEntryAdd',
      expect.objectContaining({
        item: expect.objectContaining({
          id: 'food-1',
          variantId: 'variant-2',
          calories: 200,
          servingSize: 2,
          servingUnit: 'cup',
        }),
      }),
    );
  });

  it('opens the edit form for owned foods using the selected variant values', async () => {
    const screen = renderScreen();

    fireEvent.press(screen.getAllByText('٢ كوب (٢٠٠ سعرة)')[0]);
    pressAction(screen, navigation, 'تعديل');

    expect(navigation.navigate).toHaveBeenCalledWith(
      'FoodForm',
      expect.objectContaining({
        mode: 'edit-food',
        foodId: 'food-1',
        variantId: 'variant-2',
        initialValues: expect.objectContaining({
          name: 'Greek Yogurt',
          brand: 'Sparky',
          servingSize: '2',
          servingUnit: 'cup',
          calories: '200',
        }),
      }),
    );
  });

  it('hides edit and delete actions for public foods owned by another user', () => {
    const screen = renderScreen({
      userId: 'user-2',
      sharedWithPublic: true,
    });

    expect(screen.queryByText('تعديل')).toBeNull();
    expect(screen.queryByText('حذف الصنف')).toBeNull();
  });

  it('shows delete for owned foods and triggers the delete hook', () => {
    const screen = renderScreen();

    fireEvent.press(screen.getByText('حذف الصنف'));

    expect(mockConfirmAndDelete).toHaveBeenCalledTimes(1);
  });

  it('keeps the detail view on the simple serving picker', async () => {
    const screen = renderScreen();

    expect(screen.queryByText('Create Draft Unit')).toBeNull();
    fireEvent.press(screen.getAllByText('٢ كوب (٢٠٠ سعرة)')[0]);

    await waitFor(() => {
      expect(screen.getByText('٢٠٠')).toBeTruthy();
    });
  });

  it('shows the Barcode row with the current value for owned foods', () => {
    const screen = renderScreen({ barcode: '3017620422003' });

    expect(screen.getByText('الباركود')).toBeTruthy();
    expect(screen.getByText('3017620422003')).toBeTruthy();
  });

  it('shows the Arabic empty value when no barcode is stored', () => {
    const screen = renderScreen({ barcode: null });

    expect(screen.getByText('الباركود')).toBeTruthy();
    expect(screen.getByText('غير مضاف')).toBeTruthy();
  });

  it('hides the Barcode row for foods the user does not own', () => {
    const screen = renderScreen({
      userId: 'user-2',
      sharedWithPublic: true,
      barcode: '3017620422003',
    });

    expect(screen.queryByText('الباركود')).toBeNull();
  });

  it('navigates to EditBarcode with the current barcode and returnKey on tap', () => {
    const screen = renderScreen({ barcode: '3017620422003' });

    fireEvent.press(screen.getByText('الباركود'));

    expect(navigation.navigate).toHaveBeenCalledWith('EditBarcode', {
      foodId: 'food-1',
      foodName: 'Greek Yogurt',
      currentBarcode: '3017620422003',
      returnKey: 'FoodDetail-key',
    });
  });

  it('merges updatedBarcode and clears the param', async () => {
    const screen = renderScreenWithParams(
      { updatedBarcode: '0012345678905' },
      { barcode: null },
    );

    await waitFor(() => {
      expect(screen.getByText('0012345678905')).toBeTruthy();
    });
    expect(navigation.setParams).toHaveBeenCalledWith({
      updatedBarcode: undefined,
    });
  });

  it('clears the stored barcode when updatedBarcode is null', async () => {
    const screen = renderScreenWithParams(
      { updatedBarcode: null },
      { barcode: '3017620422003' },
    );

    await waitFor(() => {
      expect(screen.getByText('غير مضاف')).toBeTruthy();
    });
    expect(screen.queryByText('3017620422003')).toBeNull();
  });

  it('adopts the returned selected variant after editing', async () => {
    const screen = renderScreenWithParams({
      updatedItem: {
        ...baseItem,
        servingSize: 2,
        servingUnit: 'cup',
        calories: 200,
        protein: 30,
        carbs: 12,
        fat: 0,
        variantId: 'variant-2',
      },
      updatedSelectedVariantId: 'variant-2',
    });

    await waitFor(() => {
      expect(screen.getByText('٢٠٠')).toBeTruthy();
    });

    expect(screen.getAllByText('٢ كوب (٢٠٠ سعرة)')[0]).toBeTruthy();
    expect(navigation.setParams).toHaveBeenCalledWith({
      updatedItem: undefined,
      updatedSelectedVariantId: undefined,
    });
  });

  it('shows a Saudi Arabic server recovery state', () => {
    mockUseServerConnection.mockReturnValue({
      isConnected: false,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    const screen = renderScreen();

    expect(screen.getByText('ما فيه خادم مربوط')).toBeTruthy();
    expect(
      screen.getByText(
        'اربط خادمك من الإعدادات عشان تشوف تفاصيل الصنف.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('الذهاب للإعدادات')).toBeTruthy();
  });
});
