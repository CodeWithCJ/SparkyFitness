import externalProviderRepository from '../models/externalProviderRepository.js';
import { log } from '../config/logging.js';
import {
  runOutsideAbortScope,
  runWithAbortSignal,
  runWithActivityListener,
} from '../utils/abortScope.js';

/**
 * Which provider row a sync runs on: the row itself for providers a user can
 * connect more than once, otherwise the user's row of that provider type.
 */
export type SyncClaimTarget =
  | { userId: string; providerId: string }
  | { userId: string; providerType: string };

export interface ProviderSyncClaim {
  ids: string[];
  claimedAt: Date;
}

// A server that dies mid-sync frees the account after this. A running sync
// renews its claim well inside it, so a long sync never loses the claim.
export const SYNC_CLAIM_EXPIRY_MINUTES = 30;
export const SYNC_CLAIM_RENEW_MINUTES = 5;
// A sync that has not touched the database for this long is treated as
// wedged (a provider call that never returns): it is stopped so it cannot hold
// the account forever. A long backfill that keeps saving data is never stopped.
export const SYNC_STALL_MINUTES = 20;

export const SYNC_ALREADY_RUNNING_MESSAGE =
  'A sync is already running for this account. Try again in a few minutes.';

/** The 409 body a manual sync route sends when the account is already syncing. */
export const SYNC_ALREADY_RUNNING_RESPONSE = {
  error: SYNC_ALREADY_RUNNING_MESSAGE,
  code: 'SYNC_ALREADY_RUNNING',
};

/** The row a manual sync runs on: the one the request named, else the user's row of that type. */
export function syncClaimTarget(
  userId: string,
  providerType: string,
  providerId?: string | null
): SyncClaimTarget {
  return providerId ? { userId, providerId } : { userId, providerType };
}

/**
 * Claims the account for one sync, or returns null when another sync holds it.
 * With no matching row the sync runs unclaimed and reports its own
 * "not connected" error, as it did before claims existed.
 */
export async function claimProviderSync(
  target: SyncClaimTarget
): Promise<ProviderSyncClaim | null> {
  const claimedAt = new Date();
  const { matched, claimedIds } =
    await externalProviderRepository.claimProviderSyncRows(
      target,
      claimedAt,
      SYNC_CLAIM_EXPIRY_MINUTES
    );
  if (claimedIds.length < matched) {
    await releaseProviderSync({ ids: claimedIds, claimedAt });
    return null;
  }
  return { ids: claimedIds, claimedAt };
}

export async function releaseProviderSync(
  claim: ProviderSyncClaim
): Promise<void> {
  try {
    // Runs after the sync may have been stopped; the query clears only this
    // claim's own rows.
    await runOutsideAbortScope(() =>
      externalProviderRepository.releaseProviderSyncRows(
        claim.ids,
        claim.claimedAt
      )
    );
  } catch (error) {
    // The claim expires on its own, so a failed release only delays the next
    // sync; it must not turn a finished sync into a failed one.
    log('warn', '[SYNC] Failed to release provider sync claim:', error);
  }
}

/** Why a running sync was stopped before it finished. */
export type ProviderSyncStopReason = 'claim-lost' | 'timeout';

export class ProviderSyncStoppedError extends Error {
  constructor(readonly reason: ProviderSyncStopReason) {
    super(
      reason === 'claim-lost'
        ? 'The sync stopped because another sync took over this account.'
        : `The sync stopped after making no progress for ${SYNC_STALL_MINUTES} minutes.`
    );
    this.name = 'ProviderSyncStoppedError';
  }
}

interface RunningProviderSync {
  /** Settles once the sync has finished and released its claim. */
  done: Promise<void>;
  /** Releases the claim now, even though the sync may still be running. */
  release: () => Promise<void>;
}

const runningSyncs = new Set<RunningProviderSync>();

/**
 * Claims the account and starts `sync`, or returns null when another sync
 * holds it. The claim is renewed while the sync runs and released when it
 * settles, so a caller that replies before the sync finishes still keeps the
 * account claimed until then. `running` is wrapped because awaiting a returned
 * promise would wait for it.
 *
 * The sync is stopped when a renewal finds the claim gone, or after it took no
 * database connection and ran no query for SYNC_STALL_MINUTES: `running`
 * rejects with ProviderSyncStoppedError at once (so a scheduled pass moves
 * on), renewal stops, and the sync's next database acquire throws; a
 * transaction already running on a connection it holds still finishes. A
 * stopped sync that is still running keeps its claim until it settles or the
 * claim expires.
 */
export async function startProviderSync<T>(
  target: SyncClaimTarget,
  sync: () => Promise<T>
): Promise<{ running: Promise<T> } | null> {
  const claim = await claimProviderSync(target);
  if (!claim) return null;
  const controller = new AbortController();
  const stop = (reason: ProviderSyncStopReason) => {
    if (!controller.signal.aborted) {
      controller.abort(new ProviderSyncStoppedError(reason));
    }
  };
  let renewal: Promise<void> = Promise.resolve();
  const renew = async () => {
    if (controller.signal.aborted) return;
    const renewedAt = new Date();
    try {
      const renewed = await runOutsideAbortScope(() =>
        externalProviderRepository.renewProviderSyncRows(
          claim.ids,
          claim.claimedAt,
          renewedAt
        )
      );
      if (renewed.length > 0) claim.claimedAt = renewedAt;
      if (renewed.length < claim.ids.length) {
        log(
          'warn',
          '[SYNC] A running sync lost its provider sync claim; stopping it.'
        );
        stop('claim-lost');
      }
    } catch (error) {
      // The claim outlives several missed renewals, so a database blip is not
      // a reason to stop the sync.
      log('warn', '[SYNC] Failed to renew provider sync claim:', error);
    }
  };
  const renewTimer = setInterval(
    () => {
      renewal = renewal.then(renew);
    },
    SYNC_CLAIM_RENEW_MINUTES * 60 * 1000
  );
  renewTimer.unref();
  const stallMs = SYNC_STALL_MINUTES * 60 * 1000;
  let lastActivity = Date.now();
  // Re-armed only when it fires rather than on every query, which a busy
  // sync runs many times a second.
  let stallTimer: NodeJS.Timeout;
  const checkStall = () => {
    const idleMs = Date.now() - lastActivity;
    if (idleMs < stallMs) {
      stallTimer = setTimeout(checkStall, stallMs - idleMs);
      stallTimer.unref();
      return;
    }
    log(
      'warn',
      `[SYNC] A provider sync made no progress for ${SYNC_STALL_MINUTES} minutes; stopping it.`
    );
    stop('timeout');
  };
  stallTimer = setTimeout(checkStall, stallMs);
  stallTimer.unref();
  const stopTimers = () => {
    clearInterval(renewTimer);
    clearTimeout(stallTimer);
  };
  controller.signal.addEventListener('abort', stopTimers, { once: true });
  let released: Promise<void> | null = null;
  const release = () => {
    stopTimers();
    // Release with the latest renewed time, not one a renewal is replacing.
    released ??= renewal.then(() => releaseProviderSync(claim));
    return released;
  };
  const work = runWithAbortSignal(controller.signal, () =>
    runWithActivityListener(
      () => {
        lastActivity = Date.now();
      },
      async () => sync()
    )
  );
  const stopped = new Promise<never>((_resolve, reject) => {
    controller.signal.addEventListener(
      'abort',
      () => reject(controller.signal.reason),
      { once: true }
    );
  });
  stopped.catch(() => {});
  const entry: RunningProviderSync = {
    release,
    done: work
      .then(
        () => undefined,
        () => undefined
      )
      .then(release)
      .finally(() => runningSyncs.delete(entry)),
  };
  runningSyncs.add(entry);
  const running = (async () => {
    try {
      return await Promise.race([work, stopped]);
    } finally {
      if (!controller.signal.aborted) await entry.done;
    }
  })();
  return { running };
}

export function runningProviderSyncCount(): number {
  return runningSyncs.size;
}

/** Resolves once every sync running now, and any started meanwhile, has settled and released its claim. */
export async function waitForProviderSyncs(): Promise<void> {
  while (runningSyncs.size > 0) {
    await Promise.all([...runningSyncs].map((entry) => entry.done));
  }
}

/**
 * For shutdown after the drain timeout: releases the claim of every sync
 * still running, so the account can sync again at once after a restart
 * instead of after the claim expiry. The process exits right after, which
 * ends the syncs themselves.
 */
export async function releaseRunningProviderSyncs(): Promise<void> {
  await Promise.all([...runningSyncs].map((entry) => entry.release()));
}
