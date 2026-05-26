import { act, renderHook, waitFor } from '@testing-library/react';
import { useCustomFoodForm } from '@/hooks/Foods/useFoodForm';
import { getConversionFactor } from '@workspace/shared';
import type { Food, FoodVariant } from '@/types/food';

const mockToast = jest.fn();
const mockFetchQuery = jest.fn();
const mockSaveFood = jest.fn();
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
    mutateAsync: mockSaveFood,
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

const createPersistedVariantFixture = (): FoodVariant[] => [
  createVariant({
    id: 'variant-g',
    serving_size: 100,
    serving_unit: 'g',
    calories: 100,
    protein: 10,
    carbs: 20,
    fat: 5,
    is_default: true,
    source: 'manual',
    ai_confidence: null,
    ai_reasoning: null,
  }),
  createVariant({
    id: 'variant-cup-ai',
    serving_size: 1,
    serving_unit: 'cup',
    calories: 260,
    protein: 26,
    carbs: 52,
    fat: 13,
    source: 'ai_estimate',
    ai_confidence: 'medium',
    ai_reasoning: 'Typical density estimate.',
  }),
];

describe('useCustomFoodForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAutoScaleOnlineImports = false;
    mockSaveFood.mockResolvedValue({
      id: 'saved-food',
      name: 'Saved Food',
      is_custom: true,
    });
  });

  it('preserves nutrition values and respects auto-scale preference after an incompatible unit change', async () => {
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
    // Issue G2: auto-scale stays ON through incompatible swaps when the user
    // pref says so. The manual-conversion-pending guard separately blocks
    // serving_size scaling until the user resolves the swap (manual fill or
    // AI estimate), so this is safe.
    expect(result.current.variants[0]?.is_locked).toBe(true);
    expect(result.current.manualUnitConversionPending[0]).toBe(true);
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Manual Nutrition Update',
        description:
          "Can't convert between units. Update nutrition values manually or convert with AI.",
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

  // Phase F: applyAiEstimate preserves the row's serving_size (no more
  // canonicalization to 1) and restores is_locked to the row's own
  // auto-scale preference (the prior incompatible-unit swap typically
  // cleared it temporarily).
  it('applyAiEstimate keeps the row serving_size and preserves a row-level auto-scale opt-out', async () => {
    mockAutoScaleOnlineImports = true;
    const initialVariants = [
      createVariant({ serving_size: 50, calories: 200 }),
    ];

    const { result } = renderHook(() =>
      useCustomFoodForm({
        initialVariants,
        onSave: jest.fn(),
      })
    );

    await waitFor(() => {
      expect(result.current.variants[0]?.is_locked).toBe(true);
    });

    // Add a new variant row that the user will set to an incompatible unit.
    act(() => {
      result.current.addVariant();
    });
    act(() => {
      result.current.updateVariant(1, 'serving_size', 2);
    });
    act(() => {
      result.current.updateVariant(1, 'serving_unit', 'cup');
    });

    // Sanity: the cup row exists with no scaling yet. (A brand-new row has
    // no trusted compatibility base, so manualUnitConversionPending stays
    // false even for an incompatible swap — AI fires off the default anchor.)
    expect(result.current.variants[1]?.serving_unit).toBe('cup');
    expect(result.current.variants[1]?.serving_size).toBe(2);

    // AI estimates "2 cup → ?g" → returns 240g. Default row (50g, 200cal)
    // is the anchor: ratio = 240 / 50 = 4.8 → calories = 200 * 4.8 = 960.
    act(() => {
      result.current.applyAiEstimate(1, {
        estimatedAmount: 240,
        confidence: 'medium',
        reasoning: 'Typical density estimate.',
      });
    });

    // serving_size preserved at 2 (not canonicalized to 1).
    expect(result.current.variants[1]?.serving_size).toBe(2);
    expect(result.current.variants[1]?.serving_unit).toBe('cup');
    expect(result.current.variants[1]?.calories).toBeCloseTo(960, 1);
    // AI provenance stamped.
    expect(result.current.variants[1]?.source).toBe('ai_estimate');
    expect(result.current.variants[1]?.ai_confidence).toBe('medium');
    // New rows start with auto-scale off, so AI apply should preserve that
    // row-level opt-out instead of snapping back to the global default.
    expect(result.current.variants[1]?.is_locked).toBe(false);
    // Manual-update flag cleared — AI satisfied the conversion.
    expect(result.current.manualUnitConversionPending[1]).toBe(false);
  });

  it('applyAiEstimate preserves a row-level auto-scale opt-in when the user enabled it before estimating', async () => {
    mockAutoScaleOnlineImports = true;
    const initialVariants = [
      createVariant({ serving_size: 50, calories: 200 }),
    ];

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
      result.current.addVariant();
    });

    expect(result.current.variants[1]?.is_locked).toBe(false);

    act(() => {
      result.current.updateVariant(1, 'is_locked', true);
    });
    act(() => {
      result.current.updateVariant(1, 'serving_size', 2);
    });
    act(() => {
      result.current.updateVariant(1, 'serving_unit', 'cup');
    });

    act(() => {
      result.current.applyAiEstimate(1, {
        estimatedAmount: 240,
        confidence: 'medium',
        reasoning: 'Typical density estimate.',
      });
    });

    expect(result.current.variants[1]?.serving_size).toBe(2);
    expect(result.current.variants[1]?.serving_unit).toBe('cup');
    expect(result.current.variants[1]?.source).toBe('ai_estimate');
    expect(result.current.variants[1]?.is_locked).toBe(true);
    expect(result.current.manualUnitConversionPending[1]).toBe(false);
  });

  it('restores the exact saved AI variant when selecting a persisted AI unit', async () => {
    const initialVariants = createPersistedVariantFixture();

    const { result } = renderHook(() =>
      useCustomFoodForm({
        initialVariants,
        onSave: jest.fn(),
      })
    );

    await waitFor(() => {
      expect(result.current.variants).toHaveLength(2);
    });

    act(() => {
      result.current.addVariant();
    });
    act(() => {
      result.current.updateVariant(2, 'serving_size', 2);
    });
    act(() => {
      result.current.updateVariant(2, 'serving_unit', 'cup');
    });

    expect(result.current.variants[2]?.source).toBe('ai_estimate');
    expect(result.current.variants[2]?.ai_confidence).toBe('medium');
    expect(result.current.variants[2]?.serving_size).toBe(1);
    expect(Number(result.current.variants[2]?.calories)).toBeCloseTo(260, 4);
    expect(result.current.manualUnitConversionPending[2]).toBe(false);
    expect(result.current.aiEstimatedUnits[2]).toBe('cup');
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('restores the exact saved manual variant when selecting the persisted original unit', async () => {
    const initialVariants = createPersistedVariantFixture();

    const { result } = renderHook(() =>
      useCustomFoodForm({
        initialVariants,
        onSave: jest.fn(),
      })
    );

    await waitFor(() => {
      expect(result.current.variants).toHaveLength(2);
    });

    act(() => {
      result.current.addVariant();
    });
    act(() => {
      result.current.updateVariant(2, 'serving_size', 200);
    });
    act(() => {
      result.current.updateVariant(2, 'serving_unit', 'piece');
    });
    act(() => {
      result.current.updateVariant(2, 'serving_unit', 'g');
    });

    expect(result.current.variants[2]?.source).toBe('manual');
    expect(result.current.variants[2]?.ai_confidence).toBeNull();
    expect(result.current.variants[2]?.ai_reasoning).toBeNull();
    expect(result.current.variants[2]?.serving_size).toBe(100);
    expect(Number(result.current.variants[2]?.calories)).toBeCloseTo(100, 4);
    expect(result.current.manualUnitConversionPending[2]).toBe(false);
    expect(result.current.aiEstimatedUnits[2]).toBeNull();
  });

  it('uses a trusted manual donor category directly from a duplicated AI row without needing an intermediate click', async () => {
    const initialVariants = createPersistedVariantFixture();

    const { result } = renderHook(() =>
      useCustomFoodForm({
        initialVariants,
        onSave: jest.fn(),
      })
    );

    await waitFor(() => {
      expect(result.current.variants).toHaveLength(2);
    });

    act(() => {
      result.current.duplicateVariant(1);
    });

    expect(result.current.variants[2]?.source).toBe('ai_estimate');

    act(() => {
      result.current.updateVariant(2, 'serving_unit', 'oz');
    });

    expect(result.current.variants[2]?.serving_unit).toBe('oz');
    expect(result.current.variants[2]?.source).toBe('manual');
    expect(result.current.variants[2]?.ai_confidence).toBeNull();
    expect(result.current.aiEstimatedUnits[2]).toBeNull();
    expect(result.current.manualUnitConversionPending[2]).toBe(false);
  });

  it('falls back to the manual-update path when no persisted donor exists', async () => {
    mockAutoScaleOnlineImports = true;
    const initialVariants = createPersistedVariantFixture();

    const { result } = renderHook(() =>
      useCustomFoodForm({
        initialVariants,
        onSave: jest.fn(),
      })
    );

    await waitFor(() => {
      expect(result.current.variants).toHaveLength(2);
    });

    act(() => {
      result.current.duplicateVariant(0);
    });
    act(() => {
      result.current.updateVariant(2, 'serving_unit', 'tsp');
    });

    expect(result.current.variants[2]?.source).toBe('manual');
    expect(result.current.variants[2]?.serving_unit).toBe('tsp');
    expect(result.current.manualUnitConversionPending[2]).toBe(true);
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        description:
          "Can't convert between units. Update nutrition values manually or convert with AI.",
      })
    );
  });

  it('keeps the AI suffix in the toast when a trusted manual row detours through another incompatible unit first', async () => {
    mockAutoScaleOnlineImports = true;
    const initialVariants = [
      createVariant({ id: 'variant-g', is_default: true }),
    ];

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
      result.current.updateVariant(0, 'serving_unit', 'piece');
    });
    act(() => {
      result.current.updateVariant(0, 'serving_unit', 'cup');
    });

    expect(mockToast).toHaveBeenLastCalledWith(
      expect.objectContaining({
        description:
          "Can't convert between units. Update nutrition values manually or convert with AI.",
      })
    );
  });

  // Once a row has been AI-estimated, any unit swap (compatible OR
  // incompatible) keeps the AI tag and suppresses scaling. The user's rule:
  // sibling units in the same category should be AI-estimated independently
  // rather than math-derived from an AI value — otherwise it gets unclear
  // what's "real" vs "AI" in the form.
  it('keeps the AI tag and suppresses scaling when the AI row is swapped to a math-compatible unit', async () => {
    const initialVariants = [
      createVariant({ serving_size: 50, calories: 200 }),
    ];

    const { result } = renderHook(() =>
      useCustomFoodForm({
        initialVariants,
        onSave: jest.fn(),
      })
    );

    await waitFor(() => {
      expect(result.current.variants).toHaveLength(1);
    });

    act(() => {
      result.current.addVariant();
    });
    act(() => {
      result.current.updateVariant(1, 'is_locked', true);
    });
    act(() => {
      result.current.updateVariant(1, 'serving_unit', 'cup');
    });
    act(() => {
      result.current.applyAiEstimate(1, {
        estimatedAmount: 240,
        confidence: 'high',
        reasoning: 'Water-like density.',
      });
    });

    expect(result.current.variants[1]?.source).toBe('ai_estimate');
    const cupCalories = Number(result.current.variants[1]?.calories ?? 0);
    expect(cupCalories).toBeGreaterThan(0);

    // Swap to a sibling-compatible unit (tsp). Math could derive this, but we
    // intentionally don't — AI rows isolate themselves so subsequent units
    // are also AI-estimated rather than math-derived from the AI value.
    act(() => {
      result.current.updateVariant(1, 'serving_unit', 'tsp');
    });

    expect(result.current.variants[1]?.serving_unit).toBe('tsp');
    // AI tag preserved.
    expect(result.current.variants[1]?.source).toBe('ai_estimate');
    expect(result.current.variants[1]?.ai_confidence).toBe('high');
    // Nutrition unchanged — no math scaling on AI rows.
    expect(Number(result.current.variants[1]?.calories)).toBe(cupCalories);
    // Pending so the AI button can re-offer for the new unit.
    expect(result.current.manualUnitConversionPending[1]).toBe(true);
  });

  // Swapping the AI row back to its originally-estimated unit recognizes the
  // round-trip and clears the pending-conversion state, so the user isn't
  // prompted to re-run AI for a unit it already has an estimate for.
  it('clears pending state when the AI row is swapped back to the originally-estimated unit', async () => {
    const initialVariants = [
      createVariant({ serving_size: 50, calories: 200 }),
    ];

    const { result } = renderHook(() =>
      useCustomFoodForm({
        initialVariants,
        onSave: jest.fn(),
      })
    );

    await waitFor(() => {
      expect(result.current.variants).toHaveLength(1);
    });

    act(() => {
      result.current.addVariant();
    });
    act(() => {
      result.current.updateVariant(1, 'is_locked', true);
    });
    act(() => {
      result.current.updateVariant(1, 'serving_unit', 'cup');
    });
    act(() => {
      result.current.applyAiEstimate(1, {
        estimatedAmount: 240,
        confidence: 'medium',
        reasoning: 'Typical density.',
      });
    });

    const aiCupCalories = Number(result.current.variants[1]?.calories ?? 0);

    // Swap away to a different unit, then back to the AI-estimated unit.
    act(() => {
      result.current.updateVariant(1, 'serving_unit', 'tsp');
    });
    expect(result.current.manualUnitConversionPending[1]).toBe(true);

    act(() => {
      result.current.updateVariant(1, 'serving_unit', 'cup');
    });

    expect(result.current.variants[1]?.serving_unit).toBe('cup');
    expect(result.current.variants[1]?.source).toBe('ai_estimate');
    expect(result.current.variants[1]?.ai_confidence).toBe('medium');
    expect(Number(result.current.variants[1]?.calories)).toBe(aiCupCalories);
    // Pending cleared — the row is back to its known AI state.
    expect(result.current.manualUnitConversionPending[1]).toBe(false);
  });

  // The AI estimate anchors ALWAYS on the food's default variant, never on
  // the row's prior state. Stops AI estimates from compounding on themselves
  // (AI cup → 240g, then AI tbsp scaled from the AI cup → double error).
  it('anchors AI estimate on the default variant even when the row already has a prior state', async () => {
    const initialVariants = [
      createVariant({ serving_size: 100, calories: 400 }),
    ];

    const { result } = renderHook(() =>
      useCustomFoodForm({
        initialVariants,
        onSave: jest.fn(),
      })
    );

    await waitFor(() => {
      expect(result.current.variants).toHaveLength(1);
    });

    act(() => {
      result.current.addVariant();
    });
    act(() => {
      result.current.updateVariant(1, 'serving_unit', 'cup');
    });
    act(() => {
      result.current.applyAiEstimate(1, {
        estimatedAmount: 240,
        confidence: 'medium',
        reasoning: 'First estimate.',
      });
    });

    // The cup row carries a non-trivial AI value. Now swap to another
    // incompatible unit (tbsp) and re-estimate. If the anchor were the row's
    // prior state (AI cup), the result would compound. With default-anchored
    // estimation it scales cleanly from the 100g/400cal baseline.
    act(() => {
      result.current.updateVariant(1, 'serving_unit', 'tbsp');
    });
    act(() => {
      result.current.applyAiEstimate(1, {
        estimatedAmount: 15,
        confidence: 'medium',
        reasoning: 'Second estimate.',
      });
    });

    // 15 g (estimated) / 100 g (default) × 400 cal = 60 cal.
    expect(Number(result.current.variants[1]?.calories)).toBeCloseTo(60, 1);
    expect(result.current.variants[1]?.source).toBe('ai_estimate');
    expect(result.current.variants[1]?.ai_reasoning).toBe('Second estimate.');
  });

  it('keeps the AI tag and suppresses scaling when the AI row is swapped to an incompatible unit', async () => {
    const initialVariants = [
      createVariant({ serving_size: 50, calories: 200 }),
    ];

    const { result } = renderHook(() =>
      useCustomFoodForm({
        initialVariants,
        onSave: jest.fn(),
      })
    );

    await waitFor(() => {
      expect(result.current.variants).toHaveLength(1);
    });

    act(() => {
      result.current.addVariant();
    });
    act(() => {
      result.current.updateVariant(1, 'serving_unit', 'cup');
    });
    act(() => {
      result.current.applyAiEstimate(1, {
        estimatedAmount: 240,
        confidence: 'high',
        reasoning: 'Water-like density.',
      });
    });

    const cupCalories = result.current.variants[1]?.calories;
    expect(result.current.variants[1]?.source).toBe('ai_estimate');

    // Incompatible swap with no donor: cup (volume) → piece (count). AI
    // estimate stays until the user resolves the manual update.
    act(() => {
      result.current.updateVariant(1, 'serving_unit', 'piece');
    });

    expect(result.current.variants[1]?.serving_unit).toBe('piece');
    expect(result.current.variants[1]?.source).toBe('ai_estimate');
    expect(result.current.variants[1]?.ai_confidence).toBe('high');
    // Nutrition unchanged — math isn't a valid basis here, so we don't scale.
    expect(result.current.variants[1]?.calories).toBe(cupCalories);
    expect(result.current.manualUnitConversionPending[1]).toBe(true);
  });

  it('shows a manual-only toast and disables auto-scale for AI rows swapped to non-AI-convertible units', async () => {
    mockAutoScaleOnlineImports = true;
    const initialVariants = createPersistedVariantFixture();

    const { result } = renderHook(() =>
      useCustomFoodForm({
        initialVariants,
        onSave: jest.fn(),
      })
    );

    await waitFor(() => {
      expect(result.current.variants[1]?.is_locked).toBe(true);
    });

    act(() => {
      result.current.updateVariant(1, 'serving_unit', 'piece');
    });

    expect(result.current.variants[1]?.is_locked).toBe(false);
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        description:
          "Can't convert between units. Update nutrition values manually.",
      })
    );
  });

  it('keeps auto-scale on and offers AI when an AI row is swapped to an AI-convertible unit without a donor', async () => {
    mockAutoScaleOnlineImports = true;
    const initialVariants = [
      createVariant({
        id: 'variant-cup-ai',
        serving_size: 1,
        serving_unit: 'cup',
        calories: 260,
        protein: 26,
        carbs: 52,
        fat: 13,
        is_default: true,
        source: 'ai_estimate',
        ai_confidence: 'medium',
        ai_reasoning: 'Typical density estimate.',
      }),
    ];

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
      result.current.updateVariant(0, 'serving_unit', 'g');
    });

    expect(result.current.variants[0]?.is_locked).toBe(true);
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        description:
          "Can't convert between units. Update nutrition values manually or convert with AI.",
      })
    );
  });

  it('does not show a second toast when an AI row is swapped away and then back to its saved unit', async () => {
    const initialVariants = [
      createVariant({
        id: 'variant-cup-ai',
        serving_size: 1,
        serving_unit: 'cup',
        calories: 260,
        protein: 26,
        carbs: 52,
        fat: 13,
        is_default: true,
        source: 'ai_estimate',
        ai_confidence: 'medium',
        ai_reasoning: 'Typical density estimate.',
      }),
    ];

    const { result } = renderHook(() =>
      useCustomFoodForm({
        initialVariants,
        onSave: jest.fn(),
      })
    );

    await waitFor(() => {
      expect(result.current.variants).toHaveLength(1);
    });

    act(() => {
      result.current.updateVariant(0, 'serving_unit', 'tsp');
    });
    act(() => {
      result.current.updateVariant(0, 'serving_unit', 'cup');
    });

    expect(mockToast).toHaveBeenCalledTimes(1);
  });

  it('turns auto-scale off for manual rows swapped to non-AI-convertible incompatible units', async () => {
    mockAutoScaleOnlineImports = true;
    const initialVariants = [
      createVariant({ id: 'variant-g', is_default: true }),
    ];

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
      result.current.updateVariant(0, 'serving_unit', 'piece');
    });

    expect(result.current.variants[0]?.is_locked).toBe(false);
  });

  it('keeps auto-scale on for manual rows swapped to AI-convertible incompatible units', async () => {
    mockAutoScaleOnlineImports = true;
    const initialVariants = [
      createVariant({ id: 'variant-g', is_default: true }),
    ];

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
      result.current.updateVariant(0, 'serving_unit', 'cup');
    });

    expect(result.current.variants[0]?.is_locked).toBe(true);
  });

  it('keeps manual rows manual when another persisted row is AI-estimated', async () => {
    const initialVariants = createPersistedVariantFixture();

    const { result } = renderHook(() =>
      useCustomFoodForm({
        initialVariants,
        onSave: jest.fn(),
      })
    );

    await waitFor(() => {
      expect(result.current.variants).toHaveLength(2);
    });

    act(() => {
      result.current.updateVariant(0, 'serving_unit', 'oz');
    });

    expect(result.current.variants[0]?.source).toBe('manual');
    expect(result.current.variants[0]?.ai_confidence).toBeNull();
    expect(result.current.variants[0]?.ai_reasoning).toBeNull();
  });

  it('clears the AI badge again when a row visits a saved AI unit and then switches to a trusted manual category', async () => {
    const initialVariants = createPersistedVariantFixture();

    const { result } = renderHook(() =>
      useCustomFoodForm({
        initialVariants,
        onSave: jest.fn(),
      })
    );

    await waitFor(() => {
      expect(result.current.variants).toHaveLength(2);
    });

    act(() => {
      result.current.updateVariant(0, 'serving_unit', 'cup');
    });

    expect(result.current.variants[0]?.source).toBe('ai_estimate');

    act(() => {
      result.current.updateVariant(0, 'serving_unit', 'oz');
    });

    expect(result.current.variants[0]?.serving_unit).toBe('oz');
    expect(result.current.variants[0]?.source).toBe('manual');
    expect(result.current.variants[0]?.ai_confidence).toBeNull();
    expect(result.current.aiEstimatedUnits[0]).toBeNull();
  });

  it('drops AI provenance immediately when a nutrient field is manually edited', async () => {
    const initialVariants = [
      createVariant({ serving_size: 50, calories: 200 }),
    ];

    const { result } = renderHook(() =>
      useCustomFoodForm({
        initialVariants,
        onSave: jest.fn(),
      })
    );

    await waitFor(() => {
      expect(result.current.variants).toHaveLength(1);
    });

    act(() => {
      result.current.addVariant();
    });
    act(() => {
      result.current.updateVariant(1, 'serving_unit', 'cup');
    });
    act(() => {
      result.current.applyAiEstimate(1, {
        estimatedAmount: 240,
        confidence: 'medium',
        reasoning: 'Typical dairy density.',
      });
    });

    expect(result.current.variants[1]?.source).toBe('ai_estimate');

    act(() => {
      result.current.updateVariant(1, 'calories', 800);
    });

    expect(result.current.variants[1]?.calories).toBe(800);
    expect(result.current.variants[1]?.source).toBe('manual');
    expect(result.current.variants[1]?.ai_confidence).toBeNull();
    expect(result.current.variants[1]?.ai_reasoning).toBeNull();
    expect(result.current.aiEstimatedUnits[1]).toBeNull();
  });

  it('keeps the AI badge and scales from the AI result when serving_size changes after an AI estimate', async () => {
    mockAutoScaleOnlineImports = true;
    const initialVariants = [
      createVariant({ serving_size: 50, calories: 200 }),
    ];

    const { result } = renderHook(() =>
      useCustomFoodForm({
        initialVariants,
        onSave: jest.fn(),
      })
    );

    await waitFor(() => {
      expect(result.current.variants).toHaveLength(1);
    });

    act(() => {
      result.current.addVariant();
    });
    act(() => {
      result.current.updateVariant(1, 'is_locked', true);
    });
    act(() => {
      result.current.updateVariant(1, 'serving_unit', 'cup');
    });
    act(() => {
      result.current.applyAiEstimate(1, {
        estimatedAmount: 240,
        confidence: 'high',
        reasoning: 'Typical density estimate.',
      });
    });
    act(() => {
      result.current.updateVariant(1, 'serving_size', 3);
    });

    expect(result.current.variants[1]?.source).toBe('ai_estimate');
    expect(result.current.variants[1]?.is_locked).toBe(true);
    expect(result.current.variants[1]?.serving_unit).toBe('cup');
    expect(result.current.variants[1]?.serving_size).toBe(3);
    expect(result.current.variants[1]?.calories).toBeCloseTo(2880, 1);
    expect(result.current.variants[1]?.ai_confidence).toBe('high');
    expect(result.current.variants[1]?.ai_reasoning).toBe(
      'Typical density estimate.'
    );
    expect(result.current.aiEstimatedUnits[1]).toBe('cup');
  });

  it('saves immediately after manual AI nutrition edits with manual provenance', async () => {
    const onSave = jest.fn();
    const initialVariants = [
      createVariant({ serving_size: 50, calories: 200, is_default: true }),
    ];

    const { result } = renderHook(() =>
      useCustomFoodForm({
        initialVariants,
        onSave,
      })
    );

    await waitFor(() => {
      expect(result.current.variants).toHaveLength(1);
    });

    act(() => {
      result.current.addVariant();
    });
    act(() => {
      result.current.updateVariant(1, 'serving_unit', 'cup');
    });
    act(() => {
      result.current.applyAiEstimate(1, {
        estimatedAmount: 240,
        confidence: 'medium',
        reasoning: 'Typical density estimate.',
      });
    });
    act(() => {
      result.current.updateVariant(1, 'calories', 800);
    });
    act(() => {
      result.current.updateField('name', 'Greek Yogurt');
    });

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: jest.fn(),
      } as any);
    });

    expect(mockSaveFood).toHaveBeenCalledWith(
      expect.objectContaining({
        variants: expect.arrayContaining([
          expect.objectContaining({
            serving_unit: 'cup',
            source: 'manual',
            ai_confidence: null,
            ai_reasoning: null,
          }),
        ]),
      })
    );
  });
});
