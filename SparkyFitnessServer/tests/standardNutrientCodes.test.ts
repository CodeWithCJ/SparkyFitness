import { describe, expect, it } from 'vitest';
import { mapStandardNutrientsByCode } from '../utils/standardNutrientCodes.js';

const CODES = {
  protein: ['PROT'],
  vitamin_a: ['VITA', 'RETOL'],
  water_ml: ['WATER'],
} as const;

describe('mapStandardNutrientsByCode', () => {
  it('takes the first reported code per column and maps its label', () => {
    const result = mapStandardNutrientsByCode(
      CODES,
      { PROT: 3.4, RETOL: 12, WATER: 90.6 },
      { PROT: 'Protein', RETOL: 'Retinol', WATER: 'Wasser' }
    );

    expect(result.values).toEqual({
      protein: 3.4,
      vitamin_a: 12,
      water_ml: 90.6,
    });
    expect(result.providerNutrientStandard).toEqual({
      Protein: 'protein',
      Retinol: 'vitamin_a',
      Wasser: 'water_ml',
    });
  });

  it('prefers an earlier code when the food reports both', () => {
    const result = mapStandardNutrientsByCode(
      CODES,
      { VITA: 40, RETOL: 12 },
      { VITA: 'Vitamin A', RETOL: 'Retinol' }
    );

    expect(result.values.vitamin_a).toBe(40);
    expect(result.providerNutrientStandard).toEqual({
      'Vitamin A': 'vitamin_a',
    });
  });

  it('fills 0 for unreported codes and skips codes without a label', () => {
    const result = mapStandardNutrientsByCode(CODES, { PROT: 0 }, {});

    expect(result.values).toEqual({ protein: 0, vitamin_a: 0, water_ml: 0 });
    expect(result.providerNutrientStandard).toEqual({});
  });
});
