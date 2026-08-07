import {
  collectNutrientsToProvision,
  isStoredNutrientAmount,
} from '@/pages/Medications/medicationUtils';

// Saving a supplement find-or-creates a user_custom_nutrients row for each picked
// nutrient, and every created row fans out into goal targets and report/goal display
// preferences. The multivitamin panel stages ~20 rows in one click, so provisioning
// must be keyed to "carries an amount the payload will store", not "row present in
// the editor" — otherwise two filled-in fields create twenty nutrients.
describe('collectNutrientsToProvision', () => {
  const pending = {
    'Vitamin B6': { catalogId: 'vitamin_b6', unit: 'mg' },
    'Vitamin B12': { catalogId: 'vitamin_b12', unit: 'µg' },
    Zinc: { catalogId: 'zinc', unit: 'mg' },
    Selenium: { catalogId: 'selenium', unit: 'µg' },
    'Bee Pollen': { unit: 'mg', isNew: true },
  };
  const allSelected = Object.keys(pending);

  it('provisions only the staged rows that carry an amount', () => {
    const result = collectNutrientsToProvision(pending, allSelected, {
      'Vitamin B6': 2,
      'Vitamin B12': 500,
    });
    expect(result.catalogIds).toEqual(['vitamin_b6', 'vitamin_b12']);
    expect(result.freeText).toEqual([]);
  });

  it('skips rows whose input was cleared back to empty string', () => {
    const result = collectNutrientsToProvision(pending, allSelected, {
      'Vitamin B6': 2,
      Zinc: '',
    });
    expect(result.catalogIds).toEqual(['vitamin_b6']);
  });

  it('provisions nothing when no amounts were entered at all', () => {
    const result = collectNutrientsToProvision(pending, allSelected, undefined);
    expect(result.catalogIds).toEqual([]);
    expect(result.freeText).toEqual([]);
    expect(result.provisionalByCatalogId).toEqual({});
  });

  it('skips rows picked and then removed from the editor, even with a value', () => {
    const result = collectNutrientsToProvision(pending, ['Vitamin B6'], {
      'Vitamin B6': 2,
      Zinc: 15,
    });
    expect(result.catalogIds).toEqual(['vitamin_b6']);
  });

  it('includes free-text rows with an amount, carrying their unit', () => {
    const result = collectNutrientsToProvision(pending, allSelected, {
      'Bee Pollen': 100,
    });
    expect(result.catalogIds).toEqual([]);
    expect(result.freeText).toEqual([{ key: 'Bee Pollen', unit: 'mg' }]);
  });

  it('maps each provisioned catalog id back to its editor key', () => {
    const result = collectNutrientsToProvision(pending, allSelected, {
      'Vitamin B12': 500,
    });
    expect(result.provisionalByCatalogId).toEqual({
      vitamin_b12: 'Vitamin B12',
    });
  });

  // An explicit 0 is stored by the payload builder, so the key reaches the server and
  // its nutrient row must exist — the predicate has to agree with getNutrients().
  it('treats an explicit 0 as a stored amount', () => {
    const result = collectNutrientsToProvision(pending, allSelected, {
      Zinc: 0,
    });
    expect(result.catalogIds).toEqual(['zinc']);
  });
});

describe('isStoredNutrientAmount', () => {
  it('accepts finite numbers including 0', () => {
    expect(isStoredNutrientAmount(0)).toBe(true);
    expect(isStoredNutrientAmount(2.5)).toBe(true);
  });

  it('rejects blank, non-numeric, and non-finite values', () => {
    expect(isStoredNutrientAmount('')).toBe(false);
    expect(isStoredNutrientAmount(undefined)).toBe(false);
    expect(isStoredNutrientAmount('5')).toBe(false);
    expect(isStoredNutrientAmount(NaN)).toBe(false);
    expect(isStoredNutrientAmount(Infinity)).toBe(false);
  });
});
