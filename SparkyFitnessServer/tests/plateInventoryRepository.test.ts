import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';
import { getClient } from '../db/poolManager.js';
import {
  activateGym,
  createGym,
  deleteGym,
  deletePlateInventory,
  getPlateInventory,
  listGyms,
  savePlateInventory,
} from '../models/plateInventoryRepository.js';

vi.mock('../db/poolManager.js', () => ({ getClient: vi.fn() }));

const row = {
  id: 'inv-1',
  user_id: 'user-1',
  weight_unit: 'kg',
  bars: [{ id: 'b1', name: null, kind: 'barbell', weight: 20 }],
  plates: [{ weight: 20, pairs: 2 }],
  collars_enabled: false,
  collar_weight: '2.500',
  created_at: '2026-10-24T00:00:00Z',
  updated_at: '2026-10-24T00:00:00Z',
};
const query = vi.fn(async (_sql: string, _params?: unknown[]) => ({
  rows: [row],
  rowCount: 1,
}));
const release = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  query.mockResolvedValue({ rows: [row], rowCount: 1 });
  vi.mocked(getClient).mockResolvedValue({
    query,
    release,
  } as unknown as PoolClient);
});

describe('plateInventoryRepository', () => {
  it('reads through an RLS-scoped client and maps numeric columns', async () => {
    const inventory = await getPlateInventory('user-1', 'auth-1');
    expect(getClient).toHaveBeenCalledWith('user-1', 'auth-1');
    expect(inventory?.collar_weight).toBe(2.5);
    expect(inventory?.created_at).toBe('2026-10-24T00:00:00.000Z');
    expect(release).toHaveBeenCalledOnce();
  });

  it('returns null when nothing is saved', async () => {
    query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    expect(await getPlateInventory('user-1')).toBeNull();
  });

  const body = {
    weight_unit: 'kg' as const,
    bars: [{ id: 'b1', name: null, kind: 'barbell' as const, weight: 20 }],
    plates: [{ weight: 20, pairs: 2 }],
    collars_enabled: false,
    collar_weight: 2.5,
  };

  it('updates the active gym and records who made the change', async () => {
    await savePlateInventory('user-1', body, 'delegate-1');
    expect(query).toHaveBeenCalledOnce();
    const [sql, params] = query.mock.calls[0]!;
    expect(sql).toContain('WHERE user_id = $1 AND is_active');
    expect(params?.[0]).toBe('user-1');
    expect(params?.[2]).toBe(JSON.stringify(body.bars));
    expect(params?.[6]).toBe('delegate-1');
    // An older app sends no gym fields, so stored ones are kept.
    expect(params?.slice(7)).toEqual([null, null, null, false]);
    expect(release).toHaveBeenCalledOnce();
  });

  it('inserts the first gym when none is active', async () => {
    query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const saved = await savePlateInventory('user-1', {
      ...body,
      name: 'Home',
      dumbbells: [2, 4],
    });
    expect(saved.id).toBe('inv-1');
    const [sql, params] = query.mock.calls[1]!;
    expect(sql).toContain('INSERT INTO plate_inventories');
    expect(params).toHaveLength(10);
    expect(params?.[7]).toBe('Home');
    expect(params?.[8]).toBe('[2,4]');
  });

  it('maps a gym row without the new columns to safe defaults', async () => {
    const inventory = await getPlateInventory('user-1');
    expect(inventory?.dumbbells).toEqual([]);
    expect(inventory?.machine_stacks).toEqual([]);
    expect(inventory?.name).toBeNull();
  });

  it('deletes the active gym in a transaction and activates another', async () => {
    expect(await deletePlateInventory('user-1')).toBe(true);
    const sqls = query.mock.calls.map((c) => c[0]);
    expect(sqls[0]).toBe('BEGIN');
    expect(sqls[2]).toContain('SET is_active = TRUE');
    expect(sqls[3]).toBe('COMMIT');
    query.mockClear();
    query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    expect(await deletePlateInventory('user-1')).toBe(false);
    expect(release).toHaveBeenCalledTimes(2);
  });

  it('lists gyms active first', async () => {
    const gyms = await listGyms('user-1');
    expect(gyms).toHaveLength(1);
    expect(query.mock.calls[0]![0]).toContain('ORDER BY is_active DESC');
  });

  it('creates a gym as the only active one', async () => {
    await createGym('user-1', { ...body, name: 'Work' });
    const sqls = query.mock.calls.map((c) => c[0]);
    expect(sqls[1]).toContain('SET is_active = FALSE');
    expect(sqls[2]).toContain('INSERT INTO plate_inventories');
    expect(query.mock.calls[2]![1]?.[1]).toBe('Work');
  });

  it("won't activate another person's gym", async () => {
    query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    expect(await activateGym('user-1', 'gym-x')).toBeNull();
    expect(query.mock.calls.at(-1)![0]).toBe('COMMIT');
  });

  it('activates a gym after clearing the others', async () => {
    expect((await activateGym('user-1', 'inv-1'))?.id).toBe('inv-1');
    expect(query.mock.calls[2]![0]).toContain('SET is_active = FALSE');
  });

  it('deletes a gym by id', async () => {
    expect(await deleteGym('user-1', 'inv-1')).toBe(true);
    expect(query.mock.calls[1]![1]).toEqual(['inv-1', 'user-1']);
  });
});
