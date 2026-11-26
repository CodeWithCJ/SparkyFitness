import { getActiveServerConfigId } from '../services/storage';
import { getOfflineDb } from './db';
import { notifyOutboxChanged } from './events';
import { deleteUnconfirmedRow } from './outbox';

/**
 * Throws away one waiting upload that has no account recorded (it is never
 * sent, since it could land in whichever account is signed in), together with
 * the uploads that wait on it. Only that row goes; a row that has an owner, or
 * one that is being sent right now, is left alone. True when it was removed.
 */
export async function discardOwnerlessUpload(rowId: string): Promise<boolean> {
  const serverConfigId = await getActiveServerConfigId();
  if (!serverConfigId) return false;
  const db = await getOfflineDb();
  const removed = await deleteUnconfirmedRow(
    db,
    rowId,
    (row) => row.userId == null
  );
  if (removed) notifyOutboxChanged();
  return removed;
}
