import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import FoodPhotoLogEntryScreen from '../../src/screens/FoodPhotoLogEntryScreen';
import { useAddFoodEntry } from '../../src/hooks/useAddFoodEntry';
import { useMealTypes } from '../../src/hooks/useMealTypes';
import { fetchDailyGoals } from '../../src/services/api/goalsApi';
import type { SaveFoodPayload } from '../../src/services/api/foodsApi';
import { createTestQueryClient } from '../hooks/queryTestUtils';

jest.mock('../../src/hooks/useAddFoodEntry', () => ({
  useAddFoodEntry: jest.fn(),
}));
jest.mock('../../src/hooks/useMealTypes', () => ({
  useMealTypes: jest.fn(),
}));
jest.mock('../../src/services/api/goalsApi', () => ({
  fetchDailyGoals: jest.fn(),
}));
jest.mock('../../src/services/haptics', () => ({
  fireSuccessHaptic: jest.fn(),
}));
jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));

// Stub the bottom-sheet picker — surface the trigger only.
jest.mock('../../src/components/BottomSheetPicker', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ renderTrigger }: any) =>
      renderTrigger
        ? renderTrigger({ onPress: jest.fn(), selectedOption: undefined })
        : null,
  };
});

// Stub CalendarSheet — no UI side effects.
jest.mock('../../src/components/CalendarSheet', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: React.forwardRef(() => null),
  };
});

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

function buildSaveFoodPayload(overrides?: Partial<SaveFoodPayload>): SaveFoodPayload {
  return {
    name: 'Bowl of yogurt and berries',
    brand: null,
    serving_size: 250,
    serving_unit: 'g',
    calories: 320,
    protein: 12,
    carbs: 40,
    fat: 8,
    dietary_fiber: 5,
    sugars: 14,
    provider_type: 'food_photo_estimate',
    ...overrides,
  };
}

describe('FoodPhotoLogEntryScreen', () => {
  const parentNavigation = { popToTop: jest.fn() };
  const navigation = {
    goBack: jest.fn(),
    getParent: jest.fn(() => parentNavigation),
  } as any;
  const addEntryAsync = jest.fn().mockResolvedValue(undefined);
  const invalidateCache = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    navigation.getParent.mockReturnValue(parentNavigation);
    (useMealTypes as jest.Mock).mockReturnValue({
      mealTypes: [
        { id: 'mt-1', name: 'Breakfast', is_visible: true, sort_order: 1 },
        { id: 'mt-2', name: 'Lunch', is_visible: true, sort_order: 2 },
      ],
      defaultMealTypeId: 'mt-1',
      isLoading: false,
      isError: false,
    });
    (useAddFoodEntry as jest.Mock).mockReturnValue({
      addEntryAsync,
      isPending: false,
      invalidateCache,
    });
    (fetchDailyGoals as jest.Mock).mockResolvedValue({
      calories: 2000,
      protein: 150,
      carbs: 200,
      fat: 60,
    });
  });

  const renderScreen = (saveFoodPayload = buildSaveFoodPayload()) =>
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <SafeAreaProvider initialMetrics={{ insets, frame }}>
          <FoodPhotoLogEntryScreen
            navigation={navigation}
            route={{
              key: 'k',
              name: 'LogEntry' as const,
              params: {
                date: '2026-05-18',
                saveFoodPayload,
              },
            }}
          />
        </SafeAreaProvider>
      </QueryClientProvider>,
    );

  it('builds entry quantity from servings × serving_size at the default 1 serving', async () => {
    const screen = renderScreen();

    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(addEntryAsync).toHaveBeenCalledTimes(1);
    });

    const [input] = addEntryAsync.mock.calls[0];
    expect(input.saveFoodPayload).toEqual(
      expect.objectContaining({
        serving_size: 250,
        serving_unit: 'g',
      }),
    );
    expect(input.createEntryPayload).toEqual({
      quantity: 250,
      unit: 'g',
      meal_type_id: 'mt-1',
      entry_date: '2026-05-18',
    });
  });

  it('renders the recap from saveFoodPayload (not from estimate)', () => {
    const screen = renderScreen(
      buildSaveFoodPayload({ name: 'Edited name', calories: 400 }),
    );
    expect(screen.getByText('Edited name')).toBeTruthy();
    expect(screen.getByText('400')).toBeTruthy();
  });

  it('invalidates the daily summary cache for the entry date on success', async () => {
    const screen = renderScreen();
    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(invalidateCache).toHaveBeenCalledWith('2026-05-18');
    });
  });

  it('dismisses to root via getParent().popToTop() when useAddFoodEntry fires onSuccess', () => {
    // Capture the onSuccess option passed to the hook so we can trigger it manually.
    let capturedOnSuccess: (() => void) | undefined;
    (useAddFoodEntry as jest.Mock).mockImplementation((options) => {
      capturedOnSuccess = options?.onSuccess;
      return { addEntryAsync, isPending: false, invalidateCache };
    });
    renderScreen();
    capturedOnSuccess?.();
    expect(parentNavigation.popToTop).toHaveBeenCalledTimes(1);
  });
});
