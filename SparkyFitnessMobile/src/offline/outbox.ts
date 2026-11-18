import type { OfflineDb, OutboxRow, OutboxStatus, SqlParam } from './types';

/** How long a confirmed upload is kept as a safety copy. */
export const SYNCED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/** Statuses that mean the server has not confirmed the row. */
const UNCONFIRMED: readonly OutboxStatus[] = [
  'pending',
  'sending',
  'conflict',
  'needs_sign_in',
  'failed',
];

const UNCONFIRMED_SQL = UNCONFIRMED.map((status) => `'${status}'`).join(', ');

interface OutboxRecord {
  id: string;
  server_config_id: string;
  user_id: string | null;
  kind: string;
  entity_id: string;
  depends_on: string | null;
  entry_date: string | null;
  payload: string;
  payload_version: number;
  base_revision: number | null;
  last_sent: string | null;
  status: OutboxStatus;
  attempts: number;
  last_error: string | null;
  created_at: number;
  updated_at: number;
  synced_at: number | null;
  reminded_at: number | null;
}

function parseJson(text: string | null): unknown {
  if (text == null) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function toRow(record: OutboxRecord): OutboxRow {
  return {
    id: record.id,
    serverConfigId: record.server_config_id,
    userId: record.user_id,
    kind: record.kind,
    entityId: record.entity_id,
    dependsOn: record.depends_on,
    entryDate: record.entry_date,
    payload: parseJson(record.payload),
    payloadVersion: record.payload_version,
    baseRevision: record.base_revision,
    lastSent: parseJson(record.last_sent),
    status: record.status,
    attempts: record.attempts,
    lastError: record.last_error,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    syncedAt: record.synced_at,
    remindedAt: record.reminded_at,
  };
}

/** What a new piece of work is queued with. */
export interface OutboxEnqueue {
  /** A fresh uuid; also what `dependsOn` of a later row points at. */
  id: string;
  serverConfigId: string;
  userId: string | null;
  kind: string;
  entityId: string;
  dependsOn?: string | null;
  entryDate?: string | null;
  payload: unknown;
  payloadVersion: number;
  baseRevision?: number | null;
}

/**
 * Queues work for the server. One unconfirmed row is kept per entity and
 * kind: queueing again replaces that row's payload with the newer one and
 * keeps its id, so rows that depend on it stay attached. Returns the id of
 * the row that now holds the work.
 */
export async function enqueueOutbox(
  db: OfflineDb,
  item: OutboxEnqueue,
  now: number = Date.now()
): Promise<string> {
  return db.transaction(async (tx) => {
    const existing = await tx.first<{ id: string }>(
      `SELECT id FROM outbox
       WHERE server_config_id = ? AND entity_id = ? AND kind = ?
         AND status IN (${UNCONFIRMED_SQL})
       ORDER BY created_at LIMIT 1`,
      [item.serverConfigId, item.entityId, item.kind]
    );
    if (existing) {
      await tx.run(
        `UPDATE outbox
         SET payload = ?, payload_version = ?, entry_date = ?, user_id = ?,
             base_revision = COALESCE(?, base_revision),
             status = 'pending', attempts = 0, last_error = NULL,
             updated_at = ?
         WHERE id = ?`,
        [
          JSON.stringify(item.payload),
          item.payloadVersion,
          item.entryDate ?? null,
          item.userId,
          item.baseRevision ?? null,
          now,
          existing.id,
        ]
      );
      return existing.id;
    }
    await tx.run(
      `INSERT INTO outbox
         (id, server_config_id, user_id, kind, entity_id, depends_on,
          entry_date, payload, payload_version, base_revision, status,
          attempts, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)`,
      [
        item.id,
        item.serverConfigId,
        item.userId,
        item.kind,
        item.entityId,
        item.dependsOn ?? null,
        item.entryDate ?? null,
        JSON.stringify(item.payload),
        item.payloadVersion,
        item.baseRevision ?? null,
        now,
        now,
      ]
    );
    return item.id;
  });
}

export async function getOutboxRow(
  db: OfflineDb,
  id: string
): Promise<OutboxRow | null> {
  const record = await db.first<OutboxRecord>(
    `SELECT * FROM outbox WHERE id = ?`,
    [id]
  );
  return record ? toRow(record) : null;
}

/** Everything the server has not confirmed for one server, oldest first. */
export async function listUnconfirmedOutbox(
  db: OfflineDb,
  serverConfigId: string
): Promise<OutboxRow[]> {
  const records = await db.all<OutboxRecord>(
    `SELECT * FROM outbox
     WHERE server_config_id = ? AND status IN (${UNCONFIRMED_SQL})
     ORDER BY created_at, id`,
    [serverConfigId]
  );
  return records.map(toRow);
}

/** How many uploads one server is still waiting for. */
export async function countUnconfirmedOutbox(
  db: OfflineDb,
  serverConfigId: string
): Promise<number> {
  const row = await db.first<{ total: number }>(
    `SELECT COUNT(*) AS total FROM outbox
     WHERE server_config_id = ? AND status IN (${UNCONFIRMED_SQL})`,
    [serverConfigId]
  );
  return row?.total ?? 0;
}

/** Fields a drain may change on a row. */
export interface OutboxPatch {
  status?: OutboxStatus;
  attempts?: number;
  lastError?: string | null;
  payload?: unknown;
  payloadVersion?: number;
  kind?: string;
  baseRevision?: number | null;
  lastSent?: unknown;
  syncedAt?: number | null;
  remindedAt?: number | null;
}

export async function updateOutboxRow(
  db: OfflineDb,
  id: string,
  patch: OutboxPatch,
  now: number = Date.now()
): Promise<void> {
  const sets: string[] = ['updated_at = ?'];
  const params: SqlParam[] = [now];
  const set = (column: string, value: SqlParam) => {
    sets.push(`${column} = ?`);
    params.push(value);
  };
  if (patch.status !== undefined) set('status', patch.status);
  if (patch.attempts !== undefined) set('attempts', patch.attempts);
  if (patch.lastError !== undefined) set('last_error', patch.lastError);
  if (patch.payload !== undefined) {
    set('payload', JSON.stringify(patch.payload));
  }
  if (patch.payloadVersion !== undefined) {
    set('payload_version', patch.payloadVersion);
  }
  if (patch.kind !== undefined) set('kind', patch.kind);
  if (patch.baseRevision !== undefined) {
    set('base_revision', patch.baseRevision);
  }
  if (patch.lastSent !== undefined) {
    set(
      'last_sent',
      patch.lastSent === null ? null : JSON.stringify(patch.lastSent)
    );
  }
  if (patch.syncedAt !== undefined) set('synced_at', patch.syncedAt);
  if (patch.remindedAt !== undefined) set('reminded_at', patch.remindedAt);
  params.push(id);
  await db.run(`UPDATE outbox SET ${sets.join(', ')} WHERE id = ?`, params);
}

/**
 * Removes the unconfirmed rows about one entity, and every row waiting on
 * them. Used when the person discards the work those rows describe.
 */
export async function deleteUnconfirmedForEntity(
  db: OfflineDb,
  serverConfigId: string,
  entityId: string
): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = await tx.all<{ id: string }>(
      `SELECT id FROM outbox
       WHERE server_config_id = ? AND entity_id = ?
         AND status IN (${UNCONFIRMED_SQL})`,
      [serverConfigId, entityId]
    );
    for (const row of rows) {
      await tx.run(
        `DELETE FROM outbox
         WHERE depends_on = ? AND status IN (${UNCONFIRMED_SQL})`,
        [row.id]
      );
      await tx.run(`DELETE FROM outbox WHERE id = ?`, [row.id]);
    }
  });
}

/**
 * Drops safety copies of uploads confirmed more than a week ago. A row the
 * server has not confirmed is never removed here, however old it is.
 */
export async function deleteOldSyncedOutbox(
  db: OfflineDb,
  now: number = Date.now()
): Promise<number> {
  const result = await db.run(
    `DELETE FROM outbox WHERE status = 'synced' AND synced_at < ?`,
    [now - SYNCED_RETENTION_MS]
  );
  return result.changes;
}
