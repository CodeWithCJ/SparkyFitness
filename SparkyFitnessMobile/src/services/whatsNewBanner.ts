import AsyncStorage from '@react-native-async-storage/async-storage';
import { addLog } from './LogService';

// Bump this whenever you add or change the cards shown in WhatsNewScreen. The
// banner is gated on this marker rather than the app version, so a release that
// ships no new What's New content no longer re-triggers the banner.
export const WHATS_NEW_CONTENT_VERSION = 3;

const LAST_SEEN_VERSION_KEY = '@WhatsNew:lastSeenVersion';

export async function getLastSeenWhatsNewVersion(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LAST_SEEN_VERSION_KEY);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(
      `[WhatsNew Banner] Failed to read last seen version: ${message}`,
      'WARNING',
    );
    return null;
  }
}

export async function markWhatsNewVersionSeen(version: string): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_SEEN_VERSION_KEY, version);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(
      `[WhatsNew Banner] Failed to persist last seen version: ${message}`,
      'WARNING',
    );
  }
}

// Stamps the current content version as already-seen. Called from the
// onboarding completion paths so that fresh installs never see the banner — by
// contrast, users upgrading from a pre-banner build never pass through
// onboarding, so their stored value stays null and the banner fires for them.
export async function markCurrentVersionSeen(): Promise<void> {
  await markWhatsNewVersionSeen(String(WHATS_NEW_CONTENT_VERSION));
}

// Dev-only: subscribers fire after `resetWhatsNewBanner` clears storage so the
// already-mounted banner can re-evaluate without needing an app restart.
const resetSubscribers = new Set<() => void>();

export function subscribeToWhatsNewBannerReset(cb: () => void): () => void {
  resetSubscribers.add(cb);
  return () => {
    resetSubscribers.delete(cb);
  };
}

export async function resetWhatsNewBanner(): Promise<void> {
  try {
    await AsyncStorage.removeItem(LAST_SEEN_VERSION_KEY);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(
      `[WhatsNew Banner] Failed to reset last seen version: ${message}`,
      'WARNING',
    );
    return;
  }
  resetSubscribers.forEach((cb) => {
    try {
      cb();
    } catch {
      // Subscribers are dev-only listeners; failures here shouldn't crash the
      // reset path.
    }
  });
}
