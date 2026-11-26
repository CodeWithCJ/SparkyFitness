import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getClient } from '../db/poolManager.js';
import { createFoodEntry } from '../models/foodEntry.js';

vi.mock('../db/poolManager.js', () => ({ getClient: vi.fn() }));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CLIENT_ID = '22222222-2222-4222-8222-222222222222';
const INDEX = 'idx_food_entries_user_client_id';

const entry = {
  user_id: USER_ID,
  food_id: 'food-1',
  variant_id: 'variant-1',
  meal_type_id: 'meal-type-1',
  quantity: 1,
  unit: 'serving',
  entry_date: '2026-10-17',
  client_id: CLIENT_ID,
};

describe('createFoodEntry client_id (offline replay)', () => {
  const query = vi.fn();
  const release = vi.fn();
  const existing = { id: 'existing-entry', client_id: CLIENT_ID };

  const isInsert = (sql: string) => sql.includes('INSERT INTO food_entries');
  const isLookup = (sql: string) =>
    sql.includes('FROM food_entries WHERE user_id');

  beforeEach(() => {
    query.mockReset();
    release.mockReset();
    vi.mocked(getClient).mockReset();
    vi.mocked(getClient).mockResolvedValue({ query, release } as never);
  });

  it('returns the entry a previous request created and inserts nothing', async () => {
    query.mockImplementation(async (sql: string) =>
      isLookup(sql) ? { rows: [existing] } : { rows: [] }
    );

    const result = await createFoodEntry(entry, USER_ID);

    expect(result).toBe(existing);
    expect(query.mock.calls.some(([sql]) => isInsert(sql))).toBe(false);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('client_id'), [
      USER_ID,
      CLIENT_ID,
    ]);
    expect(query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('stores the client id on a first request', async () => {
    query.mockImplementation(async (sql: string) => {
      if (isLookup(sql)) return { rows: [] };
      if (sql.includes('FROM foods f')) return { rows: [{ name: 'Apple' }] };
      if (isInsert(sql)) return { rows: [{ id: 'new-entry' }] };
      return { rows: [] };
    });

    const result = await createFoodEntry(entry, USER_ID);

    expect(result).toEqual({ id: 'new-entry' });
    const insert = query.mock.calls.find(([sql]) => isInsert(sql));
    expect(insert?.[0]).toContain('client_id');
    expect(insert?.[1].at(-1)).toBe(CLIENT_ID);
  });

  it('leaves client_id null when the request has none', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM foods f')) return { rows: [{ name: 'Apple' }] };
      if (isInsert(sql)) return { rows: [{ id: 'new-entry' }] };
      return { rows: [] };
    });

    await createFoodEntry({ ...entry, client_id: undefined }, USER_ID);

    expect(query.mock.calls.some(([sql]) => isLookup(sql))).toBe(false);
    const insert = query.mock.calls.find(([sql]) => isInsert(sql));
    expect(insert?.[1].at(-1)).toBeNull();
  });

  it('answers a request that lost the race with the winner instead of failing', async () => {
    let lookups = 0;
    query.mockImplementation(async (sql: string) => {
      if (isLookup(sql)) {
        lookups += 1;
        return { rows: lookups === 1 ? [] : [existing] };
      }
      if (sql.includes('FROM foods f')) return { rows: [{ name: 'Apple' }] };
      if (isInsert(sql)) {
        throw Object.assign(new Error('duplicate key'), {
          code: '23505',
          constraint: INDEX,
        });
      }
      return { rows: [] };
    });

    await expect(createFoodEntry(entry, USER_ID)).resolves.toBe(existing);
    expect(release).toHaveBeenCalled();
  });

  it('still throws a unique violation on some other index', async () => {
    query.mockImplementation(async (sql: string) => {
      if (isLookup(sql)) return { rows: [] };
      if (sql.includes('FROM foods f')) return { rows: [{ name: 'Apple' }] };
      if (isInsert(sql)) {
        throw Object.assign(new Error('duplicate key'), {
          code: '23505',
          constraint: 'idx_food_entries_user_source_source_id',
        });
      }
      return { rows: [] };
    });

    await expect(createFoodEntry(entry, USER_ID)).rejects.toThrow(
      'duplicate key'
    );
  });
});
