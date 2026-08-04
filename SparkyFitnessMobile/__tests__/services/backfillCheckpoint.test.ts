import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  loadBackfillCheckpoint,
  saveBackfillCheckpoint,
  clearBackfillCheckpoint,
  type BackfillCheckpoint,
} from '../../src/services/backfillCheckpoint';

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const checkpoint = (overrides: Partial<BackfillCheckpoint> = {}): BackfillCheckpoint => ({
  version: 1,
  status: 'in-progress',
  endEdge: '2026-08-03T04:00:00.000Z',
  cursor: '2026-07-04T04:00:00.000Z',
  floor: '2026-06-20T04:00:00.000Z',
  earliestByRecordType: { Steps: '2026-06-20T10:00:00.000Z', Weight: null },
  enabledRecordTypes: ['Steps', 'Weight'],
  recordsUploaded: 120,
  startedAt: '2026-08-03T15:00:00.000Z',
  updatedAt: '2026-08-03T15:05:00.000Z',
  ...overrides,
});

describe('backfillCheckpoint', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  test('round-trips a checkpoint through storage', async () => {
    const cp = checkpoint();
    await saveBackfillCheckpoint('server-1', cp);

    await expect(loadBackfillCheckpoint('server-1')).resolves.toEqual(cp);
  });

  test('keys checkpoints per server config', async () => {
    await saveBackfillCheckpoint('server-1', checkpoint({ recordsUploaded: 1 }));
    await saveBackfillCheckpoint('server-2', checkpoint({ recordsUploaded: 2 }));

    const first = await loadBackfillCheckpoint('server-1');
    const second = await loadBackfillCheckpoint('server-2');

    expect(first?.recordsUploaded).toBe(1);
    expect(second?.recordsUploaded).toBe(2);
  });

  test('returns null when nothing is stored', async () => {
    await expect(loadBackfillCheckpoint('server-1')).resolves.toBeNull();
  });

  test('returns null (fresh start) for corrupt JSON', async () => {
    await AsyncStorage.setItem('@Backfill:state:server-1', 'not json {');

    await expect(loadBackfillCheckpoint('server-1')).resolves.toBeNull();
  });

  test('returns null for a blob missing the version marker', async () => {
    await AsyncStorage.setItem('@Backfill:state:server-1', JSON.stringify({ cursor: 'x' }));

    await expect(loadBackfillCheckpoint('server-1')).resolves.toBeNull();
  });

  test('clear swallows storage failures instead of rejecting', async () => {
    jest.spyOn(AsyncStorage, 'removeItem').mockRejectedValueOnce(new Error('disk full'));

    await expect(clearBackfillCheckpoint('server-1')).resolves.toBeUndefined();
  });

  test('clear removes only the given config checkpoint', async () => {
    await saveBackfillCheckpoint('server-1', checkpoint());
    await saveBackfillCheckpoint('server-2', checkpoint());

    await clearBackfillCheckpoint('server-1');

    await expect(loadBackfillCheckpoint('server-1')).resolves.toBeNull();
    await expect(loadBackfillCheckpoint('server-2')).resolves.not.toBeNull();
  });
});
