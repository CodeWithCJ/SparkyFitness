import AsyncStorage from '@react-native-async-storage/async-storage';

import { ApiError } from './api/errors';
import { setExerciseEntryForm } from './api/exerciseApi';
import { addLog } from './LogService';
import { fetchCardioSessionsPage } from './api/exerciseStatsApi';
import { measureWatchRunForm } from './stepDistance';
import { learnStride } from './strideCalibration';
import { addDays } from '@workspace/shared';
import { toLocalDateString } from '../utils/dateUtils';

/**
 * A watch run is filed the moment it reaches the phone, which can be before
 * the watch's steps have reached Apple Health, so its cadence and stride come
 * out empty and stay that way. This keeps those runs and measures them again
 * later, when the steps are there, then puts the result on the entry that was
 * already filed.
 */
const KEY = '@SparkyFitness/pendingWatchForm';
/** Entries already filled in or given up on, so a sweep never takes them again. */
const DONE_KEY = '@SparkyFitness/pendingWatchFormDone';
const SWEPT_KEY = '@SparkyFitness/pendingWatchFormSweptAt';
const DONE_LIMIT = 200;
/** How far back a sweep looks for runs that never got a cadence. */
const SWEEP_DAYS = 3;
/** How often a sweep may ask the server for recent runs. */
export const FORM_SWEEP_EVERY_MS = 30 * 60_000;
/** How long to wait between looks: the watch syncs steps in its own time. */
export const FORM_RETRY_AFTER_MS = 15 * 60_000;
/** After this the steps are not coming, or the run is too old to matter. */
export const FORM_GIVE_UP_AFTER_MS = 3 * 24 * 60 * 60_000;

export interface PendingWatchForm {
  entryId: string;
  /** The server it was filed to; another server's runs are left alone. */
  ownerId: string;
  activity: 'walk' | 'run';
  startedAt: number;
  endedAt: number;
  activeSeconds: number;
  /** The distance stored on the entry, which the stride is worked out from. */
  distanceMeters: number;
  /** A treadmill figure was entered, so the stride may learn from it. */
  taughtDistance: boolean;
  createdAt: number;
  nextAttemptAt: number;
}

let chain: Promise<unknown> = Promise.resolve();
/** One read-modify-write at a time, so two callers cannot overwrite each other. */
function serial<T>(work: () => Promise<T>): Promise<T> {
  const result = chain.then(work, work);
  chain = result.catch(() => undefined);
  return result;
}

async function read(): Promise<PendingWatchForm[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as PendingWatchForm[]) : [];
  } catch {
    return [];
  }
}

const write = (items: PendingWatchForm[]) =>
  AsyncStorage.setItem(KEY, JSON.stringify(items));

async function readDone(): Promise<string[]> {
  try {
    const parsed: unknown = JSON.parse(
      (await AsyncStorage.getItem(DONE_KEY)) ?? '[]'
    );
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

/** Notes entries as finished, newest last, keeping only the latest few. */
async function markDone(entryIds: string[]): Promise<void> {
  if (entryIds.length === 0) return;
  const done = await readDone();
  await AsyncStorage.setItem(
    DONE_KEY,
    JSON.stringify([...done, ...entryIds].slice(-DONE_LIMIT))
  );
}

/** Adds a run to the stored list unless it is already there. Caller holds the lock. */
async function addPending(
  run: Omit<PendingWatchForm, 'createdAt' | 'nextAttemptAt'>,
  now: number,
  firstLookAfterMs: number
): Promise<void> {
  const items = await read();
  if (items.some((item) => item.entryId === run.entryId)) return;
  await write([
    ...items,
    { ...run, createdAt: now, nextAttemptAt: now + firstLookAfterMs },
  ]);
}

/** Keeps a filed run whose cadence and stride could not be measured yet. */
export function rememberPendingWatchForm(
  run: Omit<PendingWatchForm, 'createdAt' | 'nextAttemptAt'>,
  now = Date.now()
): Promise<void> {
  return serial(async () => {
    try {
      await addPending(run, now, FORM_RETRY_AFTER_MS);
    } catch (error) {
      addLog(
        `[Watch Run] Could not remember a run to measure later: ${String(error)}`,
        'WARNING'
      );
    }
  });
}

/**
 * Measures again every remembered run that is due and fills in the ones whose
 * steps are now in Apple Health. Never asks for access, never throws.
 * Returns the days whose runs were changed, so their caches can refresh.
 */
export function retryPendingWatchForms(
  activeOwnerId: string | null,
  now = Date.now()
): Promise<string[]> {
  return serial(async () => {
    const days: string[] = [];
    try {
      const items = await read();
      if (items.length === 0) return days;
      const kept: PendingWatchForm[] = [];
      const finished: string[] = [];
      for (const item of items) {
        if (now - item.createdAt > FORM_GIVE_UP_AFTER_MS) {
          addLog(
            `[Watch Run] Gave up measuring cadence and stride for ${item.activity} entry ${item.entryId}: no steps came from Apple Health`
          );
          finished.push(item.entryId);
          continue;
        }
        if (item.ownerId !== activeOwnerId || now < item.nextAttemptAt) {
          kept.push(item);
          continue;
        }
        const later = { ...item, nextAttemptAt: now + FORM_RETRY_AFTER_MS };
        try {
          const form = await measureWatchRunForm(
            {
              activity: item.activity,
              startedAt: item.startedAt,
              finishedAt: item.endedAt,
              activeSeconds: item.activeSeconds,
            },
            item.distanceMeters
          );
          if (!form) {
            kept.push(later);
            continue;
          }
          await setExerciseEntryForm(item.entryId, {
            avgCadence: form.avgCadence,
            strideLengthCm: form.strideLengthCm,
          });
          addLog(
            `[Watch Run] Filled in cadence ${form.avgCadence} spm${
              form.strideLengthCm != null
                ? ` and stride ${form.strideLengthCm} cm`
                : ''
            } on ${item.activity} entry ${item.entryId}`
          );
          if (item.taughtDistance) {
            await learnStride(
              item.activity,
              form.steps,
              item.distanceMeters,
              item.entryId
            );
          }
          days.push(toLocalDateString(new Date(item.startedAt)));
          finished.push(item.entryId);
        } catch (error) {
          // The entry is gone: nothing to fill in. Anything else, try again.
          if (error instanceof ApiError && error.statusCode === 404) {
            finished.push(item.entryId);
            continue;
          }
          addLog(
            `[Watch Run] Could not fill in cadence and stride yet: ${String(error)}`,
            'WARNING'
          );
          kept.push(later);
        }
      }
      await write(kept);
      await markDone(finished);
    } catch (error) {
      addLog(
        `[Watch Run] Could not measure remembered runs: ${String(error)}`,
        'WARNING'
      );
    }
    return days;
  });
}

const activityOf = (name: string): 'walk' | 'run' | null =>
  /\b(run|running|jog|jogging|treadmill)\b/i.test(name)
    ? 'run'
    : /\b(walk|walking)\b/i.test(name)
      ? 'walk'
      : null;

/** `06:22:00` or `06:22` on a day, as a local instant. */
const localInstant = (day: string, time: string): number =>
  new Date(`${day}T${time.slice(0, 5)}:00`).getTime();

/**
 * Finds runs and walks from the last few days that have no cadence, whether
 * they were filed before this existed or slipped past it, and queues them to
 * be measured. At most once in a while, and never for an entry already filled
 * in or given up on. Best effort: a server that cannot be reached just means
 * the next sweep.
 */
export function sweepRecentRunsMissingForm(
  activeOwnerId: string | null,
  now = Date.now()
): Promise<void> {
  if (!activeOwnerId) return Promise.resolve();
  return serial(async () => {
    try {
      const lastSweep = Number(await AsyncStorage.getItem(SWEPT_KEY)) || 0;
      if (now - lastSweep < FORM_SWEEP_EVERY_MS) return;
      const today = toLocalDateString(new Date(now));
      const page = await fetchCardioSessionsPage({
        startDate: addDays(today, -SWEEP_DAYS),
        endDate: today,
        page: 1,
        pageSize: 50,
        unitSystem: 'metric',
      });
      await AsyncStorage.setItem(SWEPT_KEY, String(now));
      const skip = new Set([
        ...(await readDone()),
        ...(await read()).map((item) => item.entryId),
      ]);
      const found: Omit<PendingWatchForm, 'createdAt' | 'nextAttemptAt'>[] = [];
      for (const item of page.items) {
        const activity = activityOf(item.exerciseName);
        if (
          !activity ||
          skip.has(item.id) ||
          item.avgCadence != null ||
          item.entryTime == null ||
          (item.source != null && item.source !== 'Manual') ||
          !((item.distanceMeters ?? 0) >= 100) ||
          !(item.durationMinutes >= 5)
        ) {
          continue;
        }
        const startedAt = localInstant(item.entryDate, item.entryTime);
        if (!Number.isFinite(startedAt)) continue;
        const activeMinutes =
          item.movingDurationMinutes ?? item.durationMinutes;
        found.push({
          entryId: item.id,
          ownerId: activeOwnerId,
          activity,
          startedAt,
          endedAt: startedAt + item.durationMinutes * 60_000,
          activeSeconds: Math.round(activeMinutes * 60),
          distanceMeters: item.distanceMeters ?? 0,
          // A stride is learned only from a distance the person gave.
          taughtDistance: false,
        });
      }
      for (const run of found) {
        // Due at once: it is already old enough for its steps to be in Health.
        await addPending(run, now, 0);
      }
      if (found.length > 0) {
        addLog(
          `[Watch Run] Found ${found.length} recent run(s) without cadence; measuring them from Apple Health`
        );
      }
    } catch (error) {
      addLog(
        `[Watch Run] Could not look for runs without cadence: ${String(error)}`,
        'WARNING'
      );
    }
  });
}
