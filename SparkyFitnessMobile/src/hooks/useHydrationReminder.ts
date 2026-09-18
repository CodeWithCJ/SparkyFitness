import { useEffect } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppLocale } from '../localization';
import {
  cancelScheduledNotification,
  scheduleWaterReminderNotifications,
} from '../services/notifications';
import { addLog } from '../services/LogService';
import {
  useAppPreferencesStore,
  type WaterReminderIntervalHours,
} from '../stores/appPreferencesStore';
import { computeReminderSchedule } from '../utils/hydrationReminder';

// Reconciliation runs in exactly one mounted place — the headless
// `HydrationReminderReconciler` on the Dashboard — and persists the scheduled
// chain so an unchanged input never reschedules. Every operation goes through
// one promise queue: a log tap and an app resume can both reconcile at once,
// and two interleaved passes would each schedule a chain.
const WATER_REMINDER_STORAGE_KEY = '@SparkyFitness/waterReminderSchedule';

interface StoredWaterReminderSchedule {
  signature: string;
  notificationIds: string[];
}

export interface WaterReminderReconcileInput {
  today: string;
  lastLoggedAt: Date | null;
  goalMetToday: boolean;
  intervalHours: WaterReminderIntervalHours;
  windowStart: string;
  windowEnd: string;
  language?: string | null;
}

let queue: Promise<void> = Promise.resolve();

function enqueue(task: () => Promise<void>): Promise<void> {
  queue = queue.then(task).catch((error: unknown) => {
    addLog(`Water reminder task failed: ${String(error)}`, 'ERROR');
  });
  return queue;
}

function signatureOf(input: WaterReminderReconcileInput): string {
  return JSON.stringify([
    input.today,
    input.lastLoggedAt?.getTime() ?? null,
    input.goalMetToday,
    input.intervalHours,
    input.windowStart,
    input.windowEnd,
    input.language ?? null,
  ]);
}

async function readStoredSchedule(): Promise<StoredWaterReminderSchedule | null> {
  try {
    const raw = await AsyncStorage.getItem(WATER_REMINDER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredWaterReminderSchedule>;
    if (
      typeof parsed.signature === 'string' &&
      Array.isArray(parsed.notificationIds) &&
      parsed.notificationIds.every((id) => typeof id === 'string')
    ) {
      return {
        signature: parsed.signature,
        notificationIds: parsed.notificationIds,
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function clearStoredSchedule(
  stored: StoredWaterReminderSchedule
): Promise<void> {
  await Promise.all(
    stored.notificationIds.map((id) => cancelScheduledNotification(id))
  );
  await AsyncStorage.removeItem(WATER_REMINDER_STORAGE_KEY);
}

/**
 * Keeps the scheduled reminder chain in step with the observed water state.
 * Idempotent for an unchanged input; any change cancels the old chain first.
 * An empty scheduling result (no permission) is not persisted, so the next
 * reconcile tries again.
 */
export function reconcileWaterReminders(
  input: WaterReminderReconcileInput,
  now: Date = new Date()
): Promise<void> {
  return enqueue(async () => {
    const signature = signatureOf(input);
    const stored = await readStoredSchedule();
    if (stored?.signature === signature) return;
    if (stored) await clearStoredSchedule(stored);

    const times = computeReminderSchedule({
      lastLoggedAt: input.lastLoggedAt,
      now,
      intervalHours: input.intervalHours,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
      goalMetToday: input.goalMetToday,
    });
    const notificationIds = await scheduleWaterReminderNotifications(times);
    if (notificationIds.length === 0) return;

    try {
      await AsyncStorage.setItem(
        WATER_REMINDER_STORAGE_KEY,
        JSON.stringify({ signature, notificationIds })
      );
    } catch (error) {
      // `cancelWaterReminders` can only cancel what was persisted, so a failed
      // write would leave a live chain nothing can reach — including the
      // toggle-off path. Cancel it here and let the queue log the failure.
      await Promise.all(
        notificationIds.map((id) => cancelScheduledNotification(id))
      );
      throw error;
    }
  });
}

/** Cancels and forgets any scheduled reminder chain. */
export function cancelWaterReminders(): Promise<void> {
  return enqueue(async () => {
    const stored = await readStoredSchedule();
    if (stored) await clearStoredSchedule(stored);
  });
}

export interface HydrationReminderReconcilerInput {
  today: string;
  lastLoggedAt: Date | null;
  waterMl: number;
  waterGoalMl: number | null;
  isLoading: boolean;
  refetch: () => void;
}

/**
 * Single-owner reconciler. Mount it once, in an always-present place. The
 * `lastLoggedAt` dependency is its millisecond value so a new Date instance
 * for the same log does not re-run the effect.
 */
export function useHydrationReminderReconciler({
  today,
  lastLoggedAt,
  waterMl,
  waterGoalMl,
  isLoading,
  refetch,
}: HydrationReminderReconcilerInput): void {
  const remindersActive = useAppPreferencesStore(
    (s) => s.notificationsEnabled && s.waterReminderEnabled
  );
  const intervalHours = useAppPreferencesStore(
    (s) => s.waterReminderIntervalHours
  );
  const windowStart = useAppPreferencesStore((s) => s.waterReminderWindowStart);
  const windowEnd = useAppPreferencesStore((s) => s.waterReminderWindowEnd);
  const appLocale = useAppLocale();

  const lastLoggedAtMs = lastLoggedAt?.getTime() ?? null;
  const goalMetToday =
    waterGoalMl !== null && waterGoalMl > 0 && waterMl >= waterGoalMl;

  useEffect(() => {
    if (!remindersActive) {
      void cancelWaterReminders();
      return;
    }
    if (isLoading) return;
    void reconcileWaterReminders({
      today,
      lastLoggedAt: lastLoggedAtMs === null ? null : new Date(lastLoggedAtMs),
      goalMetToday,
      intervalHours,
      windowStart,
      windowEnd,
      language: appLocale,
    });
  }, [
    remindersActive,
    isLoading,
    today,
    lastLoggedAtMs,
    goalMetToday,
    intervalHours,
    windowStart,
    windowEnd,
    appLocale,
  ]);

  // On resume, refetch so a drink logged elsewhere or a day rollover is seen;
  // the fresh data then reconciles through the effect above.
  useEffect(() => {
    if (!remindersActive) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refetch();
    });
    return () => subscription.remove();
  }, [remindersActive, refetch]);
}

/** Test-only helper — drops any queued reconcile work. */
export function __resetWaterReminderStateForTests(): void {
  queue = Promise.resolve();
}
