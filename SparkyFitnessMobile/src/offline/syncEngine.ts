import { ApiError } from '../services/api/errors';
import { addLog } from '../services/LogService';
import {
  getActiveServerConfig,
  getActiveServerConfigId,
  type ServerConfig,
} from '../services/storage';
import { serverMayBeDown } from '../utils/serverErrors';
import { accountGeneration } from './accountGeneration';
import { CACHE_COLLECTIONS, FOOD_PACK_COMPLETED_KEY } from './collections';
import { getCacheRow } from './cacheStore';
import { getOfflineDb } from './db';
import { notifyOutboxChanged, notifyUploadsConfirmed } from './events';
import { getOutboxHandler } from './handlers/registry';
import {
  deleteOldSyncedOutbox,
  getOutboxRow,
  listUnconfirmedOutbox,
  updateOutboxRow,
} from './outbox';
import type { OfflineDb, OutboxRow, SendResult } from './types';

/** Cache collection and key holding who is signed in on a server. */
export const IDENTITY_COLLECTION = 'identity';
export const IDENTITY_KEY = 'user';

/**
 * Why a drain runs. `manual` (the person tapped Upload now or Try again) and
 * `signed_in` also retry rows the automatic triggers leave alone. `reconnect`
 * skips the retry delay of a waiting row: the delay grows with every attempt
 * made while the server was away, and the server answering again is the
 * reason to try at once.
 */
export type DrainTrigger =
  'reconnect' | 'foreground' | 'background' | 'saved' | 'manual' | 'signed_in';

export interface DrainSummary {
  synced: number;
  /** Rows still waiting after this drain (any unconfirmed status). */
  remaining: number;
}

/** Wait after the Nth failed attempt before trying a row again. */
const RETRY_DELAYS_MS = [0, 30_000, 2 * 60_000, 10 * 60_000] as const;
const MAX_RETRY_DELAY_MS = 30 * 60_000;

export function retryDelayMs(attempts: number): number {
  return RETRY_DELAYS_MS[attempts] ?? MAX_RETRY_DELAY_MS;
}

/**
 * Turns a thrown request error into what the queue should do with the row.
 * Handlers call this for every error they do not treat specially.
 */
export function sendResultFromError(error: unknown): SendResult {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof ApiError && error.statusCode === 401) {
    return { outcome: 'needs_sign_in' };
  }
  if (serverMayBeDown(error)) return { outcome: 'retry', error: message };
  if (error instanceof ApiError) {
    return {
      outcome: 'failed',
      error: `${error.statusCode}: ${error.body ?? message}`,
    };
  }
  // Not a server answer at all (a bug, a storage error): keep the row and
  // try again rather than parking it as refused.
  return { outcome: 'retry', error: message };
}

export async function signedInUserId(
  db: OfflineDb,
  serverConfigId: string
): Promise<string | null> {
  const row = await getCacheRow(
    db,
    serverConfigId,
    IDENTITY_COLLECTION,
    IDENTITY_KEY
  );
  const id = (row?.payload as { id?: unknown } | null)?.id;
  return typeof id === 'string' ? id : null;
}

function isDue(row: OutboxRow, trigger: DrainTrigger, now: number): boolean {
  const personAsked = trigger === 'manual';
  switch (row.status) {
    case 'pending':
      return (
        personAsked ||
        trigger === 'reconnect' ||
        now - row.updatedAt >= retryDelayMs(row.attempts)
      );
    case 'needs_sign_in':
      // Retrying a refused credential on every trigger would trip the
      // server's rate limit; wait for a sign-in or the person.
      return personAsked || trigger === 'signed_in';
    case 'failed':
      return personAsked;
    default:
      return false;
  }
}

/** Uploads that change a day's food or water totals. */
function affectsDaySummary(kind: string): boolean {
  return kind.startsWith('food') || kind.startsWith('water');
}

async function drainOnce(trigger: DrainTrigger): Promise<DrainSummary> {
  // Read before the account and server are: a switch at any point after this
  // is noticed before the next row is sent.
  const startedUnder = accountGeneration();
  const db = await getOfflineDb();
  const now = Date.now();
  await deleteOldSyncedOutbox(db, now);
  const serverConfigId = await getActiveServerConfigId();
  if (!serverConfigId) return { synced: 0, remaining: 0 };
  // The server every request of this run is sent to: handlers use it instead
  // of resolving the active one when their request goes out. A switch after
  // this point cannot carry a row to another account's server.
  let runServerConfig: ServerConfig | undefined;
  try {
    const active = await getActiveServerConfig();
    if (active?.id === serverConfigId) runServerConfig = active;
  } catch {
    // Without it a handler falls back to the active server, and the
    // generation check before each send still applies.
  }

  const currentUserId = await signedInUserId(db, serverConfigId);
  const rows = await listUnconfirmedOutbox(db, serverConfigId);
  let synced = 0;
  // Set once a food or drink upload is confirmed: the phone's saved copy of
  // the day totals no longer counts it, so the copy is refreshed from the
  // server (it is not counted twice, since a confirmed row leaves the overlay
  // and the server's total now holds it).
  let summariesOutdated = false;
  // The account and server in force when the first food or water upload went
  // out; the refresh after the run is made for them.
  let refreshScope: {
    startedUnder: number;
    serverConfig: ServerConfig | null;
  } | null = null;
  // A row waiting on another is looked at again once that one is confirmed,
  // so a workout and the feedback given on it go up in the same run.
  let toVisit = rows;
  let stopped = false;

  while (toVisit.length > 0 && !stopped) {
    const waitingOnOthers: OutboxRow[] = [];
    const syncedBefore = synced;
    for (const listed of toVisit) {
      if (!isDue(listed, trigger, now)) continue;
      // Work made under an account is only sent while that same account is
      // known to be signed in: never under another one, and not while the
      // signed-in person is unknown (just after an account switch). A row
      // with no recorded account cannot be matched to anyone and is never
      // sent, not even by Upload now: it would be written into whichever
      // account is signed in. It is parked as needing attention, where the
      // person can discard it.
      if (listed.userId == null) {
        if (listed.status !== 'failed') {
          await updateOutboxRow(
            db,
            listed.id,
            {
              status: 'failed',
              lastError: 'No account was recorded for this upload',
            },
            undefined,
            { onlyIfStatus: listed.status, onlyIfUpdatedAt: listed.updatedAt }
          );
        }
        continue;
      } else if (listed.userId !== currentUserId) {
        continue;
      }
      if (listed.dependsOn != null) {
        const dependency = await getOutboxRow(db, listed.dependsOn);
        // A row that is gone was confirmed and later cleaned up (a discard
        // removes the rows waiting on it too), so the wait is over.
        if (dependency != null && dependency.status !== 'synced') {
          waitingOnOthers.push(listed);
          continue;
        }
      }
      const handler = getOutboxHandler(listed.kind);
      // Written by a newer build than this one: leave it for that build.
      if (!handler) continue;

      // A request goes to whichever server and account are active when it is
      // made, not the ones this run read at its start. If either changed, the
      // rest of the run stops: the remaining rows belong to the earlier
      // account and wait for it.
      if (accountGeneration() !== startedUnder) {
        stopped = true;
        break;
      }

      // Claim the row as it was listed: still in that status and still that
      // version of it. The list was read before earlier rows were sent, which
      // can take a while; a row discarded in the meantime, or replaced by
      // newer work (still pending, with a new payload), must not be sent from
      // this stale copy. A replaced row is picked up on the next run.
      const claimed = await updateOutboxRow(
        db,
        listed.id,
        { status: 'sending' },
        undefined,
        { onlyIfStatus: listed.status, onlyIfUpdatedAt: listed.updatedAt }
      );
      if (!claimed) continue;

      let row = listed;
      if (row.payloadVersion < handler.payloadVersion) {
        const payload = handler.upgrade(row.payload, row.payloadVersion);
        await updateOutboxRow(db, row.id, {
          payload,
          payloadVersion: handler.payloadVersion,
        });
        row = { ...row, payload, payloadVersion: handler.payloadVersion };
      }
      if (affectsDaySummary(row.kind) && refreshScope == null) {
        refreshScope = { startedUnder, serverConfig: runServerConfig ?? null };
      }
      // The claim and the upgrade above were awaited: look once more, right
      // before the request, and put the row back untouched if the account
      // changed meanwhile.
      if (accountGeneration() !== startedUnder) {
        await updateOutboxRow(
          db,
          row.id,
          { status: listed.status },
          undefined,
          { onlyIfStatus: 'sending' }
        );
        stopped = true;
        break;
      }
      let result: SendResult;
      try {
        result = await handler.send(row, { serverConfig: runServerConfig });
      } catch (error) {
        result = sendResultFromError(error);
      }

      if (result.outcome === 'synced') {
        // Only while the row is still the one that was sent: if the work was
        // replaced while this request was out (it went back to pending), the
        // newer version has not been sent and must stay queued.
        const confirmed = await updateOutboxRow(
          db,
          row.id,
          { status: 'synced', syncedAt: Date.now(), lastError: null },
          undefined,
          { onlyIfStatus: 'sending' }
        );
        if (!confirmed) continue;
        synced += 1;
        if (affectsDaySummary(row.kind)) summariesOutdated = true;
        try {
          await handler.onSynced?.(row);
        } catch (error) {
          addLog(`[Offline] After-upload refresh failed: ${error}`, 'WARNING');
        }
        continue;
      }
      // Every result applies only to the row that was sent: if the work was
      // replaced while the request was out (the row went back to pending),
      // this outcome says nothing about the newer version.
      const whileSending = { onlyIfStatus: 'sending' } as const;
      if (result.outcome === 'retry') {
        await updateOutboxRow(
          db,
          row.id,
          {
            status: 'pending',
            attempts: row.attempts + 1,
            lastError: result.error ?? null,
          },
          undefined,
          whileSending
        );
        // The server is not answering; the rows behind this one would only
        // fail the same way.
        stopped = true;
        break;
      }
      if (result.outcome === 'needs_sign_in') {
        await updateOutboxRow(
          db,
          row.id,
          { status: 'needs_sign_in' },
          undefined,
          whileSending
        );
        // Every later row would be refused with the same credentials.
        stopped = true;
        break;
      }
      const recorded = await updateOutboxRow(
        db,
        row.id,
        { status: result.outcome, lastError: result.error ?? null },
        undefined,
        whileSending
      );
      if (!recorded) continue;
      addLog('[Offline] Upload needs attention', 'WARNING', [
        `kind: ${row.kind}`,
        `status: ${result.outcome}`,
        `detail: ${result.error ?? 'none'}`,
      ]);
    }
    // Go round again only if something was confirmed that a waiting row
    // may have been waiting for.
    toVisit = synced > syncedBefore ? waitingOnOthers : [];
  }

  if (summariesOutdated && refreshScope) {
    try {
      // Loaded here, not at the top: it pulls in the API client, which a
      // module that only queues work should not need.
      const { refreshRecentDailySummaries } =
        await import('./dailySummaryCache');
      // The server and account the uploads were made for, read before the
      // first of them was sent: a switch in the meantime stops the refresh
      // instead of writing another server's totals under this one's key.
      if (refreshScope.serverConfig?.id === serverConfigId) {
        await refreshRecentDailySummaries(
          db,
          serverConfigId,
          undefined,
          refreshScope.startedUnder,
          refreshScope.serverConfig
        );
      }
    } catch (error) {
      // Due again: the next refresh of the offline pack does not wait out its
      // six hours for the food and totals.
      addLog(`[Offline] Saved day totals not refreshed: ${error}`, 'WARNING');
      await db
        .run(
          `DELETE FROM cache WHERE server_config_id = ? AND collection = ? AND key = ?`,
          [serverConfigId, CACHE_COLLECTIONS.pack, FOOD_PACK_COMPLETED_KEY]
        )
        .catch(() => undefined);
    }
  }
  const remaining = (await listUnconfirmedOutbox(db, serverConfigId)).length;
  return { synced, remaining };
}

let running: Promise<DrainSummary> | null = null;

/**
 * Sends everything that is due, oldest first, one request at a time. A call
 * while a drain is running joins that drain instead of starting another, so
 * no row is ever sent twice at once. Never throws: a failure is logged and
 * the rows stay queued.
 */
export function drainOutbox(trigger: DrainTrigger): Promise<DrainSummary> {
  running ??= drainOnce(trigger)
    .then((summary) => {
      // What the Diary loaded before this run does not have these workouts.
      if (summary.synced > 0) notifyUploadsConfirmed();
      return summary;
    })
    .catch((error: unknown) => {
      addLog(`[Offline] Upload run failed: ${error}`, 'ERROR');
      return { synced: 0, remaining: 0 };
    })
    .finally(() => {
      running = null;
      notifyOutboxChanged();
    });
  return running;
}
