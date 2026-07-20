import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  fetchCurrentFast,
  fetchFastingHistory,
  fetchFastingStats,
  startFast,
  endFast,
  updateFast,
  deleteFast,
} from '../services/api/fastingApi';
import {
  cancelScheduledNotification,
  scheduleFastGoalNotification,
} from '../services/notifications';
import { addLog } from '../services/LogService';
import { useRefetchOnFocus } from './useRefetchOnFocus';
import {
  fastingCurrentQueryKey,
  fastingHistoryQueryKey,
  fastingRootQueryKey,
  fastingStatsQueryKey,
} from './queryKeys';
import type { FastingLog } from '../types/fasting';

// Fasting changes can shift the calorie picture, so mutations also nudge the
// dashboard's daily summary. `dailySummaryQueryKey` is `['dailySummary', date]`,
// so a prefix invalidation hits every cached day.
const dailySummaryRootKey = ['dailySummary'] as const;

interface QueryOptions {
  enabled?: boolean;
}

export function useCurrentFast(options?: QueryOptions) {
  const enabled = options?.enabled ?? true;
  const query = useQuery({
    queryKey: fastingCurrentQueryKey,
    queryFn: fetchCurrentFast,
    enabled,
  });
  useRefetchOnFocus(query.refetch, enabled);
  return query;
}

export function useFastingStats(options?: QueryOptions) {
  const enabled = options?.enabled ?? true;
  const query = useQuery({
    queryKey: fastingStatsQueryKey,
    queryFn: fetchFastingStats,
    enabled,
  });
  useRefetchOnFocus(query.refetch, enabled);
  return query;
}

export function useFastingHistory(limit = 1, offset = 0, options?: QueryOptions) {
  const enabled = options?.enabled ?? true;
  const query = useQuery({
    queryKey: fastingHistoryQueryKey(limit, offset),
    queryFn: () => fetchFastingHistory({ limit, offset }),
    enabled,
  });
  useRefetchOnFocus(query.refetch, enabled);
  return query;
}

export function useStartFast() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { startTime: string; targetEndTime: string; fastingType: string }) =>
      startFast(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fastingRootQueryKey });
      queryClient.invalidateQueries({ queryKey: dailySummaryRootKey });
    },
  });
}

export function useEndFast() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { id: string; startTime: string; endTime: string }) => endFast(params),
    onSuccess: () => {
      // Eagerly cancel the goal notification — the reconciler will also catch
      // this once `/current` refetches to null, but eager cancel is snappier.
      void cancelFastGoalNotification();
      queryClient.invalidateQueries({ queryKey: fastingRootQueryKey });
      queryClient.invalidateQueries({ queryKey: dailySummaryRootKey });
    },
  });
}

// Edits/deletes target a specific past (or active) fasting log, distinct from
// the start/end flows above. Both invalidate the same fasting + daily-summary
// roots so the history sheet, card, and detail screen all refresh together.
export function useUpdateFast() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<FastingLog> }) =>
      updateFast(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fastingRootQueryKey });
      queryClient.invalidateQueries({ queryKey: dailySummaryRootKey });
    },
  });
}

export function useDeleteFast() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteFast(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fastingRootQueryKey });
      queryClient.invalidateQueries({ queryKey: dailySummaryRootKey });
    },
  });
}

// ---------------------------------------------------------------------------
// Goal-notification reconciliation
//
// The goal notification is driven by *observed* active-fast state (not just the
// start mutation) so a fast started on the web / another device still notifies.
// Reconciliation must run in exactly ONE mounted place — the always-mounted
// `FastingGoalReconciler` on the Dashboard via `useFastingGoalReconciler` — so
// the card and detail consumers never race to double-schedule. A single record
// (keyed by fast id + target time) is persisted; a module-level lock guards the
// schedule path against concurrent calls.
// ---------------------------------------------------------------------------

const GOAL_NOTIF_STORAGE_KEY = '@Fasting:goalNotificationId';
const schedulingLock = new Set<string>();

interface StoredGoalNotification {
  fastId: string;
  target: string | null;
  notificationId: string;
}

async function readStoredGoalNotification(): Promise<StoredGoalNotification | null> {
  try {
    const raw = await AsyncStorage.getItem(GOAL_NOTIF_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredGoalNotification>;
    if (typeof parsed?.fastId === 'string' && typeof parsed?.notificationId === 'string') {
      return {
        fastId: parsed.fastId,
        // `target` was added later; a missing/invalid value reads as null so an
        // upgraded record is treated as stale and rescheduled, not orphaned.
        target: typeof parsed.target === 'string' ? parsed.target : null,
        notificationId: parsed.notificationId,
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function clearStoredGoalNotification(notificationId: string | null): Promise<void> {
  await cancelScheduledNotification(notificationId);
  try {
    await AsyncStorage.removeItem(GOAL_NOTIF_STORAGE_KEY);
  } catch {
    // best-effort
  }
}

/** Cancels and forgets any scheduled goal notification. */
export async function cancelFastGoalNotification(): Promise<void> {
  const stored = await readStoredGoalNotification();
  if (stored) await clearStoredGoalNotification(stored.notificationId);
}

/**
 * Reconciles the scheduled goal notification against the observed active fast.
 * Idempotent: re-running with the same active fast is a no-op (the persisted
 * record keyed by fast id + target time short-circuits). A changed target
 * reschedules. Never schedules when the target is null or already past (the
 * latter is guarded inside `scheduleFastGoalNotification`).
 */
export async function reconcileFastGoalNotification(
  currentFast: FastingLog | null,
): Promise<void> {
  // Callers fire this with `void`, so a thrown error (from notification
  // scheduling or AsyncStorage) would surface as an unhandled rejection.
  // Contain it here.
  try {
    let stored = await readStoredGoalNotification();

    // No active fast → cancel any scheduled goal notification.
    if (!currentFast || currentFast.status !== 'ACTIVE') {
      if (stored) await clearStoredGoalNotification(stored.notificationId);
      return;
    }

    // A stored notification belonging to a different fast is stale — drop it.
    if (stored && stored.fastId !== currentFast.id) {
      await clearStoredGoalNotification(stored.notificationId);
      stored = null;
    }

    const target = currentFast.target_end_time;

    // Elapsed-only fast (no goal) → never schedule; drop a lingering id if the
    // target was cleared on this same fast.
    if (!target) {
      if (stored) await clearStoredGoalNotification(stored.notificationId);
      return;
    }

    // A stored notification whose target no longer matches the active fast's
    // target (e.g. the goal was edited on web / another device) is stale — drop
    // it so we reschedule for the new target time.
    if (stored && stored.target !== target) {
      await clearStoredGoalNotification(stored.notificationId);
      stored = null;
    }

    // Already scheduled for this exact fast + target → idempotent no-op.
    if (stored && stored.fastId === currentFast.id && stored.target === target) return;

    if (schedulingLock.has(currentFast.id)) return;
    schedulingLock.add(currentFast.id);
    try {
      const notificationId = await scheduleFastGoalNotification(target);
      if (notificationId) {
        await AsyncStorage.setItem(
          GOAL_NOTIF_STORAGE_KEY,
          JSON.stringify({ fastId: currentFast.id, target, notificationId }),
        );
      }
    } finally {
      schedulingLock.delete(currentFast.id);
    }
  } catch (error) {
    addLog(`Failed to reconcile fast goal notification: ${error}`, 'ERROR');
  }
}

/**
 * Single-owner reconciler. Mount this in exactly one always-present place (the
 * dashboard `FastingGoalReconciler`). Reconciles whenever the observed
 * active-fast identity/target/status changes, and again on app resume
 * (refetching so a fast started elsewhere is seen).
 */
export function useFastingGoalReconciler(
  currentFast: FastingLog | null | undefined,
  isLoading: boolean,
  refetch: () => void,
): void {
  useEffect(() => {
    if (isLoading) return;
    void reconcileFastGoalNotification(currentFast ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, currentFast?.id, currentFast?.target_end_time, currentFast?.status]);

  // On resume, refetch so a fast started/edited on another device is seen. The
  // fresh data then flows through the effect above, which reconciles the goal
  // notification — no need to reconcile here against stale pre-refetch data.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      refetch();
    });
    return () => subscription.remove();
  }, [refetch]);
}

/** Test-only helper — clears the module-level scheduling lock. */
export function __resetFastingReconcileStateForTests(): void {
  schedulingLock.clear();
}
