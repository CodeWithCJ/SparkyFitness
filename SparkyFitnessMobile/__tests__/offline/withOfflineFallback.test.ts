import { ApiError } from '../../src/services/api/errors';
import {
  setServerKnownUnreachable,
  subscribeOfflineFallbackUsed,
} from '../../src/offline/connection';
import { bumpAccountGeneration } from '../../src/offline/accountGeneration';
import { __setOfflineDbForTests } from '../../src/offline/db';
import { withOfflineFallback } from '../../src/offline/withOfflineFallback';
import type { OfflineDb } from '../../src/offline/types';
import { createTestDb } from '../helpers/offlineTestDb';

jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/services/storage', () => ({
  getActiveServerConfigId: jest.fn(async () => 's1'),
}));

describe('withOfflineFallback', () => {
  let db: OfflineDb & { close(): void };
  let fallbackUsed: jest.Mock;
  let unsubscribe: () => void;

  beforeEach(async () => {
    db = await createTestDb();
    __setOfflineDbForTests(db);
    setServerKnownUnreachable(false);
    fallbackUsed = jest.fn();
    unsubscribe = subscribeOfflineFallbackUsed(fallbackUsed);
  });

  afterEach(() => {
    unsubscribe();
    setServerKnownUnreachable(false);
    __setOfflineDbForTests(null);
    db.close();
  });

  it('returns the server answer and keeps it for later', async () => {
    const store = jest.fn(async () => {});
    const read = jest.fn(async () => 'saved');

    const value = await withOfflineFallback({
      fetch: async () => 'fresh',
      store,
      read,
    });

    expect(value).toBe('fresh');
    expect(store).toHaveBeenCalledWith(db, 's1', 'fresh');
    expect(read).not.toHaveBeenCalled();
    expect(fallbackUsed).not.toHaveBeenCalled();
  });

  it('does not keep an answer that arrived after the account changed', async () => {
    const store = jest.fn(async () => {});

    const answer = await withOfflineFallback({
      fetch: async () => {
        bumpAccountGeneration();
        return 'fresh';
      },
      store,
      read: async () => null,
    });

    expect(answer).toBe('fresh');
    expect(store).not.toHaveBeenCalled();
  });

  it('answers from the phone when the server cannot be reached, and reports it', async () => {
    const value = await withOfflineFallback({
      fetch: async () => {
        throw new TypeError('Network request failed');
      },
      read: async () => 'saved',
    });

    expect(value).toBe('saved');
    expect(fallbackUsed).toHaveBeenCalledTimes(1);
  });

  it('passes the original error on when nothing is saved', async () => {
    const error = new ApiError('down', 503);

    await expect(
      withOfflineFallback({
        fetch: async () => {
          throw error;
        },
        read: async () => null,
      })
    ).rejects.toBe(error);
  });

  it('never replaces a real server refusal with saved data', async () => {
    const read = jest.fn(async () => 'saved');
    const error = new ApiError('forbidden', 403);

    await expect(
      withOfflineFallback({
        fetch: async () => {
          throw error;
        },
        read,
      })
    ).rejects.toBe(error);
    expect(read).not.toHaveBeenCalled();
  });

  it('still returns the server answer when keeping it fails', async () => {
    const value = await withOfflineFallback({
      fetch: async () => 'fresh',
      store: async () => {
        throw new Error('disk full');
      },
      read: async () => null,
    });

    expect(value).toBe('fresh');
  });

  it('skips the request while the server is known to be away', async () => {
    setServerKnownUnreachable(true);
    const fetch = jest.fn(async () => 'fresh');

    const value = await withOfflineFallback({
      fetch,
      read: async () => 'saved',
    });

    expect(value).toBe('saved');
    expect(fetch).not.toHaveBeenCalled();
    // Nothing else would notice the server coming back.
    expect(fallbackUsed).toHaveBeenCalledTimes(1);
  });

  it('still asks the server when it is away but nothing is saved', async () => {
    setServerKnownUnreachable(true);
    const fetch = jest.fn(async () => 'fresh');

    const value = await withOfflineFallback({ fetch, read: async () => null });

    expect(value).toBe('fresh');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
