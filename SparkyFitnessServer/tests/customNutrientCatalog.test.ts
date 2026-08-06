import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MICRONUTRIENT_CATALOG,
  MULTIVITAMIN_PANEL_IDS,
  FOOD_VARIANT_NUTRIENT_FIELDS,
  SUPPLEMENT_NUTRIENT_VIEW_GROUPS,
  getMicronutrientById,
  normalizeNutrientName,
} from '@workspace/shared';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));
vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));
vi.mock('../utils/timezoneLoader', () => ({
  loadUserTimezone: vi.fn().mockResolvedValue('UTC'),
}));

const { default: customNutrientService } =
  await import('../services/customNutrientService.js');

const USER = 'user-1';

describe('MICRONUTRIENT_CATALOG', () => {
  it('has unique ids and unique canonical names', () => {
    const ids = MICRONUTRIENT_CATALOG.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);

    const names = MICRONUTRIENT_CATALOG.map((entry) =>
      normalizeNutrientName(entry.displayName)
    );
    expect(new Set(names).size).toBe(names.length);
  });

  it('never lets two entries claim the same alias', () => {
    const seen = new Map<string, string>();
    for (const entry of MICRONUTRIENT_CATALOG) {
      for (const alias of entry.aliases) {
        const key = normalizeNutrientName(alias);
        const owner = seen.get(key);
        expect(
          owner === undefined || owner === entry.id,
          `alias "${alias}" claimed by both ${owner} and ${entry.id}`
        ).toBe(true);
        seen.set(key, entry.id);
      }
    }
  });

  it('only points fixedField at real food_variant nutrient columns', () => {
    for (const entry of MICRONUTRIENT_CATALOG) {
      if (!entry.fixedField) continue;
      expect(FOOD_VARIANT_NUTRIENT_FIELDS).toContain(entry.fixedField);
    }
  });

  it('includes the micronutrients the fixed food fields do not cover', () => {
    // The whole point of the catalog: the 17 fixed fields have no vitamin D, K,
    // magnesium, zinc or B12, which is most of what people actually supplement.
    for (const id of [
      'vitamin_d',
      'vitamin_k',
      'magnesium',
      'zinc',
      'vitamin_b12',
    ]) {
      const entry = getMicronutrientById(id);
      expect(entry, `${id} missing from catalog`).toBeDefined();
      expect(entry?.fixedField).toBeUndefined();
    }
  });

  it('exposes a multivitamin panel drawn from the catalog', () => {
    expect(MULTIVITAMIN_PANEL_IDS.length).toBeGreaterThan(10);
    for (const id of MULTIVITAMIN_PANEL_IDS) {
      expect(getMicronutrientById(id)).toBeDefined();
    }
  });
});

describe('customNutrientService.ensureCatalogNutrients', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const stub = (
    existing: { name: string; unit: string; aliases: string[] }[]
  ) => {
    const getSpy = vi
      .spyOn(customNutrientService, 'getCustomNutrients')
      .mockResolvedValue(existing as never);
    const createSpy = vi
      .spyOn(customNutrientService, 'createCustomNutrient')
      .mockImplementation(
        (async (_userId: string, payload: { name: string }) => payload) as never
      );
    return { getSpy, createSpy };
  };

  it('creates a nutrient seeded with the catalog unit, aliases and Daily Value', async () => {
    const { createSpy } = stub([]);

    const result = await customNutrientService.ensureCatalogNutrients(USER, [
      'vitamin_d',
    ]);

    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).toHaveBeenCalledWith(USER, {
      name: 'Vitamin D',
      unit: 'µg',
      aliases: expect.arrayContaining(['Cholecalciferol']),
      defaultTarget: 20,
      // Goal + reports only. A supplement's nutrients must NOT be registered on the
      // food_database view, or every food row grows an always-0.0 column for each one.
      viewGroups: SUPPLEMENT_NUTRIENT_VIEW_GROUPS,
    });
    expect(SUPPLEMENT_NUTRIENT_VIEW_GROUPS).not.toContain('food_database');
    expect(result.resolved).toEqual([
      { catalogId: 'vitamin_d', name: 'Vitamin D' },
    ]);
  });

  it('never creates a custom nutrient for a built-in column', async () => {
    const { createSpy } = stub([]);

    const result = await customNutrientService.ensureCatalogNutrients(USER, [
      'vitamin_c',
    ]);

    // Vitamin C is already a food_variants column — shadowing it with a custom
    // nutrient of the same name would double-count it in the report UNION.
    expect(createSpy).not.toHaveBeenCalled();
    expect(result.resolved).toEqual([
      { catalogId: 'vitamin_c', name: 'Vitamin C', fixedField: 'vitamin_c' },
    ]);
  });

  it('is idempotent — an existing nutrient of the same name is reused', async () => {
    const { createSpy } = stub([
      { name: 'Vitamin D', unit: 'µg', aliases: [] },
    ]);

    const result = await customNutrientService.ensureCatalogNutrients(USER, [
      'vitamin_d',
    ]);

    expect(createSpy).not.toHaveBeenCalled();
    expect(result.created).toEqual([]);
    expect(result.resolved).toEqual([
      { catalogId: 'vitamin_d', name: 'Vitamin D' },
    ]);
  });

  it("resolves onto the user's own spelling when it matches by alias", async () => {
    // The user already tracks "Vit D" and taught it the alias "Vitamin D3".
    // Picking the catalog's Vitamin D must reuse that row and report its real
    // name, or the editor would store values under a key that doesn't exist.
    const { createSpy } = stub([
      { name: 'Vit D', unit: 'IU', aliases: ['Vitamin D3'] },
    ]);

    const result = await customNutrientService.ensureCatalogNutrients(USER, [
      'vitamin_d',
    ]);

    expect(createSpy).not.toHaveBeenCalled();
    expect(result.resolved).toEqual([
      { catalogId: 'vitamin_d', name: 'Vit D' },
    ]);
  });

  it('skips unknown catalog ids without failing the batch', async () => {
    const { createSpy } = stub([]);

    const result = await customNutrientService.ensureCatalogNutrients(USER, [
      'not_a_nutrient',
      'zinc',
    ]);

    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(result.resolved).toEqual([{ catalogId: 'zinc', name: 'Zinc' }]);
  });

  it('does not create the same nutrient twice within one batch', async () => {
    const { createSpy } = stub([]);

    const result = await customNutrientService.ensureCatalogNutrients(USER, [
      'magnesium',
      'magnesium',
    ]);

    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(result.resolved).toHaveLength(2);
    expect(result.resolved.every((entry) => entry.name === 'Magnesium')).toBe(
      true
    );
  });

  it('can resolve two different catalog ids onto the same existing nutrient', async () => {
    // A single user nutrient whose aliases cover both vitamins. Both picks collapse onto
    // it, so the caller receives the same name twice — the dialog must dedupe the keys
    // before they become rows, or the grid would render a duplicate React key.
    const { createSpy } = stub([
      { name: 'Fat-solubles', unit: 'µg', aliases: ['Vitamin D', 'Vitamin K'] },
    ]);

    const result = await customNutrientService.ensureCatalogNutrients(USER, [
      'vitamin_d',
      'vitamin_k',
    ]);

    expect(createSpy).not.toHaveBeenCalled();
    expect(result.resolved.map((entry) => entry.name)).toEqual([
      'Fat-solubles',
      'Fat-solubles',
    ]);
  });

  it('seeds the whole multivitamin panel in one call', async () => {
    const { createSpy } = stub([]);

    const result = await customNutrientService.ensureCatalogNutrients(
      USER,
      MULTIVITAMIN_PANEL_IDS
    );

    expect(result.resolved).toHaveLength(MULTIVITAMIN_PANEL_IDS.length);
    // Panel entries that are built-in columns resolve to a fixedField instead of
    // being created, so creates < panel size.
    const fixedCount = MULTIVITAMIN_PANEL_IDS.filter(
      (id) => getMicronutrientById(id)?.fixedField
    ).length;
    expect(createSpy).toHaveBeenCalledTimes(
      MULTIVITAMIN_PANEL_IDS.length - fixedCount
    );
  });

  it('returns the post-seed list without re-querying', async () => {
    const { getSpy } = stub([{ name: 'Ashwagandha', unit: 'mg', aliases: [] }]);

    const result = await customNutrientService.ensureCatalogNutrients(USER, [
      'zinc',
    ]);

    // The created rows are composed onto the existing ones rather than re-SELECTed, so
    // the whole call costs exactly one read.
    expect(getSpy).toHaveBeenCalledTimes(1);
    expect(result.nutrients.map((n: { name: string }) => n.name)).toEqual([
      'Ashwagandha',
      'Zinc',
    ]);
  });
});
