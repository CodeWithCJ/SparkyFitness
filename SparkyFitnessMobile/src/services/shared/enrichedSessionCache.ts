import AsyncStorage from '@react-native-async-storage/async-storage';

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

const STORAGE_KEY = '@SparkyFitness/enrichedSessions';

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

// Loaded once per process, then kept in memory. `loadPromise` collapses the
// concurrent first calls that the enrichment fan-out makes into one read.
let cache: string[] | null = null;
let loadPromise: Promise<string[]> | null = null;

const load = async (): Promise<string[]> => {
  if (cache) return cache;
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        cache = Array.isArray(parsed)
          ? parsed.filter((k): k is string => typeof k === 'string')
          : [];
      } catch {
        // A corrupt or unreadable store only costs us a round of re-collection.
        cache = [];
      }
      return cache;
    })().finally(() => {
      loadPromise = null;
    });
  }
  return loadPromise;
};

/** Whether this session's telemetry was already collected and uploaded. */
export const hasEnrichedSession = async (key: string | null): Promise<boolean> => {
  if (!key) return false;
  const keys = await load();
  return keys.includes(key);
};

/**
 * Records sessions as collected, oldest-evicted-first. Batched per sync run so
 * a run costs one write rather than one per session.
 *
 * INVARIANT — an entry here means "the server durably holds this session's
 * telemetry", not "we read it". Anything weaker loses data, because a cached
 * session is never re-collected: the next sync re-sends it as a summary-only
 * record. So commit only after an upload the server accepted in full. A run
 * that threw, or that came back with per-record rejections, must leave its
 * staging undrained — per-record rejections do not hold the sync cursor, and a
 * foreground window is the user's configured range rather than the cursor, so
 * the rejected workout WILL be re-sent, and it must carry its telemetry when
 * it is. Rejections are real: see PR #2136, where the server rejected
 * fractional telemetry values outright.
 */
export const markEnrichedSessions = async (keys: (string | null)[]): Promise<void> => {
  const fresh = keys.filter((k): k is string => Boolean(k));
  if (fresh.length === 0) return;

  const existing = await load();
  // Re-adding an existing key moves it to the newest end, so sessions that keep
  // appearing in the sync window are not evicted by a one-off backfill burst.
  const merged = [...existing.filter(k => !fresh.includes(k)), ...fresh];
  const trimmed = merged.slice(-MAX_ENRICHED_SESSION_KEYS);
  cache = trimmed;

  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // In-memory state still holds for the rest of this process; the worst case
    // is re-collecting after a restart. Never fail a sync over the cache.
  }
};

/** Test/reset seam — also used when a user clears app data from Settings. */
export const clearEnrichedSessions = async (): Promise<void> => {
  cache = [];
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Best effort.
  }
};

/** Drops the in-memory copy so the next read comes from storage (tests). */
export const _resetEnrichedSessionCacheForTests = (): void => {
  cache = null;
  loadPromise = null;
};
