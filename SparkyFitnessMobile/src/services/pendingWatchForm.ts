import AsyncStorage from '@react-native-async-storage/async-storage';

import { ApiError } from './api/errors';
import { setExerciseEntryForm } from './api/exerciseApi';
import { addLog } from './LogService';
import { measureWatchRunForm } from './stepDistance';
import { learnStride } from './strideCalibration';
import { toLocalDateString } from '../utils/dateUtils';

/**
 * A watch run is filed the moment it reaches the phone, which can be before
 * the watch's steps have reached Apple Health, so its cadence and stride come
 * out empty and stay that way. This keeps those runs and measures them again
 * later, when the steps are there, then puts the result on the entry that was
 * already filed.
 */
const KEY = '@SparkyFitness/pendingWatchForm';
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

/** Keeps a filed run whose cadence and stride could not be measured yet. */
export function rememberPendingWatchForm(
  run: Omit<PendingWatchForm, 'createdAt' | 'nextAttemptAt'>,
  now = Date.now()
): Promise<void> {
  return serial(async () => {
    try {
      const items = await read();
      if (items.some((item) => item.entryId === run.entryId)) return;
      await write([
        ...items,
        { ...run, createdAt: now, nextAttemptAt: now + FORM_RETRY_AFTER_MS },
      ]);
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
      for (const item of items) {
        if (now - item.createdAt > FORM_GIVE_UP_AFTER_MS) {
          addLog(
            `[Watch Run] Gave up measuring cadence and stride for ${item.activity} entry ${item.entryId}: no steps came from Apple Health`
          );
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
        } catch (error) {
          // The entry is gone: nothing to fill in. Anything else, try again.
          if (error instanceof ApiError && error.statusCode === 404) continue;
          addLog(
            `[Watch Run] Could not fill in cadence and stride yet: ${String(error)}`,
            'WARNING'
          );
          kept.push(later);
        }
      }
      await write(kept);
    } catch (error) {
      addLog(
        `[Watch Run] Could not measure remembered runs: ${String(error)}`,
        'WARNING'
      );
    }
    return days;
  });
}
