import { learnWatchIndoorScale } from './watchIndoorScale';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiError } from './api/errors';
import { addLog } from './LogService';
import { saveWatchRun } from './watchRunSave';
import { completeProgramWorkout } from './runProgramService';
import { toLocalDateString } from '../utils/dateUtils';
import { parseWatchRunPayload, type WatchRunPayload } from '../utils/watchRun';

/**
 * Walks and runs the watch sent that are not in the diary yet. A payload is
 * written here the moment it arrives, before any network call, because the
 * watch has already marked its Apple Health workout as handled (so the Health
 * import will skip it): if the phone dropped this one, it would be in neither
 * place.
 */
const QUEUE_KEY = '@SparkyFitness/watchRunQueue';
/** Ids already filed, so a re-delivered message is not logged twice. */
const DONE_KEY = '@SparkyFitness/watchRunDone';
const MAX_DONE = 50;
const RETRYABLE_CLIENT_STATUSES = new Set([401, 408, 429]);

interface QueuedRun {
  payload: WatchRunPayload;
  /** Set once the entry exists, so a retry only repeats the later steps. */
  entryId?: string;
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

const readQueue = () => readJson<QueuedRun[]>(QUEUE_KEY, []);
const readDone = () => readJson<string[]>(DONE_KEY, []);

// Reads and writes on this key must not interleave.
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const next = chain.then(task, task);
  chain = next.catch(() => undefined);
  return next;
}

/** Stores a run that just arrived. Returns false for a copy already handled. */
export function enqueueWatchRun(payload: WatchRunPayload): Promise<boolean> {
  return serial(async () => {
    const [queue, done] = await Promise.all([readQueue(), readDone()]);
    if (
      done.includes(payload.clientId) ||
      queue.some((item) => item.payload.clientId === payload.clientId)
    ) {
      return false;
    }
    await AsyncStorage.setItem(
      QUEUE_KEY,
      JSON.stringify([...queue, { payload }])
    );
    return true;
  });
}

/**
 * Moves runs the native side kept (they arrived before JavaScript was
 * listening) into this queue. Each one is acknowledged only after it is
 * stored here, or was already stored. A failed write leaves it pending.
 */
export async function acceptPendingWatchRuns(
  pending: readonly unknown[],
  enqueue: (payload: WatchRunPayload) => Promise<boolean>,
  ack: (clientIds: string[]) => Promise<void>
): Promise<void> {
  const stored: string[] = [];
  for (const raw of pending) {
    const payload = parseWatchRunPayload(raw);
    if (!payload) continue;
    try {
      await enqueue(payload);
      stored.push(payload.clientId);
    } catch {
      // The native copy stays until a later launch can store it.
    }
  }
  if (stored.length > 0) await ack(stored);
}

async function update(
  clientId: string,
  change: (item: QueuedRun) => QueuedRun | null
): Promise<void> {
  const queue = await readQueue();
  const next = queue.flatMap((item) =>
    item.payload.clientId === clientId ? (change(item) ?? []) : [item]
  );
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(next));
}

async function markDone(clientId: string): Promise<void> {
  const done = await readDone();
  await AsyncStorage.setItem(
    DONE_KEY,
    JSON.stringify(
      [...done.filter((id) => id !== clientId), clientId].slice(-MAX_DONE)
    )
  );
}

/**
 * A run that followed a training-program workout to its last step counts as
 * that workout. Best effort and safe to repeat: the server only moves on when
 * the index is the one due, and the run is already in the diary either way.
 */
async function tickOffProgram(
  payload: WatchRunPayload,
  entryId: string
): Promise<void> {
  if (!payload.program || !payload.planCompleted) return;
  try {
    await completeProgramWorkout(
      payload.program.id,
      payload.program.index,
      toLocalDateString(new Date(payload.startedAt)),
      entryId
    );
  } catch (error) {
    // A failure that may pass (offline, 5xx, auth) keeps the run queued: the
    // entry id is already stored, so the retry only repeats the later steps.
    // One the server will never accept is logged and the run stays filed.
    if (isRetryable(error)) throw error;
    addLog(
      `[Watch Run] Could not tick off the program workout: ${String(error)}`,
      'WARNING'
    );
  }
}

const isRetryable = (error: unknown): boolean => {
  const status = error instanceof ApiError ? error.statusCode : undefined;
  return !(
    status != null &&
    status >= 400 &&
    status < 500 &&
    !RETRYABLE_CLIENT_STATUSES.has(status)
  );
};

let processing: Promise<string[]> | null = null;
/** Set when a caller joins a pass that is already running, so it runs once more. */
let again = false;
/** One delayed retry. A second failure while this is waiting does not add another. */
let retryTimer: ReturnType<typeof setTimeout> | null = null;
/** The bridge supplies this so the retry can wait until the server is reachable. */
let retry: (() => void) | null = null;
const RETRY_DELAY_MS = 30_000;

/** Registers the drain a retryable failure should call. Null clears a pending one. */
export function onWatchRunRetry(handler: (() => void) | null): void {
  retry = handler;
  if (!handler && retryTimer != null) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

function scheduleRetry(): void {
  if (retryTimer != null || retry == null) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    retry?.();
  }, RETRY_DELAY_MS);
}

/**
 * Files every queued run it can. A failure that may pass (offline, 5xx, auth)
 * leaves the run queued and tries it again after a delay; one the server
 * will never accept is dropped and logged. Returns the diary day of each run
 * it filed.
 */
export function processWatchRunQueue(
  distanceUnit: 'km' | 'miles',
  onFiled?: (payload: WatchRunPayload, entryId: string) => void
): Promise<string[]> {
  if (processing) {
    // A run queued just as the pass was finishing would otherwise wait for the
    // next trigger: make the pass look again before it ends.
    again = true;
    return processing;
  }
  let needsRetry = false;
  processing = (async () => {
    const filed: string[] = [];
    do {
      again = false;
      const pass = await drainOnce(distanceUnit, onFiled);
      filed.push(...pass.filed);
      if (pass.needsRetry) needsRetry = true;
    } while (again);
    return filed;
  })().finally(() => {
    processing = null;
    if (needsRetry) scheduleRetry();
  });
  return processing;
}

async function drainOnce(
  distanceUnit: 'km' | 'miles',
  onFiled?: (payload: WatchRunPayload, entryId: string) => void
): Promise<{ filed: string[]; needsRetry: boolean }> {
  const filed: string[] = [];
  let needsRetry = false;
  // A run queued while this drain was going is picked up by the next pass of
  // the loop, so it is never left waiting for another trigger.
  const attempted = new Set<string>();
  for (;;) {
    const queue = await serial(readQueue);
    const item = queue.find((run) => !attempted.has(run.payload.clientId));
    if (!item) break;
    const { clientId } = item.payload;
    attempted.add(clientId);
    try {
      const entryId = await saveWatchRun(
        item.payload,
        distanceUnit,
        item.entryId,
        (created) =>
          serial(() =>
            update(clientId, (run) => ({ ...run, entryId: created }))
          )
      );
      await tickOffProgram(item.payload, entryId);
      // A treadmill distance entered on the wrist teaches the indoor factor.
      // Before marking done, so a run that stops here is learned on retry.
      if (
        item.payload.place === 'indoor' &&
        item.payload.estimatedDistanceMeters != null
      ) {
        await learnWatchIndoorScale(
          item.payload.kind,
          item.payload.distanceScale ?? 1,
          item.payload.estimatedDistanceMeters,
          item.payload.distanceMeters
        );
      }
      // Marked done first: a stop between the two steps leaves a queued run
      // that is refiled onto its stored entry, never a run in neither place
      // that a re-delivery would file a second time.
      await serial(async () => {
        await markDone(clientId);
        await update(clientId, () => null);
      });
      filed.push(toLocalDateString(new Date(item.payload.startedAt)));
      // A listener failing (a toast, a navigation) never undoes a filed run.
      try {
        onFiled?.(item.payload, entryId);
      } catch (error) {
        addLog(
          `[Watch Run] Filed-run listener failed: ${String(error)}`,
          'WARNING'
        );
      }
    } catch (error) {
      const status = error instanceof ApiError ? error.statusCode : undefined;
      const message = error instanceof Error ? error.message : String(error);
      if (!isRetryable(error)) {
        addLog(
          `[Watch Run] Dropped watch run ${clientId}: server rejected it (${status})`,
          'ERROR'
        );
        await serial(() => update(clientId, () => null));
      } else {
        addLog(
          `[Watch Run] Will retry watch run ${clientId}: ${message}`,
          'WARNING'
        );
        needsRetry = true;
      }
    }
  }
  return { filed, needsRetry };
}

/** Whether any run is still waiting to be filed. */
export async function hasQueuedWatchRuns(): Promise<boolean> {
  return (await serial(readQueue)).length > 0;
}
