import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MoveDiaryEntriesBody } from '@workspace/shared';
import { getClient } from '../db/poolManager.js';
import { moveDiaryEntries } from '../models/foodEntryMove.js';

vi.mock('../db/poolManager.js', () => ({ getClient: vi.fn() }));

const query = vi.fn();
const release = vi.fn();

const move: MoveDiaryEntriesBody = {
  sourceDate: '2026-11-24',
  targetDate: '2026-11-25',
  targetMealTypeId: 'target-category',
  foodEntryIds: ['standalone-food'],
  loggedMealIds: ['logged-meal'],
};

describe('moveDiaryEntries', () => {
  beforeEach(() => {
    query.mockReset();
    release.mockClear();
    vi.mocked(getClient).mockResolvedValue({
      query,
      release,
    } as unknown as Awaited<ReturnType<typeof getClient>>);
  });

  it('moves the logged meal and food rows in the same transaction', async () => {
    query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ food_entry_meal_id: null }] })
      .mockResolvedValueOnce({});

    await moveDiaryEntries('owner', 'actor', move);

    expect(getClient).toHaveBeenCalledWith('owner', 'actor');
    expect(query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('UPDATE food_entry_meals'),
      [
        '2026-11-25',
        'target-category',
        'actor',
        'owner',
        ['logged-meal'],
        '2026-11-24',
      ]
    );
    expect(query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('UPDATE food_entries'),
      [
        '2026-11-25',
        'target-category',
        'actor',
        'owner',
        ['logged-meal'],
        '2026-11-24',
        ['standalone-food'],
      ]
    );
    expect(query).toHaveBeenLastCalledWith('COMMIT');
    expect(release).toHaveBeenCalled();
  });

  it('rolls back both changes if a selected food is stale or inaccessible', async () => {
    query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ food_entry_meal_id: 'logged-meal' }] })
      .mockResolvedValueOnce({});

    await expect(
      moveDiaryEntries('owner', 'actor', move)
    ).rejects.toMatchObject({
      statusCode: 409,
    });

    expect(query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(release).toHaveBeenCalled();
  });

  it('rejects an unavailable destination before changing any entries', async () => {
    query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({});

    await expect(
      moveDiaryEntries('owner', 'actor', move)
    ).rejects.toMatchObject({
      name: 'ValidationError',
    });

    expect(query).toHaveBeenCalledTimes(3);
    expect(query).toHaveBeenLastCalledWith('ROLLBACK');
  });
});
