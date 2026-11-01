import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import externalProviderRepository from '../models/externalProviderRepository.js';
import { log } from '../config/logging.js';
import {
  ProviderSyncStoppedError,
  SYNC_CLAIM_EXPIRY_MINUTES,
  SYNC_CLAIM_RENEW_MINUTES,
  SYNC_STALL_MINUTES,
  releaseRunningProviderSyncs,
  runningProviderSyncCount,
  startProviderSync,
  waitForProviderSyncs,
} from '../services/providerSyncClaim.js';
import { noteWorkActivity, throwIfWorkAborted } from '../utils/abortScope.js';

vi.mock('../models/externalProviderRepository.js', () => ({
  default: {
    claimProviderSyncRows: vi.fn(),
    releaseProviderSyncRows: vi.fn(),
    renewProviderSyncRows: vi.fn(),
  },
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const target = { userId: 'user-1', providerType: 'garmin' };

describe('startProviderSync', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(
      externalProviderRepository.releaseProviderSyncRows
    ).mockResolvedValue();
  });

  it('runs the sync and releases the claim it made', async () => {
    vi.mocked(
      externalProviderRepository.claimProviderSyncRows
    ).mockResolvedValue({
      matched: 1,
      claimedIds: ['p1'],
    });

    const started = await startProviderSync(target, async () => 'synced');

    expect(await started?.running).toBe('synced');
    const [, claimedAt, expiry] = vi.mocked(
      externalProviderRepository.claimProviderSyncRows
    ).mock.calls[0];
    expect(expiry).toBe(SYNC_CLAIM_EXPIRY_MINUTES);
    expect(
      externalProviderRepository.releaseProviderSyncRows
    ).toHaveBeenCalledWith(['p1'], claimedAt);
  });

  it('returns before the sync finishes and holds the claim until it does', async () => {
    vi.mocked(
      externalProviderRepository.claimProviderSyncRows
    ).mockResolvedValue({
      matched: 1,
      claimedIds: ['p1'],
    });
    let finish = (_value: string) => {};
    const sync = () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      });

    const started = await startProviderSync(target, sync);

    expect(started).not.toBeNull();
    expect(
      externalProviderRepository.releaseProviderSyncRows
    ).not.toHaveBeenCalled();
    finish('synced');
    expect(await started!.running).toBe('synced');
    expect(
      externalProviderRepository.releaseProviderSyncRows
    ).toHaveBeenCalledOnce();
  });

  it('skips the sync when another sync holds the account', async () => {
    vi.mocked(
      externalProviderRepository.claimProviderSyncRows
    ).mockResolvedValue({
      matched: 1,
      claimedIds: [],
    });
    const sync = vi.fn();

    expect(await startProviderSync(target, sync)).toBeNull();
    expect(sync).not.toHaveBeenCalled();
  });

  it('gives back a partial claim and skips', async () => {
    vi.mocked(
      externalProviderRepository.claimProviderSyncRows
    ).mockResolvedValue({
      matched: 2,
      claimedIds: ['p1'],
    });
    const sync = vi.fn();

    expect(await startProviderSync(target, sync)).toBeNull();
    expect(sync).not.toHaveBeenCalled();
    expect(
      vi.mocked(externalProviderRepository.releaseProviderSyncRows).mock
        .calls[0][0]
    ).toEqual(['p1']);
  });

  it('releases the claim when the sync throws', async () => {
    vi.mocked(
      externalProviderRepository.claimProviderSyncRows
    ).mockResolvedValue({
      matched: 1,
      claimedIds: ['p1'],
    });

    const started = await startProviderSync(target, async () => {
      throw new Error('provider down');
    });

    await expect(started?.running).rejects.toThrow('provider down');
    expect(
      externalProviderRepository.releaseProviderSyncRows
    ).toHaveBeenCalledOnce();
  });

  it('runs unclaimed when the account has no provider row', async () => {
    vi.mocked(
      externalProviderRepository.claimProviderSyncRows
    ).mockResolvedValue({
      matched: 0,
      claimedIds: [],
    });

    const started = await startProviderSync(target, async () => 'ran');

    expect(await started?.running).toBe('ran');
  });

  it('keeps a finished sync successful when the release fails', async () => {
    vi.mocked(
      externalProviderRepository.claimProviderSyncRows
    ).mockResolvedValue({
      matched: 1,
      claimedIds: ['p1'],
    });
    vi.mocked(
      externalProviderRepository.releaseProviderSyncRows
    ).mockRejectedValue(new Error('db down'));

    const started = await startProviderSync(target, async () => 'synced');

    expect(await started?.running).toBe('synced');
    expect(log).toHaveBeenCalledWith(
      'warn',
      '[SYNC] Failed to release provider sync claim:',
      expect.any(Error)
    );
  });

  describe('while the sync runs', () => {
    const renewEvery = SYNC_CLAIM_RENEW_MINUTES * 60 * 1000;
    let finish: (value: string) => void;
    const longSync = () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      });

    beforeEach(() => {
      vi.useFakeTimers();
      vi.mocked(
        externalProviderRepository.claimProviderSyncRows
      ).mockResolvedValue({ matched: 1, claimedIds: ['p1'] });
      vi.mocked(
        externalProviderRepository.renewProviderSyncRows
      ).mockResolvedValue(['p1']);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('renews the claim and releases with the latest renewed time', async () => {
      const started = await startProviderSync(target, longSync);
      const [, claimedAt] = vi.mocked(
        externalProviderRepository.claimProviderSyncRows
      ).mock.calls[0];

      await vi.advanceTimersByTimeAsync(renewEvery);
      await vi.advanceTimersByTimeAsync(renewEvery);

      const renewals = vi.mocked(
        externalProviderRepository.renewProviderSyncRows
      ).mock.calls;
      expect(renewals).toHaveLength(2);
      expect(renewals[0][1]).toBe(claimedAt);
      expect(renewals[1][1]).toBe(renewals[0][2]);

      finish('synced');
      await started!.running;
      expect(
        externalProviderRepository.releaseProviderSyncRows
      ).toHaveBeenCalledWith(['p1'], renewals[1][2]);

      await vi.advanceTimersByTimeAsync(renewEvery);
      expect(
        externalProviderRepository.renewProviderSyncRows
      ).toHaveBeenCalledTimes(2);
    });

    it('waits for a renewal in flight before releasing', async () => {
      let finishRenewal = () => {};
      vi.mocked(
        externalProviderRepository.renewProviderSyncRows
      ).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishRenewal = () => resolve(['p1']);
          })
      );
      const started = await startProviderSync(target, longSync);
      await vi.advanceTimersByTimeAsync(renewEvery);

      finish('synced');
      await vi.advanceTimersByTimeAsync(0);
      expect(
        externalProviderRepository.releaseProviderSyncRows
      ).not.toHaveBeenCalled();

      finishRenewal();
      await started!.running;
      const [, , renewedAt] = vi.mocked(
        externalProviderRepository.renewProviderSyncRows
      ).mock.calls[0];
      expect(
        externalProviderRepository.releaseProviderSyncRows
      ).toHaveBeenCalledWith(['p1'], renewedAt);
    });

    it('stops the sync when a renewal finds the claim lost', async () => {
      vi.mocked(
        externalProviderRepository.renewProviderSyncRows
      ).mockResolvedValue([]);
      const started = await startProviderSync(target, longSync);
      const outcome = started!.running.catch((error: unknown) => error);

      await vi.advanceTimersByTimeAsync(renewEvery);

      expect(log).toHaveBeenCalledWith(
        'warn',
        '[SYNC] A running sync lost its provider sync claim; stopping it.'
      );
      const error = await outcome;
      expect(error).toBeInstanceOf(ProviderSyncStoppedError);
      expect((error as ProviderSyncStoppedError).reason).toBe('claim-lost');
      // No further renewal of a claim that belongs to someone else.
      await vi.advanceTimersByTimeAsync(renewEvery * 2);
      expect(
        externalProviderRepository.renewProviderSyncRows
      ).toHaveBeenCalledOnce();
      finish('synced');
      await waitForProviderSyncs();
    });

    it('keeps the sync running when a renewal fails', async () => {
      vi.mocked(
        externalProviderRepository.renewProviderSyncRows
      ).mockRejectedValueOnce(new Error('db blip'));
      const started = await startProviderSync(target, longSync);

      await vi.advanceTimersByTimeAsync(renewEvery);
      finish('synced');

      expect(await started!.running).toBe('synced');
    });

    it('stops a sync that makes no progress past the stall limit and stops renewing it', async () => {
      const started = await startProviderSync(target, longSync);
      const outcome = started!.running.catch((error: unknown) => error);

      await vi.advanceTimersByTimeAsync(SYNC_STALL_MINUTES * 60 * 1000);

      const error = await outcome;
      expect(error).toBeInstanceOf(ProviderSyncStoppedError);
      expect((error as ProviderSyncStoppedError).reason).toBe('timeout');
      const renewals = vi.mocked(
        externalProviderRepository.renewProviderSyncRows
      ).mock.calls.length;
      expect(renewals).toBe(
        Math.floor(SYNC_STALL_MINUTES / SYNC_CLAIM_RENEW_MINUTES) - 1
      );
      await vi.advanceTimersByTimeAsync(renewEvery * 3);
      expect(
        externalProviderRepository.renewProviderSyncRows
      ).toHaveBeenCalledTimes(renewals);
      // The wedged sync keeps its claim (which now expires on its own) until
      // it actually settles; then the claim is released.
      expect(
        externalProviderRepository.releaseProviderSyncRows
      ).not.toHaveBeenCalled();
      expect(runningProviderSyncCount()).toBe(1);
      finish('late');
      await waitForProviderSyncs();
      expect(
        externalProviderRepository.releaseProviderSyncRows
      ).toHaveBeenCalledOnce();
      expect(runningProviderSyncCount()).toBe(0);
    });

    it('keeps a sync running past the stall limit while it takes connections', async () => {
      const stallMs = SYNC_STALL_MINUTES * 60 * 1000;
      let progressing = true;
      const started = await startProviderSync(target, async () => {
        while (progressing) {
          noteWorkActivity();
          await new Promise((resolve) => setTimeout(resolve, 60_000));
        }
        return 'backfilled';
      });
      const outcome = started!.running.catch((error: unknown) => error);

      await vi.advanceTimersByTimeAsync(stallMs * 3);
      expect(runningProviderSyncCount()).toBe(1);
      progressing = false;
      await vi.advanceTimersByTimeAsync(60_000);

      expect(await outcome).toBe('backfilled');
    });

    it('stops a sync the stall limit after its last progress', async () => {
      const stallMs = SYNC_STALL_MINUTES * 60 * 1000;
      const started = await startProviderSync(target, async () => {
        await new Promise((resolve) => setTimeout(resolve, stallMs / 2));
        noteWorkActivity();
        return longSync();
      });
      let settled: unknown;
      void started!.running.catch((error: unknown) => {
        settled = error;
      });

      await vi.advanceTimersByTimeAsync(stallMs);
      expect(settled).toBeUndefined();
      await vi.advanceTimersByTimeAsync(stallMs / 2);
      expect(settled).toBeInstanceOf(ProviderSyncStoppedError);
      expect((settled as ProviderSyncStoppedError).reason).toBe('timeout');
      finish('late');
      await waitForProviderSyncs();
    });

    it('refuses database work inside a stopped sync', async () => {
      let refusal: unknown;
      const started = await startProviderSync(target, async () => {
        expect(() => throwIfWorkAborted()).not.toThrow();
        await longSync();
        try {
          throwIfWorkAborted();
        } catch (error) {
          refusal = error;
        }
      });
      const outcome = started!.running.catch((error: unknown) => error);

      await vi.advanceTimersByTimeAsync(SYNC_STALL_MINUTES * 60 * 1000);
      await outcome;
      finish('resumed');
      await waitForProviderSyncs();

      expect(refusal).toBeInstanceOf(ProviderSyncStoppedError);
      // Outside the sync's own call chain nothing is refused.
      expect(() => throwIfWorkAborted()).not.toThrow();
    });

    it('gives up a wedged sync well before its claim would expire', () => {
      // Renewal stops when the stall stop fires, at most one renewal period
      // after the last renewal, so the claim of a sync stopped for a stall
      // still expires on its own.
      expect(SYNC_STALL_MINUTES + SYNC_CLAIM_RENEW_MINUTES).toBeLessThan(
        SYNC_CLAIM_EXPIRY_MINUTES
      );
    });
  });
});

describe('shutdown', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(
      externalProviderRepository.releaseProviderSyncRows
    ).mockResolvedValue();
    vi.mocked(
      externalProviderRepository.claimProviderSyncRows
    ).mockResolvedValue({ matched: 1, claimedIds: ['p1'] });
  });

  it('waits for running syncs to finish and release', async () => {
    let finish = () => {};
    const started = await startProviderSync(
      target,
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    let waited = false;
    const wait = waitForProviderSyncs().then(() => {
      waited = true;
    });

    await Promise.resolve();
    expect(waited).toBe(false);
    expect(runningProviderSyncCount()).toBe(1);
    finish();
    await wait;
    await started!.running;
    expect(runningProviderSyncCount()).toBe(0);
    expect(
      externalProviderRepository.releaseProviderSyncRows
    ).toHaveBeenCalledOnce();
  });

  it('releases the claims of syncs still running, once each', async () => {
    let finish = () => {};
    const started = await startProviderSync(
      target,
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    const [, claimedAt] = vi.mocked(
      externalProviderRepository.claimProviderSyncRows
    ).mock.calls[0]!;

    await releaseRunningProviderSyncs();

    expect(
      externalProviderRepository.releaseProviderSyncRows
    ).toHaveBeenCalledExactlyOnceWith(['p1'], claimedAt);
    finish();
    await started!.running;
    expect(
      externalProviderRepository.releaseProviderSyncRows
    ).toHaveBeenCalledOnce();
  });
});
