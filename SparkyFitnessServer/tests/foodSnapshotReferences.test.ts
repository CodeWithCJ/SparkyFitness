import type { PoolClient } from 'pg';
import { expect, it, vi } from 'vitest';
import { prepareCopiedFoodSnapshots } from '../models/foodSnapshotReferenceRepository.js';

it('retains available references and drops unavailable links only from new copies', async () => {
  const query = vi.fn().mockResolvedValue({ rows: [{ id: 'available' }] });
  const client = { query } as unknown as PoolClient;
  const rows = [
    { variant_id: 'available', calories: 80, notes: 'Original' },
    { variant_id: 'missing', calories: 100, notes: 'Legacy snapshot' },
    { variant_id: 'missing', calories: 200, notes: 'Another snapshot' },
  ];
  const copied = await prepareCopiedFoodSnapshots(client, rows);
  expect(copied).toEqual([
    rows[0],
    { ...rows[1], variant_id: null },
    { ...rows[2], variant_id: null },
  ]);
  expect(rows[1]!.variant_id).toBe('missing');
  expect(query).toHaveBeenCalledOnce();
  expect(query).toHaveBeenCalledWith(
    expect.stringContaining('SELECT id FROM public.food_variants'),
    [['available', 'missing']]
  );
});
it('does not query for unlinked history and never replaces unknown nutrition', async () => {
  const query = vi.fn();
  const rows = [{ variant_id: null, calories: null }, { calories: 0 }];
  expect(
    await prepareCopiedFoodSnapshots({ query } as unknown as PoolClient, rows)
  ).toEqual(rows);
  expect(query).not.toHaveBeenCalled();
});
it('aborts a copy when its source-reference lookup fails', async () => {
  const query = vi.fn().mockRejectedValue(new Error('Source lock failed'));
  await expect(
    prepareCopiedFoodSnapshots({ query } as unknown as PoolClient, [
      { variant_id: 'source' },
    ])
  ).rejects.toThrow('Source lock failed');
});
