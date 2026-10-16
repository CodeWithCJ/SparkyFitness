import {
  addRows,
  buildNutrients,
  catalogIdsToProvision,
  countNutrients,
  filterMedsBySubtype,
  macroRow,
  parseAmount,
  pickerCatalogEntries,
  rowsForCatalogId,
  rowsFromLookup,
  rowsFromNutrients,
  unmatchedSummary,
} from '../../src/utils/supplements';
import { MACRO_PICKER_FIELDS } from '@workspace/shared';

describe('filterMedsBySubtype', () => {
  const meds = [
    { id: 'a', is_supplement: false },
    { id: 'b', is_supplement: true },
    { id: 'c' },
  ];

  it('returns everything for all', () => {
    expect(filterMedsBySubtype(meds, 'all')).toHaveLength(3);
  });

  it('treats a row without the flag as a medication', () => {
    expect(filterMedsBySubtype(meds, 'meds').map((m) => m.id)).toEqual([
      'a',
      'c',
    ]);
    expect(filterMedsBySubtype(meds, 'supplements').map((m) => m.id)).toEqual([
      'b',
    ]);
  });
});

describe('parseAmount', () => {
  it('reads decimals with a comma or a point', () => {
    expect(parseAmount('2.5')).toBe(2.5);
    expect(parseAmount('2,5')).toBe(2.5);
  });

  it('rejects blank, negative and non-numeric text', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('  ')).toBeNull();
    expect(parseAmount('-1')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
  });

  it('rejects hex and exponent notation from pasted text', () => {
    expect(parseAmount('0x10')).toBeNull();
    expect(parseAmount('1e3')).toBeNull();
    expect(parseAmount('Infinity')).toBeNull();
  });

  it('keeps a typed zero', () => {
    expect(parseAmount('0')).toBe(0);
  });
});

describe('rows for the catalog', () => {
  it('stores a built-in column under its field', () => {
    const [row] = rowsForCatalogId('vitamin_c');
    expect(row.fixedField).toBe('vitamin_c');
    expect(row.catalogId).toBeUndefined();
  });

  it('needs a custom nutrient for the rest', () => {
    const [row] = rowsForCatalogId('magnesium');
    expect(row.catalogId).toBe('magnesium');
    expect(row.fixedField).toBeUndefined();
  });

  it('adds the parts of a compound instead of the compound', () => {
    const rows = rowsForCatalogId('omega_3');
    expect(rows.map((r) => r.catalogId)).toEqual(['epa', 'dha']);
  });

  it('offers a compound but not its parts', () => {
    const ids = pickerCatalogEntries().map((e) => e.id);
    expect(ids).toContain('omega_3');
    expect(ids).not.toContain('epa');
    expect(ids).not.toContain('dha');
  });

  it('does not add a row twice', () => {
    const once = addRows([], rowsForCatalogId('magnesium'));
    expect(addRows(once, rowsForCatalogId('magnesium'))).toBe(once);
  });
});

describe('buildNutrients', () => {
  it('saves typed amounts and leaves blank rows out', () => {
    const vitC = rowsForCatalogId('vitamin_c')[0];
    const magnesium = rowsForCatalogId('magnesium')[0];
    const zinc = rowsForCatalogId('zinc')[0];
    const nutrients = buildNutrients(
      [
        { ...vitC, value: '90' },
        { ...magnesium, value: '200' },
        { ...zinc, value: '' },
        { ...macroRow(MACRO_PICKER_FIELDS[0]), value: '5' },
      ],
      { magnesium: 'Mag' }
    );
    expect(nutrients).toEqual({
      vitamin_c: 90,
      calories: 5,
      custom_nutrients: { Mag: 200 },
    });
  });

  it('adds two rows that resolve onto one nutrient', () => {
    const [epa, dha] = rowsForCatalogId('omega_3');
    const nutrients = buildNutrients(
      [
        { ...epa, value: '300' },
        { ...dha, value: '200' },
      ],
      { epa: 'Omega-3', dha: 'Omega-3' }
    );
    expect(nutrients.custom_nutrients).toEqual({ 'Omega-3': 500 });
  });

  it('skips a catalog row whose nutrient could not be created', () => {
    const row = { ...rowsForCatalogId('magnesium')[0], value: '100' };
    expect(buildNutrients([row])).toEqual({});
  });
});

describe('catalogIdsToProvision', () => {
  it('lists only filled rows that need a custom nutrient', () => {
    const rows = [
      { ...rowsForCatalogId('magnesium')[0], value: '100' },
      { ...rowsForCatalogId('zinc')[0], value: '' },
      { ...rowsForCatalogId('vitamin_c')[0], value: '90' },
    ];
    expect(catalogIdsToProvision(rows)).toEqual(['magnesium']);
  });
});

describe('saved supplements', () => {
  it('turns the saved payload back into rows', () => {
    const rows = rowsFromNutrients(
      { vitamin_a: 900, custom_nutrients: { Magnesium: 200 } },
      [{ name: 'Magnesium', unit: 'mg' }]
    );
    expect(rows.map((r) => [r.label, r.unit, r.value])).toEqual([
      ['Vitamin A', 'µg', '900'],
      ['Magnesium', 'mg', '200'],
    ]);
  });

  it('counts nutrients', () => {
    expect(countNutrients(undefined)).toBe(0);
    expect(
      countNutrients({ vitamin_a: 1, custom_nutrients: { A: 1, B: 2 } })
    ).toBe(3);
  });
});

describe('barcode lookup', () => {
  const product = {
    source: 'dsld' as const,
    sourceId: '1',
    name: 'Daily Multi',
    brand: null,
    form: null,
    serving: null,
    fixed: [
      { key: 'vitamin_c' as const, amount: 90 },
      { key: 'protein' as const, amount: 2 },
    ],
    catalog: [{ catalogId: 'magnesium', amount: 400 }],
    unmatched: [
      { name: 'A', amount: 1, unit: 'mg' },
      { name: 'B', amount: 1, unit: 'mg' },
      { name: 'C', amount: 1, unit: 'mg' },
    ],
  };

  it('turns the found nutrients into rows with their amounts', () => {
    const rows = rowsFromLookup(product);
    expect(rows.map((r) => [r.id, r.label, r.unit, r.value])).toEqual([
      ['fixed:vitamin_c', 'Vitamin C', 'mg', '90'],
      ['fixed:protein', 'Protein', 'g', '2'],
      ['catalog:magnesium', 'Magnesium', 'mg', '400'],
    ]);
  });

  it('saves what a lookup found', () => {
    expect(
      buildNutrients(rowsFromLookup(product), { magnesium: 'Mg' })
    ).toEqual({
      vitamin_c: 90,
      protein: 2,
      custom_nutrients: { Mg: 400 },
    });
  });

  it('summarises the ingredients left out', () => {
    expect(unmatchedSummary(product, 2)).toEqual({ names: 'A, B', extra: 1 });
    expect(unmatchedSummary({ ...product, unmatched: [] })).toBeNull();
  });
});
