import { act, renderHook } from '@testing-library/react';
import { useUnitConversion } from '@/hooks/Foods/useUnitConversion';
import { getConversionFactor } from '@workspace/shared';
import type { FoodVariant } from '@/types/food';

const createVariant = (overrides: Partial<FoodVariant>): FoodVariant => ({
  id: 'variant-id',
  serving_size: 1,
  serving_unit: 'g',
  calories: 10,
  protein: 1,
  carbs: 1,
  fat: 1,
  custom_nutrients: {},
  ...overrides,
});

describe('useUnitConversion', () => {
  const onVariantSelect = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('falls back to a compatible saved variant when the selected unit is incompatible', () => {
    const gramsVariant = createVariant({
      id: 'grams',
      serving_size: 10,
      serving_unit: 'g',
    });
    const tbspVariant = createVariant({
      id: 'tbsp',
      serving_size: 1,
      serving_unit: 'tbsp',
    });

    const { result } = renderHook(() =>
      useUnitConversion({
        variants: [gramsVariant, tbspVariant],
        selectedVariant: gramsVariant,
        onVariantSelect,
      })
    );

    act(() => {
      result.current.handleUnitChange('tsp');
    });

    expect(result.current.conversionBaseVariant).toBe(tbspVariant);
    expect(result.current.autoConversionFactor).toBeCloseTo(
      getConversionFactor('tbsp', 'tsp') ?? 0,
      5
    );
    expect(result.current.pendingUnit).toBe('tsp');
  });

  it('uses the first compatible saved variant for other compatible volume targets', () => {
    const gramsVariant = createVariant({
      id: 'grams',
      serving_size: 10,
      serving_unit: 'g',
    });
    const tbspVariant = createVariant({
      id: 'tbsp',
      serving_size: 1,
      serving_unit: 'tbsp',
    });

    const { result } = renderHook(() =>
      useUnitConversion({
        variants: [gramsVariant, tbspVariant],
        selectedVariant: gramsVariant,
        onVariantSelect,
      })
    );

    act(() => {
      result.current.handleUnitChange('ml');
    });

    expect(result.current.conversionBaseVariant).toBe(tbspVariant);
    expect(result.current.autoConversionFactor).toBeCloseTo(
      getConversionFactor('tbsp', 'ml') ?? 0,
      5
    );
  });

  it('skips AI-estimated variants when choosing an auto-conversion source', () => {
    const gramsVariant = createVariant({
      id: 'grams',
      serving_size: 10,
      serving_unit: 'g',
    });
    const aiTbspVariant = createVariant({
      id: 'tbsp-ai',
      serving_size: 1,
      serving_unit: 'tbsp',
      source: 'ai_estimate',
      ai_confidence: 'medium',
    });

    const { result } = renderHook(() =>
      useUnitConversion({
        variants: [gramsVariant, aiTbspVariant],
        selectedVariant: gramsVariant,
        onVariantSelect,
      })
    );

    act(() => {
      result.current.handleUnitChange('tsp');
    });

    expect(result.current.conversionBaseVariant).toBe(gramsVariant);
    expect(result.current.autoConversionFactor).toBeNull();
  });

  it('disables auto-conversion entirely when the selected variant is AI-estimated', () => {
    const gramsVariant = createVariant({
      id: 'grams',
      serving_size: 10,
      serving_unit: 'g',
    });
    const aiCupVariant = createVariant({
      id: 'cup-ai',
      serving_size: 1,
      serving_unit: 'cup',
      source: 'ai_estimate',
      ai_confidence: 'high',
    });

    const { result } = renderHook(() =>
      useUnitConversion({
        variants: [gramsVariant, aiCupVariant],
        selectedVariant: aiCupVariant,
        onVariantSelect,
      })
    );

    act(() => {
      result.current.handleUnitChange('tbsp');
    });

    expect(result.current.conversionBaseVariant).toBe(aiCupVariant);
    expect(result.current.autoConversionFactor).toBeNull();
  });

  it('keeps the manual conversion flow when no compatible saved variant exists', () => {
    const gramsVariant = createVariant({
      id: 'grams',
      serving_size: 10,
      serving_unit: 'g',
    });
    const pieceVariant = createVariant({
      id: 'piece',
      serving_size: 1,
      serving_unit: 'piece',
    });

    const { result } = renderHook(() =>
      useUnitConversion({
        variants: [gramsVariant, pieceVariant],
        selectedVariant: gramsVariant,
        onVariantSelect,
      })
    );

    act(() => {
      result.current.handleUnitChange('tsp');
    });

    expect(result.current.conversionBaseVariant).toBe(gramsVariant);
    expect(result.current.autoConversionFactor).toBeNull();
    expect(result.current.conversionFactor).toBe('');
    expect(result.current.buildConvertedVariant()).toBeNull();
    expect(result.current.pendingUnit).toBe('tsp');
  });

  it('enables manual conversion only for the exact pending unit and clears it on unit switch', () => {
    const gramsVariant = createVariant({
      id: 'grams',
      serving_size: 10,
      serving_unit: 'g',
      calories: 50,
    });

    const { result } = renderHook(() =>
      useUnitConversion({
        variants: [gramsVariant],
        selectedVariant: gramsVariant,
        onVariantSelect,
      })
    );

    act(() => {
      result.current.handleUnitChange('tsp');
    });

    expect(result.current.buildConvertedVariant()).toBeNull();

    act(() => {
      result.current.setConversionFactor(4.2);
    });

    expect(result.current.buildConvertedVariant()).toMatchObject({
      serving_unit: 'tsp',
      serving_size: 1,
    });

    act(() => {
      result.current.handleUnitChange('tbsp');
    });

    expect(result.current.pendingUnit).toBe('tbsp');
    expect(result.current.conversionFactor).toBe('');
    expect(result.current.autoConversionFactor).toBeNull();
    expect(result.current.buildConvertedVariant()).toBeNull();
  });

  it('keeps the selected compatible variant ahead of fallback variants', () => {
    const gramsVariant = createVariant({
      id: 'grams',
      serving_size: 10,
      serving_unit: 'g',
    });
    const cupVariant = createVariant({
      id: 'cup',
      serving_size: 1,
      serving_unit: 'cup',
    });
    const tbspVariant = createVariant({
      id: 'tbsp',
      serving_size: 1,
      serving_unit: 'tbsp',
    });

    const { result } = renderHook(() =>
      useUnitConversion({
        variants: [gramsVariant, cupVariant, tbspVariant],
        selectedVariant: tbspVariant,
        onVariantSelect,
      })
    );

    act(() => {
      result.current.handleUnitChange('tsp');
    });

    expect(result.current.conversionBaseVariant).toBe(tbspVariant);
    expect(result.current.autoConversionFactor).toBeCloseTo(
      getConversionFactor('tbsp', 'tsp') ?? 0,
      5
    );
  });

  it('requires a positive factor before building a custom unit variant', () => {
    const gramsVariant = createVariant({
      id: 'grams',
      serving_size: 10,
      serving_unit: 'g',
    });

    const { result } = renderHook(() =>
      useUnitConversion({
        variants: [gramsVariant],
        selectedVariant: gramsVariant,
        onVariantSelect,
      })
    );

    act(() => {
      result.current.handleUnitChange('__custom__');
      result.current.setPendingUnit('scoop');
    });

    expect(result.current.buildConvertedVariant()).toBeNull();

    act(() => {
      result.current.setConversionFactor(15);
    });

    expect(result.current.buildConvertedVariant()).toMatchObject({
      serving_unit: 'scoop',
      serving_size: 1,
    });
  });

  it('stamps AI provenance on the built variant when an estimate is accepted', () => {
    const gramsVariant = createVariant({
      id: 'grams',
      serving_size: 10,
      serving_unit: 'g',
      calories: 50,
    });

    const { result } = renderHook(() =>
      useUnitConversion({
        variants: [gramsVariant],
        selectedVariant: gramsVariant,
        onVariantSelect,
      })
    );

    // Pick an incompatible standard unit — no auto factor, no manual factor yet.
    act(() => {
      result.current.handleUnitChange('cup');
    });
    expect(result.current.aiEstimateData).toBeNull();
    expect(result.current.buildConvertedVariant()).toBeNull();

    // Simulate AiEstimateSection's "Use this" handler.
    act(() => {
      result.current.setAiEstimateData({
        estimatedAmount: 240,
        confidence: 'medium',
        reasoning: 'Typical dairy density ~1 g/ml × 240 ml ≈ 240 g.',
      });
    });

    // Accepting an estimate fills the factor input.
    expect(result.current.conversionFactor).toBe(240);

    const built = result.current.buildConvertedVariant();
    expect(built).toMatchObject({
      serving_size: 1,
      serving_unit: 'cup',
      source: 'ai_estimate',
      ai_confidence: 'medium',
      ai_reasoning: 'Typical dairy density ~1 g/ml × 240 ml ≈ 240 g.',
    });

    // Edit affordance: clearing the estimate keeps the factor but removes AI tag.
    act(() => {
      result.current.setAiEstimateData(null);
    });
    expect(result.current.conversionFactor).toBe(240); // factor preserved
    const manualBuilt = result.current.buildConvertedVariant();
    expect(manualBuilt).toMatchObject({ serving_unit: 'cup' });
    expect(manualBuilt?.source).toBeUndefined();
    expect(manualBuilt?.ai_confidence).toBeUndefined();
    expect(manualBuilt?.ai_reasoning).toBeUndefined();
  });

  it('clears aiEstimateData when the pending unit changes', () => {
    const gramsVariant = createVariant({
      id: 'grams',
      serving_size: 10,
      serving_unit: 'g',
    });

    const { result } = renderHook(() =>
      useUnitConversion({
        variants: [gramsVariant],
        selectedVariant: gramsVariant,
        onVariantSelect,
      })
    );

    act(() => {
      result.current.handleUnitChange('cup');
      result.current.setAiEstimateData({
        estimatedAmount: 240,
        confidence: 'high',
        reasoning: 'x',
      });
    });
    expect(result.current.aiEstimateData).not.toBeNull();

    act(() => {
      result.current.handleUnitChange('tbsp');
    });
    expect(result.current.aiEstimateData).toBeNull();
  });
});
