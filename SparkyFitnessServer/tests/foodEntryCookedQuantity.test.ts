import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import foodEntryRepository from '../models/foodEntry.js';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));

/**
 * food_entries.cooked_quantity (#3534) is the cooked weight eaten, in the unit
 * of quantity. The repository writes whatever the service resolved, copies it
 * with a day, and leaves it out of the provider re-sync.
 */
interface MockClient {
  query: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
}

describe('food_entries.cooked_quantity in the repository', () => {
  let mockClient: MockClient;

  const callFor = (fragment: string): [string, unknown[]] => {
    const call = mockClient.query.mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && c[0].includes(fragment)
    );
    if (!call) throw new Error(`No query matched ${fragment}`);
    return [call[0] as string, (call[1] ?? []) as unknown[]];
  };

  beforeEach(() => {
    mockClient = { query: vi.fn(), release: vi.fn() };
    mockClient.query.mockResolvedValue({ rows: [{ id: 'entry-1' }] });
    vi.mocked(getClient).mockResolvedValue(
      mockClient as unknown as Awaited<ReturnType<typeof getClient>>
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('writes cooked_quantity as $46 on create and keeps it out of the re-sync', async () => {
    await foodEntryRepository.createFoodEntry(
      {
        user_id: 'user-1',
        meal_type_id: 'meal-1',
        quantity: 120,
        unit: 'g',
        entry_date: '2026-11-15',
        food_name: 'Rice, dry',
        serving_size: 100,
        serving_unit: 'g',
        calories: 360,
        cooked_quantity: 300,
      },
      'user-1'
    );
    const [sql, params] = callFor('INSERT INTO food_entries');
    expect(sql).toContain('cooked_quantity');
    expect(sql).toContain('$46');
    expect(params).toHaveLength(46);
    expect(params[45]).toBe(300);
    const doUpdate = sql.slice(sql.indexOf('DO UPDATE'));
    expect(doUpdate).not.toContain('cooked_quantity');
  });

  it('writes null on create when the entry was not weighed cooked', async () => {
    await foodEntryRepository.createFoodEntry(
      {
        user_id: 'user-1',
        meal_type_id: 'meal-1',
        quantity: 1,
        unit: 'cup',
        entry_date: '2026-11-15',
        food_name: 'Milk',
        serving_size: 1,
        serving_unit: 'cup',
        calories: 120,
      },
      'user-1'
    );
    const [, params] = callFor('INSERT INTO food_entries');
    expect(params[45]).toBeNull();
  });

  it('assigns the resolved value as $40 on update', async () => {
    await foodEntryRepository.updateFoodEntry(
      'entry-1',
      'user-1',
      'user-1',
      { quantity: 120, cooked_quantity: 300 },
      { food_name: 'Rice, dry', calories: 360 }
    );
    const [sql, params] = callFor('UPDATE food_entries SET');
    expect(sql).toContain('cooked_quantity = $40');
    expect(params[39]).toBe(300);
  });

  it('copies cooked_quantity in a bulk insert (copy a day)', async () => {
    await foodEntryRepository.bulkCreateFoodEntries(
      [
        {
          user_id: 'user-1',
          meal_type_id: 'meal-1',
          quantity: 120,
          unit: 'g',
          entry_date: '2026-11-16',
          created_by_user_id: 'user-1',
          cooked_quantity: 300,
        },
        {
          user_id: 'user-1',
          meal_type_id: 'meal-1',
          quantity: 1,
          unit: 'cup',
          entry_date: '2026-11-16',
          created_by_user_id: 'user-1',
        },
      ],
      'user-1'
    );
    const [sql] = callFor('INSERT INTO food_entries');
    expect(sql).toMatch(/notes,\s+cooked_quantity\s+\)/);
    // pg-format inlines the values: the cooked row ends in 300, the other in NULL.
    expect(sql).toContain("'300')");
    expect(sql).toMatch(/NULL\)\s*RETURNING/);
  });

  it('selects cooked_quantity when reading the entries of a day', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });
    await foodEntryRepository.getFoodEntriesByDate('user-1', '2026-11-15');
    const [sql] = callFor('FROM food_entries');
    expect(sql).toContain('fe.cooked_quantity');
  });

  it('finds the last cooked entry of a food outside logged meals', async () => {
    mockClient.query.mockResolvedValue({
      rows: [
        {
          id: 'entry-9',
          entry_date: '2026-11-13',
          quantity: 120,
          unit: 'g',
          cooked_quantity: 300,
        },
      ],
    });
    const row = await foodEntryRepository.getLastCookedFoodEntry(
      'user-1',
      'food-1'
    );
    const [sql, params] = callFor('cooked_quantity IS NOT NULL');
    expect(sql).toContain('fe.food_entry_meal_id IS NULL');
    expect(sql).toContain('ORDER BY fe.entry_date DESC, fe.created_at DESC');
    expect(sql).toContain('LIMIT 1');
    expect(params).toEqual(['user-1', 'food-1']);
    expect(row).toMatchObject({ id: 'entry-9', cooked_quantity: 300 });
  });

  it('returns null when the food was never logged cooked', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });
    await expect(
      foodEntryRepository.getLastCookedFoodEntry('user-1', 'food-1')
    ).resolves.toBeNull();
  });
});
