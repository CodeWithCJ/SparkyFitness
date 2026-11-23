import type { OfflineDb } from './types';

/** One server document to keep for offline use. */
export interface CacheWrite {
  /** The document's id, or a fixed key for a single document. */
  key: string;
  /** Text to search by (an exercise or preset name); omit when not searched. */
  name?: string | null;
  payload: unknown;
}

interface CacheRecord {
  key: string;
  payload: string;
  fetched_at: number;
}

/** A cached document with when it was fetched. */
export interface CachedDocument {
  key: string;
  payload: unknown;
  fetchedAt: number;
}

function toDocument(record: CacheRecord): CachedDocument | null {
  try {
    return {
      key: record.key,
      payload: JSON.parse(record.payload) as unknown,
      fetchedAt: record.fetched_at,
    };
  } catch {
    // A row that cannot be read counts as not cached; the next refresh
    // replaces it.
    return null;
  }
}

/** Stores documents, replacing any already held under the same key. */
export async function putCacheRows(
  db: OfflineDb,
  serverConfigId: string,
  collection: string,
  rows: readonly CacheWrite[],
  now: number = Date.now()
): Promise<void> {
  if (rows.length === 0) return;
  await db.transaction(async (tx) => {
    for (const row of rows) {
      await tx.run(
        `INSERT INTO cache (server_config_id, collection, key, name, payload, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (server_config_id, collection, key)
         DO UPDATE SET name = excluded.name,
                       payload = excluded.payload,
                       fetched_at = excluded.fetched_at`,
        [
          serverConfigId,
          collection,
          row.key,
          row.name ?? null,
          JSON.stringify(row.payload),
          now,
        ]
      );
    }
  });
}

/**
 * Replaces a whole collection with a fresh full list, so documents deleted
 * on the server disappear from the phone too.
 */
export async function replaceCacheCollection(
  db: OfflineDb,
  serverConfigId: string,
  collection: string,
  rows: readonly CacheWrite[],
  now: number = Date.now()
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.run(
      `DELETE FROM cache WHERE server_config_id = ? AND collection = ?`,
      [serverConfigId, collection]
    );
    await putCacheRows(tx, serverConfigId, collection, rows, now);
  });
}

export async function getCacheRow(
  db: OfflineDb,
  serverConfigId: string,
  collection: string,
  key: string
): Promise<CachedDocument | null> {
  const record = await db.first<CacheRecord>(
    `SELECT key, payload, fetched_at FROM cache
     WHERE server_config_id = ? AND collection = ? AND key = ?`,
    [serverConfigId, collection, key]
  );
  return record ? toDocument(record) : null;
}

/** Every document of a collection, by name. */
export async function listCacheRows(
  db: OfflineDb,
  serverConfigId: string,
  collection: string
): Promise<CachedDocument[]> {
  const records = await db.all<CacheRecord>(
    `SELECT key, payload, fetched_at FROM cache
     WHERE server_config_id = ? AND collection = ?
     ORDER BY name COLLATE NOCASE, key`,
    [serverConfigId, collection]
  );
  return records.flatMap((record) => toDocument(record) ?? []);
}

/** `%` and `_` mean "anything" to LIKE; typed text must match literally. */
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * The conditions that make a name match typed text: every word of it appears
 * in the name, in any order, case-insensitively ("celsius orange" finds
 * "Celsius Sparkling Orange"), as a search on the server does.
 */
function wordMatch(text: string): { sql: string; params: string[] } {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return { sql: '1 = 1', params: [] };
  return {
    sql: words
      .map(() => `name LIKE ? ESCAPE '\\' COLLATE NOCASE`)
      .join(' AND '),
    params: words.map((word) => `%${escapeLike(word)}%`),
  };
}

/** Documents whose name contains every word of the typed text, in any order. */
export async function searchCacheRows(
  db: OfflineDb,
  serverConfigId: string,
  collection: string,
  text: string,
  limit: number
): Promise<CachedDocument[]> {
  const match = wordMatch(text);
  const records = await db.all<CacheRecord>(
    `SELECT key, payload, fetched_at FROM cache
     WHERE server_config_id = ? AND collection = ?
       AND ${match.sql}
     ORDER BY name COLLATE NOCASE, key
     LIMIT ?`,
    [serverConfigId, collection, ...match.params, limit]
  );
  return records.flatMap((record) => toDocument(record) ?? []);
}

/**
 * Removes everything cached for a server. Uploads waiting in the outbox are
 * a different table and are never touched by this.
 */
export async function clearCache(
  db: OfflineDb,
  serverConfigId: string
): Promise<void> {
  await db.run(`DELETE FROM cache WHERE server_config_id = ?`, [
    serverConfigId,
  ]);
}

/** How much is cached for a server: documents and their size in bytes. */
export async function cacheStats(
  db: OfflineDb,
  serverConfigId: string
): Promise<{ documents: number; bytes: number }> {
  const row = await db.first<{ documents: number; bytes: number | null }>(
    `SELECT COUNT(*) AS documents, SUM(LENGTH(payload)) AS bytes
     FROM cache WHERE server_config_id = ?`,
    [serverConfigId]
  );
  return { documents: row?.documents ?? 0, bytes: row?.bytes ?? 0 };
}

/** How many documents a collection holds for a server. */
export async function cacheCount(
  db: OfflineDb,
  serverConfigId: string,
  collection: string
): Promise<number> {
  const row = await db.first<{ total: number }>(
    `SELECT COUNT(*) AS total FROM cache
     WHERE server_config_id = ? AND collection = ?`,
    [serverConfigId, collection]
  );
  return row?.total ?? 0;
}

/** One page of a collection by name, with the size of the whole collection. */
export async function listCacheRowsPage(
  db: OfflineDb,
  serverConfigId: string,
  collection: string,
  limit: number,
  offset: number
): Promise<{ rows: CachedDocument[]; total: number }> {
  const records = await db.all<CacheRecord>(
    `SELECT key, payload, fetched_at FROM cache
     WHERE server_config_id = ? AND collection = ?
     ORDER BY name COLLATE NOCASE, key
     LIMIT ? OFFSET ?`,
    [serverConfigId, collection, limit, offset]
  );
  return {
    rows: records.flatMap((record) => toDocument(record) ?? []),
    total: await cacheCount(db, serverConfigId, collection),
  };
}

/** One page of the documents whose name contains the text, with the match count. */
export async function searchCacheRowsPage(
  db: OfflineDb,
  serverConfigId: string,
  collection: string,
  text: string,
  limit: number,
  offset: number
): Promise<{ rows: CachedDocument[]; total: number }> {
  const match = wordMatch(text);
  const records = await db.all<CacheRecord>(
    `SELECT key, payload, fetched_at FROM cache
     WHERE server_config_id = ? AND collection = ?
       AND ${match.sql}
     ORDER BY name COLLATE NOCASE, key
     LIMIT ? OFFSET ?`,
    [serverConfigId, collection, ...match.params, limit, offset]
  );
  const count = await db.first<{ total: number }>(
    `SELECT COUNT(*) AS total FROM cache
     WHERE server_config_id = ? AND collection = ?
       AND ${match.sql}`,
    [serverConfigId, collection, ...match.params]
  );
  return {
    rows: records.flatMap((record) => toDocument(record) ?? []),
    total: count?.total ?? 0,
  };
}

/**
 * Removes everything cached on this phone, for every server. Used when the
 * signed-in person changes: the saved library and settings belong to the
 * previous account. Uploads waiting in the outbox are kept; they carry the
 * account that made them and are never sent under another one.
 */
export async function clearAllCache(db: OfflineDb): Promise<void> {
  await db.run(`DELETE FROM cache`);
}
