import AsyncStorage from '@react-native-async-storage/async-storage';
import { getActiveServerConfigId } from '../storage';

/**
 * Remembers which workout sessions already had their telemetry collected.
 *
 * Telemetry collection (GPS route plus the heart-rate / speed / power / cadence
 * series) costs on the order of a dozen native reads per session, and the
 * foreground sync window is the user's whole configured range rather than an
 * incremental cursor — so without this every sync re-reads and re-uploads the
 * same sessions forever (#2191).
 *
 * It is also what lets the per-run budget stay small without stranding data:
 * the budget claim skips sessions already recorded here, so successive syncs
 * work through the backlog instead of re-picking the same newest few.
 *
 * Lives in `shared/` because both platform providers use it; the key builder
 * takes the identity and change marker each platform can supply.
 */

const STORAGE_KEY_PREFIX = '@SparkyFitness/enrichedSessions';

/**
 * The unscoped key this cache first shipped with. Never read: its entries mean
 * "some server has this telemetry", which is exactly the ambiguity the scoping
 * below removes. It is deleted on first load so it does not linger.
 */
const LEGACY_STORAGE_KEY = STORAGE_KEY_PREFIX;

/**
 * Scope used when no server is configured or the lookup fails.
 *
 * Falling back to a shared bucket is safe in the direction that matters: the
 * worst case is a cache miss and one round of re-collection. Reusing another
 * server's bucket would instead suppress collection, which loses telemetry.
 */
const UNSCOPED = 'none';

/**
 * Entries kept before the oldest are evicted. Each key is short (an id plus a
 * timestamp), so this stays well under 100 KB while covering far more sessions
 * than any realistic sync window.
 */
export const MAX_ENRICHED_SESSION_KEYS = 500;

/**
 * Identity plus a change marker, so a session that is still being written to
 * (a workout that has not finished syncing from the watch, a record edited
 * afterwards) is re-collected rather than frozen at its first reading.
 *
 * Returns null when there is no stable identity to key on — such a session is
 * never cached and is treated as always-uncollected.
 */
export const sessionTelemetryKey = (
  id: string | undefined | null,
  changeMarker: string | undefined | null,
): string | null => {
  if (!id) return null;
  return `${id}:${changeMarker ?? ''}`;
};

/**
 * Keyed per server config, mirroring `autoSyncKeyForConfig` in
 * autoSyncCoordinator.ts.
 *
 * An entry means "THIS server durably holds this session's telemetry", and
 * that claim does not carry across a server switch. Switching from A to B with
 * one shared bucket would leave A's keys suppressing collection for B, so B
 * received summary-only workouts and never got their GPS or sample series —
 * and unlike the sync cursor there is no window that eventually re-covers
 * them, because the cache has no expiry.
 */
const storageKeyForScope = (scope: string): string =>
  `${STORAGE_KEY_PREFIX}:${scope}`;

const activeScope = async (): Promise<string> => {
  try {
    return (await getActiveServerConfigId()) ?? UNSCOPED;
  } catch {
    return UNSCOPED;
  }
};

// Loaded once per scope, then kept in memory. `loadPromise` collapses the
// concurrent first calls that the enrichment fan-out makes into one read.
//
// The array carries insertion order, which is what eviction needs; `cacheIndex`
// mirrors it for membership. Both matter: the route-consent prefetch asks about
// every session in the window (up to ROUTE_PREFETCH_PAGE_SIZE ×
// ROUTE_PREFETCH_MAX_PAGES of them) before it can tell which are enrichment
// candidates, and a linear scan per session over MAX_ENRICHED_SESSION_KEYS is
// millions of comparisons on the JS thread — the exact stall this whole change
// exists to remove (#2191).
let cache: string[] | null = null;
let cacheIndex: Set<string> = new Set();
let cacheScope: string | null = null;
let loadPromise: Promise<string[]> | null = null;
let legacyKeyCleared = false;

const readScope = async (scope: string): Promise<string[]> => {
  try {
    const raw = await AsyncStorage.getItem(storageKeyForScope(scope));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((k): k is string => typeof k === 'string')
      : [];
  } catch {
    // A corrupt or unreadable store only costs us a round of re-collection.
    return [];
  }
};

const load = async (): Promise<string[]> => {
  const scope = await activeScope();
  if (cache && cacheScope === scope) return cache;
  // A scope change invalidates any in-flight read for the previous scope.
  if (loadPromise && cacheScope === scope) return loadPromise;

  cacheScope = scope;
  loadPromise = (async () => {
    const keys = await readScope(scope);
    cache = keys;
    cacheIndex = new Set(keys);
    if (!legacyKeyCleared) {
      legacyKeyCleared = true;
      // Best effort: nothing reads it any more, so a failure costs only the
      // orphaned entry.
      await AsyncStorage.removeItem(LEGACY_STORAGE_KEY).catch(() => undefined);
    }
    return keys;
  })().finally(() => {
    loadPromise = null;
  });
  return loadPromise;
};

/** Whether this session's telemetry was already collected and uploaded. */
export const hasEnrichedSession = async (key: string | null): Promise<boolean> => {
  if (!key) return false;
  await load();
  return cacheIndex.has(key);
};

// Commits are serialised. Without this, two runs (a foreground sync overlapping
// a background one — telemetryBudget.ts notes they are not mutually exclusive)
// both await load(), capture the same array, and the second computes its merge
// from a stale base, discarding the first run's keys.
let writeChain: Promise<void> = Promise.resolve();

const commit = async (fresh: string[]): Promise<void> => {
  const existing = await load();
  // Re-adding an existing key moves it to the newest end, so sessions that keep
  // appearing in the sync window are not evicted by a one-off backfill burst.
  const merged = [...existing.filter(k => !fresh.includes(k)), ...fresh];
  const trimmed = merged.slice(-MAX_ENRICHED_SESSION_KEYS);
  const scope = cacheScope ?? (await activeScope());
  cache = trimmed;
  cacheIndex = new Set(trimmed);
  cacheScope = scope;

  try {
    await AsyncStorage.setItem(storageKeyForScope(scope), JSON.stringify(trimmed));
  } catch {
    // In-memory state still holds for the rest of this process; the worst case
    // is re-collecting after a restart. Never fail a sync over the cache.
  }
};

/**
 * Records sessions as collected, oldest-evicted-first. Batched per sync run so
 * a run costs one write rather than one per session.
 *
 * INVARIANT — an entry here means "the server durably holds this session's
 * telemetry", not "we read it". Anything weaker loses data, because a cached
 * session is never re-collected: the next sync re-sends it as a summary-only
 * record. So commit only after an upload the server accepted in full, and only
 * for sessions whose records actually entered that upload — see
 * `sessionTelemetryOutcomesUsable` in healthSyncEngine.ts, which withholds the
 * drain when the session read itself timed out or rejected. A run that threw,
 * or that came back with per-record rejections, must leave its staging
 * undrained — per-record rejections do not hold the sync cursor, and a
 * foreground window is the user's configured range rather than the cursor, so
 * the rejected workout WILL be re-sent, and it must carry its telemetry when
 * it is. Rejections are real: see PR #2136, where the server rejected
 * fractional telemetry values outright.
 */
export const markEnrichedSessions = async (keys: (string | null)[]): Promise<void> => {
  const fresh = keys.filter((k): k is string => Boolean(k));
  if (fresh.length === 0) return;

  const run = writeChain.then(() => commit(fresh));
  // The chain must survive a rejected commit, or every later write is skipped.
  writeChain = run.catch(() => undefined);
  return run;
};

/** Test/reset seam — also used when a user clears app data from Settings. */
export const clearEnrichedSessions = async (): Promise<void> => {
  const scope = await activeScope();
  cache = [];
  cacheIndex = new Set();
  cacheScope = scope;
  try {
    await AsyncStorage.removeItem(storageKeyForScope(scope));
  } catch {
    // Best effort.
  }
};

/** Drops the in-memory copy so the next read comes from storage (tests). */
export const _resetEnrichedSessionCacheForTests = (): void => {
  cache = null;
  cacheIndex = new Set();
  cacheScope = null;
  loadPromise = null;
  legacyKeyCleared = false;
  writeChain = Promise.resolve();
};
