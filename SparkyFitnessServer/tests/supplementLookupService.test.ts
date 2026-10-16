import { describe, expect, it, vi } from 'vitest';
import {
  lookupSupplementByUpc,
  mapDsldLabel,
  mapScannedLabel,
  normalizeUpc,
  sameUpc,
  upcSearchPhrases,
  type DsldLabel,
} from '../services/supplementLookupService.js';

const row = (
  name: string,
  quantity: number | null,
  unit: string | null,
  extra: Record<string, unknown> = {}
) => ({
  name,
  ingredientGroup: name,
  notes: '',
  quantity:
    quantity === null
      ? []
      : [{ servingSizeOrder: 1, servingSizeQuantity: 1, quantity, unit }],
  nestedRows: [],
  ...extra,
});

const label = (overrides: Partial<DsldLabel> = {}): DsldLabel => ({
  id: 65059,
  fullName: 'Vitamin D3',
  brandName: 'WeCare Naturally',
  upcSku: '8 58849 00311 5',
  offMarket: 0,
  physicalState: { langualCodeDescription: 'Capsule' },
  servingSizes: [
    { order: 1, minQuantity: 1, maxQuantity: 1, unit: 'Capsule(s)' },
  ],
  ingredientRows: [row('Vitamin D', 5000, 'IU')],
  ...overrides,
});

describe('normalizeUpc', () => {
  it('keeps a UPC-A', () => {
    expect(normalizeUpc('858849003115')).toBe('858849003115');
  });

  it('drops the leading zero of an EAN-13 that wraps a UPC-A', () => {
    expect(normalizeUpc('0858849003115')).toBe('858849003115');
  });

  it('keeps an EAN-13 with another prefix', () => {
    expect(normalizeUpc('5012345678900')).toBe('5012345678900');
  });

  it('ignores separators and rejects other lengths', () => {
    expect(normalizeUpc('8 58849 00311 5')).toBe('858849003115');
    expect(normalizeUpc('12345')).toBeNull();
    expect(normalizeUpc('')).toBeNull();
  });
});

describe('upc matching', () => {
  it('groups the digits the way labels print them', () => {
    expect(upcSearchPhrases('858849003115')).toEqual([
      '8 58849 00311 5',
      '858849003115',
    ]);
  });

  it('compares codes whatever their separators and leading zeros', () => {
    expect(sameUpc('8 58849 00311 5', '858849003115')).toBe(true);
    expect(sameUpc('0-58849-00311-5', '58849003115')).toBe(true);
    expect(sameUpc('8 58849 00311 6', '858849003115')).toBe(false);
    expect(sameUpc(null, '858849003115')).toBe(false);
  });
});

describe('mapDsldLabel', () => {
  it('names the product and reads its form and serving', () => {
    const product = mapDsldLabel(label());
    expect(product).toMatchObject({
      source: 'dsld',
      sourceId: '65059',
      name: 'WeCare Naturally Vitamin D3',
      brand: 'WeCare Naturally',
      form: 'capsule',
      serving: '1 Capsule(s)',
    });
  });

  it('does not repeat a brand the name already starts with', () => {
    expect(
      mapDsldLabel(label({ fullName: 'WeCare Naturally Vitamin D3 5000 IU' }))
        .name
    ).toBe('WeCare Naturally Vitamin D3 5000 IU');
  });

  it('turns international units into the catalog unit', () => {
    const product = mapDsldLabel(
      label({
        ingredientRows: [
          row('Vitamin D', 5000, 'IU'),
          row('Vitamin A', 2500, 'IU', {
            notes: 'Vitamin A (Form: as Beta-Carotene)',
          }),
          row('Vitamin E', 30, 'IU', { notes: 'as dl-alpha tocopherol' }),
        ],
      })
    );
    expect(product.catalog).toEqual([
      { catalogId: 'vitamin_d', amount: 125 },
      { catalogId: 'vitamin_e', amount: 13.5 },
    ]);
    expect(product.fixed).toEqual([{ key: 'vitamin_a', amount: 375 }]);
  });

  it('uses the retinol factor when the form is not beta-carotene', () => {
    const product = mapDsldLabel(
      label({ ingredientRows: [row('Vitamin A', 1000, 'IU')] })
    );
    expect(product.fixed).toEqual([{ key: 'vitamin_a', amount: 300 }]);
  });

  it('reads energy and macros and converts their units', () => {
    const product = mapDsldLabel(
      label({
        ingredientRows: [
          row('Calories', 10, 'Calorie(s)'),
          row('Calories from Fat', 5, 'Calorie(s)'),
          row('Total Fat', 500, 'mg'),
          row('Protein', 2, 'Gram(s)'),
          row('Total Carbohydrates', 1.5, 'Gram(s)'),
          row('Sugar', 1, 'Gram(s)'),
          row('Sodium', 0.05, 'Gram(s)'),
        ],
      })
    );
    expect(product.fixed).toEqual([
      { key: 'calories', amount: 10 },
      { key: 'fat', amount: 0.5 },
      { key: 'protein', amount: 2 },
      { key: 'carbs', amount: 1.5 },
      { key: 'sugars', amount: 1 },
      { key: 'sodium', amount: 50 },
    ]);
    expect(product.unmatched).toEqual([
      { name: 'Calories from Fat', amount: 5, unit: 'Calorie(s)' },
    ]);
  });

  it('matches a form by its group and converts to the catalog unit', () => {
    const product = mapDsldLabel(
      label({
        ingredientRows: [
          row('Methylcobalamin', 500, 'mcg', {
            ingredientGroup: 'Vitamin B12',
          }),
          row('Magnesium', 0.4, 'Gram(s)'),
          row('Folic Acid', 400, 'mcg DFE', { ingredientGroup: 'Folate' }),
        ],
      })
    );
    expect(product.catalog).toEqual([
      { catalogId: 'vitamin_b12', amount: 500 },
      { catalogId: 'magnesium', amount: 400 },
      { catalogId: 'folate', amount: 400 },
    ]);
  });

  it('adds two rows that land on the same nutrient', () => {
    const product = mapDsldLabel(
      label({
        ingredientRows: [
          row('Vitamin C', 60, 'mg'),
          row('Ascorbic Acid', 30, 'mg', { ingredientGroup: 'Vitamin C' }),
        ],
      })
    );
    expect(product.fixed).toEqual([{ key: 'vitamin_c', amount: 90 }]);
  });

  it('reads the rows nested inside a blend', () => {
    const product = mapDsldLabel(
      label({
        ingredientRows: [
          row('Mineral Blend', 500, 'mg', {
            nestedRows: [row('Zinc', 15, 'mg')],
          }),
        ],
      })
    );
    expect(product.catalog).toEqual([{ catalogId: 'zinc', amount: 15 }]);
    expect(product.unmatched.map((u) => u.name)).toEqual(['Mineral Blend']);
  });

  it('leaves out ingredients with no amount and lists the ones it cannot place', () => {
    const product = mapDsldLabel(
      label({
        ingredientRows: [
          row('Gelatin', null, null),
          row('Silicon Dioxide', 5, 'NP'),
          row('Holy Basil', 300, 'mg'),
          row('Vitamin K', 80, 'IU'),
        ],
      })
    );
    expect(product.fixed).toEqual([]);
    expect(product.catalog).toEqual([]);
    expect(product.unmatched).toEqual([
      { name: 'Holy Basil', amount: 300, unit: 'mg' },
      { name: 'Vitamin K', amount: 80, unit: 'IU' },
    ]);
  });

  it('lists a quantity whose unit cannot be read, but not one marked not present', () => {
    const product = mapDsldLabel(
      label({
        ingredientRows: [
          row('Lactobacillus', 5, 'Billion CFU'),
          row('Biotin', 30, null),
          row('Silicon Dioxide', 5, 'NP'),
          row('Gelatin', 5, 'Not Present'),
        ],
      })
    );
    expect(product.unmatched).toEqual([
      { name: 'Lactobacillus', amount: 5, unit: 'Billion CFU' },
      { name: 'Biotin', amount: 30, unit: null },
    ]);
  });

  it('does not use a compound on its own', () => {
    const product = mapDsldLabel(
      label({
        ingredientRows: [
          row('Omega-3 (EPA+DHA)', 500, 'mg'),
          row('EPA', 300, 'mg', { ingredientGroup: 'Omega-3 EPA' }),
        ],
      })
    );
    expect(product.catalog).toEqual([{ catalogId: 'epa', amount: 300 }]);
    expect(product.unmatched.map((u) => u.name)).toEqual(['Omega-3 (EPA+DHA)']);
  });

  it('maps the physical state to a supplement form', () => {
    const form = (description: string) =>
      mapDsldLabel(
        label({ physicalState: { langualCodeDescription: description } })
      ).form;
    expect(form('Softgel Capsule')).toBe('softgel');
    expect(form('Gummy or Jelly')).toBe('gummy');
    expect(form('Tablet or Pill')).toBe('tablet');
    expect(form('Powder')).toBe('powder');
    expect(form('Lozenge')).toBeNull();
  });

  it('shows a serving range', () => {
    expect(
      mapDsldLabel(
        label({
          servingSizes: [
            { order: 1, minQuantity: 1, maxQuantity: 2, unit: 'Tablet(s)' },
          ],
        })
      ).serving
    ).toBe('1–2 Tablet(s)');
  });
});

describe('lookupSupplementByUpc', () => {
  const respond = (routes: Record<string, unknown>) =>
    vi.fn(async (url: string) => {
      const key = Object.keys(routes).find((k) => url.includes(k));
      return key
        ? { ok: true, status: 200, json: async () => routes[key] }
        : { ok: false, status: 404, json: async () => ({}) };
    });

  it('opens the hits and returns the one with the scanned code', async () => {
    const fetchImpl = respond({
      'search-filter': { hits: [{ _id: 111 }, { _id: 65059 }] },
      'label/111': label({ id: 111, upcSku: '1 11111 11111 1' }),
      'label/65059': label(),
    });

    const product = await lookupSupplementByUpc('0858849003115', fetchImpl);

    expect(product?.sourceId).toBe('65059');
    expect(fetchImpl.mock.calls[0][0]).toContain(
      encodeURIComponent('"8 58849 00311 5"')
    );
  });

  it('tries the plain digits when the grouped phrase finds nothing', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ hits: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ hits: [{ _id: 65059 }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => label({ upcSku: '858849003115' }),
      });

    const product = await lookupSupplementByUpc('858849003115', fetchImpl);

    expect(product?.sourceId).toBe('65059');
    expect(fetchImpl.mock.calls[1][0]).toContain(
      encodeURIComponent('"858849003115"')
    );
  });

  it('prefers a label still on the market', async () => {
    const fetchImpl = respond({
      'search-filter': { hits: [{ _id: 1 }, { _id: 2 }] },
      'label/1': label({ id: 1, offMarket: 1 }),
      'label/2': label({ id: 2, offMarket: 0 }),
    });

    expect(
      (await lookupSupplementByUpc('858849003115', fetchImpl))?.sourceId
    ).toBe('2');
  });

  it('finds nothing when no label carries the code', async () => {
    const fetchImpl = respond({
      'search-filter': { hits: [{ _id: 5 }] },
      'label/5': label({ id: 5, upcSku: '9 99999 99999 9' }),
    });

    expect(await lookupSupplementByUpc('858849003115', fetchImpl)).toBeNull();
  });

  it('does not search for something that is not a product code', async () => {
    const fetchImpl = vi.fn();
    expect(await lookupSupplementByUpc('1234', fetchImpl)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails when the database cannot be reached', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    }));

    await expect(
      lookupSupplementByUpc('858849003115', fetchImpl)
    ).rejects.toThrow('503');
  });

  it('uses one deadline for the search and every label it opens', async () => {
    const signals: AbortSignal[] = [];
    const fetchImpl = vi.fn(
      async (url: string, init?: { signal?: AbortSignal }) => {
        if (init?.signal) signals.push(init.signal);
        if (url.includes('search-filter')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ hits: [{ _id: 1 }, { _id: 2 }] }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => label({ upcSku: '858849003115' }),
        };
      }
    );

    await lookupSupplementByUpc('858849003115', fetchImpl);

    expect(signals.length).toBeGreaterThan(1);
    expect(signals.every((signal) => signal === signals[0])).toBe(true);
  });
});

describe('mapScannedLabel', () => {
  const scanned = (
    ingredients: { name: string; amount: number | null; unit: string | null }[]
  ) => ({
    name: 'Daily Multi',
    brand: 'Acme',
    form: 'tablet' as const,
    serving: '1 Tablet',
    ingredients,
  });

  it('totals the printed amounts in the app units', () => {
    const product = mapScannedLabel(
      scanned([
        { name: 'Vitamin D3', amount: 1000, unit: 'IU' },
        { name: 'Calcium', amount: 200, unit: 'mg' },
        { name: 'Protein', amount: 2, unit: 'g' },
      ])
    );

    expect(product.source).toBe('label');
    expect(product.name).toBe('Daily Multi');
    expect(product.form).toBe('tablet');
    expect(product.serving).toBe('1 Tablet');
    const vitaminD = product.catalog.find((c) => c.catalogId === 'vitamin_d');
    expect(vitaminD?.amount).toBeCloseTo(25, 3);
    expect(product.fixed).toEqual(
      expect.arrayContaining([
        { key: 'protein', amount: 2 },
        { key: 'calcium', amount: 200 },
      ])
    );
    expect(product.unmatched).toEqual([]);
  });

  it('lists a line it cannot place, including one with an unreadable unit', () => {
    const product = mapScannedLabel(
      scanned([
        { name: 'Probiotic Blend', amount: 5, unit: 'billion CFU' },
        { name: 'Mystery Root', amount: 50, unit: 'mg' },
        { name: 'Zinc', amount: null, unit: 'mg' },
      ])
    );

    expect(product.unmatched.map((u) => u.name)).toEqual([
      'Probiotic Blend',
      'Mystery Root',
    ]);
  });
});
