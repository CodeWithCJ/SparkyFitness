import type {
  GarminDevice,
  GarminGoalsTopic,
  GarminPhoneMessage,
  GarminSendResult,
  GarminSnapshotMessage,
  GarminSnapshotPayload,
  GarminSnapshotTopics,
  GarminStatus,
} from '../../modules/watch-connectivity';

jest.mock('../../modules/watch-connectivity', () => ({
  __esModule: true,
  default: {
    isGarminAvailable: jest.fn(() => true),
    sendGarminMessage: jest.fn(() => Promise.resolve('sent')),
    setGarminSnapshotCache: jest.fn(() => Promise.resolve()),
    getGarminSnapshotCache: jest.fn(() => Promise.resolve(null)),
    clearGarminAccount: jest.fn(() => Promise.resolve()),
    startGarmin: jest.fn(() =>
      Promise.resolve({ state: 'ready', devices: [] })
    ),
    garminStatus: jest.fn(() =>
      Promise.resolve({ state: 'ready', devices: [] })
    ),
  },
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/constants/garmin', () => ({
  isGarminWatchEnabled: jest.fn(() => true),
}));

import {
  changedTopicNames,
  clearGarminAccount,
  createGarminSync,
  GARMIN_PUSHED_AT_REFRESH_MS,
  garminAccountEpoch,
  getGarminSync,
  stableJson,
  type GarminSync,
} from '../../src/services/garminSync';
import { addLog } from '../../src/services/LogService';
import { isGarminWatchEnabled } from '../../src/constants/garmin';

const goals = (consumed: number): GarminGoalsTopic => ({
  energyUnit: 'kcal',
  day: '2026-11-19',
  consumed,
  burned: 300,
  remaining: 2100 - consumed,
  progress: 0.5,
  nutrients: [
    {
      key: 'protein',
      label: 'Protein',
      unit: 'g',
      consumed: 80,
      goal: 140,
      progress: 0.57,
    },
  ],
});

/**
 * The protocol has one topic today, but every rule here is per topic, so most
 * tests add a made-up `water` topic beside `goals`.
 */
const snapshot = (
  overrides: {
    pushedAt?: number;
    owner?: string;
    goals?: GarminGoalsTopic;
    water?: Record<string, number>;
  } = {}
): GarminSnapshotPayload => ({
  pushedAt: overrides.pushedAt ?? 1_000,
  today: '2026-11-19',
  owner: overrides.owner ?? 'server-1',
  topics: {
    goals: overrides.goals ?? goals(1200),
    ...(overrides.water ? { water: overrides.water } : {}),
  },
});

const device = (
  id: string,
  overrides: Partial<GarminDevice> = {}
): GarminDevice => ({
  id,
  name: `Watch ${id}`,
  connected: true,
  app: 'installed',
  ...overrides,
});

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

interface Harness {
  sync: GarminSync;
  /** `sync.publish` with the current account epoch. */
  publish: (payload: GarminSnapshotPayload) => Promise<void>;
  sendMessage: jest.Mock<
    Promise<GarminSendResult>,
    [string, GarminPhoneMessage]
  >;
  setCache: jest.Mock<Promise<void>, [GarminSnapshotMessage | null]>;
  getCache: jest.Mock<Promise<GarminSnapshotMessage | null>, []>;
  start: jest.Mock<Promise<GarminStatus>, []>;
  getStatus: jest.Mock<Promise<GarminStatus>, []>;
  log: jest.Mock<void, [string]>;
  /**
   * Topic names of each message sent, in order: `[deviceId, names]`; a
   * control message is `[deviceId, [type]]`.
   */
  sentTopics: () => [string, string[]][];
}

const ACCOUNT_CLEARED: GarminPhoneMessage = { type: 'accountCleared', v: 1 };

function harness(devices: GarminDevice[] | null = [device('1')]): Harness {
  const sendMessage = jest.fn<
    Promise<GarminSendResult>,
    [string, GarminPhoneMessage]
  >(() => Promise.resolve('sent'));
  const setCache = jest.fn<Promise<void>, [GarminSnapshotMessage | null]>(() =>
    Promise.resolve()
  );
  const getCache = jest.fn<Promise<GarminSnapshotMessage | null>, []>(() =>
    Promise.resolve(null)
  );
  const start = jest.fn<Promise<GarminStatus>, []>(() =>
    Promise.resolve({ state: 'ready', devices: devices ?? [] })
  );
  const getStatus = jest.fn<Promise<GarminStatus>, []>(() =>
    Promise.resolve({ state: 'ready', devices: devices ?? [] })
  );
  const log = jest.fn<void, [string]>();
  const sync = createGarminSync({
    sendMessage,
    setCache,
    getCache,
    start,
    getStatus,
    log,
  });
  if (devices) sync.updateStatus({ state: 'ready', devices });
  return {
    sync,
    publish: (payload) => sync.publish(payload, sync.accountEpoch()),
    sendMessage,
    setCache,
    getCache,
    start,
    getStatus,
    log,
    sentTopics: () =>
      sendMessage.mock.calls.map(([deviceId, message]) => [
        deviceId,
        message.type === 'snapshot'
          ? Object.keys(message.topics).sort()
          : [message.type],
      ]),
  };
}

describe('stableJson', () => {
  test('ignores key order at every depth', () => {
    expect(stableJson({ b: 1, a: { d: 2, c: [{ y: 1, x: 2 }] } })).toBe(
      stableJson({ a: { c: [{ x: 2, y: 1 }], d: 2 }, b: 1 })
    );
  });

  test('keeps array order, which is part of the content', () => {
    expect(stableJson([1, 2])).not.toBe(stableJson([2, 1]));
  });

  test('leaves out undefined values, as the message does', () => {
    expect(stableJson({ a: 1, b: undefined })).toBe(stableJson({ a: 1 }));
  });
});

describe('changedTopicNames', () => {
  const topics: GarminSnapshotTopics = snapshot({ water: { ml: 500 } }).topics;

  test('every topic, in name order, when the record is unknown', () => {
    expect(changedTopicNames(topics, null)).toEqual(['goals', 'water']);
  });

  test('only the topics whose content differs from the record', () => {
    const delivered = new Map([
      ['goals', stableJson(topics.goals)],
      ['water', stableJson({ ml: 250 })],
    ]);
    expect(changedTopicNames(topics, delivered)).toEqual(['water']);
  });
});

describe('createGarminSync', () => {
  test('the first publish sends every topic in one snapshot message', async () => {
    const h = harness();
    const payload = snapshot({ water: { ml: 500 } });

    await h.publish(payload);

    expect(h.sendMessage).toHaveBeenCalledTimes(1);
    expect(h.sendMessage).toHaveBeenCalledWith('1', {
      type: 'snapshot',
      v: 1,
      pushedAt: 1_000,
      today: '2026-11-19',
      owner: 'server-1',
      topics: payload.topics,
    });
  });

  test('an unchanged publish sends nothing, even with keys in another order', async () => {
    const h = harness();
    await h.publish(snapshot({ water: { ml: 500 } }));

    const reordered = snapshot({ pushedAt: 2_000, water: { ml: 500 } });
    const { nutrients, energyUnit, ...rest } = reordered.topics.goals;
    reordered.topics.goals = { ...rest, nutrients, energyUnit };
    await h.publish(reordered);

    expect(h.sendMessage).toHaveBeenCalledTimes(1);
  });

  test('one changed topic is sent alone, with the newest envelope', async () => {
    const h = harness();
    await h.publish(snapshot({ water: { ml: 500 } }));

    await h.publish(snapshot({ pushedAt: 2_000, water: { ml: 750 } }));

    expect(h.sendMessage).toHaveBeenCalledTimes(2);
    expect(h.sendMessage).toHaveBeenLastCalledWith(
      '1',
      expect.objectContaining({
        pushedAt: 2_000,
        topics: { water: { ml: 750 } },
      })
    );
  });

  describe('pushedAt refresh', () => {
    const unchanged = (pushedAt: number) =>
      snapshot({ pushedAt, water: { ml: 500 } });

    test('an unchanged snapshot goes out as a bare envelope once its pushedAt is five minutes newer than the watch has', async () => {
      const h = harness();
      await h.publish(unchanged(1_000));

      await h.publish(unchanged(1_000 + GARMIN_PUSHED_AT_REFRESH_MS - 1));
      expect(h.sendMessage).toHaveBeenCalledTimes(1);

      await h.publish(unchanged(1_000 + GARMIN_PUSHED_AT_REFRESH_MS));
      expect(h.sendMessage).toHaveBeenCalledTimes(2);
      expect(h.sendMessage).toHaveBeenLastCalledWith('1', {
        type: 'snapshot',
        v: 1,
        pushedAt: 1_000 + GARMIN_PUSHED_AT_REFRESH_MS,
        today: '2026-11-19',
        owner: 'server-1',
        topics: {},
      });
    });

    test('counts from the last pushedAt the watch confirmed, a changed topic included', async () => {
      const h = harness();
      await h.publish(unchanged(1_000));
      // A change four minutes in carries the newer pushedAt with it.
      await h.publish(
        snapshot({ pushedAt: 1_000 + 240_000, water: { ml: 750 } })
      );

      await h.publish(
        snapshot({
          pushedAt: 1_000 + GARMIN_PUSHED_AT_REFRESH_MS,
          water: { ml: 750 },
        })
      );
      expect(h.sendMessage).toHaveBeenCalledTimes(2);

      await h.publish(
        snapshot({
          pushedAt: 1_000 + 240_000 + GARMIN_PUSHED_AT_REFRESH_MS,
          water: { ml: 750 },
        })
      );
      expect(h.sendMessage).toHaveBeenCalledTimes(3);
      expect(h.sentTopics()[2]).toEqual(['1', []]);
    });

    test('an envelope that did not arrive does not count, so the next publish is in full', async () => {
      const h = harness();
      await h.publish(unchanged(1_000));
      h.sendMessage.mockResolvedValueOnce('notConnected');
      await h.publish(unchanged(1_000 + GARMIN_PUSHED_AT_REFRESH_MS));

      await h.publish(unchanged(2_000 + GARMIN_PUSHED_AT_REFRESH_MS));

      expect(h.sentTopics()).toEqual([
        ['1', ['goals', 'water']],
        ['1', []],
        ['1', ['goals', 'water']],
      ]);
    });
  });

  test('a new owner forgets every record, so the next send is in full', async () => {
    const h = harness([device('1'), device('2')]);
    await h.publish(snapshot({ water: { ml: 500 } }));

    await h.publish(snapshot({ owner: 'server-2', water: { ml: 500 } }));

    expect(h.sentTopics().slice(2)).toEqual([
      ['1', ['goals', 'water']],
      ['2', ['goals', 'water']],
    ]);
    expect(h.sendMessage).toHaveBeenLastCalledWith(
      '2',
      expect.objectContaining({ owner: 'server-2' })
    );
  });

  test('resync sends that watch the latest snapshot in full', async () => {
    const h = harness([device('1'), device('2')]);
    await h.publish(snapshot({ water: { ml: 500 } }));

    await h.sync.resync('2');

    expect(h.sentTopics()).toEqual([
      ['1', ['goals', 'water']],
      ['2', ['goals', 'water']],
      ['2', ['goals', 'water']],
    ]);
  });

  test('resync before any snapshot, with nothing cached, sends accountCleared', async () => {
    const h = harness();

    await h.sync.resync('1');

    // Nothing published and nothing cached is signed out: the watch may still
    // show an account it was away for the clear of.
    expect(h.getCache).toHaveBeenCalledTimes(1);
    expect(h.sendMessage.mock.calls).toEqual([['1', ACCOUNT_CLEARED]]);
  });

  test('signed out while a watch was away, its resync on return empties it', async () => {
    const h = harness([device('1'), device('2', { connected: false })]);
    await h.publish(snapshot());
    await h.sync.clearAccount();

    h.sync.updateStatus({
      state: 'ready',
      devices: [device('1'), device('2')],
    });
    await h.sync.resync('2');

    expect(h.sentTopics()).toEqual([
      ['1', ['goals']],
      ['2', ['accountCleared']],
    ]);
    // Not a record of a snapshot: the first publish after it is in full.
    await h.publish(snapshot({ owner: 'server-2' }));
    expect(h.sentTopics().slice(2)).toEqual([
      ['1', ['goals']],
      ['2', ['goals']],
    ]);
  });

  describe('resync before this runtime has published', () => {
    const cachedMessage: GarminSnapshotMessage = {
      type: 'snapshot',
      v: 1,
      pushedAt: 500,
      today: '2026-11-19',
      owner: 'server-1',
      topics: { goals: goals(900) },
    };

    test("sends the native cache's copy as stored", async () => {
      const h = harness();
      h.getCache.mockResolvedValue(cachedMessage);

      await h.sync.resync('1');

      expect(h.sendMessage).toHaveBeenCalledWith('1', cachedMessage);
    });

    test('the replay is not recorded, so the first publish is in full', async () => {
      const h = harness();
      h.getCache.mockResolvedValue({
        ...cachedMessage,
        topics: { goals: goals(1200) },
      });
      await h.sync.resync('1');

      await h.publish(snapshot());

      expect(h.sentTopics()).toEqual([
        ['1', ['goals']],
        ['1', ['goals']],
      ]);
    });

    test('a publish that lands while the cache is read is sent instead', async () => {
      const h = harness();
      let answer: (message: GarminSnapshotMessage | null) => void = () => {};
      h.getCache.mockReturnValue(
        new Promise<GarminSnapshotMessage | null>((resolve) => {
          answer = resolve;
        })
      );

      const resynced = h.sync.resync('1');
      await flush();
      const published = h.publish(snapshot({ pushedAt: 2_000 }));
      answer(cachedMessage);
      await Promise.all([resynced, published]);

      expect(h.sendMessage).toHaveBeenCalledTimes(1);
      expect(h.sendMessage).toHaveBeenCalledWith(
        '1',
        expect.objectContaining({ pushedAt: 2_000 })
      );
    });

    test('a publish that lands while an empty cache is read is sent instead of accountCleared', async () => {
      const h = harness();
      let answer: (message: GarminSnapshotMessage | null) => void = () => {};
      h.getCache.mockReturnValue(
        new Promise<GarminSnapshotMessage | null>((resolve) => {
          answer = resolve;
        })
      );

      const resynced = h.sync.resync('1');
      await flush();
      const published = h.publish(snapshot({ pushedAt: 2_000 }));
      answer(null);
      await Promise.all([resynced, published]);

      expect(h.sentTopics()).toEqual([['1', ['goals']]]);
    });

    test('a cleared account is not replayed, even mid-read', async () => {
      const h = harness();
      let answer: (message: GarminSnapshotMessage | null) => void = () => {};
      h.getCache.mockReturnValue(
        new Promise<GarminSnapshotMessage | null>((resolve) => {
          answer = resolve;
        })
      );

      const resynced = h.sync.resync('1');
      await flush();
      const cleared = h.sync.clearAccount();
      answer(cachedMessage);
      await Promise.all([resynced, cleared]);

      expect(h.sendMessage).not.toHaveBeenCalled();
    });

    test('reads the cache only after a write queued before it', async () => {
      const h = harness();
      const order: string[] = [];
      h.setCache.mockImplementation(async () => {
        order.push('write');
      });
      h.getCache.mockImplementation(async () => {
        order.push('read');
        return null;
      });

      const cleared = h.sync.clearAccount();
      await h.sync.resync('1');
      await cleared;

      expect(order).toEqual(['write', 'read']);
    });

    test('something that is not a snapshot message is ignored', async () => {
      const h = harness();
      h.getCache.mockResolvedValue({
        type: 'other',
      } as unknown as GarminSnapshotMessage);

      await h.sync.resync('1');

      expect(h.sendMessage).not.toHaveBeenCalled();
    });

    test('a failed read is logged and sends nothing', async () => {
      const h = harness();
      h.getCache.mockRejectedValue(new Error('prefs gone'));

      await h.sync.resync('1');

      expect(h.sendMessage).not.toHaveBeenCalled();
      expect(h.log).toHaveBeenCalledWith(
        'Garmin snapshot cache read failed: Error: prefs gone'
      );
    });

    test('a failed replay is logged; one over the cap too', async () => {
      const h = harness();
      h.getCache.mockResolvedValue(cachedMessage);
      h.sendMessage.mockResolvedValueOnce('failed');
      await h.sync.resync('1');
      expect(h.log).toHaveBeenCalledWith(
        'Garmin snapshot to 1 not delivered: failed'
      );

      h.sendMessage.mockResolvedValueOnce('tooLarge');
      await h.sync.resync('1');
      expect(h.log).toHaveBeenCalledWith(
        'Garmin cached snapshot is too large for 1; not sent'
      );
    });
  });

  test('a snapshot without topics still sends its envelope in full, so the owner arrives', async () => {
    const h = harness();
    const bare: GarminSnapshotPayload = {
      ...snapshot(),
      topics: {} as GarminSnapshotTopics,
    };

    await h.publish(bare);
    // Known to hold nothing for this owner now, so a repeat is not a change.
    await h.publish({ ...bare, pushedAt: 2_000 });
    await h.sync.resync('1');

    expect(h.sendMessage.mock.calls).toEqual([
      ['1', expect.objectContaining({ topics: {}, owner: 'server-1' })],
      ['1', expect.objectContaining({ topics: {}, pushedAt: 2_000 })],
    ]);
  });

  test.each<GarminSendResult>(['notConnected', 'failed'])(
    "a '%s' result forgets the record, so the next send is in full",
    async (result) => {
      const h = harness();
      h.sendMessage.mockResolvedValueOnce(result);
      await h.publish(snapshot({ water: { ml: 500 } }));

      await h.publish(snapshot({ pushedAt: 2_000, water: { ml: 500 } }));

      expect(h.sentTopics()).toEqual([
        ['1', ['goals', 'water']],
        ['1', ['goals', 'water']],
      ]);
    }
  );

  test('only failures other than a watch being away are logged', async () => {
    const h = harness();
    h.sendMessage.mockResolvedValueOnce('notConnected');
    await h.publish(snapshot());
    expect(h.log).not.toHaveBeenCalled();

    h.sendMessage.mockResolvedValueOnce('failed');
    await h.publish(snapshot({ pushedAt: 2_000 }));
    expect(h.log).toHaveBeenCalledWith(
      'Garmin snapshot to 1 not delivered: failed'
    );
  });

  test('a send that throws counts as failed and is logged', async () => {
    const h = harness();
    h.sendMessage.mockRejectedValueOnce(new Error('bridge gone'));

    await expect(h.publish(snapshot())).resolves.toBeUndefined();
    await h.publish(snapshot({ pushedAt: 2_000 }));

    expect(h.log).toHaveBeenCalledWith(
      'Garmin send to 1 threw: Error: bridge gone'
    );
    expect(h.sendMessage).toHaveBeenCalledTimes(2);
  });

  test("'tooLarge' splits the snapshot into one message per topic", async () => {
    const h = harness();
    h.sendMessage.mockResolvedValueOnce('tooLarge');

    await h.publish(snapshot({ water: { ml: 500 } }));
    await h.publish(snapshot({ pushedAt: 2_000, water: { ml: 500 } }));

    expect(h.sentTopics()).toEqual([
      ['1', ['goals', 'water']],
      ['1', ['goals']],
      ['1', ['water']],
    ]);
  });

  test('a single topic over the cap is logged and skipped, not recorded', async () => {
    const h = harness();
    h.sendMessage.mockImplementation((_deviceId, message) =>
      Promise.resolve('water' in message.topics ? 'tooLarge' : 'sent')
    );

    await h.publish(snapshot({ water: { ml: 500 } }));
    await h.publish(snapshot({ pushedAt: 2_000, water: { ml: 500 } }));

    expect(h.sentTopics()).toEqual([
      ['1', ['goals', 'water']],
      ['1', ['goals']],
      ['1', ['water']],
      // `goals` stayed recorded; only `water` is tried again, on its own.
      ['1', ['water']],
    ]);
    expect(h.log).toHaveBeenCalledWith(
      'Garmin topic water is too large for 1; not sent'
    );
    expect(h.log).toHaveBeenCalledTimes(2);
  });

  test('a failure while splitting stops the split and forgets the record', async () => {
    const h = harness();
    h.sendMessage
      .mockResolvedValueOnce('tooLarge')
      .mockResolvedValueOnce('notConnected');

    await h.publish(snapshot({ water: { ml: 500 } }));
    await h.publish(snapshot({ pushedAt: 2_000, water: { ml: 500 } }));

    expect(h.sentTopics()).toEqual([
      ['1', ['goals', 'water']],
      ['1', ['goals']],
      ['1', ['goals', 'water']],
    ]);
  });

  test('a disconnected watch gets nothing', async () => {
    const h = harness([device('away', { connected: false }), device('here')]);

    await h.publish(snapshot());

    expect(h.sentTopics()).toEqual([['here', ['goals']]]);
  });

  test("a connected watch Garmin Connect says lacks the app still gets the send: that answer is wrong for a sideloaded app, so the send's result decides", async () => {
    const h = harness([
      device('noApp', { app: 'notInstalled' }),
      device('maybe', { app: 'unknown' }),
    ]);

    await h.publish(snapshot());

    expect(h.sentTopics()).toEqual([
      ['noApp', ['goals']],
      ['maybe', ['goals']],
    ]);
  });

  test('sends to one watch never overlap, and the second diffs against the first', async () => {
    const h = harness([device('1'), device('2')]);
    const pending: ((result: GarminSendResult) => void)[] = [];
    h.sendMessage.mockImplementation(
      (deviceId) =>
        new Promise<GarminSendResult>((resolve) => {
          if (deviceId === '1') pending.push(resolve);
          else resolve('sent');
        })
    );

    const first = h.publish(snapshot({ water: { ml: 500 } }));
    await flush();
    const second = h.publish(snapshot({ pushedAt: 2_000, water: { ml: 750 } }));
    await flush();

    // Watch 2 is not held up by watch 1's send.
    expect(h.sentTopics()).toEqual([
      ['1', ['goals', 'water']],
      ['2', ['goals', 'water']],
      ['2', ['water']],
    ]);

    pending[0]?.('sent');
    await first;
    await flush();

    expect(h.sentTopics().slice(3)).toEqual([['1', ['water']]]);
    expect(h.sendMessage).toHaveBeenLastCalledWith(
      '1',
      expect.objectContaining({
        pushedAt: 2_000,
        topics: { water: { ml: 750 } },
      })
    );

    pending[1]?.('sent');
    await second;
  });

  test('a send forgotten while in flight does not record its result', async () => {
    const h = harness();
    const pending: ((result: GarminSendResult) => void)[] = [];
    h.sendMessage.mockImplementation(
      () => new Promise<GarminSendResult>((resolve) => pending.push(resolve))
    );

    const published = h.publish(snapshot({ water: { ml: 500 } }));
    await flush();
    const resynced = h.sync.resync('1');
    pending[0]?.('sent');
    await published;
    await flush();

    // The resync still goes out in full after the send it waited for.
    expect(h.sentTopics()).toEqual([
      ['1', ['goals', 'water']],
      ['1', ['goals', 'water']],
    ]);
    pending[1]?.('sent');
    await resynced;
  });

  describe('cache', () => {
    test('gets the full message for a signed-in owner', async () => {
      const h = harness();
      const payload = snapshot({ water: { ml: 500 } });
      await h.publish(payload);

      await h.publish(snapshot({ pushedAt: 2_000, water: { ml: 750 } }));

      expect(h.setCache).toHaveBeenCalledTimes(2);
      expect(h.setCache).toHaveBeenNthCalledWith(1, {
        type: 'snapshot',
        v: 1,
        pushedAt: 1_000,
        today: '2026-11-19',
        owner: 'server-1',
        topics: payload.topics,
      });
      // Every topic, not the changed ones the watch got.
      expect(h.setCache.mock.calls[1]?.[0]?.topics).toEqual(
        snapshot({ water: { ml: 750 } }).topics
      );
    });

    test('is deleted when there is no owner, and nothing is sent', async () => {
      const h = harness();
      await h.publish(snapshot());

      await h.publish(snapshot({ owner: '', pushedAt: 2_000 }));

      expect(h.setCache).toHaveBeenLastCalledWith(null);
      // Signed out: no snapshot carrying the last figures goes out.
      expect(h.sendMessage).toHaveBeenCalledTimes(1);
    });

    test('with no owner, a resync sends accountCleared, never the last figures', async () => {
      const h = harness();
      await h.publish(snapshot());
      await h.publish(snapshot({ owner: '', pushedAt: 2_000 }));

      await h.sync.resync('1');

      expect(h.sentTopics()).toEqual([
        ['1', ['goals']],
        ['1', ['accountCleared']],
      ]);
    });

    test('a failed write is logged and does not stop the sends', async () => {
      const h = harness();
      h.setCache.mockRejectedValueOnce(new Error('disk full'));

      await expect(h.publish(snapshot())).resolves.toBeUndefined();

      expect(h.sendMessage).toHaveBeenCalledTimes(1);
      expect(h.log).toHaveBeenCalledWith(
        'Garmin snapshot cache write failed: Error: disk full'
      );
    });

    test('writes run in order, so an older snapshot cannot land last', async () => {
      const h = harness();
      const written: (number | null)[] = [];
      let release: () => void = () => {};
      h.setCache.mockImplementationOnce(
        (message) =>
          new Promise<void>((resolve) => {
            release = () => {
              written.push(message?.pushedAt ?? null);
              resolve();
            };
          })
      );
      h.setCache.mockImplementation((message) => {
        written.push(message?.pushedAt ?? null);
        return Promise.resolve();
      });

      const first = h.publish(snapshot());
      const second = h.publish(snapshot({ pushedAt: 2_000 }));
      await flush();
      expect(written).toEqual([]);
      release();
      await Promise.all([first, second]);

      expect(written).toEqual([1_000, 2_000]);
    });
  });

  describe('devices', () => {
    test('an unknown link is started once before the first send', async () => {
      const h = harness(null);
      h.start.mockResolvedValue({ state: 'ready', devices: [device('7')] });

      await Promise.all([
        h.publish(snapshot()),
        h.publish(snapshot({ pushedAt: 2_000 })),
      ]);
      await h.publish(snapshot({ pushedAt: 3_000, goals: goals(1500) }));

      expect(h.start).toHaveBeenCalledTimes(1);
      expect(h.getStatus).not.toHaveBeenCalled();
      expect(h.sentTopics()).toEqual([
        ['7', ['goals']],
        ['7', ['goals']],
      ]);
    });

    test('a link that is not ready is started again on the next publish', async () => {
      // Garmin Connect installed after the first start, which answered
      // 'unavailable' with no watches.
      const h = harness(null);
      h.start.mockResolvedValueOnce({ state: 'unavailable', devices: [] });
      await h.publish(snapshot());
      expect(h.sendMessage).not.toHaveBeenCalled();

      h.start.mockResolvedValueOnce({ state: 'ready', devices: [device('7')] });
      await h.publish(snapshot({ pushedAt: 2_000 }));

      expect(h.start).toHaveBeenCalledTimes(2);
      expect(h.sentTopics()).toEqual([['7', ['goals']]]);
    });

    test('a failed start is logged and sends nothing yet', async () => {
      const h = harness(null);
      h.start.mockRejectedValueOnce(new Error('no service'));

      await h.publish(snapshot());

      expect(h.sendMessage).not.toHaveBeenCalled();
      expect(h.log).toHaveBeenCalledWith(
        'Garmin start failed: Error: no service'
      );
    });

    test('a failed status read is logged', async () => {
      const h = harness();
      h.getStatus.mockRejectedValueOnce(new Error('no service'));

      await h.sync.refreshDevices();

      expect(h.log).toHaveBeenCalledWith(
        'Garmin status failed: Error: no service'
      );
    });

    test('start takes the watches the native side reports', async () => {
      const h = harness(null);
      h.start.mockResolvedValue({ state: 'ready', devices: [device('5')] });

      await h.sync.start();
      await h.publish(snapshot());

      expect(h.start).toHaveBeenCalledTimes(1);
      expect(h.sentTopics()).toEqual([['5', ['goals']]]);
    });

    test('a status answer older than an event is dropped', async () => {
      const h = harness(null);
      let answer: (status: GarminStatus) => void = () => {};
      h.getStatus.mockReturnValue(
        new Promise<GarminStatus>((resolve) => {
          answer = resolve;
        })
      );

      const refreshed = h.sync.refreshDevices();
      h.sync.updateStatus({ state: 'ready', devices: [device('new')] });
      answer({ state: 'ready', devices: [device('old')] });
      await refreshed;
      await h.publish(snapshot());

      expect(h.sentTopics()).toEqual([['new', ['goals']]]);
    });

    test('a watch that disconnects is forgotten, so it gets everything back', async () => {
      const h = harness();
      await h.publish(snapshot({ water: { ml: 500 } }));

      h.sync.updateStatus({
        state: 'ready',
        devices: [device('1', { connected: false })],
      });
      h.sync.updateStatus({ state: 'ready', devices: [device('1')] });
      await h.publish(snapshot({ pushedAt: 2_000, water: { ml: 500 } }));

      expect(h.sentTopics()).toEqual([
        ['1', ['goals', 'water']],
        ['1', ['goals', 'water']],
      ]);
    });

    test('a freshly installed app gets the latest snapshot in full', async () => {
      const h = harness([device('1', { app: 'notInstalled' })]);
      await h.publish(snapshot({ water: { ml: 500 } }));

      h.sync.updateStatus({
        state: 'ready',
        devices: [device('1', { app: 'installed' })],
      });
      await flush();

      // Its storage starts empty, whatever reached the watch before.
      expect(h.sentTopics()).toEqual([
        ['1', ['goals', 'water']],
        ['1', ['goals', 'water']],
      ]);
    });

    test('a malformed status means no link and no watches, so the next publish starts it again', async () => {
      const h = harness();
      h.sync.updateStatus(null as unknown as GarminStatus);
      h.start.mockResolvedValue({ state: 'starting', devices: [] });

      await h.publish(snapshot());

      expect(h.start).toHaveBeenCalledTimes(1);
      expect(h.sendMessage).not.toHaveBeenCalled();
    });

    test('forgetAll makes the next send full', async () => {
      const h = harness();
      await h.publish(snapshot({ water: { ml: 500 } }));

      h.sync.forgetAll();
      await h.publish(snapshot({ pushedAt: 2_000, water: { ml: 500 } }));

      expect(h.sentTopics()).toEqual([
        ['1', ['goals', 'water']],
        ['1', ['goals', 'water']],
      ]);
    });
  });

  describe('clearAccount', () => {
    test('forgets the latest snapshot and deletes the cache', async () => {
      const h = harness();
      await h.publish(snapshot());

      await h.sync.clearAccount();
      await h.sync.resync('1');

      expect(h.setCache).toHaveBeenLastCalledWith(null);
      // A resync then has nothing of the account to send.
      expect(h.sentTopics()).toEqual([
        ['1', ['goals']],
        ['1', ['accountCleared']],
      ]);
    });

    test('a snapshot built before it is dropped, even for the same owner', async () => {
      const h = harness();
      await h.publish(snapshot());
      const epoch = h.sync.accountEpoch();

      await h.sync.clearAccount();
      // A push that started building before the clear finishes after it.
      await h.sync.publish(snapshot({ pushedAt: 2_000 }), epoch);

      expect(h.sync.accountEpoch()).toBe(epoch + 1);
      expect(h.setCache).toHaveBeenLastCalledWith(null);
      expect(h.sendMessage).toHaveBeenCalledTimes(1);

      // One built after it goes out, in full.
      await h.sync.publish(
        snapshot({ pushedAt: 3_000 }),
        h.sync.accountEpoch()
      );
      expect(h.sentTopics()).toEqual([
        ['1', ['goals']],
        ['1', ['goals']],
      ]);
    });

    test('the next publish is sent in full, even for the same owner', async () => {
      const h = harness();
      await h.publish(snapshot({ water: { ml: 500 } }));

      await h.sync.clearAccount();
      await h.publish(snapshot({ pushedAt: 2_000, water: { ml: 500 } }));

      expect(h.sentTopics()).toEqual([
        ['1', ['goals', 'water']],
        ['1', ['goals', 'water']],
      ]);
    });

    test('a send in flight records nothing, and its failure is not logged', async () => {
      const h = harness();
      let answer: (result: GarminSendResult) => void = () => {};
      h.sendMessage.mockReturnValueOnce(
        new Promise<GarminSendResult>((resolve) => {
          answer = resolve;
        })
      );
      const published = h.publish(snapshot());
      await flush();

      const cleared = h.sync.clearAccount();
      // The native clear answers the queued send 'failed'.
      answer('failed');
      await Promise.all([published, cleared]);

      expect(h.log).not.toHaveBeenCalled();
    });

    test('a send queued behind it sends nothing', async () => {
      const h = harness();
      let answer: (result: GarminSendResult) => void = () => {};
      h.sendMessage.mockReturnValueOnce(
        new Promise<GarminSendResult>((resolve) => {
          answer = resolve;
        })
      );
      const first = h.publish(snapshot());
      const second = h.publish(snapshot({ pushedAt: 2_000 }));
      await flush();

      const cleared = h.sync.clearAccount();
      answer('sent');
      await Promise.all([first, second, cleared]);

      expect(h.sendMessage).toHaveBeenCalledTimes(1);
    });
  });
});

// One shared sync per runtime, so these run in order.
describe('getGarminSync and clearGarminAccount', () => {
  const watch = (
    jest.requireMock('../../modules/watch-connectivity') as {
      default: {
        isGarminAvailable: jest.Mock;
        sendGarminMessage?: jest.Mock;
        setGarminSnapshotCache?: jest.Mock;
        getGarminSnapshotCache: jest.Mock;
        clearGarminAccount?: jest.Mock;
        startGarmin: jest.Mock;
        garminStatus: jest.Mock;
      };
    }
  ).default;
  const enabled = isGarminWatchEnabled as jest.MockedFunction<
    typeof isGarminWatchEnabled
  >;

  beforeEach(() => {
    jest.clearAllMocks();
    enabled.mockReturnValue(true);
  });

  test('clearGarminAccount before any sync clears natively, and copes without the method', async () => {
    // No sync yet, so no epoch a push could carry.
    expect(garminAccountEpoch()).toBeNull();
    await clearGarminAccount();
    expect(watch.clearGarminAccount).toHaveBeenCalledTimes(1);

    const clear = watch.clearGarminAccount;
    delete watch.clearGarminAccount;
    await expect(clearGarminAccount()).resolves.toBeUndefined();
    watch.clearGarminAccount = clear;
  });

  test('is null where this install does not use Garmin, even with Garmin Connect', () => {
    // A release build before the watch app is published, or iOS.
    enabled.mockReturnValue(false);
    watch.isGarminAvailable.mockReturnValue(true);

    expect(getGarminSync()).toBeNull();
  });

  test('is null without the send methods, else one shared sync that starts the link', async () => {
    const send = watch.sendGarminMessage;
    delete watch.sendGarminMessage;
    expect(getGarminSync()).toBeNull();
    watch.sendGarminMessage = send;

    const sync = getGarminSync();
    expect(sync).not.toBeNull();
    expect(getGarminSync()).toBe(sync);

    watch.startGarmin.mockResolvedValue({
      state: 'ready',
      devices: [device('9')],
    });
    expect(garminAccountEpoch()).toBe(0);
    await sync?.publish(snapshot(), 0);

    expect(watch.startGarmin).toHaveBeenCalledTimes(1);
    expect(watch.setGarminSnapshotCache).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'snapshot', owner: 'server-1' })
    );
    expect(watch.sendGarminMessage).toHaveBeenCalledWith(
      '9',
      expect.objectContaining({ type: 'snapshot', v: 1 })
    );
    expect(addLog).not.toHaveBeenCalled();
  });

  test('clearGarminAccount also makes the shared sync forget the account', async () => {
    const sync = getGarminSync();

    await clearGarminAccount();
    await sync?.resync('9');

    expect(watch.clearGarminAccount).toHaveBeenCalledTimes(1);
    expect(watch.setGarminSnapshotCache).toHaveBeenLastCalledWith(null);
    // A push built before the clear is turned away.
    expect(garminAccountEpoch()).toBe(1);
    // Nothing of the cleared account is sent again: the cache read comes
    // back empty, so the watch is told to drop it.
    expect(watch.getGarminSnapshotCache).toHaveBeenCalledTimes(1);
    expect(watch.sendGarminMessage?.mock.calls).toEqual([
      ['9', { type: 'accountCleared', v: 1 }],
    ]);
  });

  test('a module without the cache read never empties a watch on resync', async () => {
    const sync = getGarminSync();
    const read = watch.getGarminSnapshotCache;
    // An older native build: nothing says the phone is signed out.
    delete (watch as { getGarminSnapshotCache?: jest.Mock })
      .getGarminSnapshotCache;

    await sync?.resync('9');

    expect(watch.sendGarminMessage).not.toHaveBeenCalled();
    expect(addLog).toHaveBeenCalledWith(
      expect.stringContaining('Garmin snapshot cache read failed'),
      'WARNING'
    );
    watch.getGarminSnapshotCache = read;
  });

  test('a sync created where the flag is off later is not used while it is off', () => {
    enabled.mockReturnValue(false);

    expect(getGarminSync()).toBeNull();
  });
});
