import AsyncStorage from '@react-native-async-storage/async-storage';
import { renderHook, waitFor } from '@testing-library/react-native';

import { useWhatsNewBannerState } from '../../src/components/WhatsNewBanner';
import {
  WHATS_NEW_CONTENT_VERSION,
  getLastSeenWhatsNewVersion,
  markWhatsNewVersionSeen,
} from '../../src/services/whatsNewBanner';

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  navigationRef: { isReady: () => false, navigate: jest.fn() },
}));

jest.mock('../../src/components/Icon', () => 'Icon');

jest.mock('../../src/components/LiquidGlassSurface', () => ({
  __esModule: true,
  default: 'LiquidGlassSurface',
  createLiquidGlassPillStyle: jest.fn(() => ({})),
}));

jest.mock('uniwind', () => ({
  useCSSVariable: jest.fn((variables: string[]) => variables.map(() => '#000')),
}));

const currentVersion = String(WHATS_NEW_CONTENT_VERSION);
const previousVersion = String(WHATS_NEW_CONTENT_VERSION - 1);

describe('useWhatsNewBannerState', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it('shows the banner to a user who last saw the previous content version, then marks the current one seen', async () => {
    await markWhatsNewVersionSeen(previousVersion);

    const { result } = renderHook(() => useWhatsNewBannerState());

    await waitFor(() => expect(result.current.visible).toBe(true));
    await waitFor(async () =>
      expect(await getLastSeenWhatsNewVersion()).toBe(currentVersion)
    );
  });

  it('shows the banner to a user who has never seen one', async () => {
    const { result } = renderHook(() => useWhatsNewBannerState());

    await waitFor(() => expect(result.current.visible).toBe(true));
  });

  it('stays hidden once the current content version was seen', async () => {
    await markWhatsNewVersionSeen(currentVersion);

    const { result } = renderHook(() => useWhatsNewBannerState());

    await waitFor(async () =>
      expect(await getLastSeenWhatsNewVersion()).toBe(currentVersion)
    );
    expect(result.current.visible).toBe(false);
  });

  it('stays hidden for a stored app version and stamps the current content version', async () => {
    await markWhatsNewVersionSeen('1.4.0');

    const { result } = renderHook(() => useWhatsNewBannerState());

    await waitFor(async () =>
      expect(await getLastSeenWhatsNewVersion()).toBe(currentVersion)
    );
    expect(result.current.visible).toBe(false);
  });
});
