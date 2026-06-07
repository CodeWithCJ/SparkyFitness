import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  WHATS_NEW_CONTENT_VERSION,
  getLastSeenWhatsNewVersion,
  markCurrentVersionSeen,
  markWhatsNewVersionSeen,
} from '../../src/services/whatsNewBanner';

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

describe('whatsNewBanner', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  test('getLastSeenWhatsNewVersion returns null before mark', async () => {
    await expect(getLastSeenWhatsNewVersion()).resolves.toBeNull();
  });

  test('markWhatsNewVersionSeen persists, getLastSeen returns the version', async () => {
    await markWhatsNewVersionSeen('1.4.0');
    await expect(getLastSeenWhatsNewVersion()).resolves.toBe('1.4.0');
  });

  test('markWhatsNewVersionSeen overwrites previous value', async () => {
    await markWhatsNewVersionSeen('1.4.0');
    await markWhatsNewVersionSeen('1.5.0');
    await expect(getLastSeenWhatsNewVersion()).resolves.toBe('1.5.0');
  });

  test('storage key matches namespaced format', async () => {
    await markWhatsNewVersionSeen('1.4.0');
    await expect(
      AsyncStorage.getItem('@WhatsNew:lastSeenVersion'),
    ).resolves.toBe('1.4.0');
  });

  test('markCurrentVersionSeen stamps the current content version', async () => {
    await markCurrentVersionSeen();
    await expect(getLastSeenWhatsNewVersion()).resolves.toBe(
      String(WHATS_NEW_CONTENT_VERSION),
    );
  });
});
