import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSystemClient } from '../db/poolManager.js';
import openFoodFactsSyncQueueRepository from '../models/openFoodFactsSyncQueueRepository.js';

vi.mock('../db/poolManager.js', () => ({
  getSystemClient: vi.fn(),
}));

interface FakeClient {
  query: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
}

const fakeClient: FakeClient = {
  query: vi.fn(),
  release: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  fakeClient.query.mockResolvedValue({ rows: [], rowCount: 0 });
  vi.mocked(getSystemClient).mockResolvedValue(fakeClient as never);
});

describe('openFoodFactsSyncQueueRepository backfill', () => {
  it('feeds at most one bounded backlog batch without returning every queued row', async () => {
    fakeClient.query.mockResolvedValue({
      rows: [{ userId: 'user-1', enqueued: '100', hasMore: true }],
      rowCount: 1,
    });

    await expect(
      openFoodFactsSyncQueueRepository.enqueueNextBackfillBatch(100)
    ).resolves.toEqual({
      userId: 'user-1',
      enqueued: 100,
      hasMore: true,
    });

    const [query, params] = fakeClient.query.mock.calls[0] as [
      string,
      unknown[],
    ];
    expect(query).toContain('FOR UPDATE OF preferences SKIP LOCKED');
    expect(query).toContain('LIMIT $1');
    expect(query).toContain('COUNT(*)');
    expect(query).not.toContain('RETURNING food_id');
    expect(params).toEqual([100]);
    expect(fakeClient.release).toHaveBeenCalledTimes(1);
  });

  it('rejects an unbounded backlog request before opening a database client', async () => {
    await expect(
      openFoodFactsSyncQueueRepository.enqueueNextBackfillBatch(101)
    ).rejects.toThrow(/between 1 and 100/i);
    expect(getSystemClient).not.toHaveBeenCalled();
  });
});

describe('openFoodFactsSyncQueueRepository worker operations', () => {
  it('does not expose obsolete compatibility or trigger-owned cleanup APIs', () => {
    expect(openFoodFactsSyncQueueRepository).not.toHaveProperty('complete');
    expect(openFoodFactsSyncQueueRepository).not.toHaveProperty(
      'deleteForUser'
    );
    expect(openFoodFactsSyncQueueRepository).not.toHaveProperty(
      'deleteActionable'
    );
  });

  it('claims only a bounded number of due rows below the attempt ceiling', async () => {
    fakeClient.query.mockResolvedValue({
      rows: [
        {
          foodId: 'food-1',
          userId: 'user-1',
          revision: '4',
          attemptCount: 3,
        },
      ],
      rowCount: 1,
    });

    await expect(
      openFoodFactsSyncQueueRepository.claimDue(1, 300, 8)
    ).resolves.toEqual([
      {
        foodId: 'food-1',
        userId: 'user-1',
        revision: 4,
        attemptCount: 3,
      },
    ]);

    const [query, params] = fakeClient.query.mock.calls[0] as [
      string,
      unknown[],
    ];
    expect(query).toContain('FOR UPDATE OF queue SKIP LOCKED');
    expect(query).not.toContain('rate_limit');
    expect(query).toContain('attempt_count < $3');
    expect(query).toContain('attempt_count = queue.attempt_count + 1');
    expect(query).toContain('allow_openfoodfacts_contributions = TRUE');
    expect(query).toContain('auto_contribute_openfoodfacts = TRUE');
    expect(query).toContain(
      "revision = nextval('public.openfoodfacts_sync_revision_seq')"
    );
    expect(params).toEqual([1, 300, 8]);
  });

  it('rejects multi-product claims before opening a database client', async () => {
    await expect(
      openFoodFactsSyncQueueRepository.claimDue(2, 300, 8)
    ).rejects.toThrow(/between 1 and 1/i);
    expect(getSystemClient).not.toHaveBeenCalled();
  });

  it('defers local rate contention without spending the claimed attempt', async () => {
    fakeClient.query.mockResolvedValue({ rowCount: 1, rows: [] });

    await expect(
      openFoodFactsSyncQueueRepository.deferWithoutAttempt('food-1', 4, 5)
    ).resolves.toBe(true);

    const [query, params] = fakeClient.query.mock.calls[0] as [
      string,
      unknown[],
    ];
    expect(query).toContain("status = 'pending'");
    expect(query).toContain('attempt_count = GREATEST(attempt_count - 1, 0)');
    expect(query).toContain("status = 'processing'");
    expect(query).toContain('revision = $2');
    expect(query).toContain('lease_expires_at = NULL');
    expect(params).toEqual(['food-1', 4, 5]);
  });

  it('checks the complete active lease identity before a guarded write', async () => {
    fakeClient.query.mockResolvedValue({
      rowCount: 1,
      rows: [{ current: true }],
    });

    await expect(
      openFoodFactsSyncQueueRepository.isClaimCurrent('food-1', 'user-1', 4)
    ).resolves.toBe(true);

    const [query, params] = fakeClient.query.mock.calls[0] as [
      string,
      unknown[],
    ];
    expect(query).toContain('food_id = $1');
    expect(query).toContain('user_id = $2');
    expect(query).toContain('revision = $3');
    expect(query).toContain("status = 'processing'");
    expect(query).toContain('lease_expires_at > NOW()');
    expect(params).toEqual(['food-1', 'user-1', 4]);
  });

  it('rejects an otherwise identical processing claim after its lease expires', async () => {
    fakeClient.query.mockResolvedValue({
      rowCount: 1,
      rows: [{ current: false }],
    });

    await expect(
      openFoodFactsSyncQueueRepository.isClaimCurrent('food-1', 'user-1', 4)
    ).resolves.toBe(false);

    const [query] = fakeClient.query.mock.calls[0] as [string, unknown[]];
    expect(query).toContain("status = 'processing'");
    expect(query).toContain('lease_expires_at > NOW()');
  });

  it('retains a successfully published row at the claimed revision', async () => {
    fakeClient.query.mockResolvedValue({ rowCount: 1, rows: [] });

    await expect(
      openFoodFactsSyncQueueRepository.markSucceeded('food-1', 4)
    ).resolves.toBe(true);

    const [query, params] = fakeClient.query.mock.calls[0] as [
      string,
      unknown[],
    ];
    expect(query).toContain('UPDATE openfoodfacts_sync_queue');
    expect(query).toContain("status = 'succeeded'");
    expect(query).toContain('last_succeeded_at = NOW()');
    expect(query).toContain('revision = $2');
    expect(query).toContain("status = 'processing'");
    expect(query).not.toContain('DELETE FROM');
    expect(params).toEqual(['food-1', 4]);
  });

  it('makes a permanent failure terminal at the claimed revision', async () => {
    fakeClient.query.mockResolvedValue({ rowCount: 1, rows: [] });

    await expect(
      openFoodFactsSyncQueueRepository.markFailed(
        'food-1',
        4,
        'invalid barcode'
      )
    ).resolves.toBe(true);

    const [query, params] = fakeClient.query.mock.calls[0] as [
      string,
      unknown[],
    ];
    expect(query).toContain("status = 'failed'");
    expect(query).not.toContain('attempt_count = attempt_count + 1');
    expect(query).toContain('lease_expires_at = NULL');
    expect(query).toContain('revision = $2');
    expect(query).toContain("status = 'processing'");
    expect(params).toEqual(['food-1', 4, 'invalid barcode']);
  });

  it('turns a retry into a terminal failure when the attempt ceiling is reached', async () => {
    fakeClient.query.mockResolvedValue({
      rowCount: 1,
      rows: [{ status: 'failed' }],
    });

    await expect(
      openFoodFactsSyncQueueRepository.retry(
        'food-1',
        4,
        300,
        'temporary failure',
        8
      )
    ).resolves.toBe('failed');

    const [query, params] = fakeClient.query.mock.calls[0] as [
      string,
      unknown[],
    ];
    expect(query).toContain('attempt_count >= $5');
    expect(query).toContain("THEN 'failed'");
    expect(query).not.toContain('attempt_count = attempt_count + 1');
    expect(query).toContain('revision = $2');
    expect(query).toContain("status = 'processing'");
    expect(query).toContain('RETURNING status');
    expect(params).toEqual(['food-1', 4, 300, 'temporary failure', 8]);
  });
});

describe('openFoodFactsSyncQueueRepository visibility', () => {
  it('returns all four status totals for one user', async () => {
    fakeClient.query.mockResolvedValue({
      rowCount: 1,
      rows: [{ pending: '2', processing: '1', failed: '3', succeeded: '11' }],
    });

    await expect(
      openFoodFactsSyncQueueRepository.getStatusCounts('user-1')
    ).resolves.toEqual({
      pending: 2,
      processing: 1,
      failed: 3,
      succeeded: 11,
    });

    const [, params] = fakeClient.query.mock.calls[0] as [string, unknown[]];
    expect(params).toEqual(['user-1']);
  });

  it('returns bounded recent failures without exposing provider credentials', async () => {
    const failedAt = new Date('2026-09-04T10:00:00.000Z');
    fakeClient.query.mockResolvedValue({
      rowCount: 1,
      rows: [
        {
          foodId: 'food-1',
          foodName: 'Test food',
          userId: 'user-1',
          attemptCount: '8',
          error: 'invalid barcode',
          updatedAt: failedAt,
        },
      ],
    });

    await expect(
      openFoodFactsSyncQueueRepository.getRecentFailures('user-1', 10)
    ).resolves.toEqual([
      {
        foodId: 'food-1',
        foodName: 'Test food',
        attemptCount: 8,
        error: 'invalid barcode',
        updatedAt: '2026-09-04T10:00:00.000Z',
      },
    ]);

    const [query, params] = fakeClient.query.mock.calls[0] as [
      string,
      unknown[],
    ];
    expect(query).toContain("queue.status = 'failed'");
    expect(query).not.toContain('external_data_providers');
    expect(params).toEqual(['user-1', 10]);
  });

  it('reports the feature active only when server and user consent coexist', async () => {
    fakeClient.query.mockResolvedValue({
      rowCount: 1,
      rows: [{ active: true }],
    });

    await expect(
      openFoodFactsSyncQueueRepository.isFeatureActive()
    ).resolves.toBe(true);

    const [query] = fakeClient.query.mock.calls[0] as [string, unknown[]];
    expect(query).toContain('allow_openfoodfacts_contributions = TRUE');
    expect(query).toContain('auto_contribute_openfoodfacts = TRUE');
  });
});
