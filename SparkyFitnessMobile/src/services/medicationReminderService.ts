import * as Notifications from 'expo-notifications';
import i18n from '../localization/i18n';

import { addDays, getDeviceTimezone, getTodayDate } from '../utils/dateUtils';
import {
  getDueDosesForDate,
  isValidTimeZone,
  localDateTimeToUtc,
  todayInZone,
} from '@workspace/shared';
import {
  ensureMedicationReminderChannel,
  hasNotificationPermission,
  MEDICATION_REMINDER_CATEGORY,
  MEDICATION_REMINDER_GROUP_CATEGORY,
  MEDICATION_REMINDER_CHANNEL_ID,
} from './notifications';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import type { MedicationDetail, MedicationEntry } from '@workspace/shared';
import { isDoseLogged } from '../utils/medications';
import { addLog } from './LogService';
import { accountGeneration } from '../offline/accountGeneration';
import { getActiveServerConfig, getActiveServerConfigId } from './storage';
import { belongsToOtherServer } from './notificationServerScope';
import {
  clearSnoozedMedicationReminders,
  removeSnoozedMedicationReminders,
  flushPendingMedicationNotificationActions,
  syncSnoozedMedicationReminders,
} from './medicationNotificationHandler';
import { listEntries } from './api/medicationsApi';

const REPEAT_MINUTES = [10, 20, 30];
// iOS keeps only the 64 soonest pending notifications, so base reminders get a
// bounded lookahead and the repeat pings stay today-only.
const REMINDER_LOOKAHEAD_DAYS = 7;

/** What the caller decided about the reminders before they are reconciled. */
export interface MedicationReminderScope {
  /**
   * False cancels and dismisses every medication reminder (Medications is
   * turned off in Settings → Features, #3487, or the caller has reminders
   * off); true schedules them as the reminder preferences allow. Required so
   * no caller can forget the feature.
   */
  active: boolean;
  /**
   * The saved server the caller read its medications and feature choices
   * from. When given, the pass does nothing if another server is active by
   * the time it runs: what it would schedule or cancel belongs to an account
   * the person switched away from.
   */
  serverId?: string | null;
  /**
   * `accountGeneration()` when the caller started its reads. When given and
   * the account on the phone changed since (another server, or another
   * account on the same one, which keeps the server id), the request is
   * dropped at once: it is not queued and does not replace a reconcile
   * waiting for the account now signed in.
   */
  accountGeneration?: number;
}

interface ReconcileRequest {
  medications: MedicationDetail[];
  entries: MedicationEntry[];
  entriesDate: string;
  active: boolean;
  serverId: string | null | undefined;
  accountGeneration: number | undefined;
}

/**
 * The work waiting for the next pass. Callers add to it rather than replace
 * it, so one kind of work never drops another: the account change cancels
 * everything first, then the reconcile runs (the last caller's, as with its
 * data), then the reminders of other servers are cancelled.
 */
interface QueuedReminderWork {
  cancelAll: boolean;
  reconcile: ReconcileRequest | null;
  cancelOtherServers: boolean;
  promise: Promise<void>;
  resolve: () => void;
  reject: (reason?: unknown) => void;
}

let activeReconcileRunning = false;
let queuedReminderWork: QueuedReminderWork | null = null;

function resolveCurrentTimezoneAndToday(): {
  validTz: string | null;
  tz: string;
  today: string;
} {
  const rawTz = getDeviceTimezone();
  const validTz = rawTz && isValidTimeZone(rawTz) ? rawTz : null;
  const today = validTz ? todayInZone(validTz) : getTodayDate();
  return { validTz, tz: validTz ?? 'UTC', today };
}

function queuedWork(): QueuedReminderWork {
  if (!queuedReminderWork) {
    let resolve!: () => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    queuedReminderWork = {
      cancelAll: false,
      reconcile: null,
      cancelOtherServers: false,
      promise,
      resolve,
      reject,
    };
  }
  return queuedReminderWork;
}

function startQueuedWork(work: QueuedReminderWork): Promise<void> {
  if (!activeReconcileRunning) {
    void drainReconcileQueue();
  }
  return work.promise;
}

function dequeueReminderWork(): QueuedReminderWork | null {
  const next = queuedReminderWork;
  queuedReminderWork = null;
  return next;
}

function medReminderKey(
  medicationId: string,
  scheduleId: string,
  date: string,
  timeOfDay: string
) {
  return `med_${date}_${medicationId}_${scheduleId}_${timeOfDay}`;
}

function medGroupReminderKey(
  date: string,
  timeOfDay: string,
  doses: { medication: { id: string }; schedule: { id: string } }[]
) {
  const ids = doses
    .map((d) => `${d.medication.id}:${d.schedule.id}`)
    .sort()
    .join('_');
  return `med_group_${date}_${timeOfDay}_${ids}`;
}

function repeatMedReminderKey(baseKey: string, offset: number) {
  return `${baseKey}_${offset}`;
}

function scheduledDoseInstant(
  date: string,
  timeOfDay: string,
  tz: string | null
): Date {
  if (tz) {
    return localDateTimeToUtc(`${date}T${timeOfDay}`, tz);
  }
  const [hours, minutes] = timeOfDay.split(':').map(Number);
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

async function cancelReminders(ids: string[]): Promise<void> {
  await Promise.all(
    ids.map(async (id) => {
      try {
        await Notifications.cancelScheduledNotificationAsync(id);
      } catch {
        // already cancelled or invalid
      }
    })
  );
}

async function dismissPresentedReminders(ids: string[]): Promise<void> {
  if (typeof Notifications.dismissNotificationAsync !== 'function') return;
  await Promise.all(
    ids.map(async (id) => {
      try {
        await Notifications.dismissNotificationAsync(id);
      } catch {
        // already dismissed or invalid
      }
    })
  );
}

async function scheduleReminder(
  body: string,
  triggerDate: Date,
  data: Record<string, string>,
  categoryIdentifier: string = MEDICATION_REMINDER_CATEGORY
): Promise<string | null> {
  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: i18n.t('medications.notificationTitle', {
          defaultValue: 'Medication reminder',
        }),
        body,
        sound: true,
        categoryIdentifier,
        data,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
        channelId: MEDICATION_REMINDER_CHANNEL_ID,
      },
    });
  } catch (err) {
    addLog(`scheduleReminder failed: ${(err as Error).message}`, 'ERROR');
    return null;
  }
}

type ReminderData = Record<string, unknown> | null | undefined;

/** Cancels and dismisses the medication reminders `matches` picks, and
 * returns the base keys of the snoozed copies among them. */
async function cancelAndDismissAllMedicationReminders(
  matches: (data: NonNullable<ReminderData>) => boolean = () => true
): Promise<Set<string>> {
  const snoozedBaseKeys = new Set<string>();
  const isMedicationReminder = (data: ReminderData) => {
    if (!data?.medicationId || !matches(data)) return false;
    if (data.isSnoozed === 'true') {
      const baseKey = data.baseKey ?? data.key;
      if (typeof baseKey === 'string') snoozedBaseKeys.add(baseKey);
    }
    return true;
  };
  const all = await Notifications.getAllScheduledNotificationsAsync();
  const medIds = all
    .filter((n) => isMedicationReminder(n.content.data))
    .map((n) => n.identifier);
  if (medIds.length > 0) await cancelReminders(medIds);
  if (typeof Notifications.getPresentedNotificationsAsync === 'function') {
    const presented =
      await Notifications.getPresentedNotificationsAsync().catch(() => []);
    const presentedIds = presented
      .filter((n) => isMedicationReminder(n.request.content.data))
      .map((n) => n.request.identifier);
    if (presentedIds.length > 0) {
      await dismissPresentedReminders(presentedIds);
    }
  }
  return snoozedBaseKeys;
}

/**
 * Cancels and dismisses the reminders made for a server other than the active
 * one, and leaves the active server's alone. For while it is not known yet
 * whether Medications is on for the active account (#3487): its own reminders
 * stay as they are, but those of an account switched away from stop. Reminders
 * without a server stamp (from an older build) count as the active server's.
 *
 * It goes through the reconcile queue, after a pass already under way and
 * after any reconcile waiting with it, which it never drops.
 */
export function cancelMedicationRemindersOfOtherServers(): Promise<void> {
  const work = queuedWork();
  work.cancelOtherServers = true;
  return startQueuedWork(work);
}

/**
 * Cancels and dismisses every medication reminder and forgets the snooze
 * records, for when the account on the phone changes (another account on the
 * same server, another server, or the server deleted): they carry the
 * previous account's medication names, and nothing else would tell them
 * apart while the new account's feature choices are not known yet. The app
 * cannot tell a sign-in back into the same account from another one, so that
 * cancels them too: the account's next reconcile schedules them again, but a
 * snoozed copy and the reminders already shown are gone.
 *
 * A reconcile still waiting was read for the previous account, so it is
 * dropped; one queued after this, for the new account, runs after it. A
 * reconcile read before the change and queued after it is dropped when it
 * says which account generation it read under (`accountGeneration`), as the
 * background task's do.
 */
export function cancelMedicationRemindersForAccountChange(): Promise<void> {
  const work = queuedWork();
  work.cancelAll = true;
  work.reconcile = null;
  return startQueuedWork(work);
}

async function cancelAllRemindersOnce(): Promise<void> {
  await cancelAndDismissAllMedicationReminders();
  if (!(await clearSnoozedMedicationReminders())) {
    addLog(
      'Medication reminders were cancelled but their snooze records could not be cleared; the next full cancel tries again',
      'WARNING'
    );
  }
}

async function cancelRemindersOfOtherServersOnce(): Promise<void> {
  let activeServerId: string | null;
  try {
    // Only the stored id, no keychain read: a failed keychain or keystore read
    // must not make the active server look like none, and so cancel its
    // reminders too.
    activeServerId = await getActiveServerConfigId();
  } catch {
    // Not known which server is active: every reminder stays as it is.
    return;
  }
  const snoozedBaseKeys = await cancelAndDismissAllMedicationReminders((data) =>
    belongsToOtherServer(
      typeof data.serverId === 'string' ? data.serverId : null,
      activeServerId
    )
  );
  // Their snoozed copies are gone; a record left behind would keep the dose
  // silent for the rest of the day once that server is back.
  if (!(await removeSnoozedMedicationReminders(snoozedBaseKeys))) {
    addLog(
      "Another server's snooze records could not be removed; they are tried again on the next pass",
      'WARNING'
    );
  }
}

/**
 * Reconcile medication reminder notifications.
 * Can be called from the foreground or background.
 *
 * Base reminders cover the next REMINDER_LOOKAHEAD_DAYS days so doses still
 * fire on days the app never wakes; repeat pings are today-only.
 *
 * Uses Notifications.getAllScheduledNotificationsAsync() instead of an
 * AsyncStorage ledger — every pending request already carries its content.data.
 *
 * @param medications - Active medications from the API
 * @param entries - Today's medication entries from the API
 * @param scope - Whether reminders may be scheduled at all, and for which
 *   server and account; a queued pass runs with the last caller's, as it
 *   does with its data
 */
export function reconcileMedicationReminders(
  medications: MedicationDetail[],
  entries: MedicationEntry[],
  scope: MedicationReminderScope
): Promise<void> {
  // Read for an account the person has left since: dropped here, before it
  // can take the place of the reconcile waiting for the account signed in.
  if (
    scope.accountGeneration !== undefined &&
    scope.accountGeneration !== accountGeneration()
  ) {
    addLog(
      'Medication reminder pass dropped: it was read for a previous account',
      'DEBUG'
    );
    return Promise.resolve();
  }
  const work = queuedWork();
  work.reconcile = {
    medications,
    entries,
    entriesDate: resolveCurrentTimezoneAndToday().today,
    active: scope.active,
    serverId: scope.serverId,
    accountGeneration: scope.accountGeneration,
  };
  return startQueuedWork(work);
}

interface ReconcileDrainState {
  flushedDuringDrain: boolean;
}

async function drainReconcileQueue(): Promise<void> {
  activeReconcileRunning = true;
  const drainState: ReconcileDrainState = { flushedDuringDrain: false };
  try {
    let work = dequeueReminderWork();
    while (work) {
      // Each part runs even when an earlier one failed; the caller hears of
      // the first failure.
      const failures: unknown[] = [];
      const run = async (part: () => Promise<void>) => {
        try {
          await part();
        } catch (error) {
          failures.push(error);
        }
      };
      const { reconcile } = work;
      if (work.cancelAll) await run(cancelAllRemindersOnce);
      if (reconcile) {
        await run(() =>
          reconcileMedicationRemindersOnce(reconcile, drainState)
        );
      }
      if (work.cancelOtherServers) await run(cancelRemindersOfOtherServersOnce);
      if (failures.length > 0) work.reject(failures[0]);
      else work.resolve();
      work = dequeueReminderWork();
    }
  } finally {
    activeReconcileRunning = false;
  }
}

async function reconcileMedicationRemindersOnce(
  request: ReconcileRequest,
  drainState: ReconcileDrainState
): Promise<void> {
  const { medications, entriesDate, active, serverId } = request;
  let { entries } = request;
  // Each reminder is stamped with the server it was made for, so the iOS
  // native handler logs a button press only against that same server.
  const activeServerId =
    (await getActiveServerConfig().catch(() => null))?.id ?? null;
  const flushedAny = await flushPendingMedicationNotificationActions();
  if (flushedAny) {
    drainState.flushedDuringDrain = true;
  }
  // The presses flushed above are logged whatever happens next. A pass read
  // for an account or a server that is no longer the active one does nothing
  // more: what it would schedule or cancel belongs to an account switched
  // away from.
  if (
    request.accountGeneration !== undefined &&
    request.accountGeneration !== accountGeneration()
  ) {
    addLog(
      'Medication reminder pass skipped: it was read for a previous account',
      'DEBUG'
    );
    return;
  }
  if (serverId !== undefined) {
    const currentServerId = await getActiveServerConfigId().catch(
      () => undefined
    );
    if (currentServerId === undefined || currentServerId !== serverId) {
      addLog(
        'Medication reminder pass skipped: it was read for another server',
        'DEBUG'
      );
      return;
    }
  }
  // With reminders off only the reminders go, and no preference is written.
  const prefs = useAppPreferencesStore.getState();
  if (
    !active ||
    !prefs.medicationRemindersEnabled ||
    !prefs.notificationsEnabled
  ) {
    // The snoozed copies go with them, so their records go too: turned back
    // on the same day, a slot still recorded as snoozed would get no reminder
    // at all.
    await cancelAllRemindersOnce();
    return;
  }

  const granted = await hasNotificationPermission();
  if (!granted) {
    await cancelAndDismissAllMedicationReminders();
    return;
  }

  const { validTz, tz, today } = resolveCurrentTimezoneAndToday();
  const hasMismatchedEntryDate = entries.some(
    (entry) => Boolean(entry.entry_date) && entry.entry_date !== today
  );
  if (
    drainState.flushedDuringDrain ||
    entriesDate !== today ||
    hasMismatchedEntryDate
  ) {
    try {
      entries = await listEntries({
        fromDate: today,
        toDate: today,
      });
    } catch (err) {
      addLog(
        `reconcileMedicationReminders failed to reload entries: ${(err as Error).message}`,
        'WARNING'
      );
      return;
    }
  }

  await ensureMedicationReminderChannel();

  const hideNames = prefs.medicationReminderHideNames;
  const consolidate = prefs.medicationReminderConsolidate;
  const reminderLocale =
    i18n.resolvedLanguage?.split('-')[0] === 'pl' ? 'pl' : 'en';

  const desiredKeys = new Set<string>();
  const expectedFireAtMs = new Map<string, number>();

  type DueDose = ReturnType<
    typeof getDueDosesForDate<MedicationDetail>
  >[number];

  interface ReminderSlot {
    doses: DueDose[];
    timeOfDay: string;
    date: string;
    withRepeats: boolean;
    baseKey: string;
    baseTriggerDate: Date;
  }

  const slotsToSchedule: ReminderSlot[] = [];

  const addSlot = (
    doses: DueDose[],
    date: string,
    timeOfDay: string,
    isToday: boolean,
    baseKey: string
  ) => {
    const baseTriggerDate = scheduledDoseInstant(date, timeOfDay, validTz);
    desiredKeys.add(baseKey);
    expectedFireAtMs.set(baseKey, baseTriggerDate.getTime());

    const withRepeats = isToday && prefs.medicationReminderRepeats;
    if (withRepeats) {
      for (const offset of REPEAT_MINUTES) {
        const repeatKey = repeatMedReminderKey(baseKey, offset);
        desiredKeys.add(repeatKey);
        expectedFireAtMs.set(
          repeatKey,
          baseTriggerDate.getTime() + offset * 60_000
        );
      }
    }

    slotsToSchedule.push({
      doses,
      timeOfDay,
      date,
      withRepeats,
      baseKey,
      baseTriggerDate,
    });
  };

  for (let dayOffset = 0; dayOffset < REMINDER_LOOKAHEAD_DAYS; dayOffset++) {
    const date = addDays(today, dayOffset);
    const isToday = dayOffset === 0;
    const dueDoses = getDueDosesForDate(medications, date, tz);

    const unloggedDoses: DueDose[] = [];
    for (const due of dueDoses) {
      const timeOfDay = due.schedule.time_of_day;
      if (!timeOfDay) continue;

      // Entries only cover today; future doses can't have been logged yet.
      if (
        isToday &&
        isDoseLogged(entries, due.medication.id, due.schedule.id)
      ) {
        continue;
      }

      unloggedDoses.push(due);
    }

    if (unloggedDoses.length === 0) continue;

    if (consolidate) {
      const byTime = new Map<string, DueDose[]>();
      for (const due of unloggedDoses) {
        const time = due.schedule.time_of_day!;
        const group = byTime.get(time) ?? [];
        group.push(due);
        byTime.set(time, group);
      }

      for (const [timeOfDay, doses] of byTime.entries()) {
        const baseKey =
          doses.length === 1
            ? medReminderKey(
                doses[0].medication.id,
                doses[0].schedule.id,
                date,
                timeOfDay
              )
            : medGroupReminderKey(date, timeOfDay, doses);
        addSlot(doses, date, timeOfDay, isToday, baseKey);
      }
    } else {
      for (const due of unloggedDoses) {
        const timeOfDay = due.schedule.time_of_day!;
        const baseKey = medReminderKey(
          due.medication.id,
          due.schedule.id,
          date,
          timeOfDay
        );
        addSlot([due], date, timeOfDay, isToday, baseKey);
      }
    }
  }

  const allPending = await Notifications.getAllScheduledNotificationsAsync();
  const presented = await Notifications.getPresentedNotificationsAsync().catch(
    () => []
  );

  const snoozedContents: Notifications.NotificationContent[] = [
    ...allPending
      .filter(
        (n) =>
          Boolean(n.content.data?.medicationId) &&
          n.content.data?.isSnoozed === 'true'
      )
      .map((n) => n.content),
    ...presented
      .filter((n) => {
        const data = n.request.content.data as
          Record<string, string | undefined> | undefined;
        return Boolean(data?.medicationId) && data?.isSnoozed === 'true';
      })
      .map((n) => n.request.content),
  ];

  const snoozedBaseKeys = await syncSnoozedMedicationReminders(
    today,
    desiredKeys,
    snoozedContents,
    new Set(medications.map((m) => m.id)),
    entries
  );

  // A snoozed reminder is a verbatim copy of the notification the user tapped
  // and its key is not in `desiredKeys`, so the copy-freshness test below never
  // reaches it. Rebuild it at the time the snooze was due to fire when the
  // privacy or language preference changed after the snooze was created.
  const slotBaseKeys = new Set(slotsToSchedule.map((s) => s.baseKey));
  const staleSnoozeFireAt = new Map<string, Date>();
  const staleSnoozeSource = new Map<
    string,
    Record<string, string | undefined>
  >();
  for (const n of allPending) {
    const data = (n.content.data ?? {}) as Record<string, string | undefined>;
    const key = data.key;
    const baseKey = data.baseKey ?? key;
    if (!data.medicationId || data.isSnoozed !== 'true' || !baseKey) continue;
    if (!snoozedBaseKeys.has(baseKey)) continue;
    const copyIsStale =
      (data.hideNames === 'true') !== hideNames ||
      (data.locale ?? 'en') !== reminderLocale;
    if (!copyIsStale) continue;
    const keyMatch =
      typeof key === 'string' ? /_snooze_(\d+)$/.exec(key) : null;
    const trigger = n.trigger as unknown as {
      date?: Date | number;
      value?: number;
      seconds?: number;
    } | null;
    const epochMs = keyMatch
      ? Number(keyMatch[1])
      : typeof trigger?.value === 'number'
        ? trigger.value
        : typeof trigger?.seconds === 'number'
          ? Date.now() + trigger.seconds * 1000
          : trigger?.date instanceof Date
            ? trigger.date.getTime()
            : typeof trigger?.date === 'number'
              ? trigger.date
              : NaN;
    if (Number.isFinite(epochMs) && epochMs > Date.now()) {
      staleSnoozeFireAt.set(baseKey, new Date(epochMs));
      staleSnoozeSource.set(baseKey, data);
    }
  }
  const presentedStaleSnoozes = new Set<string>();
  for (const n of presented) {
    const data = n.request.content.data as
      Record<string, string | undefined> | undefined;
    if (!data?.medicationId || data.isSnoozed !== 'true') continue;
    const baseKey = data.baseKey ?? data.key;
    if (!baseKey || !snoozedBaseKeys.has(baseKey)) continue;
    const copyIsStale =
      (data.hideNames === 'true') !== hideNames ||
      (data.locale ?? 'en') !== reminderLocale;
    if (copyIsStale && !staleSnoozeFireAt.has(baseKey)) {
      staleSnoozeFireAt.set(baseKey, new Date(Date.now() + 1000));
      staleSnoozeSource.set(baseKey, data);
      presentedStaleSnoozes.add(baseKey);
    }
  }

  const toCancel = allPending
    .filter((n) => {
      if (!n.content.data?.medicationId) return false;
      const key = n.content.data.key as string | undefined;
      const baseKey = (n.content.data.baseKey ?? key) as string | undefined;
      if (n.content.data.isSnoozed === 'true') {
        return (
          !baseKey ||
          !snoozedBaseKeys.has(baseKey) ||
          staleSnoozeFireAt.has(baseKey)
        );
      }
      if (baseKey && snoozedBaseKeys.has(baseKey)) return true;
      if (!key || !desiredKeys.has(key)) return true;
      // DATE triggers are anchored to a fixed UTC epoch instant at scheduling
      // time, so travel across timezones (or legacy unstamped reminders) must
      // cancel and reschedule whenever the expected fire instant changes.
      const expectedMs = expectedFireAtMs.get(key);
      if (
        expectedMs !== undefined &&
        n.content.data.scheduledForMs !== String(expectedMs)
      ) {
        return true;
      }
      // Notification copy is language-sensitive as well as privacy-sensitive:
      // changing EN ↔ PL must replace pending notifications created earlier.
      return (
        (n.content.data.hideNames === 'true') !== hideNames ||
        (n.content.data.locale ?? 'en') !== reminderLocale
      );
    })
    .map((n) => n.identifier);
  if (toCancel.length > 0) await cancelReminders(toCancel);

  if (presented.length > 0) {
    const presentedToDismiss = presented
      .filter((n) => {
        const data = n.request.content.data as
          Record<string, string | undefined> | undefined;
        if (!data?.medicationId) return false;
        const key = data.key;
        const baseKey = data.baseKey ?? key;
        if (data.isSnoozed === 'true') {
          return (
            !baseKey ||
            !snoozedBaseKeys.has(baseKey) ||
            staleSnoozeFireAt.has(baseKey)
          );
        }
        const expectedMs = key ? expectedFireAtMs.get(key) : undefined;
        const firedEarlyForCurrentZone =
          expectedMs !== undefined &&
          expectedMs > Date.now() &&
          data.scheduledForMs !== String(expectedMs);
        return (
          ((!key || !desiredKeys.has(key)) &&
            (!baseKey || !desiredKeys.has(baseKey))) ||
          firedEarlyForCurrentZone ||
          (data.hideNames === 'true') !== hideNames ||
          (data.locale ?? 'en') !== reminderLocale
        );
      })
      .map((n) => n.request.identifier);
    if (presentedToDismiss.length > 0) {
      await dismissPresentedReminders(presentedToDismiss);
    }
  }

  const pendingKeys = new Set(
    allPending
      .filter(
        (n) =>
          n.content.data?.medicationId && toCancel.indexOf(n.identifier) === -1
      )
      .map((n) => n.content.data?.key as string)
  );

  for (const {
    doses,
    timeOfDay,
    date,
    withRepeats,
    baseKey,
    baseTriggerDate,
  } of slotsToSchedule) {
    let snoozeFireAt = staleSnoozeFireAt.get(baseKey);
    const isCoveredBySnooze =
      snoozedBaseKeys.has(baseKey) ||
      Array.from(snoozedBaseKeys).some(
        (k) =>
          k.startsWith(`med_group_${date}_${timeOfDay}_`) &&
          doses.every((d) => k.includes(`${d.medication.id}:${d.schedule.id}`))
      );
    if (isCoveredBySnooze && !snoozeFireAt) continue;
    if (snoozeFireAt && presentedStaleSnoozes.has(baseKey)) {
      snoozeFireAt = new Date(Date.now() + 1000);
    }
    const isGroup = doses.length > 1;
    const categoryIdentifier = isGroup
      ? MEDICATION_REMINDER_GROUP_CATEGORY
      : MEDICATION_REMINDER_CATEGORY;

    let body: string;
    if (hideNames) {
      body = isGroup
        ? i18n.t('medications.notificationScheduledDoses', {
            count: doses.length,
            defaultValue: 'You have {{count}} scheduled doses',
            defaultValue_one: 'You have {{count}} scheduled dose',
          })
        : i18n.t('medications.notificationScheduledDose', {
            defaultValue: 'You have a scheduled dose',
          });
    } else if (!isGroup) {
      const due = doses[0];
      const doseSuffix =
        due.medication.dose_amount != null
          ? ` (${due.medication.dose_amount}${due.medication.dose_unit ? ` ${due.medication.dose_unit}` : ''})`
          : '';
      body = i18n.t('medications.notificationScheduledDoseNamed', {
        defaultValue: 'Scheduled dose: {{name}}{{dose}}',
        name: due.medication.name,
        dose: doseSuffix,
      });
    } else {
      const doseNames = doses.map((d) => {
        const doseSuffix =
          d.medication.dose_amount != null
            ? ` (${d.medication.dose_amount}${d.medication.dose_unit ? ` ${d.medication.dose_unit}` : ''})`
            : '';
        return `${d.medication.name}${doseSuffix}`;
      });

      body =
        doseNames.length <= 3
          ? i18n.t('medications.notificationScheduledDosesNamed', {
              defaultValue: 'Scheduled doses: {{names}}',
              names: doseNames.join(', '),
            })
          : i18n.t('medications.notificationScheduledDosesOverflow', {
              count: doseNames.length - 3,
              names: doseNames.slice(0, 3).join(', '),
              defaultValue: 'Scheduled doses: {{names}}, and {{count}} more',
              defaultValue_one:
                'Scheduled doses: {{names}}, and {{count}} more',
            });
    }

    const data: Record<string, string> = {
      medicationId: doses[0].medication.id,
      scheduleId: doses[0].schedule.id,
      ...(doses[0].medication.user_id
        ? { userId: doses[0].medication.user_id }
        : {}),
      ...(activeServerId ? { serverId: activeServerId } : {}),
      entryDate: date,
      key: baseKey,
      baseKey,
      hideNames: String(hideNames),
      locale: reminderLocale,
    };

    if (isGroup) {
      data.doses = JSON.stringify(
        doses.map((d) => ({
          medicationId: d.medication.id,
          scheduleId: d.schedule.id,
        }))
      );
      data.isGroup = 'true';
    }

    if (snoozeFireAt) {
      // Stand-in for the cancelled snooze: keep it flagged as snoozed so the
      // stored snooze record stays consistent, and so the next reconcile
      // leaves it alone.
      data.key = `${baseKey}_snooze_${snoozeFireAt.getTime()}`;
      data.isSnoozed = 'true';
    }

    const triggerDate = snoozeFireAt ?? baseTriggerDate;
    if (!snoozeFireAt) {
      data.scheduledForMs = String(triggerDate.getTime());
    }
    if (!pendingKeys.has(baseKey) && triggerDate.getTime() > Date.now()) {
      await scheduleReminder(body, triggerDate, data, categoryIdentifier);
    }

    // Checked per key, not per dose: enabling repeats mid-day must still add
    // the repeat pings behind an already-pending base reminder.
    if (withRepeats && !snoozeFireAt) {
      for (const offset of REPEAT_MINUTES) {
        const repeatKey = repeatMedReminderKey(baseKey, offset);
        if (pendingKeys.has(repeatKey)) continue;
        const repeatDate = new Date(triggerDate.getTime() + offset * 60000);
        if (repeatDate.getTime() > Date.now()) {
          await scheduleReminder(
            body,
            repeatDate,
            {
              ...data,
              key: repeatKey,
              scheduledForMs: String(repeatDate.getTime()),
            },
            categoryIdentifier
          );
        }
      }
    }
  }

  for (const [baseKey, recordedSnoozeFireAt] of staleSnoozeFireAt.entries()) {
    if (slotBaseKeys.has(baseKey)) continue;
    const sourceData = staleSnoozeSource.get(baseKey);
    const snoozeFireAt = presentedStaleSnoozes.has(baseKey)
      ? new Date(Date.now() + 1000)
      : recordedSnoozeFireAt;
    if (!sourceData || snoozeFireAt.getTime() <= Date.now()) continue;

    let parsedDoses: { medicationId: string; scheduleId?: string | null }[] =
      [];
    if (typeof sourceData.doses === 'string') {
      try {
        const parsed = JSON.parse(sourceData.doses);
        if (Array.isArray(parsed)) parsedDoses = parsed;
      } catch {
        // ignore malformed JSON
      }
    }
    if (parsedDoses.length === 0 && sourceData.medicationId) {
      parsedDoses = [
        {
          medicationId: sourceData.medicationId,
          scheduleId: sourceData.scheduleId ?? null,
        },
      ];
    }

    const isGroup = parsedDoses.length > 1 || sourceData.isGroup === 'true';
    const categoryIdentifier = isGroup
      ? MEDICATION_REMINDER_GROUP_CATEGORY
      : MEDICATION_REMINDER_CATEGORY;

    const medById = new Map(medications.map((m) => [m.id, m]));
    const resolvedMeds = parsedDoses
      .map((d) => medById.get(d.medicationId))
      .filter((m): m is MedicationDetail => Boolean(m));

    let body: string;
    if (hideNames || resolvedMeds.length === 0) {
      const count = Math.max(parsedDoses.length, 1);
      body = isGroup
        ? i18n.t('medications.notificationScheduledDoses', {
            count,
            defaultValue: 'You have {{count}} scheduled doses',
            defaultValue_one: 'You have {{count}} scheduled dose',
          })
        : i18n.t('medications.notificationScheduledDose', {
            defaultValue: 'You have a scheduled dose',
          });
    } else if (!isGroup) {
      const med = resolvedMeds[0];
      const doseSuffix =
        med.dose_amount != null
          ? ` (${med.dose_amount}${med.dose_unit ? ` ${med.dose_unit}` : ''})`
          : '';
      body = i18n.t('medications.notificationScheduledDoseNamed', {
        defaultValue: 'Scheduled dose: {{name}}{{dose}}',
        name: med.name,
        dose: doseSuffix,
      });
    } else {
      const doseNames = resolvedMeds.map((med) => {
        const doseSuffix =
          med.dose_amount != null
            ? ` (${med.dose_amount}${med.dose_unit ? ` ${med.dose_unit}` : ''})`
            : '';
        return `${med.name}${doseSuffix}`;
      });
      body =
        doseNames.length <= 3
          ? i18n.t('medications.notificationScheduledDosesNamed', {
              defaultValue: 'Scheduled doses: {{names}}',
              names: doseNames.join(', '),
            })
          : i18n.t('medications.notificationScheduledDosesOverflow', {
              count: doseNames.length - 3,
              names: doseNames.slice(0, 3).join(', '),
              defaultValue: 'Scheduled doses: {{names}}, and {{count}} more',
              defaultValue_one:
                'Scheduled doses: {{names}}, and {{count}} more',
            });
    }

    const rebuiltData: Record<string, string> = {};
    for (const [k, v] of Object.entries(sourceData)) {
      if (typeof v === 'string') {
        rebuiltData[k] = v;
      }
    }
    rebuiltData.baseKey = baseKey;
    rebuiltData.key = `${baseKey}_snooze_${snoozeFireAt.getTime()}`;
    rebuiltData.isSnoozed = 'true';
    rebuiltData.hideNames = String(hideNames);
    rebuiltData.locale = reminderLocale;

    await scheduleReminder(body, snoozeFireAt, rebuiltData, categoryIdentifier);
  }
}
