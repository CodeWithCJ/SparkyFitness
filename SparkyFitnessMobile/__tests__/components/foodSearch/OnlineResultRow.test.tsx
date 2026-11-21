import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { OnlineResultRow } from '../../../src/components/foodSearch/FoodSearchResultRow';
import type { ExternalFoodItem } from '../../../src/types/externalFoods';

jest.mock('../../../src/components/FoodThumbnail', () => () => null);
jest.mock('../../../src/components/AllergenBadges', () => () => null);
jest.mock('../../../src/components/FoodImageSourceProvider', () => ({
  useFoodImageSourceContext: () => () => undefined,
}));
jest.mock('../../../src/components/LightboxProvider', () => ({
  useOpenLightbox: () => jest.fn(),
}));
jest.mock('../../../src/hooks/useEnergyUnit', () => ({
  useEnergyUnit: () => 'kcal',
}));

const createExternalFood = (
  overrides: Partial<ExternalFoodItem> = {}
): ExternalFoodItem => ({
  id: 'ext-1',
  name: 'Banana',
  brand: null,
  calories: 89,
  protein: 1.1,
  carbs: 22.8,
  fat: 0.3,
  serving_size: 100,
  serving_unit: 'g',
  ...overrides,
});

describe('OnlineResultRow', () => {
  it('renders calories and "Tap for full nutrition" when has_core_nutrition is false but has_calories is true', () => {
    render(
      <OnlineResultRow
        item={createExternalFood({
          calories: 120,
          protein: 0,
          carbs: 0,
          fat: 0,
          has_core_nutrition: false,
          has_calories: true,
        })}
        accentColor="#007AFF"
        loadingFoodId={null}
        getProviderColor={() => '#007AFF'}
        onSelect={jest.fn()}
        showMacros={true}
      />
    );

    expect(screen.getByText('120 kcal')).toBeTruthy();
    expect(screen.getByText('Tap for full nutrition')).toBeTruthy();
    expect(screen.queryByText(/Protein/i)).toBeNull();
  });

  it('renders "Tap for nutrition" and no fake "0 kcal" when both flags are false', () => {
    render(
      <OnlineResultRow
        item={createExternalFood({
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
          has_core_nutrition: false,
          has_calories: false,
        })}
        accentColor="#007AFF"
        loadingFoodId={null}
        getProviderColor={() => '#007AFF'}
        onSelect={jest.fn()}
        showMacros={true}
      />
    );

    expect(screen.getByText('Tap for nutrition')).toBeTruthy();
    expect(screen.queryByText('0 kcal')).toBeNull();
    expect(screen.queryByText(/Protein/i)).toBeNull();
  });

  it('renders standard macros and calories when flags are undefined (legacy behavior)', () => {
    render(
      <OnlineResultRow
        item={createExternalFood({
          calories: 89,
          protein: 1.1,
          carbs: 22.8,
          fat: 0.3,
          has_core_nutrition: undefined,
          has_calories: undefined,
        })}
        accentColor="#007AFF"
        loadingFoodId={null}
        getProviderColor={() => '#007AFF'}
        onSelect={jest.fn()}
        showMacros={true}
      />
    );

    expect(screen.getByText('89 kcal')).toBeTruthy();
    expect(screen.getByText(/Protein/i)).toBeTruthy();
  });
});
