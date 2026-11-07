import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import {
  addNotificationResponseListener,
  dismissDeliveredNotification,
  ensureMedicationReminderChannel,
  MEDICATION_REMINDER_CATEGORY,
  MEDICATION_REMINDER_CHANNEL_ID,
  MEDICATION_REMINDER_GROUP_CATEGORY,
  MEDICATION_TAKEN_ACTION,
  MEDICATION_SKIP_ACTION,
  MEDICATION_SNOOZE_ACTION,
} from './notifications';
import {
  createEntry,
  listEntries,
  listMedications,
} from './api/medicationsApi';
import { queryClient } from '../hooks/queryClient';
import { invalidateMedicationEntryCaches } from '../hooks/invalidateMedicationEntryCaches';
import { addLog, _flushBuffer } from '../services/LogService';
import type { MedicationEntry, MedicationEntryStatus } from '@workspace/shared';
import { addDays } from '../utils/dateUtils';
import { isDoseLogged } from '../utils/medications';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import i18n, {
  getDeviceLanguage,
  initializeI18n,
  normalizeLanguage,
} from '../localization/i18n';

export const MEDICATION_NOTIFICATION_TASK_NAME =
  'MEDICATION_NOTIFICATION_ACTION_TASK';
export const PENDING_MEDICATION_NOTIFICATION_ACTIONS_KEY =
  'pending_medication_notification_actions';
const SNOOZED_MEDICATION_REMINDERS_KEY = 'snoozed_medication_reminders';

interface SnoozedMedicationReminderRecord {
  baseKey: string;
  entryDate: string;
  doses?: { medicationId: string; scheduleId: string | null }[];
}

export interface PendingMedicationNotificationAction {
  key: string | null;
  notificationId: string;
  status: MedicationEntryStatus;
  doses: { medicationId: string; scheduleId: string | null }[];
  entryDate: string;
  userId?: string | null;
  takenAt?: string;
}

let initialized = false;
const inFlightActions = new Map<string, Promise<boolean>>();
let pendingActionsQueue: Promise<unknown> = Promise.resolve();

function withPendingActionsLock<T>(work: () => Promise<T>): Promise<T> {
  const next = pendingActionsQueue.then(work, work);
  pendingActionsQueue = next.catch(() => undefined);
  return next;
}

export function extractNotificationData(
  content: Notifications.NotificationContent | undefined
): Record<string, string | undefined> | undefined {
  if (!content) return undefined;
  if (
    content.data &&
    typeof content.data === 'object' &&
    Object.keys(content.data).length > 0
  ) {
    return content.data as Record<string, string | undefined>;
  }
  const rawContent = content as Notifications.NotificationContent & {
    dataString?: string;
  };
  const jsonSource =
    typeof content.data === 'string'
      ? content.data
      : typeof rawContent.dataString === 'string'
        ? rawContent.dataString
        : undefined;
  if (jsonSource) {
    try {
      const parsed = JSON.parse(jsonSource);
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, string | undefined>;
      }
    } catch {
      // ignore malformed JSON
    }
  }
  if (content.data && typeof content.data === 'object') {
    return content.data as Record<string, string | undefined>;
  }
  return undefined;
}

function parseDosesFromData(
  data: Record<string, string | undefined> | undefined
): { medicationId: string; scheduleId: string | null }[] {
  if (!data) return [];
  if (data.doses) {
    try {
      const parsed =
        typeof data.doses === 'string' ? JSON.parse(data.doses) : data.doses;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map(
          (d: { medicationId: string; scheduleId?: string | null }) => ({
            medicationId: d.medicationId,
            scheduleId: d.scheduleId ?? null,
          })
        );
      }
    } catch {
      // fallback below
    }
  }
  if (data.medicationId) {
    return [
      {
        medicationId: data.medicationId,
        scheduleId: data.scheduleId ?? null,
      },
    ];
  }
  return [];
}

function doesNotificationMatchAction(
  content: Notifications.NotificationContent | undefined,
  key: string | null,
  doses: { medicationId: string; scheduleId: string | null }[],
  entryDate: string
): boolean {
  const notifData = extractNotificationData(content);
  if (!notifData) return false;

  const notifBaseKey = notifData.baseKey ?? notifData.key ?? null;
  if (
    key &&
    (notifBaseKey === key ||
      notifData.key === key ||
      (typeof notifData.key === 'string' &&
        notifData.key.startsWith(`${key}_`)))
  ) {
    return true;
  }

  if (notifData.entryDate && notifData.entryDate !== entryDate) {
    return false;
  }

  const notifDoses = parseDosesFromData(notifData);
  if (notifDoses.length === 0 || doses.length === 0) return false;

  // Dismiss/cancel another notification if every dose it represents is covered
  // by the doses just logged/skipped in this action.
  return notifDoses.every((nd) =>
    doses.some(
      (d) =>
        d.medicationId === nd.medicationId &&
        (d.scheduleId ?? null) === (nd.scheduleId ?? null)
    )
  );
}

function actionDedupeId(action: {
  key: string | null;
  entryDate: string;
  doses: { medicationId: string; scheduleId: string | null }[];
  userId?: string | null;
}): string {
  const prefix = action.userId ? `${action.userId}_` : '';
  if (action.key) return `${prefix}${action.key}`;
  const doseIds = action.doses
    .map((d) => `${d.medicationId}:${d.scheduleId ?? ''}`)
    .sort()
    .join(',');
  return `${prefix}${action.entryDate}_${doseIds}`;
}

async function readPendingActions(): Promise<
  PendingMedicationNotificationAction[]
> {
  try {
    const raw = await AsyncStorage.getItem(
      PENDING_MEDICATION_NOTIFICATION_ACTIONS_KEY
    );
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? (parsed as PendingMedicationNotificationAction[])
      : [];
  } catch {
    return [];
  }
}

async function writePendingActions(
  actions: PendingMedicationNotificationAction[]
): Promise<void> {
  try {
    if (actions.length === 0) {
      await AsyncStorage.removeItem(
        PENDING_MEDICATION_NOTIFICATION_ACTIONS_KEY
      );
    } else {
      await AsyncStorage.setItem(
        PENDING_MEDICATION_NOTIFICATION_ACTIONS_KEY,
        JSON.stringify(actions)
      );
    }
  } catch {
    // ignore storage errors
  }
}

async function enqueuePendingAction(
  record: PendingMedicationNotificationAction
): Promise<void> {
  await withPendingActionsLock(async () => {
    const existing = await readPendingActions();
    const id = actionDedupeId(record);
    const filtered = existing.filter((item) => actionDedupeId(item) !== id);
    filtered.push(record);
    await writePendingActions(filtered);
  });
}

async function removePendingAction(record: {
  key: string | null;
  entryDate: string;
  doses: { medicationId: string; scheduleId: string | null }[];
  userId?: string | null;
}): Promise<void> {
  await withPendingActionsLock(async () => {
    const existing = await readPendingActions();
    if (existing.length === 0) return;
    const id = actionDedupeId(record);
    const filtered = existing.filter((item) => actionDedupeId(item) !== id);
    if (filtered.length !== existing.length) {
      await writePendingActions(filtered);
    }
  });
}

async function readSnoozedReminders(): Promise<
  SnoozedMedicationReminderRecord[]
> {
  try {
    const raw = await AsyncStorage.getItem(SNOOZED_MEDICATION_REMINDERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? (parsed as SnoozedMedicationReminderRecord[])
      : [];
  } catch {
    return [];
  }
}

async function writeSnoozedReminders(
  records: SnoozedMedicationReminderRecord[]
): Promise<void> {
  try {
    if (records.length === 0) {
      await AsyncStorage.removeItem(SNOOZED_MEDICATION_REMINDERS_KEY);
    } else {
      await AsyncStorage.setItem(
        SNOOZED_MEDICATION_REMINDERS_KEY,
        JSON.stringify(records)
      );
    }
  } catch {
    // ignore storage errors
  }
}

async function recordSnoozedReminder(
  baseKey: string,
  entryDate: string,
  doses: { medicationId: string; scheduleId: string | null }[]
): Promise<void> {
  await withPendingActionsLock(async () => {
    const existing = await readSnoozedReminders();
    const filtered = existing.filter((item) => item.baseKey !== baseKey);
    filtered.push({ baseKey, entryDate, doses });
    await writeSnoozedReminders(filtered);
  });
}

async function removeSnoozedReminder(baseKey: string | null): Promise<void> {
  if (!baseKey) return;
  await withPendingActionsLock(async () => {
    const existing = await readSnoozedReminders();
    if (existing.length === 0) return;
    const filtered = existing.filter((item) => item.baseKey !== baseKey);
    if (filtered.length !== existing.length) {
      await writeSnoozedReminders(filtered);
    }
  });
}

/**
 * Returns the set of snoozed `baseKey`s that remain active while pruning stale
 * or logged entries from storage. A snooze is retained while its `baseKey` is
 * in `desiredKeys` or while at least one represented dose has no terminal
 * `taken` or `skipped` entry for its stored `entryDate` (such as a cross-day
 * snooze or a same-day grouped snooze after one of its doses is logged).
 * Records whose doses all belong to medications other than the active account's
 * are never retained: a snooze record carries no user identity, so the
 * medication ids it references are the only proof of ownership.
 */
export async function syncSnoozedMedicationReminders(
  today: string,
  desiredKeys: Set<string>,
  activeSnoozeNotifications: Notifications.NotificationContent[] = [],
  ownedMedicationIds?: Set<string>,
  todayEntries?: MedicationEntry[]
): Promise<Set<string>> {
  return withPendingActionsLock(async () => {
    const existing = await readSnoozedReminders();
    const candidates = new Map<
      string,
      {
        baseKey: string;
        entryDate: string;
        doses: { medicationId: string; scheduleId: string | null }[];
      }
    >();

    for (const item of existing) {
      candidates.set(item.baseKey, {
        baseKey: item.baseKey,
        entryDate: item.entryDate,
        doses: Array.isArray(item.doses) ? item.doses : [],
      });
    }

    const activeSnoozeBaseKeys = new Set<string>();
    for (const content of activeSnoozeNotifications) {
      const data = extractNotificationData(content);
      if (!data || data.isSnoozed !== 'true') continue;
      const baseKey = data.baseKey ?? data.key;
      if (!baseKey) continue;
      activeSnoozeBaseKeys.add(baseKey);
      const entryDate = data.entryDate || today;
      const notifDoses = parseDosesFromData(data);
      const current = candidates.get(baseKey);
      if (current) {
        if (current.doses.length === 0 && notifDoses.length > 0) {
          current.doses = notifDoses;
        }
      } else {
        candidates.set(baseKey, {
          baseKey,
          entryDate,
          doses: notifDoses,
        });
      }
    }

    if (candidates.size === 0) return new Set<string>();

    const entriesByDate = new Map<string, Promise<MedicationEntry[] | null>>();
    const getEntriesForDate = (
      entryDate: string
    ): Promise<MedicationEntry[] | null> => {
      if (entryDate === today && todayEntries !== undefined) {
        return Promise.resolve(todayEntries);
      }
      let pending = entriesByDate.get(entryDate);
      if (!pending) {
        pending = listEntries({ fromDate: entryDate, toDate: entryDate }).catch(
          () => null
        );
        entriesByDate.set(entryDate, pending);
      }
      return pending;
    };

    const retainedBaseKeys = new Set<string>();
    for (const candidate of candidates.values()) {
      // A snooze left behind by an account that is no longer active must not
      // keep its reminder alive: the stored copy still carries that account's
      // medication names, and nothing else in reconcile cancels it.
      if (
        ownedMedicationIds &&
        !candidate.doses.some((d) => ownedMedicationIds.has(d.medicationId))
      ) {
        continue;
      }

      if (candidate.entryDate === today) {
        if (desiredKeys.has(candidate.baseKey)) {
          retainedBaseKeys.add(candidate.baseKey);
          continue;
        }
        if (!candidate.baseKey.startsWith('med_group_')) {
          continue;
        }
      }

      if (candidate.doses.length === 0) {
        continue;
      }

      if (
        candidate.entryDate < addDays(today, -1) &&
        !activeSnoozeBaseKeys.has(candidate.baseKey)
      ) {
        continue;
      }

      const entriesForDate = await getEntriesForDate(candidate.entryDate);
      const hasUnloggedDose =
        entriesForDate === null ||
        candidate.doses.some(
          (d) =>
            (!ownedMedicationIds || ownedMedicationIds.has(d.medicationId)) &&
            !isDoseLogged(entriesForDate, d.medicationId, d.scheduleId)
        );
      if (hasUnloggedDose) {
        retainedBaseKeys.add(candidate.baseKey);
      }
    }

    const retainedStorage = existing.filter((item) =>
      retainedBaseKeys.has(item.baseKey)
    );
    if (retainedStorage.length !== existing.length) {
      await writeSnoozedReminders(retainedStorage);
    }
    return retainedBaseKeys;
  });
}

export async function flushPendingMedicationNotificationActions(): Promise<boolean> {
  const pending = await readPendingActions();
  if (pending.length === 0) return false;

  // Resolve the medications (and owning user_id) for the currently signed-in
  // account. Queued records belonging to another account must be retained in
  // storage so they can be replayed when that account is active again, while
  // never writing another account's doses into the current account.
  let ownedMedicationIds: Set<string>;
  let activeUserIds: Set<string>;
  try {
    const medications = await listMedications();
    ownedMedicationIds = new Set(medications.map((m) => m.id));
    activeUserIds = new Set(
      medications
        .map((m) => m.user_id)
        .filter((id): id is string => Boolean(id))
    );
  } catch {
    // Ownership cannot be verified right now; keep the queue for a later run
    // rather than writing it into an account we cannot vouch for.
    return false;
  }

  const resolvedIds = new Set<string>();
  let anySucceeded = false;

  for (const record of pending) {
    const dedupeKey = actionDedupeId(record);
    const existingPromise = inFlightActions.get(dedupeKey);
    if (existingPromise) {
      await existingPromise;
      continue;
    }

    const replayPromise = (async (): Promise<boolean> => {
      try {
        if (
          record.userId &&
          activeUserIds.size > 0 &&
          !activeUserIds.has(record.userId)
        ) {
          // Record belongs to a different account; retain it for replay later.
          return false;
        }

        const ownedDoses = record.doses.filter((d) =>
          ownedMedicationIds.has(d.medicationId)
        );
        if (ownedDoses.length === 0) {
          // Only drop the record if we can confirm its owning user is currently
          // active (meaning the medication was deleted by its owner). Otherwise
          // retain it so the owning account can replay it after switching back.
          if (record.userId && activeUserIds.has(record.userId)) {
            resolvedIds.add(dedupeKey);
            return true;
          }
          return false;
        }

        const existing = await listEntries({
          fromDate: record.entryDate,
          toDate: record.entryDate,
          ...(ownedDoses.length === 1
            ? { medicationId: ownedDoses[0].medicationId }
            : {}),
        });

        const unlogged = ownedDoses.filter(
          (d) => !isDoseLogged(existing, d.medicationId, d.scheduleId)
        );

        if (unlogged.length > 0) {
          const takenAt =
            record.status === 'taken'
              ? (record.takenAt ?? new Date().toISOString())
              : undefined;
          await Promise.all(
            unlogged.map((d) =>
              createEntry({
                medication_id: d.medicationId,
                schedule_id: d.scheduleId,
                status: record.status,
                entry_date: record.entryDate,
                taken_at: takenAt,
              })
            )
          );
        }

        await removeSnoozedReminder(record.key);
        await clearMatchingReminders(
          record.notificationId,
          record.key,
          ownedDoses,
          record.entryDate
        );
        resolvedIds.add(dedupeKey);
        anySucceeded = true;
        return true;
      } catch {
        return false;
      }
    })().finally(() => {
      inFlightActions.delete(dedupeKey);
    });

    inFlightActions.set(dedupeKey, replayPromise);
    await replayPromise;
  }

  if (resolvedIds.size > 0) {
    await withPendingActionsLock(async () => {
      const latest = await readPendingActions();
      await writePendingActions(
        latest.filter((item) => !resolvedIds.has(actionDedupeId(item)))
      );
    });
  }
  if (anySucceeded) {
    invalidateMedicationEntryCaches(queryClient);
  }
  return anySucceeded;
}

/**
 * Handle Taken, Skip or Snooze, sharing concurrent work for the same dose.
 * Clear only the matching saved response after success; ignore unrelated actions.
 * @returns True for successful or unrelated responses, false for invalid data or failed actions.
 */
export async function processMedicationNotificationResponse(
  response: Notifications.NotificationResponse
): Promise<boolean> {
  const actionId = response.actionIdentifier;

  const isSnooze = actionId === MEDICATION_SNOOZE_ACTION;
  let status: MedicationEntryStatus | null = null;
  if (actionId === MEDICATION_TAKEN_ACTION) {
    status = 'taken';
  } else if (actionId === MEDICATION_SKIP_ACTION) {
    status = 'skipped';
  }

  if (!status && !isSnooze) return true;

  const content = response.notification?.request?.content;
  const data = extractNotificationData(content);
  const medicationId = data?.medicationId;
  const entryDate = data?.entryDate;

  if ((!medicationId && !data?.doses) || !entryDate) {
    addLog(
      '[MedicationNotificationAction] Missing required data in notification',
      'WARNING'
    );
    return false;
  }

  const doses = parseDosesFromData(data);
  if (doses.length === 0) return false;

  const notificationId = response.notification.request.identifier;
  const baseKey = data?.baseKey ?? data?.key ?? null;
  const userId = data?.userId ?? null;
  const dedupeKey = isSnooze
    ? `snooze_${actionDedupeId({ key: baseKey, entryDate, doses, userId })}`
    : actionDedupeId({ key: baseKey, entryDate, doses, userId });

  const existingPromise = inFlightActions.get(dedupeKey);
  const actionPromise =
    existingPromise ??
    (isSnooze
      ? handleSnoozeNotificationAction(
          content,
          data,
          doses,
          entryDate,
          notificationId,
          baseKey
        )
      : handleNotificationAction(
          status!,
          doses,
          entryDate,
          notificationId,
          baseKey,
          userId
        )
    ).finally(() => {
      inFlightActions.delete(dedupeKey);
    });

  if (!existingPromise) inFlightActions.set(dedupeKey, actionPromise);
  const succeeded = await actionPromise;
  const last = succeeded ? Notifications.getLastNotificationResponse() : null;
  // Consume only this successful action; another feature may have a newer response.
  if (
    last?.actionIdentifier === actionId &&
    last.notification.request.identifier === notificationId &&
    last.notification.date === response.notification.date
  ) {
    Notifications.clearLastNotificationResponse();
  }
  return succeeded;
}

async function handleSnoozeNotificationAction(
  content: Notifications.NotificationContent | undefined,
  data: Record<string, string | undefined> | undefined,
  doses: { medicationId: string; scheduleId: string | null }[],
  entryDate: string,
  notificationId: string,
  key: string | null
): Promise<boolean> {
  try {
    if (!useAppPreferencesStore.persist?.hasHydrated?.()) {
      await useAppPreferencesStore.persist?.rehydrate?.();
    }
  } catch {
    // Fall back to in-memory default if storage rehydration fails in headless mode.
  }

  try {
    if (!i18n.isInitialized) {
      const prefsLang = useAppPreferencesStore.getState()?.languagePreference;
      const targetLang = normalizeLanguage(
        data?.locale ??
          (prefsLang && prefsLang !== 'system'
            ? prefsLang
            : getDeviceLanguage())
      );
      await initializeI18n(targetLang);
    }
  } catch {
    // Fall back to default English strings if i18n init fails in headless mode.
  }

  try {
    await ensureMedicationReminderChannel();

    const prefsState = useAppPreferencesStore.getState();
    const snoozeMinutes = prefsState?.medicationReminderSnoozeMinutes ?? 30;
    const hideNames = Boolean(prefsState?.medicationReminderHideNames);
    const triggerDate = new Date(Date.now() + snoozeMinutes * 60_000);
    const effectiveBaseKey = key ?? `${entryDate}_${doses[0].medicationId}`;
    const snoozeKey = `${effectiveBaseKey}_snooze_${triggerDate.getTime()}`;
    const isGroup = doses.length > 1 || data?.isGroup === 'true';
    const categoryIdentifier =
      content?.categoryIdentifier ||
      (isGroup
        ? MEDICATION_REMINDER_GROUP_CATEGORY
        : MEDICATION_REMINDER_CATEGORY);

    const cleanData: Record<string, string> = {};
    if (data) {
      for (const [k, v] of Object.entries(data)) {
        if (typeof v === 'string') {
          cleanData[k] = v;
        }
      }
    }
    cleanData.medicationId = doses[0].medicationId;
    if (doses[0].scheduleId) {
      cleanData.scheduleId = doses[0].scheduleId;
    }
    cleanData.entryDate = entryDate;
    cleanData.baseKey = effectiveBaseKey;
    cleanData.key = snoozeKey;
    cleanData.isSnoozed = 'true';
    cleanData.hideNames = String(hideNames);

    const genericBody = isGroup
      ? i18n.t('medications.notificationScheduledDoses', {
          count: doses.length,
          defaultValue: 'You have {{count}} scheduled doses',
          defaultValue_one: 'You have {{count}} scheduled dose',
        }) || `You have ${doses.length} scheduled doses`
      : i18n.t('medications.notificationScheduledDose', {
          defaultValue: 'You have a scheduled dose',
        }) || 'You have a scheduled dose';

    const fallbackTitle =
      i18n.t('medications.notificationTitle', {
        defaultValue: 'Medication reminder',
      }) || 'Medication reminder';

    // Schedule the replacement reminder before dismissing the active notification
    // or cancelling pending repeats so a scheduling error never drops the alert.
    const scheduledId = await Notifications.scheduleNotificationAsync({
      content: {
        title: content?.title || fallbackTitle,
        body: hideNames ? genericBody : content?.body || genericBody,
        sound: true,
        categoryIdentifier,
        data: cleanData,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
        channelId: MEDICATION_REMINDER_CHANNEL_ID,
      },
    });

    await recordSnoozedReminder(effectiveBaseKey, entryDate, doses);
    await dismissDeliveredNotification(notificationId);
    await clearMatchingReminders(notificationId, key, doses, entryDate, {
      excludeIdentifier: scheduledId,
      excludeKey: snoozeKey,
    });

    addLog(
      `[MedicationNotificationAction] Snoozed ${doses.length} medication(s) for ${snoozeMinutes}m`,
      'DEBUG'
    );
    return true;
  } catch (error) {
    addLog(
      `[MedicationNotificationAction] Failed to snooze medication: ${(error as Error).message}`,
      'ERROR'
    );
    return false;
  }
}

TaskManager.defineTask<Notifications.NotificationTaskPayload>(
  MEDICATION_NOTIFICATION_TASK_NAME,
  async ({ data, error }) => {
    if (error) {
      addLog(
        `[MedicationNotificationAction] Background task error: ${error.message}`,
        'ERROR'
      );
      await _flushBuffer?.();
      return Notifications.BackgroundNotificationTaskResult.Failed;
    }

    if (data && typeof data === 'object' && 'actionIdentifier' in data) {
      const ok = await processMedicationNotificationResponse(
        data as unknown as Notifications.NotificationResponse
      );
      await _flushBuffer?.();
      return ok
        ? Notifications.BackgroundNotificationTaskResult.NewData
        : Notifications.BackgroundNotificationTaskResult.Failed;
    }

    await _flushBuffer?.();
    return Notifications.BackgroundNotificationTaskResult.NewData;
  }
);

/**
 * Register the task and live listener once, then recover an action received
 * before startup subscribed to notification responses.
 */
export function initMedicationNotificationActions(): void {
  if (initialized) return;
  initialized = true;

  if (typeof Notifications.registerTaskAsync === 'function') {
    void Notifications.registerTaskAsync(
      MEDICATION_NOTIFICATION_TASK_NAME
    ).catch((err: unknown) => {
      addLog(
        `[MedicationNotificationAction] Failed to register background notification task: ${(err as Error).message}`,
        'WARNING'
      );
    });
  }

  addNotificationResponseListener((response) => {
    void processMedicationNotificationResponse(response);
  });

  // Recover cold-launch actions received before the listener was installed.
  const last = Notifications.getLastNotificationResponse();
  if (last) void processMedicationNotificationResponse(last);
}

async function clearMatchingReminders(
  notificationId: string,
  key: string | null,
  doses: { medicationId: string; scheduleId: string | null }[],
  entryDate: string,
  options?: { excludeIdentifier?: string; excludeKey?: string }
): Promise<void> {
  if (typeof Notifications.getPresentedNotificationsAsync === 'function') {
    const presented =
      await Notifications.getPresentedNotificationsAsync().catch(() => []);
    const siblingDelivered = presented.filter(
      (n) =>
        n.request.identifier !== notificationId &&
        doesNotificationMatchAction(n.request.content, key, doses, entryDate)
    );
    await Promise.all(
      siblingDelivered.map((n) =>
        dismissDeliveredNotification(n.request.identifier)
      )
    );
  }

  const allPending =
    await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  const toCancel = allPending.filter((n) => {
    if (
      options?.excludeIdentifier &&
      n.identifier === options.excludeIdentifier
    ) {
      return false;
    }
    if (
      options?.excludeKey &&
      extractNotificationData(n.content)?.key === options.excludeKey
    ) {
      return false;
    }
    return doesNotificationMatchAction(n.content, key, doses, entryDate);
  });
  await Promise.all(
    toCancel.map((n) =>
      Notifications.cancelScheduledNotificationAsync(n.identifier).catch(
        () => {}
      )
    )
  );
}

async function handleNotificationAction(
  status: MedicationEntryStatus,
  doses: { medicationId: string; scheduleId: string | null }[],
  entryDate: string,
  notificationId: string,
  key: string | null,
  userId: string | null = null
): Promise<boolean> {
  const takenAt = status === 'taken' ? new Date().toISOString() : undefined;
  try {
    // Dismiss the tapped notification immediately so Android / Wear OS clears
    // the interacted reminder right away. Sibling delivered and scheduled repeat
    // reminders are cleared only after the entry is confirmed or written.
    await dismissDeliveredNotification(notificationId);

    const existing = await listEntries({
      fromDate: entryDate,
      toDate: entryDate,
      ...(doses.length === 1 ? { medicationId: doses[0].medicationId } : {}),
    });

    const unlogged = doses.filter(
      (d) => !isDoseLogged(existing, d.medicationId, d.scheduleId)
    );

    if (unlogged.length === 0) {
      await removePendingAction({ key, entryDate, doses, userId });
      await removeSnoozedReminder(key);
      await clearMatchingReminders(notificationId, key, doses, entryDate);
      invalidateMedicationEntryCaches(queryClient);
      return true;
    }

    await Promise.all(
      unlogged.map((d) =>
        createEntry({
          medication_id: d.medicationId,
          schedule_id: d.scheduleId,
          status,
          entry_date: entryDate,
          taken_at: takenAt,
        })
      )
    );

    await removePendingAction({ key, entryDate, doses, userId });
    await removeSnoozedReminder(key);
    await clearMatchingReminders(notificationId, key, doses, entryDate);

    // This path writes the entry through the API directly rather than through the
    // mutations, so nothing else marks the caches stale. With an infinite stale time the
    // app can resume onto an already-focused dashboard, skip the focus refetch, and show
    // calories that do not include the dose the user just marked taken from the reminder.
    invalidateMedicationEntryCaches(queryClient);

    addLog(
      `[MedicationNotificationAction] Logged ${unlogged.length} medication(s) as ${status}`,
      'DEBUG'
    );
    return true;
  } catch (error) {
    await enqueuePendingAction({
      key,
      notificationId,
      status,
      doses,
      entryDate,
      userId,
      takenAt,
    });
    addLog(
      `[MedicationNotificationAction] Failed to log medication: ${(error as Error).message}`,
      'ERROR'
    );
    return false;
  }
}
