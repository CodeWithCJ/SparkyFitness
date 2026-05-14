import { act, renderHook, waitFor } from '@testing-library/react';
import { useCustomFoodForm } from '@/hooks/Foods/useFoodForm';
import { getConversionFactor } from '@/utils/servingSizeConversions';
import type { Food, FoodVariant } from '@/types/food';

const mockToast = jest.fn();
const mockFetchQuery = jest.fn();
const mockCustomNutrients: [] = [];
const mockQueryClient = {
  fetchQuery: mockFetchQuery,
};

let mockAutoScaleOnlineImports = false;

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
    autoScaleOnlineImports: mockAutoScaleOnlineImports,
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

const createFood = (overrides: Partial<Food> = {}): Food => ({
  id: 'food-1',
  name: 'Imported Food',
  is_custom: true,
  variants: [createVariant()],
  ...overrides,
});

describe('useCustomFoodForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAutoScaleOnlineImports = false;
  });

  it('preserves nutrition values and turns auto-scale off after an incompatible unit change', async () => {
    mockAutoScaleOnlineImports = true;
    const initialVariants = [createVariant()];

    const { result } = renderHook(() =>
      useCustomFoodForm({
        initialVariants,
        onSave: jest.fn(),
      })
    );

    await waitFor(() => {
      expect(result.current.variants[0]?.is_locked).toBe(true);
    });

    act(() => {
      result.current.updateVariant(0, 'serving_unit', 'tsp');
    });

    expect(result.current.variants[0]?.serving_unit).toBe('tsp');
    expect(result.current.variants[0]?.calories).toBe(100);
    expect(result.current.variants[0]?.protein).toBe(10);
    expect(result.current.variants[0]?.is_locked).toBe(false);
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Manual conversion required',
        description:
          '"g" and "tsp" are incompatible unit types. Please update the serving size and nutrition values manually.',
      })
    );
  });

  it('opens existing food edits with auto-scale on when the preference is enabled', async () => {
    mockAutoScaleOnlineImports = true;
    const food = createFood();

    const { result } = renderHook(() =>
      useCustomFoodForm({
        food,
        onSave: jest.fn(),
      })
    );

    await waitFor(() => {
      expect(result.current.variants[0]?.is_locked).toBe(true);
    });

    expect(result.current.hasTrustedCompatibilityBase[0]).toBe(true);
  });

  it('opens brand-new custom foods with auto-scale off even when the preference is enabled', async () => {
    mockAutoScaleOnlineImports = true;

    const { result } = renderHook(() =>
      useCustomFoodForm({
        onSave: jest.fn(),
      })
    );

    await waitFor(() => {
      expect(result.current.variants[0]?.serving_unit).toBe('g');
    });

    expect(result.current.variants[0]?.is_locked).toBe(false);
    expect(result.current.hasTrustedCompatibilityBase[0]).toBe(false);
  });

  it('keeps newly added unsaved custom variants auto-scale off by default', async () => {
    mockAutoScaleOnlineImports = true;

    const { result } = renderHook(() =>
      useCustomFoodForm({
        onSave: jest.fn(),
      })
    );

    await waitFor(() => {
      expect(result.current.variants).toHaveLength(1);
    });

    act(() => {
      result.current.addVariant();
    });

    expect(result.current.variants[1]?.is_locked).toBe(false);
    expect(result.current.hasTrustedCompatibilityBase[1]).toBe(false);
  });

  it('does not show incompatible-unit toasts for unsaved custom foods before save', async () => {
    const { result } = renderHook(() =>
      useCustomFoodForm({
        onSave: jest.fn(),
      })
    );

    await waitFor(() => {
      expect(result.current.variants[0]?.serving_unit).toBe('g');
    });

    act(() => {
      result.current.updateVariant(0, 'calories', 100);
    });

    act(() => {
      result.current.updateVariant(0, 'serving_unit', 'serving');
    });

    expect(result.current.variants[0]?.serving_unit).toBe('serving');
    expect(result.current.variants[0]?.calories).toBe(100);
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('keeps auto-scale on during compatible unit changes when the preference intent is on', async () => {
    mockAutoScaleOnlineImports = true;
    const initialVariants = [createVariant()];

    const { result } = renderHook(() =>
      useCustomFoodForm({
        initialVariants,
        onSave: jest.fn(),
      })
    );

    await waitFor(() => {
      expect(result.current.variants[0]?.is_locked).toBe(true);
    });

    act(() => {
      result.current.updateVariant(0, 'serving_unit', 'oz');
    });

    expect(result.current.variants[0]?.serving_unit).toBe('oz');
    expect(result.current.variants[0]?.is_locked).toBe(true);
    expect(Number(result.current.variants[0]?.calories)).toBeCloseTo(
      100 * (getConversionFactor('g', 'oz') ?? 0),
      4
    );
  });

  it('restores auto-scale when returning to a compatible unit after an incompatible one', async () => {
    mockAutoScaleOnlineImports = true;
    const initialVariants = [createVariant()];

    const { result } = renderHook(() =>
      useCustomFoodForm({
        initialVariants,
        onSave: jest.fn(),
      })
    );

    await waitFor(() => {
      expect(result.current.variants[0]?.is_locked).toBe(true);
    });

    act(() => {
      result.current.updateVariant(0, 'serving_unit', 'tsp');
    });

    act(() => {
      result.current.updateVariant(0, 'serving_unit', 'oz');
    });

    expect(result.current.variants[0]?.serving_unit).toBe('oz');
    expect(result.current.variants[0]?.is_locked).toBe(true);
    expect(Number(result.current.variants[0]?.calories)).toBeCloseTo(
      100 * (getConversionFactor('g', 'oz') ?? 0),
      4
    );
  });

  it('keeps auto-scale off when returning to a compatible unit after the user preference intent is off', async () => {
    const initialVariants = [createVariant()];

    const { result } = renderHook(() =>
      useCustomFoodForm({
        initialVariants,
        onSave: jest.fn(),
      })
    );

    await waitFor(() => {
      expect(result.current.variants[0]?.is_locked).toBe(false);
    });

    act(() => {
      result.current.updateVariant(0, 'serving_unit', 'tsp');
    });

    act(() => {
      result.current.updateVariant(0, 'serving_unit', 'oz');
    });

    expect(result.current.variants[0]?.serving_unit).toBe('oz');
    expect(result.current.variants[0]?.is_locked).toBe(false);
  });

  it('creates a new scaling baseline when auto-scale is re-enabled after a manual custom-unit edit', async () => {
    const { result } = renderHook(() =>
      useCustomFoodForm({
        onSave: jest.fn(),
      })
    );

    await waitFor(() => {
      expect(result.current.variants[0]?.serving_unit).toBe('g');
    });

    act(() => {
      result.current.updateVariant(0, 'serving_unit', 'serving');
    });

    act(() => {
      result.current.updateVariant(0, 'serving_size', 1);
    });

    act(() => {
      result.current.updateVariant(0, 'calories', 100);
    });

    act(() => {
      result.current.updateVariant(0, 'protein', 10);
    });

    act(() => {
      result.current.updateVariant(0, 'is_locked', true);
    });

    expect(result.current.variants[0]?.is_locked).toBe(true);

    act(() => {
      result.current.updateVariant(0, 'serving_size', 2);
    });

    expect(result.current.variants[0]?.serving_size).toBe(2);
    expect(result.current.variants[0]?.calories).toBe(200);
    expect(result.current.variants[0]?.protein).toBe(20);
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
    expect(result.current.hasTrustedCompatibilityBase[1]).toBe(true);
  });

  it('preserves trusted compatibility status when duplicating a trusted variant', async () => {
    mockAutoScaleOnlineImports = true;
    const initialVariants = [createVariant()];

    const { result } = renderHook(() =>
      useCustomFoodForm({
        initialVariants,
        onSave: jest.fn(),
      })
    );

    await waitFor(() => {
      expect(result.current.hasTrustedCompatibilityBase[0]).toBe(true);
    });

    act(() => {
      result.current.duplicateVariant(0);
    });

    expect(result.current.hasTrustedCompatibilityBase[1]).toBe(true);
    expect(result.current.variants[1]?.is_locked).toBe(true);
  });

  it('skips scaling math when serving sizes are invalid instead of producing destructive values', async () => {
    mockAutoScaleOnlineImports = true;
    const initialVariants = [createVariant({ serving_size: 0 })];

    const { result } = renderHook(() =>
      useCustomFoodForm({
        initialVariants,
        onSave: jest.fn(),
      })
    );

    await waitFor(() => {
      expect(result.current.variants[0]?.is_locked).toBe(true);
    });

    act(() => {
      result.current.updateVariant(0, 'serving_size', 2);
    });

    expect(result.current.variants[0]?.serving_size).toBe(2);
    expect(result.current.variants[0]?.calories).toBe(100);
    expect(result.current.variants[0]?.protein).toBe(10);
  });
});
