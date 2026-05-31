import { renderHook } from '@testing-library/react-native';
import {
  resolveAutoConversionSource,
  useUnitConversion,
} from '../../src/hooks/useUnitConversion';
import { getConversionFactor } from '@workspace/shared';
import type { FoodUnitVariant } from '../../src/types/foodUnitVariants';

const createVariant = (
  overrides: Partial<FoodUnitVariant>,
): FoodUnitVariant => ({
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
  it('builds a converted variant from a compatible fallback saved unit', () => {
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
      }),
    );

    expect(result.current.buildConvertedVariant('tsp')).toMatchObject({
      serving_size: 1,
      serving_unit: 'tsp',
    });
    expect(
      resolveAutoConversionSource([gramsVariant, tbspVariant], gramsVariant, 'tsp'),
    ).toEqual({
      baseVariant: tbspVariant,
      factor: getConversionFactor('tbsp', 'tsp'),
    });
  });

  it('normalizes weight conversions to a 1-unit serving like web does', () => {
    const gramsVariant = createVariant({
      id: 'grams',
      serving_size: 100,
      serving_unit: 'g',
      calories: 250,
      protein: 20,
      carbs: 10,
      fat: 5,
    });

    const { result } = renderHook(() =>
      useUnitConversion({
        variants: [gramsVariant],
        selectedVariant: gramsVariant,
      }),
    );

    const convertedVariant = result.current.buildConvertedVariant('oz');

    expect(convertedVariant).toMatchObject({
      serving_size: 1,
      serving_unit: 'oz',
    });
    expect(convertedVariant?.calories).toBeCloseTo(
      250 * ((getConversionFactor('g', 'oz') ?? 0) / 100),
      5,
    );
    expect(convertedVariant?.protein).toBeCloseTo(
      20 * ((getConversionFactor('g', 'oz') ?? 0) / 100),
      5,
    );
  });

  it('normalizes volume conversions to a 1-unit serving like web does', () => {
    const millilitersVariant = createVariant({
      id: 'milliliters',
      serving_size: 100,
      serving_unit: 'ml',
      calories: 60,
      protein: 3,
      carbs: 9,
      fat: 1,
    });

    const { result } = renderHook(() =>
      useUnitConversion({
        variants: [millilitersVariant],
        selectedVariant: millilitersVariant,
      }),
    );

    const convertedVariant = result.current.buildConvertedVariant('cup');

    expect(convertedVariant).toMatchObject({
      serving_size: 1,
      serving_unit: 'cup',
    });
    expect(convertedVariant?.calories).toBeCloseTo(
      60 * ((getConversionFactor('ml', 'cup') ?? 0) / 100),
      5,
    );
    expect(convertedVariant?.carbs).toBeCloseTo(
      9 * ((getConversionFactor('ml', 'cup') ?? 0) / 100),
      5,
    );
  });

  it('uses the selected compatible variant ahead of fallback variants', () => {
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
      calories: 24,
    });

    const { result } = renderHook(() =>
      useUnitConversion({
        variants: [gramsVariant, cupVariant, tbspVariant],
        selectedVariant: tbspVariant,
      }),
    );

    const convertedVariant = result.current.buildConvertedVariant('tsp');
    expect(convertedVariant).toMatchObject({
      serving_size: 1,
      serving_unit: 'tsp',
    });
    expect(convertedVariant?.calories).toBeCloseTo(8, 4);
  });

  it('returns null when no compatible saved variant exists', () => {
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
      }),
    );

    expect(result.current.buildConvertedVariant('tsp')).toBeNull();
  });

  it('skips AI-estimated variants as auto-convert sources', () => {
    const gramsVariant = createVariant({
      id: 'grams',
      serving_size: 10,
      serving_unit: 'g',
    });
    const aiTbspVariant = createVariant({
      id: 'ai-tbsp',
      serving_size: 1,
      serving_unit: 'tbsp',
      source: 'ai_estimate',
      ai_confidence: 'medium',
    });

    const { result } = renderHook(() =>
      useUnitConversion({
        variants: [gramsVariant, aiTbspVariant],
        selectedVariant: gramsVariant,
      }),
    );

    expect(
      resolveAutoConversionSource([gramsVariant, aiTbspVariant], gramsVariant, 'tsp'),
    ).toBeNull();
    expect(result.current.buildConvertedVariant('tsp')).toBeNull();
  });

  it('falls back to a non-AI sibling variant when the selected variant is AI-estimated', () => {
    // When the user has picked an AI variant (cup AI) but a sibling manual
    // variant (tbsp) exists, auto-convert should still work via the manual
    // donor — that's how a math-compatible target unit (tsp) keeps a green
    // checkmark in the dropdown. The AI variant itself is skipped as a
    // donor, but non-AI siblings are still valid math sources.
    const aiCupVariant = createVariant({
      id: 'ai-cup',
      serving_size: 1,
      serving_unit: 'cup',
      source: 'ai_estimate',
      ai_confidence: 'high',
    });
    const tbspVariant = createVariant({
      id: 'tbsp',
      serving_size: 1,
      serving_unit: 'tbsp',
      calories: 24,
    });

    const { result } = renderHook(() =>
      useUnitConversion({
        variants: [aiCupVariant, tbspVariant],
        selectedVariant: aiCupVariant,
      }),
    );

    const resolved = resolveAutoConversionSource(
      [aiCupVariant, tbspVariant],
      aiCupVariant,
      'tsp',
    );
    expect(resolved?.baseVariant.id).toBe('tbsp');
    expect(result.current.buildConvertedVariant('tsp')).not.toBeNull();
  });

  it('still returns null when the only candidates are AI-estimated', () => {
    const aiCupVariant = createVariant({
      id: 'ai-cup',
      serving_size: 1,
      serving_unit: 'cup',
      source: 'ai_estimate',
      ai_confidence: 'high',
    });

    const { result } = renderHook(() =>
      useUnitConversion({
        variants: [aiCupVariant],
        selectedVariant: aiCupVariant,
      }),
    );

    expect(
      resolveAutoConversionSource([aiCupVariant], aiCupVariant, 'tsp'),
    ).toBeNull();
    expect(result.current.buildConvertedVariant('tsp')).toBeNull();
  });

  it('builds a manual-update variant that preserves the base nutrition values', () => {
    const gramsVariant = createVariant({
      id: 'grams',
      serving_size: 10,
      serving_unit: 'g',
      calories: 25,
      protein: 3,
      carbs: 4,
      fat: 2,
      custom_nutrients: { omega3: 5 },
    });

    const { result } = renderHook(() =>
      useUnitConversion({
        variants: [gramsVariant],
        selectedVariant: gramsVariant,
      }),
    );

    expect(result.current.buildManualVariant('cup')).toEqual({
      serving_size: 10,
      serving_unit: 'cup',
      calories: 25,
      protein: 3,
      carbs: 4,
      fat: 2,
      saturated_fat: 0,
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
      glycemic_index: gramsVariant.glycemic_index,
      custom_nutrients: { omega3: 5 },
    });
  });

  it('excludes existing units from the selectable conversion list', () => {
    const gramsVariant = createVariant({
      id: 'grams',
      serving_size: 100,
      serving_unit: 'g',
    });
    const ouncesVariant = createVariant({
      id: 'ounces',
      serving_size: 1,
      serving_unit: 'oz',
    });

    const { result } = renderHook(() =>
      useUnitConversion({
        variants: [gramsVariant, ouncesVariant],
        selectedVariant: gramsVariant,
      }),
    );

    expect(result.current.convertibleUnits).not.toContain('g');
    expect(result.current.convertibleUnits).not.toContain('oz');
    expect(result.current.convertibleUnits).toContain('kg');
  });
});
