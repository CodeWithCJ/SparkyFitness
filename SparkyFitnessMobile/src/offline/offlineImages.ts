import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as Network from 'expo-network';
import { addLog } from '../services/LogService';
import { getActiveServerConfig } from '../services/storage';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import type { Exercise } from '../types/exercise';
import type { WorkoutPlanTemplate } from '../types/workoutPlans';
import type { WorkoutPreset } from '../types/workoutPresets';
import { resolveRemoteExerciseImageSource } from '../utils/exerciseImageSource';
import { addDays, getTodayDate } from '../utils/dateUtils';
import { getCacheRow, listCacheRows } from './cacheStore';
import { CACHE_COLLECTIONS } from './collections';
import { getOfflineDb } from './db';
import { clearLocalImageIndex, setLocalImageIndex } from './localImageIndex';
import type { OfflineDb } from './types';

/** Most space pictures may take per server; the person's picks are kept first. */
export const OFFLINE_IMAGE_CAP_BYTES = 300 * 1024 * 1024;
/** Pictures fetched at once. */
const DOWNLOAD_CONCURRENCY = 3;
/** Days of plan whose exercises get pictures, today included. */
const PICTURE_PLAN_DAYS = 7;

export type ImageReason = 'manual' | 'plan' | 'preset';
const REASON_ORDER: ImageReason[] = ['manual', 'plan', 'preset'];

const ROOT_DIRECTORY = 'offline-images';

/** Loads the saved pictures of a server into memory. */
export async function loadOfflineImageIndex(
  serverConfigId: string
): Promise<void> {
  const db = await getOfflineDb();
  const rows = await db.all<{ source_uri: string; file_path: string }>(
    `SELECT source_uri, file_path FROM offline_image WHERE server_config_id = ?`,
    [serverConfigId]
  );
  setLocalImageIndex(
    serverConfigId,
    rows.map((row) => [row.source_uri, row.file_path])
  );
}

/** Exercises whose pictures the person chose to keep. */
export async function listKeptExercises(
  db: OfflineDb,
  serverConfigId: string
): Promise<Set<string>> {
  const rows = await db.all<{ exercise_id: string }>(
    `SELECT exercise_id FROM offline_keep WHERE server_config_id = ?`,
    [serverConfigId]
  );
  return new Set(rows.map((row) => row.exercise_id));
}

/** Adds exercises to, or removes them from, the kept-offline list. */
export async function setExercisesKeptOffline(
  serverConfigId: string,
  exerciseIds: readonly string[],
  keep: boolean
): Promise<void> {
  const db = await getOfflineDb();
  await db.transaction(async (tx) => {
    for (const exerciseId of exerciseIds) {
      if (keep) {
        await tx.run(
          `INSERT OR IGNORE INTO offline_keep (server_config_id, exercise_id, created_at)
           VALUES (?, ?, ?)`,
          [serverConfigId, exerciseId, Date.now()]
        );
      } else {
        await tx.run(
          `DELETE FROM offline_keep WHERE server_config_id = ? AND exercise_id = ?`,
          [serverConfigId, exerciseId]
        );
      }
    }
  });
}

/** Which exercises want pictures, and why; the strongest reason wins. */
export async function wantedExercises(
  db: OfflineDb,
  serverConfigId: string,
  today: string = getTodayDate()
): Promise<Map<string, ImageReason>> {
  const wanted = new Map<string, ImageReason>();
  const want = (exerciseId: string | null | undefined, reason: ImageReason) => {
    if (!exerciseId) return;
    const current = wanted.get(exerciseId);
    if (
      current == null ||
      REASON_ORDER.indexOf(reason) < REASON_ORDER.indexOf(current)
    ) {
      wanted.set(exerciseId, reason);
    }
  };

  for (const id of await listKeptExercises(db, serverConfigId)) {
    want(id, 'manual');
  }

  const presets = new Map<string, WorkoutPreset>();
  for (const row of await listCacheRows(
    db,
    serverConfigId,
    CACHE_COLLECTIONS.workoutPreset
  )) {
    const preset = row.payload as WorkoutPreset;
    presets.set(String(preset.id), preset);
    for (const exercise of preset.exercises ?? []) {
      want(exercise.exercise_id, 'preset');
    }
  }

  for (let offset = 0; offset < PICTURE_PLAN_DAYS; offset += 1) {
    const day = await getCacheRow(
      db,
      serverConfigId,
      CACHE_COLLECTIONS.planDay,
      addDays(today, offset)
    );
    for (const plan of (day?.payload as WorkoutPlanTemplate[] | undefined) ??
      []) {
      for (const assignment of plan.assignments ?? []) {
        want(assignment.exercise_id, 'plan');
        const preset =
          assignment.workout_preset_id != null
            ? presets.get(String(assignment.workout_preset_id))
            : undefined;
        for (const exercise of preset?.exercises ?? []) {
          want(exercise.exercise_id, 'plan');
        }
      }
    }
  }
  return wanted;
}

async function onUnmeteredNetwork(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    return (
      state.type === Network.NetworkStateType.WIFI ||
      state.type === Network.NetworkStateType.ETHERNET
    );
  } catch {
    return false;
  }
}

function deleteFile(fileUri: string): void {
  try {
    const file = new File(fileUri);
    if (file.exists) file.delete();
  } catch {
    // Already gone.
  }
}

async function usedBytes(
  db: OfflineDb,
  serverConfigId: string
): Promise<number> {
  const row = await db.first<{ total: number | null }>(
    `SELECT SUM(bytes) AS total FROM offline_image WHERE server_config_id = ?`,
    [serverConfigId]
  );
  return row?.total ?? 0;
}

/** How much space saved pictures take for a server. */
export async function offlineImageBytes(
  serverConfigId: string
): Promise<number> {
  return usedBytes(await getOfflineDb(), serverConfigId);
}

let running: Promise<void> | null = null;

/**
 * Downloads the pictures of the exercises a workout may need offline: the
 * ones the person picked, this week's plan, then saved workouts, in that
 * order, until the space cap. Pictures no longer wanted are removed (the
 * person's picks only when they unpick them). Only on Wi-Fi unless the
 * person allowed mobile data. Never throws.
 */
export function refreshOfflineImages(): Promise<void> {
  running ??= refreshOnce()
    .catch((error: unknown) => {
      addLog(`[Offline] Picture refresh stopped: ${error}`, 'WARNING');
    })
    .finally(() => {
      running = null;
    });
  return running;
}

async function refreshOnce(): Promise<void> {
  const config = await getActiveServerConfig();
  if (!config) return;
  const db = await getOfflineDb();
  const wanted = await wantedExercises(db, config.id);

  // Drop what is no longer wanted first, so the space goes to what is.
  const stored = await db.all<{
    source_uri: string;
    file_path: string;
    exercise_id: string | null;
  }>(
    `SELECT source_uri, file_path, exercise_id FROM offline_image WHERE server_config_id = ?`,
    [config.id]
  );
  for (const row of stored) {
    if (row.exercise_id != null && wanted.has(row.exercise_id)) continue;
    deleteFile(row.file_path);
    await db.run(
      `DELETE FROM offline_image WHERE server_config_id = ? AND source_uri = ?`,
      [config.id, row.source_uri]
    );
  }

  const allowMobileData =
    useAppPreferencesStore.getState().offlinePicturesOnMobileData;
  if (!allowMobileData && !(await onUnmeteredNetwork())) {
    await loadOfflineImageIndex(config.id);
    return;
  }

  const directory = new Directory(Paths.cache, ROOT_DIRECTORY, config.id);
  if (!directory.exists) directory.create({ intermediates: true });

  const queue: { exerciseId: string; reason: ImageReason; path: string }[] = [];
  const ordered = [...wanted.entries()].sort(
    ([, a], [, b]) => REASON_ORDER.indexOf(a) - REASON_ORDER.indexOf(b)
  );
  for (const [exerciseId, reason] of ordered) {
    const row = await getCacheRow(
      db,
      config.id,
      CACHE_COLLECTIONS.exercise,
      exerciseId
    );
    for (const path of (row?.payload as Exercise | undefined)?.images ?? []) {
      queue.push({ exerciseId, reason, path });
    }
  }

  let used = await usedBytes(db, config.id);
  const have = new Set(
    (
      await db.all<{ source_uri: string; file_path: string }>(
        `SELECT source_uri, file_path FROM offline_image WHERE server_config_id = ?`,
        [config.id]
      )
    )
      .filter((row) => new File(row.file_path).exists)
      .map((row) => row.source_uri)
  );

  const work = queue.filter((item) => {
    const source = resolveRemoteExerciseImageSource(item.path, config);
    return source != null && !have.has(source.uri);
  });

  for (let start = 0; start < work.length; start += DOWNLOAD_CONCURRENCY) {
    if (used >= OFFLINE_IMAGE_CAP_BYTES) break;
    const batch = work.slice(start, start + DOWNLOAD_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (item) => {
        const source = resolveRemoteExerciseImageSource(item.path, config)!;
        const hash = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          source.uri
        );
        const extension =
          /\.(png|jpe?g|gif|webp)(?:\?|$)/i.exec(source.uri)?.[1] ?? 'img';
        try {
          const file = await File.downloadFileAsync(
            source.uri,
            new File(directory, `${hash}.${extension.toLowerCase()}`),
            { headers: source.headers, idempotent: true }
          );
          return { item, source, file };
        } catch (error) {
          addLog(`[Offline] Picture not saved: ${error}`, 'DEBUG');
          return null;
        }
      })
    );
    for (const result of results) {
      if (result == null) continue;
      const bytes = result.file.size ?? 0;
      used += bytes;
      await db.run(
        `INSERT OR REPLACE INTO offline_image
           (server_config_id, source_uri, file_path, bytes, reason, exercise_id, last_used_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          config.id,
          result.source.uri,
          result.file.uri,
          bytes,
          result.item.reason,
          result.item.exerciseId,
          Date.now(),
        ]
      );
    }
  }
  await loadOfflineImageIndex(config.id);
}

/** Removes every saved picture of a server, files included. */
export async function clearOfflineImages(
  serverConfigId: string
): Promise<void> {
  const db = await getOfflineDb();
  const rows = await db.all<{ file_path: string }>(
    `SELECT file_path FROM offline_image WHERE server_config_id = ?`,
    [serverConfigId]
  );
  rows.forEach((row) => deleteFile(row.file_path));
  await db.run(`DELETE FROM offline_image WHERE server_config_id = ?`, [
    serverConfigId,
  ]);
  clearLocalImageIndex(serverConfigId);
}

/** Removes every saved picture on this phone, for every server. */
export async function clearAllOfflineImages(): Promise<void> {
  const db = await getOfflineDb();
  const rows = await db.all<{ server_config_id: string }>(
    `SELECT DISTINCT server_config_id FROM offline_image`
  );
  for (const row of rows) await clearOfflineImages(row.server_config_id);
}
