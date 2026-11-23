import { migrateOfflineDb } from '../../src/offline/schema';
import { createRawTestDb } from '../helpers/offlineTestDb';

describe('offline schema', () => {
  it('creates the tables on a new file and records the version', async () => {
    const db = createRawTestDb();
    await migrateOfflineDb(db);

    const tables = await db.all<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`
    );
    expect(tables.map((table) => table.name)).toEqual([
      'cache',
      'offline_image',
      'offline_keep',
      'outbox',
    ]);
    const version = await db.first<{ user_version: number }>(
      'PRAGMA user_version'
    );
    expect(version?.user_version).toBe(2);
    db.close();
  });

  it('upgrades a file made by an earlier build without losing its rows', async () => {
    const db = createRawTestDb();
    await migrateOfflineDb(db);
    await db.exec('DROP TABLE offline_keep');
    await db.exec('PRAGMA user_version = 1');
    await db.run(
      `INSERT INTO cache (server_config_id, collection, key, payload, fetched_at)
       VALUES ('s1', 'exercise', 'e1', '{}', 1)`
    );

    await migrateOfflineDb(db);

    expect(await db.all(`SELECT key FROM cache`)).toHaveLength(1);
    expect(await db.all(`SELECT * FROM offline_keep`)).toEqual([]);
    db.close();
  });

  it('leaves an up-to-date file and its rows alone', async () => {
    const db = createRawTestDb();
    await migrateOfflineDb(db);
    await db.run(
      `INSERT INTO cache (server_config_id, collection, key, payload, fetched_at)
       VALUES ('s1', 'exercise', 'e1', '{}', 1)`
    );

    await migrateOfflineDb(db);

    const rows = await db.all(`SELECT key FROM cache`);
    expect(rows).toHaveLength(1);
    db.close();
  });

  it('hands a request that was in flight when the app died back to the queue', async () => {
    const db = createRawTestDb();
    await migrateOfflineDb(db);
    await db.run(
      `INSERT INTO outbox (id, server_config_id, kind, entity_id, payload,
         payload_version, status, created_at, updated_at)
       VALUES ('o1', 's1', 'k', 'e1', '{}', 1, 'sending', 1, 1),
              ('o2', 's1', 'k', 'e2', '{}', 1, 'conflict', 1, 1)`
    );

    await migrateOfflineDb(db);

    const rows = await db.all<{ id: string; status: string }>(
      `SELECT id, status FROM outbox ORDER BY id`
    );
    expect(rows).toEqual([
      { id: 'o1', status: 'pending' },
      { id: 'o2', status: 'conflict' },
    ]);
    db.close();
  });
});
