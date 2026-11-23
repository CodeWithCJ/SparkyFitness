import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cacheCount, cacheStats, getCacheRow } from '../offline/cacheStore';
import { CACHE_COLLECTIONS, PACK_COMPLETED_KEY } from '../offline/collections';
import { getOfflineDb } from '../offline/db';
import { subscribeOutboxChanged } from '../offline/events';
import { listKeptExercises, offlineImageBytes } from '../offline/offlineImages';
import { listUnconfirmedOutbox } from '../offline/outbox';
import { uploadsToShow } from '../offline/workoutHandOver';
import { signedInUserId } from '../offline/syncEngine';
import type { OutboxRow } from '../offline/types';
import { getActiveServerConfigId } from '../services/storage';
import { offlineStatusQueryKey } from './queryKeys';

export interface OfflineStatus {
  /** Uploads the active server has not confirmed, oldest first. */
  waiting: OutboxRow[];
  /** Documents kept for offline use on this phone, and their size. */
  cachedDocuments: number;
  cachedBytes: number;
  /** When the data kept for offline use was last fully refreshed, or null. */
  lastRefreshedAt: number | null;
  /** Space taken by saved exercise pictures. */
  pictureBytes: number;
  /** Exercises the person chose to keep pictures of, by name. */
  keptExercises: { id: string; name: string }[];
  /** Foods, saved meals and days of the Diary kept for offline use. */
  foodsKept: number;
  mealsKept: number;
  foodDaysKept: number;
}

const EMPTY: OfflineStatus = {
  waiting: [],
  cachedDocuments: 0,
  cachedBytes: 0,
  lastRefreshedAt: null,
  pictureBytes: 0,
  keptExercises: [],
  foodsKept: 0,
  mealsKept: 0,
  foodDaysKept: 0,
};

async function readOfflineStatus(): Promise<OfflineStatus> {
  const serverConfigId = await getActiveServerConfigId();
  if (!serverConfigId) return EMPTY;
  const db = await getOfflineDb();
  const [allWaiting, stats, marker, userId] = await Promise.all([
    listUnconfirmedOutbox(db, serverConfigId),
    cacheStats(db, serverConfigId),
    getCacheRow(db, serverConfigId, CACHE_COLLECTIONS.pack, PACK_COMPLETED_KEY),
    signedInUserId(db, serverConfigId),
  ]);
  // Another account's waiting work is never sent under this one, and is not
  // this person's to see or act on.
  const waiting = uploadsToShow(
    allWaiting.filter((row) => row.userId == null || row.userId === userId)
  );
  const keptIds = await listKeptExercises(db, serverConfigId);
  const keptExercises: { id: string; name: string }[] = [];
  for (const id of keptIds) {
    const row = await getCacheRow(
      db,
      serverConfigId,
      CACHE_COLLECTIONS.exercise,
      id
    );
    keptExercises.push({
      id,
      name: (row?.payload as { name?: string } | undefined)?.name ?? id,
    });
  }
  keptExercises.sort((a, b) => a.name.localeCompare(b.name));
  return {
    waiting,
    cachedDocuments: stats.documents,
    cachedBytes: stats.bytes,
    lastRefreshedAt: marker?.fetchedAt ?? null,
    pictureBytes: await offlineImageBytes(serverConfigId),
    keptExercises,
    foodsKept: await cacheCount(db, serverConfigId, CACHE_COLLECTIONS.food),
    mealsKept: await cacheCount(db, serverConfigId, CACHE_COLLECTIONS.meal),
    foodDaysKept: await cacheCount(
      db,
      serverConfigId,
      CACHE_COLLECTIONS.diaryFoodDay
    ),
  };
}

/**
 * What this phone holds for offline use: uploads still waiting and how much
 * is cached. Read from the phone's own file, so it works with no connection,
 * and re-read whenever the upload queue changes.
 */
export function useOfflineStatus() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: offlineStatusQueryKey,
    queryFn: readOfflineStatus,
    // The phone's own file: always worth a fresh read, never a server call.
    staleTime: 0,
    networkMode: 'always',
  });

  useEffect(
    () =>
      subscribeOutboxChanged(() => {
        void queryClient.invalidateQueries({ queryKey: offlineStatusQueryKey });
      }),
    [queryClient]
  );

  return {
    status: query.data ?? EMPTY,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
