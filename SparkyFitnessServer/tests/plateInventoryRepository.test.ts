import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';
import { getClient } from '../db/poolManager.js';
import {
  deletePlateInventory,
  getPlateInventory,
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

  it('upserts on the user and records who made the change', async () => {
    await savePlateInventory(
      'user-1',
      {
        weight_unit: 'kg',
        bars: [{ id: 'b1', name: null, kind: 'barbell', weight: 20 }],
        plates: [{ weight: 20, pairs: 2 }],
        collars_enabled: false,
        collar_weight: 2.5,
      },
      'delegate-1'
    );
    const [sql, params] = query.mock.calls[0]!;
    expect(sql).toContain('ON CONFLICT (user_id) DO UPDATE');
    expect(params?.[0]).toBe('user-1');
    expect(params?.[2]).toBe(
      JSON.stringify([{ id: 'b1', name: null, kind: 'barbell', weight: 20 }])
    );
    expect(params?.[6]).toBe('delegate-1');
    expect(release).toHaveBeenCalledOnce();
  });

  it('reports whether a row was deleted and releases the client', async () => {
    expect(await deletePlateInventory('user-1')).toBe(true);
    query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    expect(await deletePlateInventory('user-1')).toBe(false);
    expect(release).toHaveBeenCalledTimes(2);
  });
});
