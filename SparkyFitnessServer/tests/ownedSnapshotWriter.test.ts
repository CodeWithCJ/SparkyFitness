import { beforeEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import {
  insertOwnedSnapshot,
  updateOwnedSnapshot,
} from '../utils/ownedSnapshotWriter.js';
const id = randomUUID(),
  user = randomUUID(),
  food = randomUUID();
const query = vi.fn();
const client = { query } as unknown as PoolClient;
beforeEach(() => {
  vi.resetAllMocks();
  query.mockImplementation(async (sql: string) =>
    sql.includes('pg_attribute')
      ? {
          rows: [
            'id',
            'user_id',
            'food_id',
            'quantity',
            'notes',
            'created_at',
            'updated_at',
          ].map((name) => ({ name })),
          rowCount: 7,
        }
      : { rows: [{ id }], rowCount: 1 }
  );
});
it('rejects foreign snapshot owners before issuing SQL', async () => {
  await expect(
    insertOwnedSnapshot(client, 'food_entries', user, {
      id,
      user_id: randomUUID(),
    })
  ).rejects.toThrow(/owner/);
  await expect(
    updateOwnedSnapshot(client, 'foods', user, { id, user_id: randomUUID() })
  ).rejects.toThrow(/owner/);
  expect(query).not.toHaveBeenCalled();
});
it('inserts only supplied columns to retain database defaults and gates the actor in SQL', async () => {
  const value = { id, user_id: user, quantity: 2 };
  await insertOwnedSnapshot(client, 'food_entries', user, value);
  expect(query.mock.calls[0]![1]).toEqual([
    'public.food_entries',
    '',
    Object.keys(value),
  ]);
  expect(query.mock.calls[1]![0]).toContain('record.user_id=$3');
  expect(query.mock.calls[1]![1]).toEqual([JSON.stringify(value), id, user]);
});
it('preserves creation metadata and lets an explicitly replaced diary food change its food identity', async () => {
  await updateOwnedSnapshot(client, 'food_entries', user, {
    id,
    user_id: user,
    food_id: food,
    quantity: 2,
    notes: 'kept',
  });
  const sql = query.mock.calls[1]![0] as string;
  expect(sql).toContain('"food_id"');
  expect(sql).not.toContain('record."created_at"');
  expect(sql).toContain('stored.user_id=$3');
});
it('a variant update cannot transfer its parent food and verifies that parent is owned', async () => {
  await updateOwnedSnapshot(
    client,
    'food_variants',
    user,
    { id, food_id: food, quantity: 2 },
    true
  );
  const sql = query.mock.calls[1]![0] as string;
  expect(sql).toContain('stored.food_id=record.food_id');
  expect(sql).toContain('f.user_id=$3');
  expect(sql).not.toContain('record."food_id"');
  expect(sql).toContain('updated_at=now()');
  query
    .mockResolvedValueOnce({ rows: [{ name: 'id' }] })
    .mockResolvedValueOnce({ rowCount: 0 });
  await expect(
    updateOwnedSnapshot(client, 'food_variants', user, { id, food_id: food })
  ).rejects.toThrow(/no longer owned/);
});
