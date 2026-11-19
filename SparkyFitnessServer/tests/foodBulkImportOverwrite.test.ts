import { vi, beforeEach, describe, it, expect } from 'vitest';

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

import * as poolManagerNamed from '../db/poolManager.js';
import foodRepository from '../models/food.js';

const UID = 'user-1';

interface QueryCall {
  sql: string;
  params: unknown[];
}

/**
 * Drives createFoodsInBulk through the overwrite path for one food that already
 * exists with one matching variant, and returns every query it issued.
 */
async function runOverwriteImport(
  variant: Record<string, unknown>
): Promise<QueryCall[]> {
  const calls: QueryCall[] = [];
  const client = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes('SELECT id, name, brand FROM foods')) {
        return { rows: [{ id: 'food-1', name: 'Oats', brand: 'Acme' }] };
      }
      if (sql.includes('SELECT id FROM food_variants')) {
        return { rows: [{ id: 'variant-1' }] };
      }
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  (poolManagerNamed.getClient as ReturnType<typeof vi.fn>).mockResolvedValue(
    client
  );
  await foodRepository.createFoodsInBulk(
    UID,
    [{ name: 'Oats', brand: 'Acme', ...variant }] as never,
    true
  );
  return calls;
}

function variantUpdate(calls: QueryCall[]): QueryCall {
  const call = calls.find(
    (c) => c.sql.includes('UPDATE food_variants SET') && c.sql.includes('iron')
  );
  if (!call) throw new Error('no food_variants nutrient UPDATE was issued');
  return call;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createFoodsInBulk — overwrite preserves omitted nutrients', () => {
  // The CSV importer omits nutrient columns the file never mapped, so they
  // arrive here as undefined. Before the fix, the overwrite UPDATE assigned
  // them directly and sanitizeNumeric(undefined) -> null wiped real stored
  // values for every column the file simply did not carry.
  it('does not overwrite a stored nutrient the import omitted', async () => {
    const calls = await runOverwriteImport({
      serving_size: 100,
      serving_unit: 'g',
      calories: 250,
      // protein, carbs, fat, ... deliberately absent
    });
    const update = variantUpdate(calls);

    expect(update.sql).toContain('protein = COALESCE($4, protein)');
    expect(update.sql).toContain('iron = COALESCE($19, iron)');
    // $4 is protein: absent from the import, so it must be null and be
    // COALESCEd back to the stored column rather than assigned.
    expect(update.params[3]).toBeNull();
  });

  it('still writes an explicit zero from a mapped but blank cell', async () => {
    // A mapped blank cell parses to 0 in the importer, and 0 is not null, so
    // COALESCE keeps it — clearing a value on purpose must keep working.
    const calls = await runOverwriteImport({
      serving_size: 100,
      serving_unit: 'g',
      calories: 250,
      protein: 0,
    });
    const update = variantUpdate(calls);

    expect(update.params[3]).toBe(0);
  });

  it('keeps stored custom nutrients when the import carries none', async () => {
    const calls = await runOverwriteImport({
      serving_size: 100,
      serving_unit: 'g',
      calories: 250,
    });
    const update = variantUpdate(calls);

    expect(update.sql).toContain(
      'custom_nutrients = COALESCE($21, custom_nutrients)'
    );
    expect(update.params[20]).toBeNull();
  });
});

describe('createFoodsInBulk — health score inputs', () => {
  async function runCreateImport(
    rows: Record<string, unknown>[]
  ): Promise<QueryCall[]> {
    const calls: QueryCall[] = [];
    const client = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        if (sql.includes('INSERT INTO foods')) {
          return { rows: [{ id: 'food-new' }] };
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    (poolManagerNamed.getClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      client
    );
    await foodRepository.createFoodsInBulk(
      UID,
      rows.map((row) => ({ name: 'Cola', brand: 'Fizz', ...row })) as never,
      false
    );
    return calls;
  }

  function foodInsert(calls: QueryCall[]): QueryCall {
    const call = calls.find((c) => c.sql.includes('INSERT INTO foods'));
    if (!call) throw new Error('no foods INSERT was issued');
    return call;
  }

  it('stores the values a row carries', async () => {
    const insert = foodInsert(
      await runCreateImport([
        {
          serving_size: 100,
          serving_unit: 'ml',
          nutri_score_category: 'beverage',
          fruit_veg_legume_percent: 0,
        },
      ])
    );
    expect(insert.sql).toContain(
      'fruit_veg_legume_percent, nutri_score_category'
    );
    expect(insert.params.slice(11, 13)).toEqual([0, 'beverage']);
  });

  it('stores null for a missing or blank column', async () => {
    const insert = foodInsert(
      await runCreateImport([
        { serving_size: 100, serving_unit: 'ml', nutri_score_category: '' },
      ])
    );
    expect(insert.params.slice(11, 13)).toEqual([null, null]);
  });

  it('takes the first stated value across a food’s variant rows', async () => {
    const insert = foodInsert(
      await runCreateImport([
        { serving_size: 100, serving_unit: 'ml', is_default: true },
        {
          serving_size: 350,
          serving_unit: 'ml',
          nutri_score_category: 'beverage',
        },
      ])
    );
    expect(insert.params[12]).toBe('beverage');
  });

  it('rejects an unknown Nutri-Score category before touching the database', async () => {
    await expect(
      runCreateImport([
        { serving_size: 100, serving_unit: 'g', nutri_score_category: 'water' },
      ])
    ).rejects.toMatchObject({ name: 'ValidationError' });
  });

  it('stores added sugars on the variant, null when unknown', async () => {
    const variantInsert = (calls: QueryCall[]) =>
      calls.find((c) => c.sql.includes('INSERT INTO food_variants'))!;
    const stated = variantInsert(
      await runCreateImport([
        { serving_size: 350, serving_unit: 'ml', added_sugars: '10.6' },
      ])
    );
    const blank = variantInsert(
      await runCreateImport([
        { serving_size: 350, serving_unit: 'ml', added_sugars: '' },
      ])
    );
    expect(stated.params.at(-1)).toBe(10.6);
    expect(blank.params.at(-1)).toBeNull();
  });

  it('never writes a provider grade from an import row', async () => {
    const insert = foodInsert(
      await runCreateImport([
        {
          serving_size: 100,
          serving_unit: 'g',
          provider_nutriscore_grade: 'a',
        },
      ])
    );
    expect(insert.sql).not.toContain('provider_nutriscore_grade');
    expect(insert.params).not.toContain('a');
  });

  it('rejects an out-of-range percentage before touching the database', async () => {
    await expect(
      runCreateImport([
        {
          serving_size: 100,
          serving_unit: 'g',
          fruit_veg_legume_percent: 120,
        },
      ])
    ).rejects.toMatchObject({ name: 'ValidationError' });
    expect(poolManagerNamed.getClient).not.toHaveBeenCalled();
  });

  it('keeps stored values on overwrite when the import omits them', async () => {
    const calls = await runOverwriteImport({
      serving_size: 100,
      serving_unit: 'g',
      calories: 250,
    });
    const update = calls.find((c) => c.sql.includes('UPDATE foods SET'));
    expect(update?.sql).toContain(
      'fruit_veg_legume_percent = COALESCE($6, fruit_veg_legume_percent)'
    );
    expect(update?.params.slice(5, 7)).toEqual([null, null]);
  });
});
