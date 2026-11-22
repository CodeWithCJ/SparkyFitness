import * as SQLite from 'expo-sqlite';
import { addLog } from '../services/LogService';
import { migrateOfflineDb } from './schema';
import type { OfflineDb, SqlParam } from './types';

const DATABASE_NAME = 'sparky-offline.db';

/** The calls `OfflineDb` needs, present on a database and on a transaction. */
type SqliteRunner = Pick<
  SQLite.SQLiteDatabase,
  'execAsync' | 'runAsync' | 'getAllAsync' | 'getFirstAsync'
>;

function wrapRunner(
  runner: SqliteRunner,
  transaction: OfflineDb['transaction']
): OfflineDb {
  return {
    exec: (sql) => runner.execAsync(sql),
    run: async (sql, params: SqlParam[] = []) => {
      const result = await runner.runAsync(sql, params);
      return { changes: result.changes };
    },
    all: <T>(sql: string, params: SqlParam[] = []) =>
      runner.getAllAsync<T>(sql, params),
    first: <T>(sql: string, params: SqlParam[] = []) =>
      runner.getFirstAsync<T>(sql, params),
    transaction,
  };
}

function wrapDatabase(database: SQLite.SQLiteDatabase): OfflineDb {
  const transaction: OfflineDb['transaction'] = async (task) => {
    let result: Awaited<ReturnType<typeof task>> | undefined;
    // Exclusive: other statements wait for the transaction instead of
    // slipping into it, which the plain transaction helper allows.
    await database.withExclusiveTransactionAsync(async (txn) => {
      // A nested transaction joins the one already open.
      const nested: OfflineDb['transaction'] = (inner) => inner(tx);
      const tx = wrapRunner(txn, nested);
      result = await task(tx);
    });
    return result as Awaited<ReturnType<typeof task>>;
  };
  return wrapRunner(database, transaction);
}

let opening: Promise<OfflineDb> | null = null;

/**
 * The offline file, opened and brought up to date once per launch. The file
 * is created on first use, so nothing has to be set up after an app update.
 */
export function getOfflineDb(): Promise<OfflineDb> {
  opening ??= (async () => {
    const database = await SQLite.openDatabaseAsync(DATABASE_NAME);
    await database.execAsync('PRAGMA journal_mode = WAL');
    const db = wrapDatabase(database);
    await migrateOfflineDb(db);
    return db;
  })().catch((error: unknown) => {
    // Let a later call try again rather than caching the failure.
    opening = null;
    addLog(`[Offline] Could not open the offline file: ${error}`, 'ERROR');
    throw error;
  });
  return opening;
}

/** Tests only: run the offline code against a database the test supplies. */
export function __setOfflineDbForTests(db: OfflineDb | null): void {
  opening = db ? Promise.resolve(db) : null;
}
