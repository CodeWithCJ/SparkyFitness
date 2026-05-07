import { act, renderHook } from '@testing-library/react-native';
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
      }),
    );

    act(() => {
      result.current.handleExistingUnitSelection('tsp');
    });

    expect(result.current.conversionBaseVariant).toBe(tbspVariant);
    expect(result.current.autoConversionFactor).toBeCloseTo(
      getConversionFactor('tbsp', 'tsp') ?? 0,
      5,
    );
    expect(result.current.pendingUnit).toBe('tsp');
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
    });

    const { result } = renderHook(() =>
      useUnitConversion({
        variants: [gramsVariant, cupVariant, tbspVariant],
        selectedVariant: tbspVariant,
      }),
    );

    act(() => {
      result.current.handleExistingUnitSelection('tsp');
    });

    expect(result.current.conversionBaseVariant).toBe(tbspVariant);
    expect(result.current.autoConversionFactor).toBeCloseTo(
      getConversionFactor('tbsp', 'tsp') ?? 0,
      5,
    );
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
      }),
    );

    act(() => {
      result.current.handleExistingUnitSelection('tsp');
    });

    expect(result.current.conversionBaseVariant).toBe(gramsVariant);
    expect(result.current.autoConversionFactor).toBeNull();
    expect(result.current.conversionFactor).toBe('');
    expect(result.current.buildConvertedVariant()).toBeNull();
    expect(result.current.pendingUnit).toBe('tsp');
  });

  it('clears manual conversion state when switching pending units', () => {
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
      }),
    );

    act(() => {
      result.current.handleExistingUnitSelection('piece');
    });

    expect(result.current.buildConvertedVariant()).toBeNull();

    act(() => {
      result.current.setConversionFactor(4.2);
    });

    expect(result.current.buildConvertedVariant()).toMatchObject({
      serving_unit: 'piece',
      serving_size: 1,
    });

    act(() => {
      result.current.handleExistingUnitSelection('tsp');
    });

    expect(result.current.pendingUnit).toBe('tsp');
    expect(result.current.conversionFactor).toBe('');
    expect(result.current.autoConversionFactor).toBeNull();
    expect(result.current.buildConvertedVariant()).toBeNull();
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
      }),
    );

    act(() => {
      result.current.startCustomUnit();
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

  it('resolves auto-convert sources directly when a compatible saved variant exists', () => {
    const gramsVariant = createVariant({
      id: 'grams',
      serving_size: 100,
      serving_unit: 'g',
    });
    const cupVariant = createVariant({
      id: 'cup',
      serving_size: 1,
      serving_unit: 'cup',
    });

    expect(
      resolveAutoConversionSource([gramsVariant, cupVariant], gramsVariant, 'tbsp'),
    ).toEqual({
      baseVariant: cupVariant,
      factor: getConversionFactor('cup', 'tbsp'),
    });
  });
});
