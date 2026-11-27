import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MoveDiaryEntriesBody } from '@workspace/shared';
import { getClient } from '../db/poolManager.js';
import { moveDiaryEntries } from '../models/foodEntryMove.js';
import {
  lockWaterAggregates,
  recomputeWaterAggregate,
} from '../models/measurementRepository.js';

vi.mock('../db/poolManager.js', () => ({ getClient: vi.fn() }));
vi.mock('../models/measurementRepository.js', () => ({
  lockWaterAggregates: vi.fn(),
  recomputeWaterAggregate: vi.fn(),
}));

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
    vi.mocked(lockWaterAggregates).mockReset();
    vi.mocked(recomputeWaterAggregate).mockReset();
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
      .mockResolvedValueOnce({
        rows: [{ id: 'standalone-food', food_entry_meal_id: null }],
      })
      .mockResolvedValueOnce({ rows: [] });

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

  function mockLinkedDrinks() {
    query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [
          { id: 'standalone-food', food_entry_meal_id: null },
          { id: 'component-food', food_entry_meal_id: 'logged-meal' },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { id: 'drink-1', entryDate: move.sourceDate, source: 'manual' },
          { id: 'drink-2', entryDate: move.sourceDate, source: 'manual' },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 2 });
  }

  it('moves drink credits for standalone foods and meal components and rebuilds both days', async () => {
    mockLinkedDrinks();
    await moveDiaryEntries('owner', 'actor', move);

    expect(query).toHaveBeenNthCalledWith(
      5,
      expect.stringContaining('FROM water_intake_entries'),
      ['owner', ['standalone-food', 'component-food'], move.targetDate]
    );
    expect(lockWaterAggregates).toHaveBeenCalledWith(
      expect.objectContaining({ query }),
      'owner',
      [
        { entryDate: move.sourceDate, source: 'manual' },
        { entryDate: move.targetDate, source: 'manual' },
      ]
    );
    expect(
      vi.mocked(lockWaterAggregates).mock.invocationCallOrder[0]
    ).toBeLessThan(query.mock.invocationCallOrder[5]);
    expect(query).toHaveBeenNthCalledWith(
      6,
      expect.stringContaining('UPDATE water_intake_entries'),
      [
        move.targetDate,
        'owner',
        ['drink-1', 'drink-2'],
        [move.sourceDate, move.sourceDate],
        ['manual', 'manual'],
      ]
    );
    expect(recomputeWaterAggregate).toHaveBeenCalledTimes(2);
    for (const date of [move.sourceDate, move.targetDate]) {
      expect(recomputeWaterAggregate).toHaveBeenCalledWith(
        expect.objectContaining({ query }),
        'owner',
        'actor',
        date,
        'manual'
      );
    }
    expect(query).toHaveBeenLastCalledWith('COMMIT');
  });

  it('rolls the entire move back if rebuilding a water total fails', async () => {
    mockLinkedDrinks();
    vi.mocked(recomputeWaterAggregate).mockRejectedValueOnce(
      new Error('water total unavailable')
    );

    await expect(moveDiaryEntries('owner', 'actor', move)).rejects.toThrow(
      'water total unavailable'
    );
    expect(query).toHaveBeenLastCalledWith('ROLLBACK');
  });

  it('does not change the hydration ledger for a move within one day', async () => {
    query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [{ id: 'standalone-food', food_entry_meal_id: null }],
      });

    await moveDiaryEntries('owner', 'actor', {
      ...move,
      targetDate: move.sourceDate,
    });

    expect(query).toHaveBeenCalledTimes(5);
    expect(lockWaterAggregates).not.toHaveBeenCalled();
    expect(recomputeWaterAggregate).not.toHaveBeenCalled();
    expect(query).toHaveBeenLastCalledWith('COMMIT');
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
