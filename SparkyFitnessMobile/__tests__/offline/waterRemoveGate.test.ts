import { putCacheRows } from '../../src/offline/cacheStore';
import { CACHE_COLLECTIONS } from '../../src/offline/collections';
import { __setOfflineDbForTests } from '../../src/offline/db';
import { listUnconfirmedOutbox } from '../../src/offline/outbox';
import {
  IDENTITY_COLLECTION,
  IDENTITY_KEY,
} from '../../src/offline/syncEngine';
import type { OfflineDb } from '../../src/offline/types';
import { removeLatestDrinkOffline } from '../../src/offline/waterHandOver';
import { createTestDb } from '../helpers/offlineTestDb';

jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/services/storage', () => ({
  getActiveServerConfigId: jest.fn(async () => 's1'),
  getActiveServerConfig: jest.fn(async () => ({
    id: 's1',
    url: 'https://one',
  })),
}));
// Just after an account switch the saved copy is not trusted yet.
jest.mock('../../src/offline/accountGeneration', () => ({
  ...jest.requireActual('../../src/offline/accountGeneration'),
  savedCopyReadable: jest.fn(async () => false),
}));

describe('taking a drink off while the saved copy is not trusted', () => {
  let db: OfflineDb & { close(): void };

  beforeEach(async () => {
    db = await createTestDb();
    __setOfflineDbForTests(db);
    await putCacheRows(db, 's1', IDENTITY_COLLECTION, [
      { key: IDENTITY_KEY, payload: { id: 'u1' } },
    ]);
    await putCacheRows(db, 's1', CACHE_COLLECTIONS.waterLog, [
      {
        key: '2026-11-21',
        payload: [
          {
            id: 'previous-accounts-drink',
            water_ml: 250,
            source: 'manual',
            logged_at: '2026-11-21T09:00:00Z',
          },
        ],
      },
    ]);
  });

  afterEach(() => {
    __setOfflineDbForTests(null);
    db.close();
  });

  it('does not read the saved drink list or queue a removal from it', async () => {
    expect(await removeLatestDrinkOffline('2026-11-21')).toBe('none');
    expect(await listUnconfirmedOutbox(db, 's1')).toHaveLength(0);
  });
});
