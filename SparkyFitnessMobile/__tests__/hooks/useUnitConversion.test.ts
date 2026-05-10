import { renderHook } from '@testing-library/react-native';
import {
  resolveAutoConversionSource,
  useUnitConversion,
} from '../../src/hooks/useUnitConversion';
import { getConversionFactor } from '../../src/utils/servingSizeConversions';
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
