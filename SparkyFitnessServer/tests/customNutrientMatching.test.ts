import { describe, expect, it } from 'vitest';
import { normalizeNutrientName } from '@workspace/shared';
import {
  buildAliasIndex,
  applyCustomNutrientMatches,
} from '../utils/foodUtils.js';
import { mapUsdaBarcodeProduct } from '../integrations/usda/usdaService.js';

describe('normalizeNutrientName', () => {
  it('lowercases, strips punctuation, and collapses whitespace', () => {
    expect(normalizeNutrientName('Magnesium, Mg')).toBe('magnesium mg');
    expect(normalizeNutrientName('  Magnesium ')).toBe('magnesium');
    expect(normalizeNutrientName('Vitamin-A (RAE)')).toBe('vitamin a rae');
  });

  it('is idempotent', () => {
    const once = normalizeNutrientName('Magnesium, Mg');
    expect(normalizeNutrientName(once)).toBe(once);
  });
});

describe('buildAliasIndex', () => {
  it('indexes the name and aliases case-insensitively, carrying the unit', () => {
    const index = buildAliasIndex([
      { name: 'Magnesium', unit: 'mg', aliases: ['Magnesium, Mg'] },
    ]);
    expect(index.get('magnesium')).toEqual({ name: 'Magnesium', unit: 'mg' });
    expect(index.get('magnesium mg')?.name).toBe('Magnesium');
  });

  it('keeps the first nutrient on a duplicate normalized alias', () => {
    const index = buildAliasIndex([
      { name: 'Magnesium', aliases: ['mag'] },
      { name: 'Manganese', aliases: ['mag'] },
    ]);
    expect(index.get('mag')?.name).toBe('Magnesium');
  });

  it('ignores blank/non-string aliases', () => {
    const index = buildAliasIndex([
      // @ts-expect-error testing defensive handling of bad input
      { name: 'Zinc', aliases: ['', '  ', 5, null] },
    ]);
    expect(index.get('zinc')?.name).toBe('Zinc');
    expect(index.size).toBe(1);
  });
});

describe('applyCustomNutrientMatches', () => {
  it('matches provider nutrients (by exact provider label) into custom_nutrients', () => {
    // Alias is the provider's exact label "Magnesium, Mg"; matching is
    // case/punctuation-insensitive so it lines up with the USDA field.
    const index = buildAliasIndex([
      { name: 'Magnesium', aliases: ['Magnesium, Mg'] },
    ]);
    const variant = {
      calories: 100,
      provider_nutrients: { 'Magnesium, Mg': 18, Sodium: 200 },
    };
    const foods = [{ default_variant: variant, variants: [variant] }];

    applyCustomNutrientMatches(foods, index);

    // provider_nutrients stays on the variant for the field viewer.
    expect(variant).toHaveProperty('provider_nutrients');
    expect(
      (variant as { custom_nutrients?: Record<string, number> })
        .custom_nutrients
    ).toEqual({
      Magnesium: 18,
    });
  });

  it('skips zero and missing provider values', () => {
    const index = buildAliasIndex([{ name: 'Magnesium', aliases: [] }]);
    const variant = { provider_nutrients: { Magnesium: 0 } };
    applyCustomNutrientMatches([{ default_variant: variant }], index);
    expect(
      (variant as { custom_nutrients?: Record<string, number> })
        .custom_nutrients
    ).toBeUndefined();
  });

  it('does nothing when no aliases are configured', () => {
    const variant = { provider_nutrients: { Magnesium: 18 } };
    applyCustomNutrientMatches([{ default_variant: variant }], new Map());
    expect(
      (variant as { custom_nutrients?: Record<string, number> })
        .custom_nutrients
    ).toBeUndefined();
  });

  it('converts the provider amount into the custom nutrient unit', () => {
    const index = buildAliasIndex([
      { name: 'Magnesium', unit: 'µg', aliases: ['Magnesium, Mg'] },
    ]);
    const variant = {
      provider_nutrients: { 'Magnesium, Mg': 0.4 },
      provider_nutrient_units: { 'Magnesium, Mg': 'mg' },
    };
    applyCustomNutrientMatches([{ default_variant: variant }], index);
    expect(
      (variant as { custom_nutrients?: Record<string, number> })
        .custom_nutrients
    ).toEqual({ Magnesium: 400 });
  });

  it('retains the raw provider value when units are incompatible (e.g. IU)', () => {
    const index = buildAliasIndex([
      { name: 'Vitamin D', unit: 'mg', aliases: ['vitd'] },
    ]);
    const variant = {
      provider_nutrients: { vitd: 10 },
      provider_nutrient_units: { vitd: 'IU' },
    };
    applyCustomNutrientMatches([{ default_variant: variant }], index);
    expect(
      (variant as { custom_nutrients?: Record<string, number> })
        .custom_nutrients
    ).toEqual({ 'Vitamin D': 10 });
  });

  it('retains the raw value when the provider reports no unit', () => {
    const index = buildAliasIndex([
      { name: 'Magnesium', unit: 'mg', aliases: ['magnesium'] },
    ]);
    const variant = { provider_nutrients: { magnesium: 18 } };
    applyCustomNutrientMatches([{ default_variant: variant }], index);
    expect(
      (variant as { custom_nutrients?: Record<string, number> })
        .custom_nutrients
    ).toEqual({ Magnesium: 18 });
  });
});

describe('mapUsdaBarcodeProduct provider nutrients', () => {
  it('exposes magnesium under its exact USDA label for alias matching', () => {
    // Shape mirrors USDA "Fish, salmon, smoked" (per 100 g) with magnesium 18 mg.
    const usdaFood = {
      description: 'Fish, salmon, smoked',
      fdcId: 2706292,
      servingSize: 100,
      servingSizeUnit: 'g',
      foodNutrients: [
        {
          nutrient: { id: 1008, name: 'Energy', unitName: 'kcal' },
          amount: 117,
        },
        {
          nutrient: { id: 1003, name: 'Protein', unitName: 'g' },
          amount: 18.3,
        },
        {
          nutrient: { id: 1096, name: 'Magnesium, Mg', unitName: 'mg' },
          amount: 18,
        },
      ],
    };

    const mapped = mapUsdaBarcodeProduct(usdaFood);
    const variant = mapped.default_variant as {
      provider_nutrients?: Record<string, number>;
    };
    expect(variant.provider_nutrients?.['Magnesium, Mg']).toBe(18);

    // End-to-end: a user custom Magnesium with the USDA alias picks up the value.
    const index = buildAliasIndex([
      { name: 'Magnesium', aliases: ['Magnesium, Mg'] },
    ]);
    applyCustomNutrientMatches([mapped], index);
    expect(
      (mapped.default_variant as { custom_nutrients?: Record<string, number> })
        .custom_nutrients?.Magnesium
    ).toBe(18);
  });
});
