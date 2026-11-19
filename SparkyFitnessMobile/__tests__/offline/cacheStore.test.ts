import {
  cacheStats,
  clearCache,
  getCacheRow,
  listCacheRows,
  putCacheRows,
  replaceCacheCollection,
  searchCacheRows,
} from '../../src/offline/cacheStore';
import { createTestDb } from '../helpers/offlineTestDb';

describe('offline cache', () => {
  it('stores a document and reads it back as it was', async () => {
    const db = await createTestDb();
    const payload = { id: 'e1', name: 'Bench Press', extra: { nested: [1] } };
    await putCacheRows(db, 's1', 'exercise', [
      { key: 'e1', name: 'Bench Press', payload },
    ]);

    const row = await getCacheRow(db, 's1', 'exercise', 'e1');
    expect(row?.payload).toEqual(payload);
    db.close();
  });

  it('replaces a document stored again under the same key', async () => {
    const db = await createTestDb();
    await putCacheRows(db, 's1', 'exercise', [
      { key: 'e1', name: 'Old', payload: { v: 1 } },
    ]);
    await putCacheRows(db, 's1', 'exercise', [
      { key: 'e1', name: 'New', payload: { v: 2 } },
    ]);

    const rows = await listCacheRows(db, 's1', 'exercise');
    expect(rows.map((row) => row.payload)).toEqual([{ v: 2 }]);
    db.close();
  });

  it('keeps servers apart', async () => {
    const db = await createTestDb();
    await putCacheRows(db, 's1', 'exercise', [{ key: 'e1', payload: 1 }]);
    await putCacheRows(db, 's2', 'exercise', [{ key: 'e1', payload: 2 }]);

    expect((await getCacheRow(db, 's1', 'exercise', 'e1'))?.payload).toBe(1);
    expect((await getCacheRow(db, 's2', 'exercise', 'e1'))?.payload).toBe(2);
    await clearCache(db, 's1');
    expect(await getCacheRow(db, 's1', 'exercise', 'e1')).toBeNull();
    expect((await getCacheRow(db, 's2', 'exercise', 'e1'))?.payload).toBe(2);
    db.close();
  });

  it('drops documents missing from a fresh full list', async () => {
    const db = await createTestDb();
    await putCacheRows(db, 's1', 'workout_preset', [
      { key: '1', name: 'Push', payload: {} },
      { key: '2', name: 'Pull', payload: {} },
    ]);
    await replaceCacheCollection(db, 's1', 'workout_preset', [
      { key: '2', name: 'Pull', payload: {} },
    ]);

    const rows = await listCacheRows(db, 's1', 'workout_preset');
    expect(rows.map((row) => row.key)).toEqual(['2']);
    db.close();
  });

  it('searches by name without case, and treats % and _ as plain text', async () => {
    const db = await createTestDb();
    await putCacheRows(db, 's1', 'exercise', [
      { key: 'a', name: 'Bench Press', payload: {} },
      { key: 'b', name: 'Leg Press', payload: {} },
      { key: 'c', name: 'Squat', payload: {} },
      { key: 'd', name: '100% Effort', payload: {} },
    ]);

    const press = await searchCacheRows(db, 's1', 'exercise', 'pRESS', 10);
    expect(press.map((row) => row.key)).toEqual(['a', 'b']);
    const percent = await searchCacheRows(db, 's1', 'exercise', '%', 10);
    expect(percent.map((row) => row.key)).toEqual(['d']);
    const limited = await searchCacheRows(db, 's1', 'exercise', 'press', 1);
    expect(limited).toHaveLength(1);
    db.close();
  });

  it('treats a row that cannot be read as not cached', async () => {
    const db = await createTestDb();
    await db.run(
      `INSERT INTO cache (server_config_id, collection, key, payload, fetched_at)
       VALUES ('s1', 'exercise', 'bad', 'not json', 1)`
    );

    expect(await getCacheRow(db, 's1', 'exercise', 'bad')).toBeNull();
    expect(await listCacheRows(db, 's1', 'exercise')).toEqual([]);
    db.close();
  });

  it('reports how much is cached for a server', async () => {
    const db = await createTestDb();
    expect(await cacheStats(db, 's1')).toEqual({ documents: 0, bytes: 0 });
    await putCacheRows(db, 's1', 'exercise', [{ key: 'a', payload: 'abc' }]);

    const stats = await cacheStats(db, 's1');
    expect(stats.documents).toBe(1);
    expect(stats.bytes).toBe('"abc"'.length);
    db.close();
  });
});
