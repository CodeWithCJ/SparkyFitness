import { act, renderHook, waitFor } from '@testing-library/react';
import { useCustomFoodForm } from '@/hooks/Foods/useFoodForm';
import { getConversionFactor } from '@/utils/servingSizeConversions';
import type { FoodVariant } from '@/types/food';

const mockToast = jest.fn();
const mockFetchQuery = jest.fn();
const mockCustomNutrients: [] = [];
const mockQueryClient = {
  fetchQuery: mockFetchQuery,
};

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-1' },
  }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    energyUnit: 'kcal' as const,
    convertEnergy: (value: number) => value,
    loggingLevel: 'ERROR',
    autoScaleOnlineImports: false,
  }),
}));

jest.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}));

jest.mock('@/hooks/use-toast', () => ({
  toast: (...args: unknown[]) => mockToast(...args),
}));

jest.mock('@/hooks/Foods/useFoods', () => ({
  useUpdateFoodEntriesSnapshotMutation: () => ({
    mutateAsync: jest.fn(),
  }),
}));

jest.mock('@/hooks/Foods/useCustomNutrients', () => ({
  useCustomNutrients: () => ({
    data: mockCustomNutrients,
  }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mockQueryClient,
}));

jest.mock('@/hooks/Foods/useFoodVariants', () => ({
  foodVariantsOptions: () => ({
    queryKey: ['food-variants'],
  }),
  useSaveFoodMutation: () => ({
    mutateAsync: jest.fn(),
  }),
}));

const createVariant = (overrides: Partial<FoodVariant> = {}): FoodVariant => ({
  id: 'variant-1',
  serving_size: 10,
  serving_unit: 'g',
  calories: 100,
  protein: 10,
  carbs: 20,
  fat: 5,
  saturated_fat: 1,
  polyunsaturated_fat: 0,
  monounsaturated_fat: 0,
  trans_fat: 0,
  cholesterol: 0,
  sodium: 0,
  potassium: 0,
  dietary_fiber: 0,
  sugars: 0,
  vitamin_a: 0,
  vitamin_c: 0,
  calcium: 0,
  iron: 0,
  custom_nutrients: {},
  ...overrides,
});

describe('useCustomFoodForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('zeros nutrition and keeps manual mode after an incompatible unit change', async () => {
    const initialVariants = [createVariant()];

    const { result } = renderHook(() =>
      useCustomFoodForm({
        initialVariants,
        onSave: jest.fn(),
      })
    );

    await waitFor(() => {
      expect(result.current.variants[0]?.serving_unit).toBe('g');
    });

    act(() => {
      result.current.updateVariant(0, 'serving_unit', 'tsp');
    });

    expect(result.current.variants[0]?.serving_unit).toBe('tsp');
    expect(result.current.variants[0]?.calories).toBe(0);
    expect(result.current.variants[0]?.protein).toBe(0);
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Manual conversion required',
        description:
          '"g" and "tsp" are incompatible unit types. Please update the serving size and nutrition values manually.',
      })
    );

    act(() => {
      result.current.updateVariant(0, 'serving_unit', 'tbsp');
    });

    expect(result.current.variants[0]?.serving_unit).toBe('tbsp');
    expect(result.current.variants[0]?.calories).toBe(0);
    expect(result.current.variants[0]?.protein).toBe(0);
    expect(mockToast).toHaveBeenLastCalledWith(
      expect.objectContaining({
        title: 'Manual conversion required',
        description:
          '"g" and "tbsp" are incompatible unit types. Please update the serving size and nutrition values manually.',
      })
    );
  });

  it('keeps the original compatibility base when duplicating a manual-only variant', async () => {
    const initialVariants = [createVariant()];

    const { result } = renderHook(() =>
      useCustomFoodForm({
        initialVariants,
        onSave: jest.fn(),
      })
    );

    await waitFor(() => {
      expect(result.current.variants[0]?.serving_unit).toBe('g');
    });

    act(() => {
      result.current.updateVariant(0, 'serving_unit', 'tsp');
    });

    act(() => {
      result.current.duplicateVariant(0);
    });

    expect(result.current.variants[1]?.serving_unit).toBe('tsp');
    expect(result.current.conversionBaseVariants[1]?.serving_unit).toBe('g');
  });

  it('allows automatic conversion again after reverting to the loaded unit', async () => {
    const baseVariant = createVariant();
    const initialVariants = [baseVariant];

    const { result } = renderHook(() =>
      useCustomFoodForm({
        initialVariants,
        onSave: jest.fn(),
      })
    );

    await waitFor(() => {
      expect(result.current.variants[0]?.serving_unit).toBe('g');
    });

    act(() => {
      result.current.updateVariant(0, 'serving_unit', 'tsp');
    });

    act(() => {
      result.current.updateVariant(0, 'serving_unit', 'g');
    });

    act(() => {
      result.current.updateVariant(0, 'serving_unit', 'oz');
    });

    expect(result.current.variants[0]?.serving_unit).toBe('oz');
    expect(Number(result.current.variants[0]?.calories)).toBeCloseTo(
      baseVariant.calories * (getConversionFactor('g', 'oz') ?? 0),
      4
    );
    expect(Number(result.current.variants[0]?.protein)).toBeCloseTo(
      baseVariant.protein * (getConversionFactor('g', 'oz') ?? 0),
      4
    );
  });
});
