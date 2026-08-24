import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  MAX_ENRICHED_SESSION_KEYS,
  _resetEnrichedSessionCacheForTests,
  clearEnrichedSessions,
  hasEnrichedSession,
  markEnrichedSessions,
  sessionTelemetryKey,
} from '../../../src/services/shared/enrichedSessionCache';
import { getActiveServerConfigId } from '../../../src/services/storage';

jest.mock('../../../src/services/storage', () => ({
  getActiveServerConfigId: jest.fn(),
}));

const mockActiveConfig = getActiveServerConfigId as jest.Mock;
const keyFor = (scope: string) => `@SparkyFitness/enrichedSessions:${scope}`;

describe('enrichedSessionCache', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    _resetEnrichedSessionCacheForTests();
    mockActiveConfig.mockResolvedValue('server-a');
  });

  describe('sessionTelemetryKey', () => {
    it('folds the change marker in, so an edited record is re-collected', () => {
      expect(sessionTelemetryKey('rec-1', '2026-08-01T00:00:00Z')).not.toBe(
        sessionTelemetryKey('rec-1', '2026-08-02T00:00:00Z'),
      );
    });

    it('is null without a stable identity', () => {
      expect(sessionTelemetryKey(undefined, 'marker')).toBeNull();
      expect(sessionTelemetryKey('', 'marker')).toBeNull();
    });
  });

  describe('per-server scoping', () => {
    it('does not let one server\'s keys suppress collection for another', async () => {
      await markEnrichedSessions(['rec-1:m']);
      expect(await hasEnrichedSession('rec-1:m')).toBe(true);

      // The user switches to a second server. That server has never received
      // this session's telemetry, so it must be collected again — otherwise it
      // only ever gets the summary, with no window that re-covers it.
      mockActiveConfig.mockResolvedValue('server-b');
      expect(await hasEnrichedSession('rec-1:m')).toBe(false);

      // Switching back still sees the original server's entry.
      mockActiveConfig.mockResolvedValue('server-a');
      expect(await hasEnrichedSession('rec-1:m')).toBe(true);
    });

    it('writes under the active config key', async () => {
      await markEnrichedSessions(['rec-1:m']);
      expect(await AsyncStorage.getItem(keyFor('server-a'))).toContain('rec-1:m');
    });

    it('never reads the unscoped key this cache first shipped with', async () => {
      await AsyncStorage.setItem(
        '@SparkyFitness/enrichedSessions',
        JSON.stringify(['legacy:m']),
      );

      // A legacy entry means "some server has it", which is exactly the
      // ambiguity scoping removes — re-collecting is the safe direction.
      expect(await hasEnrichedSession('legacy:m')).toBe(false);
      expect(await AsyncStorage.getItem('@SparkyFitness/enrichedSessions')).toBeNull();
    });

    it('falls back to an unscoped bucket when no server is configured', async () => {
      mockActiveConfig.mockResolvedValue(null);
      await markEnrichedSessions(['rec-1:m']);
      expect(await AsyncStorage.getItem(keyFor('none'))).toContain('rec-1:m');
    });

    it('treats a failed config lookup as a miss rather than another server\'s hit', async () => {
      await markEnrichedSessions(['rec-1:m']);
      _resetEnrichedSessionCacheForTests();
      mockActiveConfig.mockRejectedValue(new Error('storage unavailable'));

      expect(await hasEnrichedSession('rec-1:m')).toBe(false);
    });
  });

  describe('concurrent commits', () => {
    it('does not lose a run\'s keys to an overlapping run', async () => {
      // Foreground and background runs are not mutually exclusive. Both read
      // the cache, then both write — an unserialised merge computes from a
      // stale base and discards the other run's keys.
      await Promise.all([
        markEnrichedSessions(['run-a:m']),
        markEnrichedSessions(['run-b:m']),
      ]);

      expect(await hasEnrichedSession('run-a:m')).toBe(true);
      expect(await hasEnrichedSession('run-b:m')).toBe(true);

      _resetEnrichedSessionCacheForTests();
      expect(await hasEnrichedSession('run-a:m')).toBe(true);
      expect(await hasEnrichedSession('run-b:m')).toBe(true);
    });

    it('keeps committing after one commit fails', async () => {
      const setItem = jest
        .spyOn(AsyncStorage, 'setItem')
        .mockRejectedValueOnce(new Error('disk full'));

      await markEnrichedSessions(['run-a:m']);
      await markEnrichedSessions(['run-b:m']);

      expect(await hasEnrichedSession('run-b:m')).toBe(true);
      setItem.mockRestore();
    });
  });

  describe('eviction', () => {
    it('keeps the most recently confirmed keys', async () => {
      const keys = Array.from({ length: MAX_ENRICHED_SESSION_KEYS + 10 }, (_, i) => `rec-${i}:m`);
      await markEnrichedSessions(keys);

      expect(await hasEnrichedSession('rec-0:m')).toBe(false);
      expect(await hasEnrichedSession(`rec-${MAX_ENRICHED_SESSION_KEYS + 9}:m`)).toBe(true);
    });

    it('re-adding an existing key moves it to the newest end', async () => {
      await markEnrichedSessions(['keep:m']);
      await markEnrichedSessions(
        Array.from({ length: MAX_ENRICHED_SESSION_KEYS - 1 }, (_, i) => `rec-${i}:m`),
      );
      await markEnrichedSessions(['keep:m']);
      await markEnrichedSessions(['newest:m']);

      expect(await hasEnrichedSession('keep:m')).toBe(true);
    });
  });

  it('clearEnrichedSessions drops the active scope', async () => {
    await markEnrichedSessions(['rec-1:m']);
    await clearEnrichedSessions();

    expect(await hasEnrichedSession('rec-1:m')).toBe(false);
    expect(await AsyncStorage.getItem(keyFor('server-a'))).toBeNull();
  });
});
