import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';
import { getClient } from '../db/poolManager.js';
import {
  claimActionTagRun,
  releaseActionTagRun,
} from '../models/actionTagRepository.js';

vi.mock('../db/poolManager.js', () => ({ getClient: vi.fn() }));

const query = vi.fn();
const release = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getClient).mockResolvedValue({
    query,
    release,
  } as unknown as PoolClient);
});

describe('claimActionTagRun', () => {
  it('returns what it wrote, so a rollback can recognise its own claim', async () => {
    query.mockResolvedValue({
      rows: [
        {
          previous_run_at: '2026-10-30T11:59:00.000Z',
          claimed_at: '2026-10-30T12:00:00.123Z',
        },
      ],
    });
    const claim = await claimActionTagRun('user-1', 'tag-1', 10);
    expect(claim).toEqual({
      previousRunAt: new Date('2026-10-30T11:59:00.000Z'),
      claimedAt: new Date('2026-10-30T12:00:00.123Z'),
    });
    expect(String(query.mock.calls[0]?.[0])).toContain(
      "date_trunc('milliseconds', NOW())"
    );
  });

  it('returns null when the tag ran within the debounce window', async () => {
    query.mockResolvedValue({ rows: [] });
    expect(await claimActionTagRun('user-1', 'tag-1', 10)).toBeNull();
  });
});

describe('releaseActionTagRun', () => {
  it('restores the old time only while this claim is still the latest', async () => {
    const claim = {
      previousRunAt: new Date('2026-10-30T11:59:00.000Z'),
      claimedAt: new Date('2026-10-30T12:00:00.123Z'),
    };
    query.mockResolvedValue({ rowCount: 1 });
    await releaseActionTagRun('user-1', 'tag-1', claim);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('AND last_run_at = $4');
    expect(params).toEqual([
      'tag-1',
      'user-1',
      claim.previousRunAt,
      claim.claimedAt,
    ]);
    expect(release).toHaveBeenCalledOnce();
  });
});
