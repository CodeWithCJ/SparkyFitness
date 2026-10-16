import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';
import { getClient } from '../db/poolManager.js';
import { createShoe, updateShoe } from '../models/shoeRepository.js';

vi.mock('../db/poolManager.js', () => ({ getClient: vi.fn() }));
const row = {
  id: 'shoe-1',
  user_id: 'user-1',
  name: 'Trainer',
  status: 'active',
  is_default: true,
  starting_distance_km: 0,
  logged_distance_km: 0,
  retirement_distance_km: 800,
  run_count: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};
const query = vi.fn(async (_sql: string, _params?: unknown[]) => ({
  rows: [row],
}));
const release = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  query.mockResolvedValue({ rows: [row] });
  vi.mocked(getClient).mockResolvedValue({
    query,
    release,
  } as unknown as PoolClient);
});

const lockSql = 'SELECT pg_advisory_xact_lock(hashtext($1))';

describe('shoe default transactions', () => {
  it('locks a default creation before clearing the previous default', async () => {
    await createShoe('user-1', { name: 'Trainer', is_default: true });
    expect(query.mock.calls[0][0]).toBe('BEGIN');
    expect(query.mock.calls[1]).toEqual([lockSql, ['shoes:user-1']]);
    expect(query.mock.calls[2][0]).toContain('SET is_default = FALSE');
    expect(query.mock.calls.at(-1)?.[0]).toBe('COMMIT');
    expect(release).toHaveBeenCalledOnce();
  });

  it('locks before reading the current shoe even when the default field is omitted', async () => {
    await updateShoe('user-1', 'shoe-1', { name: 'Renamed' });
    expect(query.mock.calls[0][0]).toBe('BEGIN');
    expect(query.mock.calls[1]).toEqual([lockSql, ['shoes:user-1']]);
    expect(query.mock.calls[2][0]).toContain('FROM shoes s');
    expect(query.mock.calls[3][0]).toContain('SET is_default = FALSE');
    expect(query.mock.calls.at(-1)?.[0]).toBe('COMMIT');
  });

  it('rolls back and releases the client on a lock failure', async () => {
    const error = new Error('lock failed');
    query.mockResolvedValueOnce({ rows: [] }).mockRejectedValueOnce(error);
    await expect(
      updateShoe('user-1', 'shoe-1', { is_default: true })
    ).rejects.toThrow(error);
    expect(query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
    expect(release).toHaveBeenCalledOnce();
  });
});
