import * as Network from 'expo-network';
import { File } from 'expo-file-system';
import { putCacheRows } from '../../src/offline/cacheStore';
import { CACHE_COLLECTIONS } from '../../src/offline/collections';
import { __setOfflineDbForTests } from '../../src/offline/db';
import { localImageUri } from '../../src/offline/localImageIndex';
import {
  OFFLINE_IMAGE_CAP_BYTES,
  clearOfflineImages,
  listKeptExercises,
  offlineImageBytes,
  refreshOfflineImages,
  setExercisesKeptOffline,
  wantedExercises,
} from '../../src/offline/offlineImages';
import type { OfflineDb } from '../../src/offline/types';
import { useAppPreferencesStore } from '../../src/stores/appPreferencesStore';
import { createTestDb } from '../helpers/offlineTestDb';

jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/services/storage', () => ({
  ...jest.requireActual('../../src/services/storage'),
  getActiveServerConfig: jest.fn(async () => ({
    id: 's1',
    url: 'https://sparky.example',
  })),
  getActiveServerConfigId: jest.fn(async () => 's1'),
}));
jest.mock('expo-network', () => ({
  getNetworkStateAsync: jest.fn(),
  NetworkStateType: {
    WIFI: 'WIFI',
    ETHERNET: 'ETHERNET',
    CELLULAR: 'CELLULAR',
  },
}));
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: jest.fn(async (_algorithm: string, text: string) =>
    Buffer.from(text).toString('hex').slice(-16)
  ),
}));

// A small in-memory stand-in for the phone's file system.
const mockFiles = new Map<string, number>();
jest.mock('expo-file-system', () => {
  const join = (...parts: unknown[]) =>
    parts
      .map((part) =>
        typeof part === 'string' ? part : (part as { uri: string }).uri
      )
      .join('/');
  class MockDirectory {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(...parts);
    }
    get exists() {
      return true;
    }
    create() {}
  }
  class MockFile {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(...parts);
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    get size() {
      return mockFiles.get(this.uri) ?? null;
    }
    delete() {
      mockFiles.delete(this.uri);
    }
    static downloadFileAsync = jest.fn(
      async (_url: string, destination: MockFile) => {
        mockFiles.set(destination.uri, 1000);
        return destination;
      }
    );
  }
  return {
    File: MockFile,
    Directory: MockDirectory,
    Paths: { cache: { uri: 'file://cache' } },
  };
});

const mockNetwork = Network.getNetworkStateAsync as jest.Mock;
const mockDownload = (File as unknown as { downloadFileAsync: jest.Mock })
  .downloadFileAsync;

const EX_PLAN = 'ex-plan';
const EX_PRESET = 'ex-preset';
const EX_KEPT = 'ex-kept';

async function seed(db: OfflineDb, today: string) {
  await putCacheRows(db, 's1', CACHE_COLLECTIONS.exercise, [
    { key: EX_PLAN, payload: { id: EX_PLAN, images: ['plan.png'] } },
    { key: EX_PRESET, payload: { id: EX_PRESET, images: ['preset.jpg'] } },
    { key: EX_KEPT, payload: { id: EX_KEPT, images: ['kept.gif'] } },
  ]);
  await putCacheRows(db, 's1', CACHE_COLLECTIONS.workoutPreset, [
    { key: '7', payload: { id: 7, exercises: [{ exercise_id: EX_PRESET }] } },
  ]);
  await putCacheRows(db, 's1', CACHE_COLLECTIONS.planDay, [
    {
      key: today,
      payload: [{ assignments: [{ exercise_id: EX_PLAN }] }],
    },
  ]);
}

describe('exercise pictures kept offline', () => {
  let db: OfflineDb & { close(): void };
  const today = '2026-11-17';

  beforeEach(async () => {
    jest.clearAllMocks();
    mockFiles.clear();
    db = await createTestDb();
    __setOfflineDbForTests(db);
    useAppPreferencesStore.setState({ offlinePicturesOnMobileData: false });
    mockNetwork.mockResolvedValue({ type: 'WIFI', isConnected: true });
  });

  afterEach(() => {
    __setOfflineDbForTests(null);
    db.close();
  });

  it('wants picked exercises, then the plan, then saved workouts', async () => {
    await seed(db, today);
    await setExercisesKeptOffline('s1', [EX_KEPT, EX_PRESET], true);

    const wanted = await wantedExercises(db, 's1', today);

    expect(Object.fromEntries(wanted)).toEqual({
      [EX_KEPT]: 'manual',
      [EX_PRESET]: 'manual',
      [EX_PLAN]: 'plan',
    });
    expect(await listKeptExercises(db, 's1')).toEqual(
      new Set([EX_KEPT, EX_PRESET])
    );
  });

  it('downloads on Wi-Fi and is then used in place of the server address', async () => {
    jest.useFakeTimers({ now: new Date(`${today}T12:00:00`) });
    await seed(db, today);

    await refreshOfflineImages();

    expect(mockDownload).toHaveBeenCalledTimes(2);
    expect(await offlineImageBytes('s1')).toBe(2000);
    const remote = 'https://sparky.example/api/uploads/exercises/plan.png';
    expect(localImageUri('s1', remote)).toMatch(
      /^file:\/\/cache\/offline-images\/s1\//
    );
    jest.useRealTimers();
  });

  it('does not download on mobile data unless allowed', async () => {
    await seed(db, today);
    mockNetwork.mockResolvedValue({ type: 'CELLULAR', isConnected: true });

    await refreshOfflineImages();
    expect(mockDownload).not.toHaveBeenCalled();

    useAppPreferencesStore.setState({ offlinePicturesOnMobileData: true });
    await refreshOfflineImages();
    expect(mockDownload).toHaveBeenCalled();
  });

  it('removes pictures no longer wanted, but keeps the picked ones', async () => {
    await seed(db, today);
    await setExercisesKeptOffline('s1', [EX_KEPT], true);
    await refreshOfflineImages();
    const before = await offlineImageBytes('s1');

    // The saved workout is gone from the server.
    await db.run(`DELETE FROM cache WHERE collection = ?`, [
      CACHE_COLLECTIONS.workoutPreset,
    ]);
    await refreshOfflineImages();

    expect(await offlineImageBytes('s1')).toBe(before - 1000);
    const kept = 'https://sparky.example/api/uploads/exercises/kept.gif';
    expect(localImageUri('s1', kept)).not.toBeNull();
  });

  it('stops downloading at the space cap', async () => {
    await seed(db, today);
    await db.run(
      `INSERT INTO offline_image (server_config_id, source_uri, file_path, bytes, reason, exercise_id, last_used_at)
       VALUES ('s1', 'x', 'file://x', ?, 'manual', ?, 1)`,
      [OFFLINE_IMAGE_CAP_BYTES, EX_KEPT]
    );
    await setExercisesKeptOffline('s1', [EX_KEPT], true);

    await refreshOfflineImages();

    expect(mockDownload).not.toHaveBeenCalled();
  });

  it('treats a picture the system cleared as not saved', async () => {
    await seed(db, today);
    await refreshOfflineImages();
    const remote = 'https://sparky.example/api/uploads/exercises/preset.jpg';
    const file = localImageUri('s1', remote)!;

    mockFiles.delete(file);

    expect(localImageUri('s1', remote)).toBeNull();
  });

  it('clears every picture of a server, files included', async () => {
    await seed(db, today);
    await refreshOfflineImages();

    await clearOfflineImages('s1');

    expect(await offlineImageBytes('s1')).toBe(0);
    expect(mockFiles.size).toBe(0);
  });
});
