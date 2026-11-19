import { showOfflineUploadReminder } from '../services/notifications';
import { getActiveServerConfigId } from '../services/storage';
import { getOfflineDb } from './db';
import { listUnconfirmedOutbox, updateOutboxRow } from './outbox';

/** How long work may wait before the person is reminded, once. */
export const WAITING_REMINDER_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Reminds the person once when something has waited a week to upload
 * (D15). Never deletes anything: a waiting workout has no expiry. Each row
 * is reminded about at most once, and rows that were already reminded about
 * do not cause another reminder.
 */
export async function remindAboutLongWaitingUploads(
  now: number = Date.now()
): Promise<void> {
  const serverConfigId = await getActiveServerConfigId();
  if (!serverConfigId) return;
  const db = await getOfflineDb();
  const due = (await listUnconfirmedOutbox(db, serverConfigId)).filter(
    (row) =>
      row.remindedAt == null && now - row.createdAt >= WAITING_REMINDER_AFTER_MS
  );
  if (due.length === 0) return;
  if (!(await showOfflineUploadReminder())) return;
  for (const row of due) {
    await updateOutboxRow(db, row.id, { remindedAt: now });
  }
}
