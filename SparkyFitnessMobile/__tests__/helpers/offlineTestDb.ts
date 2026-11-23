import type { OfflineDb, SqlParam } from '../../src/offline/types';
import { migrateOfflineDb } from '../../src/offline/schema';

interface NodeStatement {
  run(...params: SqlParam[]): { changes: number | bigint };
  all(...params: SqlParam[]): unknown[];
  get(...params: SqlParam[]): unknown;
}

interface NodeDatabase {
  exec(sql: string): void;
  prepare(sql: string): NodeStatement;
  close(): void;
}

// Node's built-in SQLite runs the same SQL the app runs on expo-sqlite, so
// the offline tests exercise real statements instead of a hand-written fake.
const { DatabaseSync } = require('node:sqlite') as {
  DatabaseSync: new (path: string) => NodeDatabase;
};

/** An empty in-memory database behind the app's `OfflineDb` interface. */
export function createRawTestDb(): OfflineDb & { close(): void } {
  const database = new DatabaseSync(':memory:');
  let depth = 0;
  const db: OfflineDb & { close(): void } = {
    exec: async (sql) => {
      database.exec(sql);
    },
    run: async (sql, params = []) => ({
      changes: Number(database.prepare(sql).run(...params).changes),
    }),
    all: async <T>(sql: string, params: SqlParam[] = []) =>
      database.prepare(sql).all(...params) as T[],
    first: async <T>(sql: string, params: SqlParam[] = []) =>
      (database.prepare(sql).get(...params) as T | undefined) ?? null,
    transaction: async (task) => {
      if (depth > 0) return task(db);
      depth += 1;
      database.exec('BEGIN');
      try {
        const result = await task(db);
        database.exec('COMMIT');
        return result;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      } finally {
        depth -= 1;
      }
    },
    close: () => database.close(),
  };
  return db;
}

/** An in-memory database with the offline tables already created. */
export async function createTestDb(): Promise<OfflineDb & { close(): void }> {
  const db = createRawTestDb();
  await migrateOfflineDb(db);
  return db;
}
