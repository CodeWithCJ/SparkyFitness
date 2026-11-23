import type { OfflineDb } from './types';

/**
 * The offline file's tables. They are this app's own and never mirror the
 * server: `cache` and `outbox` hold JSON documents, so a new server column or
 * a new module needs no change here.
 *
 * Add a step for a structural change; never edit a step that has shipped.
 */
const MIGRATIONS: readonly string[] = [
  // 1: cache of server documents, the upload queue, saved exercise pictures.
  `
  CREATE TABLE IF NOT EXISTS cache (
    server_config_id TEXT NOT NULL,
    collection       TEXT NOT NULL,
    key              TEXT NOT NULL,
    name             TEXT,
    payload          TEXT NOT NULL,
    fetched_at       INTEGER NOT NULL,
    PRIMARY KEY (server_config_id, collection, key)
  );
  CREATE INDEX IF NOT EXISTS cache_name
    ON cache (server_config_id, collection, name COLLATE NOCASE);

  CREATE TABLE IF NOT EXISTS outbox (
    id               TEXT PRIMARY KEY,
    server_config_id TEXT NOT NULL,
    user_id          TEXT,
    kind             TEXT NOT NULL,
    entity_id        TEXT NOT NULL,
    depends_on       TEXT,
    entry_date       TEXT,
    payload          TEXT NOT NULL,
    payload_version  INTEGER NOT NULL,
    base_revision    INTEGER,
    last_sent        TEXT,
    status           TEXT NOT NULL,
    attempts         INTEGER NOT NULL DEFAULT 0,
    last_error       TEXT,
    created_at       INTEGER NOT NULL,
    updated_at       INTEGER NOT NULL,
    synced_at        INTEGER,
    reminded_at      INTEGER
  );
  CREATE INDEX IF NOT EXISTS outbox_status
    ON outbox (server_config_id, status);
  CREATE INDEX IF NOT EXISTS outbox_entity
    ON outbox (server_config_id, entity_id);

  CREATE TABLE IF NOT EXISTS offline_image (
    server_config_id TEXT NOT NULL,
    source_uri       TEXT NOT NULL,
    file_path        TEXT NOT NULL,
    bytes            INTEGER NOT NULL,
    reason           TEXT NOT NULL,
    exercise_id      TEXT,
    last_used_at     INTEGER NOT NULL,
    PRIMARY KEY (server_config_id, source_uri)
  );
  `,
  // 2: exercises the person chose to keep pictures of (multi-select in the
  // exercise library). Kept apart from `cache`, which "Clear offline data"
  // and an account switch empty, so the choice outlives a refresh.
  `
  CREATE TABLE IF NOT EXISTS offline_keep (
    server_config_id TEXT NOT NULL,
    exercise_id      TEXT NOT NULL,
    created_at       INTEGER NOT NULL,
    PRIMARY KEY (server_config_id, exercise_id)
  );
  `,
];

/**
 * Brings the file up to this build's structure. Safe to run on every launch:
 * a file already up to date is left alone, and each step commits together
 * with its version number.
 */
export async function migrateOfflineDb(db: OfflineDb): Promise<void> {
  const row = await db.first<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  for (let version = current; version < MIGRATIONS.length; version += 1) {
    const step = MIGRATIONS[version]!;
    await db.transaction(async (tx) => {
      await tx.exec(step);
      // PRAGMA takes no bound parameters; the value is a loop counter.
      await tx.exec(`PRAGMA user_version = ${version + 1}`);
    });
  }
  // A request in flight when the app died never reported back. Hand it to
  // the next drain instead of leaving it stranded.
  await db.run(`UPDATE outbox SET status = 'pending' WHERE status = 'sending'`);
}
