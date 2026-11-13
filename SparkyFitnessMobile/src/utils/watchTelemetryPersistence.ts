import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AESEncryptionKey,
  AESSealedData,
  aesDecryptAsync,
  aesEncryptAsync,
} from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { addLog } from '../services/LogService';
import { deleteWatchRunsForConfig } from '../services/watchRunQueue';
import WatchConnectivity, {
  type WatchHeartRateSamplePayload,
} from '../../modules/watch-connectivity';

const STORAGE_KEY = 'sparky.watchTelemetryBuffer';
const KEY_STORE = 'sparky.watchTelemetryKey';
const keyStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

/**
 * One buffer per server config. There is no shared buffer: telemetry with no
 * owner has nowhere it can be posted, so it is neither read nor written.
 */
function bufferKey(ownerId: string): string {
  return `${STORAGE_KEY}.${ownerId}`;
}

let onAccountSwitch: (() => void) | null = null;

/** The hook drops its in-memory sessions when the signed-in account changes. */
export function setWatchTelemetryAccountSwitchHandler(
  handler: () => void
): () => void {
  onAccountSwitch = handler;
  return () => {
    if (onAccountSwitch === handler) onAccountSwitch = null;
  };
}

/** Reads the configs an identity change must purge. Safe to call again. */
type WatchTelemetryPurgeIdReader = () => Promise<Iterable<string>>;

// Work left over from identity changes. Module state, so it runs whether or
// not the bridge is mounted. A reader leaves the list only once it has read
// its ids, and a config leaves the set only once its purge succeeded.
const pendingIdReaders: WatchTelemetryPurgeIdReader[] = [];
const pendingPurges = new Set<string>();
let settleRun: Promise<boolean> | null = null;

function logPurgeFailure(what: string, error: unknown): void {
  addLog(
    `Watch telemetry ${what} on account switch failed: ${
      error instanceof Error ? error.message : String(error)
    }`,
    'WARNING'
  );
}

/**
 * Resolves true once every identity change so far has had its configs read
 * and purged. False means a read or a purge failed; it stays pending, and
 * restore must stop and call this again later. Work added while this runs
 * is finished before it resolves true.
 */
export function settleWatchTelemetryPurges(): Promise<boolean> {
  if (settleRun) return settleRun;
  const run = (async (): Promise<boolean> => {
    for (;;) {
      while (pendingIdReaders.length > 0) {
        const read = pendingIdReaders[0];
        try {
          for (const id of await read()) {
            if (id) pendingPurges.add(id);
          }
        } catch (error) {
          logPurgeFailure('config read', error);
          return false;
        }
        pendingIdReaders.splice(pendingIdReaders.indexOf(read), 1);
      }
      if (pendingPurges.size === 0) return true;
      for (const ownerId of [...pendingPurges]) {
        try {
          await deleteWatchTelemetryForConfig(ownerId);
          pendingPurges.delete(ownerId);
        } catch (error) {
          logPurgeFailure('purge', error);
          return false;
        }
      }
    }
  })();
  settleRun = run;
  void run.finally(() => {
    if (settleRun === run) settleRun = null;
  });
  return run;
}

/**
 * Telemetry is keyed by server config, not by person, and the next account
 * may use the same config. Queues a purge of the configs `readConfigIds`
 * names: their saved buffers and queued batches, so nothing is restored or
 * posted under the new account's credentials. The bridge drops what it
 * holds now; restore waits until the read and every purge have succeeded.
 */
export function notifyWatchTelemetryAccountSwitch(
  readConfigIds: WatchTelemetryPurgeIdReader
): void {
  pendingIdReaders.push(readConfigIds);
  void settleWatchTelemetryPurges();
  onAccountSwitch?.();
}

export interface WatchTelemetryAttribution {
  steps: { setId: string; exerciseEntryId: string }[];
  completedAtBySetId: Record<string, number>;
  startedAt: number | null;
  activeSetId: string | null;
}

/**
 * Heart rate and energy the watch reported for ONE live-workout session,
 * keyed by exercise_entries id.
 *
 * The samples are NOT cleared by a flush: every field the server derives
 * from a post (avg, max, calories, the zone rows it replaces) is computed
 * from the whole payload, so re-posting the accumulated series overwrites the
 * earlier, shorter one with a strictly better answer. Posting only the part
 * that arrived since would instead clobber an exercise's avg HR with its last
 * minute's.
 */
export interface WatchTelemetrySessionState {
  samples: Map<string, WatchHeartRateSamplePayload[]>;
  // Summed from the per-batch deltas the watch sends. Separate from the
  // samples because a batch can carry energy with no samples, or samples with
  // no energy — HealthKit permissions are granted per type.
  energy: Map<string, number>;
  // Largest duration the watch has reported for the exercise, in minutes.
  // The watch sends the cumulative window when the exercise is left.
  // Once the phone's completion timeline has disagreed with that, durations
  // come only from the timeline — a later batch must not put the watch's
  // larger number back.
  durations: Map<string, number>;
  durationFromTimeline: boolean;
  // `transferUserInfo` can redeliver, and energy is a delta, so applying a
  // batch twice would double calories.
  handledBatchClientIds: Set<string>;
  // Captured when the session goes live so a flush after the store is
  // cleared can still invalidate the diary for the right day.
  entryDate: string | null;
  // Holds something the server has not accepted yet.
  unposted: boolean;
  // When the phone stopped considering this session live; null while live.
  // Pruning treats null as still live, so a restored session that is not the
  // current workout has to set this or it stays in storage forever.
  endedAt: number | null;
  // Steps, completions and the active set, copied when the phone ends the
  // session. The watch's last batch arrives after the live store is cleared,
  // and that is the ordinary path for a workout finished on the phone.
  attribution: WatchTelemetryAttribution | null;
  /**
   * Apple's zone group for the whole session, kept so a later flush of the
   * series does not replace those seconds with a server recalculation.
   */
  appleZones?:
    | {
        index?: number;
        minimumBpm?: number | null;
        maximumBpm?: number | null;
        seconds: number;
      }[]
    | null;
  /** Exercise the zone group is posted on. The server clears the others. */
  appleZoneEntryId?: string | null;
}

interface PersistedSession {
  samples: [string, WatchHeartRateSamplePayload[]][];
  energy: [string, number][];
  durations: [string, number][];
  durationFromTimeline: boolean;
  handledBatchClientIds: string[];
  entryDate: string | null;
  unposted: boolean;
  endedAt: number | null;
  attribution: WatchTelemetryAttribution | null;
  appleZones?: WatchTelemetrySessionState['appleZones'];
  appleZoneEntryId?: string | null;
}

function toPersisted(session: WatchTelemetrySessionState): PersistedSession {
  return {
    samples: [...session.samples.entries()],
    energy: [...session.energy.entries()],
    durations: [...session.durations.entries()],
    durationFromTimeline: session.durationFromTimeline,
    handledBatchClientIds: [...session.handledBatchClientIds],
    entryDate: session.entryDate,
    unposted: session.unposted,
    endedAt: session.endedAt,
    attribution: session.attribution,
    appleZones: session.appleZones ?? null,
    appleZoneEntryId: session.appleZoneEntryId ?? null,
  };
}

function isSample(value: unknown): value is WatchHeartRateSamplePayload {
  if (value == null || typeof value !== 'object') return false;
  const sample = value as WatchHeartRateSamplePayload;
  return typeof sample.t === 'string' && typeof sample.bpm === 'number';
}

function isPairList(
  value: unknown,
  valueOk: (item: unknown) => boolean
): boolean {
  if (value == null) return true;
  if (!Array.isArray(value)) return false;
  return value.every(
    (entry) =>
      Array.isArray(entry) &&
      entry.length === 2 &&
      typeof entry[0] === 'string' &&
      valueOk(entry[1])
  );
}

function isPersistedSession(value: unknown): value is PersistedSession {
  if (value == null || typeof value !== 'object') return false;
  const session = value as PersistedSession;
  if (
    !isPairList(
      session.samples,
      (samples) => Array.isArray(samples) && samples.every(isSample)
    )
  ) {
    return false;
  }
  if (!isPairList(session.energy, (kcal) => typeof kcal === 'number')) {
    return false;
  }
  if (
    !isPairList(session.durations, (minutes) => typeof minutes === 'number')
  ) {
    return false;
  }
  if (
    session.handledBatchClientIds != null &&
    (!Array.isArray(session.handledBatchClientIds) ||
      session.handledBatchClientIds.some((id) => typeof id !== 'string'))
  ) {
    return false;
  }
  return true;
}

function fromPersisted(
  session: PersistedSession,
  create: (entryDate: string | null) => WatchTelemetrySessionState
): WatchTelemetrySessionState | null {
  if (!isPersistedSession(session)) return null;
  const next = create(
    typeof session.entryDate === 'string' ? session.entryDate : null
  );
  next.samples = new Map(session.samples ?? []);
  next.energy = new Map(session.energy ?? []);
  next.durations = new Map(session.durations ?? []);
  next.durationFromTimeline = session.durationFromTimeline === true;
  next.handledBatchClientIds = new Set(session.handledBatchClientIds ?? []);
  next.unposted = session.unposted === true;
  next.endedAt = session.endedAt ?? null;
  next.attribution = session.attribution ?? null;
  next.appleZones = Array.isArray(session.appleZones)
    ? session.appleZones
    : null;
  next.appleZoneEntryId =
    typeof session.appleZoneEntryId === 'string'
      ? session.appleZoneEntryId
      : null;
  return next;
}

export function serializeWatchTelemetry(
  sessions: Map<string, WatchTelemetrySessionState>
): string {
  const persisted: Record<string, PersistedSession> = {};
  for (const [sessionId, session] of sessions) {
    if (
      !session.unposted &&
      session.samples.size === 0 &&
      session.energy.size === 0 &&
      session.durations.size === 0
    ) {
      continue;
    }
    persisted[sessionId] = toPersisted(session);
  }
  return JSON.stringify(persisted);
}

export function deserializeWatchTelemetry(
  raw: string | null,
  create: (entryDate: string | null) => WatchTelemetrySessionState
): Map<string, WatchTelemetrySessionState> {
  const sessions = new Map<string, WatchTelemetrySessionState>();
  if (!raw) return sessions;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return sessions;
  }
  if (parsed == null || typeof parsed !== 'object') return sessions;
  for (const [sessionId, value] of Object.entries(
    parsed as Record<string, PersistedSession>
  )) {
    if (value == null || typeof value !== 'object') continue;
    const restored = fromPersisted(value, create);
    if (restored) sessions.set(sessionId, restored);
  }
  return sessions;
}

/**
 * Copies saved sessions into the live map. Returns true when the merge
 * leaves telemetry the server has not accepted. A saved snapshot that adds
 * nothing new does not re-arm `unposted`, so a late read cannot undo a
 * flush that just succeeded.
 */
export function mergeWatchTelemetry(
  sessions: Map<string, WatchTelemetrySessionState>,
  saved: Map<string, WatchTelemetrySessionState>,
  create: (entryDate: string | null) => WatchTelemetrySessionState
): boolean {
  let shouldFlush = false;
  for (const [sessionId, incoming] of saved) {
    let target = sessions.get(sessionId);
    const created = target == null;
    if (!target) {
      target = create(incoming.entryDate);
      sessions.set(sessionId, target);
    }
    const empty =
      target.samples.size === 0 &&
      target.energy.size === 0 &&
      target.durations.size === 0;
    let mergedNewTelemetry = false;

    for (const [exerciseEntryId, samples] of incoming.samples) {
      const existing = target.samples.get(exerciseEntryId) ?? [];
      const seen = new Set(existing.map((sample) => sample.t));
      const added = samples.filter(
        (sample) => sample?.t && !seen.has(sample.t)
      );
      if (added.length > 0) {
        target.samples.set(exerciseEntryId, existing.concat(added));
        mergedNewTelemetry = true;
      }
    }
    if (mergeEnergy(target, incoming)) mergedNewTelemetry = true;
    if (incoming.durationFromTimeline && !target.durationFromTimeline) {
      target.durationFromTimeline = true;
      target.durations = new Map(incoming.durations);
      mergedNewTelemetry = true;
    } else if (!target.durationFromTimeline) {
      for (const [exerciseEntryId, minutes] of incoming.durations) {
        const previous = target.durations.get(exerciseEntryId) ?? 0;
        if (minutes > previous) {
          target.durations.set(exerciseEntryId, minutes);
          mergedNewTelemetry = true;
        }
      }
    }
    for (const clientId of incoming.handledBatchClientIds) {
      target.handledBatchClientIds.add(clientId);
    }
    if (target.entryDate == null) target.entryDate = incoming.entryDate;
    if (target.endedAt == null) target.endedAt = incoming.endedAt;
    if (target.attribution == null) target.attribution = incoming.attribution;
    if (incoming.unposted && (created || empty || mergedNewTelemetry)) {
      target.unposted = true;
      shouldFlush = true;
    }
  }
  return shouldFlush;
}

/**
 * Energy is a sum of per-batch deltas. `max` drops whichever side is smaller,
 * which is the batch that arrived after relaunch and before this read.
 * Adding both doubles calories when one side's batches are already in the
 * other total, so that case keeps the total that already includes both.
 */
function mergeEnergy(
  target: WatchTelemetrySessionState,
  incoming: WatchTelemetrySessionState
): boolean {
  const incomingHasIds = incoming.handledBatchClientIds.size > 0;
  const targetHasIds = target.handledBatchClientIds.size > 0;
  let incomingNovel = false;
  let targetNovel = false;
  if (incomingHasIds && targetHasIds) {
    for (const id of incoming.handledBatchClientIds) {
      if (!target.handledBatchClientIds.has(id)) incomingNovel = true;
    }
    for (const id of target.handledBatchClientIds) {
      if (!incoming.handledBatchClientIds.has(id)) targetNovel = true;
    }
    if (!incomingNovel && !targetNovel) {
      let changed = false;
      for (const [exerciseEntryId, kcal] of incoming.energy) {
        if ((target.energy.get(exerciseEntryId) ?? 0) === 0 && kcal !== 0) {
          target.energy.set(exerciseEntryId, kcal);
          changed = true;
        }
      }
      return changed;
    }
    // Saved total already includes the live batches, or the reverse.
    // Adding would count those batches twice.
    if (incomingNovel && !targetNovel) {
      let changed = false;
      for (const [exerciseEntryId, kcal] of incoming.energy) {
        if (target.energy.get(exerciseEntryId) !== kcal) {
          target.energy.set(exerciseEntryId, kcal);
          changed = true;
        }
      }
      return changed;
    }
    if (!incomingNovel && targetNovel) return false;
  }

  // Both sides have an id the other lacks, so the totals are added. The
  // bridge ignores batches until the saved buffer is merged, so the live side
  // only holds batches the saved side never saw. A batch counted in both
  // would need to reach the map before the merge, which the bridge prevents.
  let changed = false;
  for (const [exerciseEntryId, kcal] of incoming.energy) {
    const previous = target.energy.get(exerciseEntryId) ?? 0;
    if (kcal === 0) continue;
    target.energy.set(exerciseEntryId, previous + kcal);
    changed = true;
  }
  return changed;
}

export async function readWatchTelemetry(
  create: (entryDate: string | null) => WatchTelemetrySessionState,
  ownerId: string | null
): Promise<Map<string, WatchTelemetrySessionState>> {
  // A buffer under the bare key came from a build before buffers were split
  // per config. Nothing records which config wrote it, so no config may claim
  // it. It only existed on development builds.
  await AsyncStorage.removeItem(STORAGE_KEY);
  if (!ownerId) return new Map();
  const raw = await AsyncStorage.getItem(bufferKey(ownerId));
  if (!raw) return new Map();
  // A value written before encryption starts with '{'. Read it once; the
  // next write replaces it with ciphertext. A keychain or decrypt failure
  // throws, so the caller does not replace the stored buffer with empty.
  const json = raw.startsWith('{') ? raw : await openSealed(raw);
  return deserializeWatchTelemetry(json, create);
}

/**
 * Forgets a server config's telemetry: its saved buffer, and the native-queue
 * batches stamped with it. Used when the config is deleted, and when the
 * signed-in account changes, since the next account may use the same config
 * and must not restore or post the previous account's samples.
 */
export async function deleteWatchTelemetryForConfig(
  ownerId: string
): Promise<void> {
  // A write already queued for this config would recreate the buffer.
  await writeChain;
  await AsyncStorage.removeItem(bufferKey(ownerId));
  await deleteWatchRunsForConfig(ownerId);
  if (
    !WatchConnectivity ||
    typeof WatchConnectivity.pendingHeartRateBatches !== 'function'
  ) {
    return;
  }
  const pending = await WatchConnectivity.pendingHeartRateBatches();
  const ids = pending
    .filter((batch) => batch.ownerId === ownerId)
    .map((batch) => batch.clientId || batch.queueId)
    .filter((id): id is string => Boolean(id));
  if (ids.length > 0) await WatchConnectivity.ackHeartRateBatches(ids);
}

let writeChain: Promise<void> = Promise.resolve();

/** Resolves when every write started so far has finished. */
export function settleWatchTelemetryWrites(): Promise<void> {
  return writeChain;
}

export async function writeWatchTelemetry(
  sessions: Map<string, WatchTelemetrySessionState>,
  ownerId: string | null
): Promise<void> {
  // No active config means nowhere to post, so nothing is saved. The native
  // queue keeps the batches, and none of them are acked.
  if (!ownerId) {
    throw new Error('Watch telemetry has no owning server config');
  }
  // Snapshot now, but persist in call order. Two flushes in flight used to
  // race on AsyncStorage, and the older unposted snapshot could land last.
  // The key is the config that owned the snapshot, so a switch cannot
  // write this config's samples into the next one's buffer.
  const key = bufferKey(ownerId);
  const serialized = serializeWatchTelemetry(sessions);
  const run = writeChain.then(async () => {
    if (serialized === '{}') {
      await AsyncStorage.removeItem(key);
      return;
    }
    await AsyncStorage.setItem(key, await seal(serialized));
  });
  writeChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

let keyPromise: Promise<AESEncryptionKey> | null = null;

/**
 * The buffer is a whole workout of samples, which is too large for
 * SecureStore. The AES key lives in the keychain (and is not backed up);
 * AsyncStorage holds only the ciphertext.
 */
function telemetryKey(): Promise<AESEncryptionKey> {
  if (!keyPromise) {
    keyPromise = loadOrCreateKey().catch((error) => {
      keyPromise = null;
      throw error;
    });
  }
  return keyPromise;
}

async function loadOrCreateKey(): Promise<AESEncryptionKey> {
  const existing = await SecureStore.getItemAsync(KEY_STORE, keyStoreOptions);
  if (existing) return AESEncryptionKey.import(existing, 'base64');
  const key = await AESEncryptionKey.generate();
  await SecureStore.setItemAsync(
    KEY_STORE,
    await key.encoded('base64'),
    keyStoreOptions
  );
  return key;
}

async function seal(plaintext: string): Promise<string> {
  const key = await telemetryKey();
  const sealed = await aesEncryptAsync(
    new TextEncoder().encode(plaintext),
    key
  );
  const combined = await sealed.combined('base64');
  if (typeof combined !== 'string') {
    throw new Error('Watch telemetry seal was not base64');
  }
  return combined;
}

/** Clears the cached key so a test can force the next read to hit SecureStore. */
export function __resetWatchTelemetryKeyForTests(): void {
  keyPromise = null;
}

async function openSealed(stored: string): Promise<string> {
  // A keychain failure must reject. Returning null looks like an empty
  // buffer, and the caller would then delete the ciphertext.
  const key = await telemetryKey();
  try {
    const bytes = (await aesDecryptAsync(
      AESSealedData.fromCombined(stored),
      key
    )) as Uint8Array;
    return new TextDecoder().decode(bytes);
  } catch {
    throw new Error('Watch telemetry could not be decrypted');
  }
}
