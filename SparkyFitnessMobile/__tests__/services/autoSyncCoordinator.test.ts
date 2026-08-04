import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  tryClaimAutoSync,
  isSyncClaimed,
  subscribeSyncClaimed,
  setForegroundAutoSyncWindowOpen,
  isForegroundAutoSyncWindowOpen,
  shouldRunForegroundResumeAutoSync,
  recordAutoSyncTime,
  markSyncInFlight,
  isSyncInFlight,
} from '../../src/services/autoSyncCoordinator';

const CONFIG_ID = 'config-1';
const STORAGE_KEY = `@AutoSync:lastAutoSyncAt:${CONFIG_ID}`;
const COOLDOWN_MS = 5 * 60 * 1000;

describe('autoSyncCoordinator', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    // Reset the shared in-memory flags so each test starts clean.
    tryClaimAutoSync()?.();
    setForegroundAutoSyncWindowOpen(false);
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('tryClaimAutoSync', () => {
    it('grants the first claim and reports the lock as held', () => {
      const release = tryClaimAutoSync();

      expect(release).toBeInstanceOf(Function);
      expect(isSyncClaimed()).toBe(true);

      release!();
      expect(isSyncClaimed()).toBe(false);
    });

    it('refuses a second claim while one is held', () => {
      const release = tryClaimAutoSync();

      expect(tryClaimAutoSync()).toBeNull();
      expect(isSyncClaimed()).toBe(true);

      release!();
    });

    it('allows a fresh claim once the previous one is released', () => {
      tryClaimAutoSync()!();

      const second = tryClaimAutoSync();
      expect(second).toBeInstanceOf(Function);
      second!();
    });

    it('release is idempotent and never frees a later claim', () => {
      const releaseFirst = tryClaimAutoSync();
      releaseFirst!();

      // A new owner claims the lock...
      const releaseSecond = tryClaimAutoSync();
      expect(releaseSecond).toBeInstanceOf(Function);

      // ...calling the stale first release again must NOT release the second owner.
      releaseFirst!();
      expect(isSyncClaimed()).toBe(true);

      releaseSecond!();
      expect(isSyncClaimed()).toBe(false);
    });
  });

  describe('subscribeSyncClaimed', () => {
    it('notifies on claim and on release', () => {
      const listener = jest.fn();
      const unsubscribe = subscribeSyncClaimed(listener);

      const release = tryClaimAutoSync();
      expect(listener).toHaveBeenCalledTimes(1);

      release!();
      expect(listener).toHaveBeenCalledTimes(2);

      unsubscribe();
    });

    it('does not notify for a refused claim or a repeated release', () => {
      const release = tryClaimAutoSync();
      const listener = jest.fn();
      const unsubscribe = subscribeSyncClaimed(listener);

      expect(tryClaimAutoSync()).toBeNull();
      expect(listener).not.toHaveBeenCalled();

      release!();
      release!();
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
    });

    it('stops notifying after unsubscribe', () => {
      const listener = jest.fn();
      const unsubscribe = subscribeSyncClaimed(listener);
      unsubscribe();

      tryClaimAutoSync()?.();

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('sync in-flight marker', () => {
    it('counts overlapping syncs and clears once all settle', () => {
      expect(isSyncInFlight()).toBe(false);

      const doneFirst = markSyncInFlight();
      const doneSecond = markSyncInFlight();
      expect(isSyncInFlight()).toBe(true);

      doneFirst();
      expect(isSyncInFlight()).toBe(true);

      doneSecond();
      expect(isSyncInFlight()).toBe(false);
    });

    it('done() is idempotent and never uncounts another sync', () => {
      const doneFirst = markSyncInFlight();
      const doneSecond = markSyncInFlight();

      doneFirst();
      doneFirst();
      expect(isSyncInFlight()).toBe(true);

      doneSecond();
      expect(isSyncInFlight()).toBe(false);
    });
  });

  describe('foreground auto-sync window', () => {
    it('round-trips the open flag', () => {
      expect(isForegroundAutoSyncWindowOpen()).toBe(false);

      setForegroundAutoSyncWindowOpen(true);
      expect(isForegroundAutoSyncWindowOpen()).toBe(true);

      setForegroundAutoSyncWindowOpen(false);
      expect(isForegroundAutoSyncWindowOpen()).toBe(false);
    });
  });

  describe('shouldRunForegroundResumeAutoSync', () => {
    it('returns true when there is no recorded sync time', async () => {
      await expect(shouldRunForegroundResumeAutoSync(CONFIG_ID)).resolves.toBe(true);
    });

    it('returns true when the stored value is not a number', async () => {
      await AsyncStorage.setItem(STORAGE_KEY, 'not-a-timestamp');
      await expect(shouldRunForegroundResumeAutoSync(CONFIG_ID)).resolves.toBe(true);
    });

    it('returns false while still inside the cooldown window', async () => {
      await AsyncStorage.setItem(STORAGE_KEY, String(Date.now() - 1000));
      await expect(shouldRunForegroundResumeAutoSync(CONFIG_ID)).resolves.toBe(false);
    });

    it('returns true once the cooldown window has elapsed', async () => {
      await AsyncStorage.setItem(STORAGE_KEY, String(Date.now() - COOLDOWN_MS - 1000));
      await expect(shouldRunForegroundResumeAutoSync(CONFIG_ID)).resolves.toBe(true);
    });

    it('treats the exact cooldown boundary as elapsed (inclusive)', async () => {
      // Stored exactly COOLDOWN_MS ago; the real clock only advances, so the
      // gap is >= COOLDOWN_MS and the inclusive `>=` comparison passes.
      await AsyncStorage.setItem(STORAGE_KEY, String(Date.now() - COOLDOWN_MS));
      await expect(shouldRunForegroundResumeAutoSync(CONFIG_ID)).resolves.toBe(true);
    });

    it('keys the cooldown per config id', async () => {
      await AsyncStorage.setItem(STORAGE_KEY, String(Date.now() - 1000));

      // A different config has no recorded time, so it is not gated.
      await expect(shouldRunForegroundResumeAutoSync('config-2')).resolves.toBe(true);
      await expect(shouldRunForegroundResumeAutoSync(CONFIG_ID)).resolves.toBe(false);
    });

    it('fails open (returns true) when reading storage throws', async () => {
      jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('boom'));
      await expect(shouldRunForegroundResumeAutoSync(CONFIG_ID)).resolves.toBe(true);
    });
  });

  describe('recordAutoSyncTime', () => {
    it('persists the current time under the per-config key', async () => {
      const before = Date.now();
      await recordAutoSyncTime(CONFIG_ID);
      const after = Date.now();

      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      expect(stored).not.toBeNull();
      const recorded = Number.parseInt(stored as string, 10);
      expect(recorded).toBeGreaterThanOrEqual(before);
      expect(recorded).toBeLessThanOrEqual(after);
    });

    it('a recorded time then gates the foreground resume sync', async () => {
      await recordAutoSyncTime(CONFIG_ID);
      await expect(shouldRunForegroundResumeAutoSync(CONFIG_ID)).resolves.toBe(false);
    });

    it('swallows storage write errors', async () => {
      jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'));
      await expect(recordAutoSyncTime(CONFIG_ID)).resolves.toBeUndefined();
    });
  });
});
