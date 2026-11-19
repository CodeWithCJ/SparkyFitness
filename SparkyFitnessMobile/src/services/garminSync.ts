import WatchConnectivity, {
  type GarminAccountClearedMessage,
  type GarminDevice,
  type GarminPhoneMessage,
  type GarminSendResult,
  type GarminSnapshotMessage,
  type GarminSnapshotPayload,
  type GarminSnapshotTopics,
  type GarminStatus,
} from '../../modules/watch-connectivity';
import { isGarminWatchEnabled } from '../constants/garmin';
import { addLog } from './LogService';

/**
 * What each Garmin watch gets, and when (`agent-docs/garmin.md`, "Phone
 * side"). The native transport only carries one message to one watch and
 * reports the watches; every decision lives here, so a future iOS transport
 * shares it and Jest covers it.
 *
 * Connect IQ has no latest-value slot: a message is all a watch ever gets. So
 * this keeps, per watch, what it confirmed receiving, and sends it only the
 * topics that differ. Anything that leaves that record in doubt (a failed
 * send, a reconnect, a new account) forgets it, and the next message is in
 * full.
 */

/** Version 1 of the phone <-> Connect IQ protocol. */
const GARMIN_PROTOCOL_VERSION = 1;

/**
 * How old the `pushedAt` a watch last got may grow while no topic changes.
 * The watch shows it as the time its figures are from, so once the phone has
 * confirmed the same figures for this long, it gets the envelope alone.
 */
export const GARMIN_PUSHED_AT_REFRESH_MS = 5 * 60 * 1000;

const ACCOUNT_CLEARED_MESSAGE: GarminAccountClearedMessage = {
  type: 'accountCleared',
  v: GARMIN_PROTOCOL_VERSION,
};

type TopicName = keyof GarminSnapshotTopics;

export interface GarminSyncDeps {
  sendMessage: (
    deviceId: string,
    message: GarminPhoneMessage
  ) => Promise<GarminSendResult>;
  setCache: (message: GarminSnapshotMessage | null) => Promise<void>;
  getCache: () => Promise<GarminSnapshotMessage | null>;
  /** `startGarmin()`: starts the link if it can, and its status. */
  start: () => Promise<GarminStatus>;
  /** `garminStatus()`: the status, starting nothing. */
  getStatus: () => Promise<GarminStatus>;
  log: (message: string) => void;
}

export interface GarminSync {
  /**
   * Takes the snapshot of a context push: caches it natively and sends each
   * connected watch what it is missing. Resolves once those sends have
   * finished; never rejects. A snapshot with no owner (signed out) only
   * deletes the cache: it sends nothing. `epoch` is `accountEpoch()` as it
   * was when the push started building; a snapshot from before the last
   * `clearAccount` is dropped.
   */
  publish(snapshot: GarminSnapshotPayload, epoch: number): Promise<void>;
  /**
   * Bumped by every `clearAccount`. A push reads it before it starts
   * fetching, so its figures, which may belong to the account just cleared,
   * are not published after the clear (the owner is the server config id, so
   * signing in again to the same server would not tell them apart).
   */
  accountEpoch(): number;
  /**
   * Sends that watch the latest snapshot in full (`onGarminResync`), or,
   * before this runtime has published one, the native cache's copy. With
   * neither (signed out), it sends `accountCleared`, so a watch that was away
   * when the account was cleared still drops it.
   */
  resync(deviceId: string): Promise<void>;
  /** The link and its watches as the native side reports them. */
  updateStatus(status: GarminStatus): void;
  /** Starts the native link (`startGarmin()`) and takes its status. */
  start(): Promise<void>;
  /** Asks the native side for the watches again (`garminStatus()`). */
  refreshDevices(): Promise<void>;
  /** Forgets what every watch holds, so each next message is in full. */
  forgetAll(): void;
  /**
   * Forgets the account: the latest snapshot, its owner and every record, and
   * deletes the native cache after any write already queued. Resolves once
   * that delete has run.
   */
  clearAccount(): Promise<void>;
}

/**
 * JSON that does not depend on key order, so two copies of a topic built in a
 * different order still compare equal. Arrays keep their order: it is part
 * of the content (the Goals page draws its nutrient rows in that order).
 */
export function stableJson(value: unknown): string {
  return JSON.stringify(sortedKeys(value)) ?? 'null';
}

function sortedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedKeys);
  if (value === null || typeof value !== 'object') return value;
  const source = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    sorted[key] = sortedKeys(source[key]);
  }
  return sorted;
}

/** The topics a snapshot carries, in name order so sends are predictable. */
function topicNames(topics: Partial<GarminSnapshotTopics>): TopicName[] {
  return (Object.keys(topics) as TopicName[])
    .filter((name) => topics[name] !== undefined)
    .sort();
}

/**
 * The topics of `topics` whose content differs from what a watch confirmed
 * receiving (`delivered`: topic name -> `stableJson` of that copy). Every
 * topic when the record is null, which is how a watch whose holdings are
 * unknown gets a full snapshot.
 */
export function changedTopicNames(
  topics: Partial<GarminSnapshotTopics>,
  delivered: ReadonlyMap<string, string> | null
): TopicName[] {
  return topicNames(topics).filter(
    (name) => delivered?.get(name) !== stableJson(topics[name])
  );
}

function pickTopics(
  topics: Partial<GarminSnapshotTopics>,
  names: readonly TopicName[]
): Partial<GarminSnapshotTopics> {
  const picked: Partial<GarminSnapshotTopics> = {};
  for (const name of names) copyTopic(topics, picked, name);
  return picked;
}

// Generic over the key so each topic keeps its own type once there are several.
function copyTopic<K extends TopicName>(
  from: Partial<GarminSnapshotTopics>,
  to: Partial<GarminSnapshotTopics>,
  name: K
): void {
  to[name] = from[name];
}

/** The `snapshot` message carrying `topics` of `snapshot`. */
export function snapshotMessage(
  snapshot: GarminSnapshotPayload,
  topics: Partial<GarminSnapshotTopics>
): GarminSnapshotMessage {
  return {
    type: 'snapshot',
    v: GARMIN_PROTOCOL_VERSION,
    pushedAt: snapshot.pushedAt,
    today: snapshot.today,
    owner: snapshot.owner,
    topics,
  };
}

/**
 * A cached message as the native side hands it back. Checked because it
 * crosses the bridge and may have been stored by an older build.
 */
function isSnapshotMessage(value: unknown): value is GarminSnapshotMessage {
  if (value === null || typeof value !== 'object') return false;
  const message = value as { type?: unknown; topics?: unknown };
  return (
    message.type === 'snapshot' &&
    typeof message.topics === 'object' &&
    message.topics !== null
  );
}

interface WatchState {
  /**
   * Topic name -> `stableJson` of the copy the watch confirmed (`sent`).
   * Null when what it holds is unknown, so its next message is in full.
   */
  delivered: Map<string, string> | null;
  /**
   * The `pushedAt` of the last message the watch confirmed. It shows that
   * time with its figures, so an unchanged snapshot still goes out as a bare
   * envelope once it is `GARMIN_PUSHED_AT_REFRESH_MS` newer.
   */
  deliveredPushedAt: number | null;
  /**
   * Bumped by every forget. A send that started before one does not record
   * its result: the watch may have dropped it since (reconnect, new account).
   */
  generation: number;
  /** End of this watch's send chain; each send waits for the one before. */
  tail: Promise<void>;
}

/**
 * What `readCache` found: the cached message, nothing (`empty`: no account
 * has published since the last clear), or something that could not be read,
 * which says nothing either way.
 */
type CacheRead = GarminSnapshotMessage | 'empty' | 'unreadable';

export function createGarminSync(deps: GarminSyncDeps): GarminSync {
  let latest: GarminSnapshotPayload | null = null;
  let publishedOwner: string | null = null;
  let accountEpoch = 0;
  // Null until the native side has said which watches there are.
  let devices: readonly GarminDevice[] | null = null;
  // Null until the native side has said; anything but 'ready' makes the next
  // publish start the link and read the watches first.
  let linkState: GarminStatus['state'] | null = null;
  // Bumped by every status event, so a status answer that was asked for
  // before a newer event does not overwrite it.
  let devicesVersion = 0;
  let statusRequest: Promise<void> | null = null;
  let startRequest: Promise<void> | null = null;
  // Cache writes run one after another, so an older snapshot can never land
  // after a newer one.
  let cacheTail: Promise<void> = Promise.resolve();
  const watches = new Map<string, WatchState>();

  function watchState(deviceId: string): WatchState {
    let state = watches.get(deviceId);
    if (!state) {
      state = {
        delivered: null,
        deliveredPushedAt: null,
        generation: 0,
        tail: Promise.resolve(),
      };
      watches.set(deviceId, state);
    }
    return state;
  }

  function forget(deviceId: string): void {
    const state = watches.get(deviceId);
    if (!state) return;
    state.delivered = null;
    state.deliveredPushedAt = null;
    state.generation += 1;
  }

  function forgetAll(): void {
    for (const deviceId of watches.keys()) forget(deviceId);
  }

  /**
   * Queues a send of the latest snapshot to one watch. Sends to one watch
   * never overlap, so its record is updated in the order the watch got them.
   * `replayCache`: with no latest snapshot when the send runs, send the
   * native cache's copy instead, or `accountCleared` when nothing is cached.
   */
  function enqueue(deviceId: string, replayCache = false): Promise<void> {
    const state = watchState(deviceId);
    const run = state.tail.then(() => sendLatest(deviceId, state, replayCache));
    // `sendLatest` handles its own failures; this only keeps the chain alive
    // should one slip through.
    state.tail = run.catch((error: unknown) => {
      deps.log(`Garmin send to ${deviceId} failed: ${String(error)}`);
    });
    return state.tail;
  }

  async function deliver(
    deviceId: string,
    message: GarminPhoneMessage
  ): Promise<GarminSendResult> {
    try {
      return await deps.sendMessage(deviceId, message);
    } catch (error) {
      deps.log(`Garmin send to ${deviceId} threw: ${String(error)}`);
      return 'failed';
    }
  }

  function record(
    state: WatchState,
    snapshot: GarminSnapshotPayload,
    names: readonly TopicName[]
  ): void {
    const delivered = state.delivered ?? new Map<string, string>();
    for (const name of names) {
      delivered.set(name, stableJson(snapshot.topics[name]));
    }
    state.delivered = delivered;
    state.deliveredPushedAt = snapshot.pushedAt;
  }

  /**
   * Whether a watch that already has every topic of `snapshot` should still
   * get its envelope, so the time it shows the figures as from keeps up with
   * the phone confirming them.
   */
  function pushedAtStale(
    state: WatchState,
    snapshot: GarminSnapshotPayload
  ): boolean {
    return (
      state.deliveredPushedAt === null ||
      snapshot.pushedAt - state.deliveredPushedAt >= GARMIN_PUSHED_AT_REFRESH_MS
    );
  }

  /**
   * The result of a send that did not reach the watch. `notConnected` is the
   * watch being away, which is normal and not logged.
   */
  function lost(deviceId: string, result: GarminSendResult): void {
    if (result !== 'notConnected') {
      deps.log(`Garmin snapshot to ${deviceId} not delivered: ${result}`);
    }
    forget(deviceId);
  }

  /**
   * Sends one watch what it is missing of the latest snapshot. Read when the
   * send runs rather than when it was queued, so a watch behind a slow send
   * gets the newest figures, and a queued send with nothing new sends nothing
   * (or the envelope alone, once its `pushedAt` is worth refreshing).
   */
  async function sendLatest(
    deviceId: string,
    state: WatchState,
    replayCache: boolean
  ): Promise<void> {
    if (latest === null && replayCache) {
      await sendWithoutLatest(deviceId, state);
    }
    // A publish that landed while the cached copy was read or sent is newer,
    // so it follows (in full: the replay is never recorded).
    const snapshot = latest;
    if (!snapshot) return;
    const generation = state.generation;
    const full = state.delivered === null;
    const names = changedTopicNames(snapshot.topics, state.delivered);
    // A watch whose holdings are unknown gets the envelope even without
    // topics, so the owner reaches it and it drops another account's topics.
    // One that has every topic gets it once its `pushedAt` is stale: the
    // watch rewrites its `meta` from an envelope without topics.
    if (names.length === 0 && !full && !pushedAtStale(state, snapshot)) return;

    const result = await deliver(
      deviceId,
      snapshotMessage(snapshot, pickTopics(snapshot.topics, names))
    );
    // Forgotten while in flight: whatever this result says is out of date.
    if (generation !== state.generation) return;
    if (result === 'sent') {
      record(state, snapshot, names);
    } else if (result === 'tooLarge' && names.length > 1) {
      await sendEachTopic(deviceId, state, snapshot, names);
    } else if (result === 'tooLarge') {
      // On its own over the cap: sending it again would only fail again. Not
      // recorded, so it goes out once it has shrunk.
      deps.log(
        `Garmin topic ${names[0] ?? '(none)'} is too large for ${deviceId}; not sent`
      );
    } else {
      lost(deviceId, result);
    }
  }

  /** Splits a snapshot that was over the size cap into one message per topic. */
  async function sendEachTopic(
    deviceId: string,
    state: WatchState,
    snapshot: GarminSnapshotPayload,
    names: readonly TopicName[]
  ): Promise<void> {
    const generation = state.generation;
    for (const name of names) {
      const result = await deliver(
        deviceId,
        snapshotMessage(snapshot, pickTopics(snapshot.topics, [name]))
      );
      if (generation !== state.generation) return;
      if (result === 'sent') {
        record(state, snapshot, [name]);
      } else if (result === 'tooLarge') {
        deps.log(`Garmin topic ${name} is too large for ${deviceId}; not sent`);
      } else {
        // The watch went away or the SDK failed: the rest would fail too.
        lost(deviceId, result);
        return;
      }
    }
  }

  /**
   * Answers a resync that comes before this JS runtime has a snapshot.
   *
   * With the native cache's copy, sends that: this runtime started after the
   * cache was written, or the server has not answered since. That copy is the
   * same account's last snapshot, since every account change deletes it.
   *
   * With nothing cached either, no account has published since the last
   * clear (signed out, or the server was removed or switched), so the watch
   * gets `accountCleared`. The clear itself reaches only the watches
   * connected then, and the native side sends it on a resync only while
   * nothing here listens.
   *
   * Not recorded, since what the watch then holds is not `latest`, so the
   * next publish is sent in full.
   */
  async function sendWithoutLatest(
    deviceId: string,
    state: WatchState
  ): Promise<void> {
    const generation = state.generation;
    const cached = await readCache();
    // Forgotten meanwhile (an account change, a reconnect), or a publish
    // landed: what was read is out of date. A cache that could not be read
    // says nothing about the account, so the watch keeps what it shows.
    if (
      cached === 'unreadable' ||
      generation !== state.generation ||
      latest !== null
    ) {
      return;
    }
    const message = cached === 'empty' ? ACCOUNT_CLEARED_MESSAGE : cached;
    const result = await deliver(deviceId, message);
    if (generation !== state.generation || result === 'sent') return;
    if (result === 'tooLarge') {
      deps.log(`Garmin cached snapshot is too large for ${deviceId}; not sent`);
    } else {
      lost(deviceId, result);
    }
  }

  /** Reads the cache after every write queued before it. */
  async function readCache(): Promise<CacheRead> {
    await cacheTail;
    try {
      const message = await deps.getCache();
      if (message === null) return 'empty';
      return isSnapshotMessage(message) ? message : 'unreadable';
    } catch (error) {
      deps.log(`Garmin snapshot cache read failed: ${String(error)}`);
      return 'unreadable';
    }
  }

  function writeCache(message: GarminSnapshotMessage | null): Promise<void> {
    cacheTail = cacheTail
      .then(() => deps.setCache(message))
      .catch((error: unknown) => {
        deps.log(`Garmin snapshot cache write failed: ${String(error)}`);
      });
    return cacheTail;
  }

  function applyStatus(status: GarminStatus | null | undefined): void {
    // Crosses the native bridge; a malformed one means no link, no watches.
    linkState = status?.state ?? null;
    applyDevices(status?.devices);
  }

  function applyDevices(next: readonly GarminDevice[] | undefined): void {
    const list = Array.isArray(next) ? next : [];
    const previous = devices;
    devices = list;
    for (const deviceId of watches.keys()) {
      const device = list.find((entry) => entry.id === deviceId);
      // What a watch holds after a gap is unknown; it may have been reset.
      if (!device?.connected) forget(deviceId);
    }
    for (const device of list) {
      const before = previous?.find((entry) => entry.id === device.id);
      // A freshly installed app starts with empty storage, whatever was sent
      // to the watch before, so it gets the latest snapshot in full.
      if (
        device.connected &&
        before?.app === 'notInstalled' &&
        device.app === 'installed'
      ) {
        void resync(device.id);
      }
    }
  }

  /** One status read; dropped when a newer status event came meanwhile. */
  async function readStatus(
    read: () => Promise<GarminStatus>,
    what: string
  ): Promise<void> {
    const version = devicesVersion;
    try {
      const status = await read();
      if (version === devicesVersion) applyStatus(status);
    } catch (error) {
      deps.log(`Garmin ${what} failed: ${String(error)}`);
    }
  }

  function refreshDevices(): Promise<void> {
    statusRequest ??= readStatus(deps.getStatus, 'status').finally(() => {
      statusRequest = null;
    });
    return statusRequest;
  }

  function start(): Promise<void> {
    startRequest ??= readStatus(deps.start, 'start').finally(() => {
      startRequest = null;
    });
    return startRequest;
  }

  function resync(deviceId: string): Promise<void> {
    forget(deviceId);
    return enqueue(deviceId, true);
  }

  async function publish(
    snapshot: GarminSnapshotPayload,
    epoch: number
  ): Promise<void> {
    // Built from before the last account clear: its figures may be the
    // cleared account's, even under the same owner.
    if (epoch !== accountEpoch) return;
    // A watch's record belongs to the account it was sent for; the watch
    // drops that account's topics when it sees another owner.
    if (snapshot.owner !== publishedOwner) forgetAll();
    publishedOwner = snapshot.owner;
    // No owner is signed out. Such a snapshot still carries the last figures
    // the hook held, so nothing of it is kept or sent: the account change
    // that left no owner has already emptied the connected watches natively
    // (`accountCleared`, through `clearGarminAccount`), and a watch away then
    // gets it from `resync` when it comes back.
    if (snapshot.owner === '') {
      latest = null;
      await writeCache(null);
      return;
    }
    latest = snapshot;
    const cached = writeCache(
      snapshotMessage(
        snapshot,
        pickTopics(snapshot.topics, topicNames(snapshot.topics))
      )
    );
    // Starting is idempotent natively, and also what notices Garmin Connect
    // installed, or back, since the link last reported.
    if (linkState !== 'ready') await start();
    // Every connected watch, whatever Garmin Connect said about the app: its
    // answer is not trusted for a sideloaded app (`agent-docs/garmin.md`), so
    // it is shown in Settings only, and the send result decides.
    const sends = (devices ?? [])
      .filter((device) => device.connected)
      .map((device) => enqueue(device.id));
    await Promise.all([cached, ...sends]);
  }

  function clearAccount(): Promise<void> {
    accountEpoch += 1;
    latest = null;
    publishedOwner = null;
    // Also turns away every send already queued or in flight: each reads
    // `latest` when it runs, and a forgotten one records nothing.
    forgetAll();
    return writeCache(null);
  }

  return {
    publish,
    accountEpoch: () => accountEpoch,
    resync,
    updateStatus(status) {
      devicesVersion += 1;
      applyStatus(status);
    },
    start,
    refreshDevices,
    forgetAll,
    clearAccount,
  };
}

let shared: GarminSync | null = null;

/**
 * The shared sync's `accountEpoch()`, read without the native checks
 * `getGarminSync()` makes, or null before there is a sync. A push takes this
 * before it starts fetching and hands it to `publish`; one that started with
 * no sync cannot show it postdates a clear, so it publishes nothing and the
 * next push does.
 */
export function garminAccountEpoch(): number | null {
  return shared?.accountEpoch() ?? null;
}

const UNAVAILABLE: GarminStatus = { state: 'unavailable', devices: [] };

/**
 * The app's Garmin sync, bound to the native module. Null where this install
 * does not use Garmin (`isGarminWatchEnabled()`: iOS, a release build before
 * the watch app is published, no Garmin Connect) or the native build lacks the
 * Garmin send methods. Created once, so what each watch holds survives the
 * hook that drives it remounting.
 */
export function getGarminSync(): GarminSync | null {
  const watch = WatchConnectivity;
  if (
    !watch ||
    !isGarminWatchEnabled() ||
    !watch.sendGarminMessage ||
    !watch.setGarminSnapshotCache
  ) {
    return null;
  }
  if (!shared) {
    shared = createGarminSync({
      sendMessage: (deviceId, message) =>
        watch.sendGarminMessage?.(deviceId, message) ??
        Promise.resolve<GarminSendResult>('failed'),
      setCache: (message) =>
        watch.setGarminSnapshotCache?.(message) ?? Promise.resolve(),
      // A module without the read cannot say the phone is signed out, so it
      // reads as unreadable rather than empty (which would empty the watch).
      getCache: () =>
        watch.getGarminSnapshotCache?.() ??
        Promise.reject(new Error('getGarminSnapshotCache is unavailable')),
      start: () => watch.startGarmin?.() ?? Promise.resolve(UNAVAILABLE),
      getStatus: () => watch.garminStatus?.() ?? Promise.resolve(UNAVAILABLE),
      log: (message) => {
        void addLog(message, 'WARNING');
      },
    });
  }
  return shared;
}

/**
 * The Garmin side of an account change (signing out, removing or switching
 * the active server): the sync forgets the account and turns away the
 * pushes already under way, and the native side deletes its cache, drops
 * queued sends and tells every connected watch to drop that account's
 * figures (`accountCleared`); a watch away then gets it on its next resync.
 * Called from the identity change itself, so it runs whether or not a server
 * answers afterwards.
 *
 * Not gated on `isGarminWatchEnabled()`: a cache written while Garmin was on
 * (Garmin Connect since removed, an earlier build) must go too, and clearing
 * where there is nothing does nothing.
 */
export async function clearGarminAccount(): Promise<void> {
  // The sync first, so the sends the native clear answers `failed` are
  // already forgotten and are not logged as lost.
  const cleared = shared?.clearAccount();
  await Promise.all([cleared, WatchConnectivity?.clearGarminAccount?.()]);
}
