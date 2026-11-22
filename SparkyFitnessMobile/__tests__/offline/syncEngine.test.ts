import { ApiError } from '../../src/services/api/errors';
import { bumpAccountGeneration } from '../../src/offline/accountGeneration';
import { putCacheRows } from '../../src/offline/cacheStore';
import { __setOfflineDbForTests } from '../../src/offline/db';
import { subscribeUploadsConfirmed } from '../../src/offline/events';
import {
  __clearOutboxHandlersForTests,
  registerOutboxHandler,
} from '../../src/offline/handlers/registry';
import {
  deleteUnconfirmedForEntity,
  enqueueOutbox,
  getOutboxRow,
  updateOutboxRow,
} from '../../src/offline/outbox';
import {
  IDENTITY_COLLECTION,
  IDENTITY_KEY,
  drainOutbox,
  retryDelayMs,
  sendResultFromError,
} from '../../src/offline/syncEngine';
import type { OfflineDb, OutboxRow, SendResult } from '../../src/offline/types';
import { createTestDb } from '../helpers/offlineTestDb';

jest.mock('expo-sqlite', () => ({}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/services/storage', () => ({
  getActiveServerConfigId: jest.fn(async () => 's1'),
  getActiveServerConfig: jest.fn(async () => ({
    id: 's1',
    url: 'https://one',
  })),
}));

const KIND = 'test.thing';

describe('offline sync engine', () => {
  let db: OfflineDb & { close(): void };
  let send: jest.Mock<Promise<SendResult>, [OutboxRow]>;
  let onSynced: jest.Mock;

  const queue = (id: string, extra: Record<string, unknown> = {}) =>
    enqueueOutbox(db, {
      id,
      serverConfigId: 's1',
      userId: 'u1',
      kind: KIND,
      entityId: `entity-${id}`,
      payload: { id },
      payloadVersion: 2,
      ...extra,
    });

  beforeEach(async () => {
    db = await createTestDb();
    __setOfflineDbForTests(db);
    __clearOutboxHandlersForTests();
    await putCacheRows(db, 's1', IDENTITY_COLLECTION, [
      { key: IDENTITY_KEY, payload: { id: 'u1' } },
    ]);
    send = jest.fn(async () => ({ outcome: 'synced' }) as SendResult);
    onSynced = jest.fn();
    registerOutboxHandler({
      kind: KIND,
      payloadVersion: 2,
      upgrade: (payload) => ({ ...(payload as object), upgraded: true }),
      send,
      onSynced,
    });
  });

  afterEach(() => {
    __setOfflineDbForTests(null);
    db.close();
  });

  it('sends waiting rows oldest first and marks them confirmed', async () => {
    await enqueueOutbox(
      db,
      {
        id: 'second',
        serverConfigId: 's1',
        userId: 'u1',
        kind: KIND,
        entityId: 'e2',
        payload: {},
        payloadVersion: 2,
      },
      2000
    );
    await enqueueOutbox(
      db,
      {
        id: 'first',
        serverConfigId: 's1',
        userId: 'u1',
        kind: KIND,
        entityId: 'e1',
        payload: {},
        payloadVersion: 2,
      },
      1000
    );

    const summary = await drainOutbox('reconnect');

    expect(send.mock.calls.map(([row]) => row.id)).toEqual(['first', 'second']);
    expect(summary).toEqual({ synced: 2, remaining: 0 });
    expect((await getOutboxRow(db, 'first'))?.status).toBe('synced');
    expect(onSynced).toHaveBeenCalledTimes(2);
  });

  it('hands each handler the server the run started on, to send to', async () => {
    await enqueueOutbox(db, {
      id: 'only',
      serverConfigId: 's1',
      userId: 'u1',
      kind: KIND,
      entityId: 'e-only',
      payload: {},
      payloadVersion: 2,
    });

    await drainOutbox('reconnect');

    expect(send).toHaveBeenCalledWith(expect.objectContaining({ id: 'only' }), {
      serverConfig: { id: 's1', url: 'https://one' },
    });
  });

  it('puts a claimed row back untouched when the account changes before its request', async () => {
    await enqueueOutbox(db, {
      id: 'held',
      serverConfigId: 's1',
      userId: 'u1',
      kind: KIND,
      entityId: 'e-held',
      payload: {},
      payloadVersion: 1, // upgraded first, which is awaited before the send
    });
    // The account changes while the row is being upgraded for sending.
    const upgrade = jest.fn((payload: unknown) => {
      bumpAccountGeneration();
      return { ...(payload as object), upgraded: true };
    });
    __clearOutboxHandlersForTests();
    registerOutboxHandler({
      kind: KIND,
      payloadVersion: 2,
      upgrade,
      send,
      onSynced,
    });

    await drainOutbox('reconnect');

    expect(send).not.toHaveBeenCalled();
    expect((await getOutboxRow(db, 'held'))?.status).toBe('pending');
  });

  it('stops the run when the account changes while rows are going up, leaving the rest waiting', async () => {
    for (const [id, at] of [
      ['first', 1000],
      ['second', 2000],
    ] as const) {
      await enqueueOutbox(
        db,
        {
          id,
          serverConfigId: 's1',
          userId: 'u1',
          kind: KIND,
          entityId: `e-${id}`,
          payload: {},
          payloadVersion: 2,
        },
        at
      );
    }
    // Someone else signs in while the first row's request is out.
    send.mockImplementationOnce(async () => {
      bumpAccountGeneration();
      return { outcome: 'synced' } as SendResult;
    });

    const summary = await drainOutbox('reconnect');

    expect(send).toHaveBeenCalledTimes(1);
    expect(summary.synced).toBe(1);
    expect((await getOutboxRow(db, 'second'))?.status).toBe('pending');
  });

  it('tells the app when the server confirmed something, and only then', async () => {
    const confirmed = jest.fn();
    const stop = subscribeUploadsConfirmed(confirmed);

    await queue('a');
    send.mockResolvedValueOnce({ outcome: 'retry', error: 'offline' });
    await drainOutbox('reconnect');
    expect(confirmed).not.toHaveBeenCalled();

    await drainOutbox('manual');
    stop();
    expect(confirmed).toHaveBeenCalledTimes(1);
  });

  it('keeps a row waiting and stops the run when the server is unreachable', async () => {
    await queue('a');
    await queue('b');
    send.mockResolvedValueOnce({ outcome: 'retry', error: 'offline' });

    const summary = await drainOutbox('reconnect');

    expect(send).toHaveBeenCalledTimes(1);
    expect(summary).toEqual({ synced: 0, remaining: 2 });
    expect(await getOutboxRow(db, 'a')).toMatchObject({
      status: 'pending',
      attempts: 1,
      lastError: 'offline',
    });
    expect((await getOutboxRow(db, 'b'))?.attempts).toBe(0);
  });

  it('waits out the retry delay, unless the person asks', async () => {
    await queue('a');
    await updateOutboxRow(db, 'a', { attempts: 1 });

    await drainOutbox('foreground');
    expect(send).not.toHaveBeenCalled();

    await drainOutbox('manual');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('never sends a row with no recorded account, not even when the person asks', async () => {
    await enqueueOutbox(db, {
      id: 'unowned',
      serverConfigId: 's1',
      userId: null,
      kind: KIND,
      entityId: 'e-unowned',
      payload: {},
      payloadVersion: 2,
    });

    await drainOutbox('reconnect');
    await drainOutbox('foreground');
    expect(send).not.toHaveBeenCalled();

    await drainOutbox('manual');
    expect(send).not.toHaveBeenCalled();
    // It is parked as needing attention, where it can be discarded.
    expect((await getOutboxRow(db, 'unowned'))?.status).toBe('failed');
  });

  it('does not send a row that was discarded while an earlier one was going up', async () => {
    await queue('a');
    await queue('b');
    send.mockImplementationOnce(async () => {
      // The person discards b while a's request is out.
      await deleteUnconfirmedForEntity(db, 's1', 'entity-b');
      return { outcome: 'synced' } as SendResult;
    });

    const summary = await drainOutbox('reconnect');

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0].id).toBe('a');
    expect(summary.synced).toBe(1);
    expect(await getOutboxRow(db, 'b')).toBeNull();
  });

  it('sends the newer payload of a waiting row that was replaced while an earlier row uploaded', async () => {
    await queue('a');
    await queue('b');
    send.mockImplementationOnce(async () => {
      // b is replaced by newer work (still pending) while a's request is out.
      await enqueueOutbox(
        db,
        {
          id: 'b-again',
          serverConfigId: 's1',
          userId: 'u1',
          kind: KIND,
          entityId: 'entity-b',
          payload: { id: 'b-newer' },
          payloadVersion: 2,
        },
        Date.now() + 5_000
      );
      return { outcome: 'synced' } as SendResult;
    });

    await drainOutbox('reconnect');
    // b was not sent from the stale listing; the newer one goes next run.
    expect(send).toHaveBeenCalledTimes(1);
    expect((await getOutboxRow(db, 'b'))?.status).toBe('pending');

    await drainOutbox('manual');
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]![0].payload).toEqual({ id: 'b-newer' });
    expect((await getOutboxRow(db, 'b'))?.status).toBe('synced');
  });

  it('does not let the failure of an older upload mark newer work', async () => {
    await queue('a');
    send.mockImplementationOnce(async () => {
      // The work is replaced while its request is out, then the old request
      // is refused as a conflict.
      await enqueueOutbox(
        db,
        {
          id: 'a-again',
          serverConfigId: 's1',
          userId: 'u1',
          kind: KIND,
          entityId: 'entity-a',
          payload: { id: 'newer' },
          payloadVersion: 2,
        },
        Date.now() + 5_000
      );
      return { outcome: 'conflict', error: 'changed' } as SendResult;
    });

    await drainOutbox('reconnect');

    expect(await getOutboxRow(db, 'a')).toMatchObject({
      status: 'pending',
      lastError: null,
      payload: { id: 'newer' },
    });
  });

  it('keeps newer work queued when the upload that finished was of the older work', async () => {
    await queue('a');
    send.mockImplementationOnce(async () => {
      // The workout changes while its upload is out: the row is replaced.
      await enqueueOutbox(db, {
        id: 'a-again',
        serverConfigId: 's1',
        userId: 'u1',
        kind: KIND,
        entityId: 'entity-a',
        payload: { id: 'newer' },
        payloadVersion: 2,
      });
      return { outcome: 'synced' } as SendResult;
    });

    const summary = await drainOutbox('reconnect');

    expect(summary.synced).toBe(0);
    expect(await getOutboxRow(db, 'a')).toMatchObject({
      status: 'pending',
      payload: { id: 'newer' },
    });

    await drainOutbox('manual');
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]![0].payload).toEqual({ id: 'newer' });
    expect((await getOutboxRow(db, 'a'))?.status).toBe('synced');
  });

  it('tries a waiting row at once when the connection comes back', async () => {
    await queue('a');
    await updateOutboxRow(db, 'a', { attempts: 4 });

    await drainOutbox('foreground');
    expect(send).not.toHaveBeenCalled();

    await drainOutbox('reconnect');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('treats a thrown error like a refused or unreachable request', async () => {
    await queue('a');
    send.mockRejectedValueOnce(new ApiError('bad', 400, 'invalid body'));

    await drainOutbox('reconnect');

    expect(await getOutboxRow(db, 'a')).toMatchObject({
      status: 'failed',
      lastError: '400: invalid body',
    });
  });

  it('parks a refused row until the person retries it', async () => {
    await queue('a');
    await updateOutboxRow(db, 'a', { status: 'failed' });

    await drainOutbox('reconnect');
    expect(send).not.toHaveBeenCalled();
    await drainOutbox('manual');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('stops at a credentials refusal and retries only after a sign-in', async () => {
    await queue('a');
    await queue('b');
    send.mockResolvedValueOnce({ outcome: 'needs_sign_in' });

    await drainOutbox('reconnect');
    expect(send).toHaveBeenCalledTimes(1);
    expect((await getOutboxRow(db, 'a'))?.status).toBe('needs_sign_in');

    await drainOutbox('foreground');
    // Only the untouched row behind it is tried; the refused one waits.
    expect(send.mock.calls.map(([row]) => row.id)).toEqual(['a', 'b']);

    await drainOutbox('signed_in');
    expect(send.mock.calls.map(([row]) => row.id)).toEqual(['a', 'b', 'a']);
  });

  it('never sends a conflict on its own', async () => {
    await queue('a');
    send.mockResolvedValueOnce({ outcome: 'conflict' });

    await drainOutbox('reconnect');
    await drainOutbox('manual');

    expect(send).toHaveBeenCalledTimes(1);
    expect((await getOutboxRow(db, 'a'))?.status).toBe('conflict');
  });

  it('holds a row until the row it depends on is confirmed', async () => {
    await queue('session');
    await queue('feedback', { dependsOn: 'session' });
    send.mockResolvedValueOnce({ outcome: 'retry' });

    await drainOutbox('reconnect');
    expect(send.mock.calls.map(([row]) => row.id)).toEqual(['session']);

    await drainOutbox('manual');
    expect(send.mock.calls.map(([row]) => row.id)).toEqual([
      'session',
      'session',
      'feedback',
    ]);
  });

  it('sends a waiting row whose confirmed parent was already cleaned up', async () => {
    await queue('feedback', { dependsOn: 'long-gone' });

    await drainOutbox('manual');

    expect(send.mock.calls.map(([row]) => row.id)).toEqual(['feedback']);
  });

  it("does not upload another account's work", async () => {
    await putCacheRows(db, 's1', IDENTITY_COLLECTION, [
      { key: IDENTITY_KEY, payload: { id: 'someone-else' } },
    ]);
    await queue('a');

    const summary = await drainOutbox('manual');

    expect(send).not.toHaveBeenCalled();
    expect(summary.remaining).toBe(1);
  });

  it('waits while the signed-in person is not known yet', async () => {
    await db.run(`DELETE FROM cache`);
    await queue('a');

    const summary = await drainOutbox('manual');

    expect(send).not.toHaveBeenCalled();
    expect(summary.remaining).toBe(1);
  });

  it('does not send work made before anyone was known, whoever is signed in', async () => {
    await queue('a', { userId: null });

    await drainOutbox('manual');

    expect(send).not.toHaveBeenCalled();
  });

  it('brings a payload written by an older build up to date before sending', async () => {
    await queue('a', { payloadVersion: 1 });

    await drainOutbox('reconnect');

    expect(send.mock.calls[0]![0].payload).toEqual({ id: 'a', upgraded: true });
  });

  it('leaves a kind this build does not know for a newer build', async () => {
    await queue('a', { kind: 'from.the.future' });

    const summary = await drainOutbox('manual');

    expect(send).not.toHaveBeenCalled();
    expect(summary.remaining).toBe(1);
  });

  it('runs one drain at a time', async () => {
    await queue('a');
    let release: (result: SendResult) => void = () => {};
    send.mockReturnValueOnce(
      new Promise<SendResult>((resolve) => {
        release = resolve;
      })
    );

    const first = drainOutbox('reconnect');
    const second = drainOutbox('manual');
    expect(second).toBe(first);
    release({ outcome: 'synced' });
    await first;

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('grows the wait between attempts up to a ceiling', () => {
    expect(retryDelayMs(0)).toBe(0);
    expect(retryDelayMs(1)).toBe(30_000);
    expect(retryDelayMs(50)).toBe(30 * 60_000);
  });

  it('maps request errors to queue outcomes', () => {
    expect(sendResultFromError(new ApiError('x', 401))).toEqual({
      outcome: 'needs_sign_in',
    });
    expect(sendResultFromError(new ApiError('x', 503)).outcome).toBe('retry');
    expect(sendResultFromError(new TypeError('Network')).outcome).toBe('retry');
    expect(sendResultFromError(new ApiError('x', 422)).outcome).toBe('failed');
  });
});
