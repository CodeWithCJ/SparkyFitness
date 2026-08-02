import React from 'react';
import { ActivityIndicator, Platform } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactTestInstance } from 'react-test-renderer';
import Toast from 'react-native-toast-message';
import DevTools from '../../src/components/DevTools';

type SeedResult = {
  success: boolean;
  recordsInserted: number;
  error?: string;
};

type Permission = {
  accessType: string;
  recordType: string;
};

const mockSeedHealthData = jest.fn<Promise<SeedResult>, [number]>();
const mockSeedHistoricalSteps = jest.fn<Promise<SeedResult>, []>();
const mockTriggerManualSync = jest.fn<Promise<void>, []>();
const mockNotifySessionExpired = jest.fn();
const mockGetActiveServerConfig = jest.fn<Promise<{ id: string } | null>, []>();
const mockResetWhatsNewBanner = jest.fn<Promise<void>, []>();
const mockResetAnnouncementModal = jest.fn<Promise<void>, []>();
const mockOpenHealthConnectSettings = jest.fn();
const mockOpenHealthConnectDataManagement = jest.fn();
const mockGetGrantedPermissions = jest.fn<Promise<Permission[]>, []>();
const mockResetSources = jest.fn<Promise<void>, []>();
const mockResetProvider = jest.fn<Promise<void>, []>();
const mockResetFuture = jest.fn<Promise<void>, []>();
const mockToastShow = Toast.show as jest.MockedFunction<typeof Toast.show>;

const mockPopovers = [
  {
    id: 'sources',
    resetLabel: 'Sources Intro',
    hasSeen: jest.fn(),
    markSeen: jest.fn(),
    reset: mockResetSources,
  },
  {
    id: 'provider',
    resetLabel: 'Source Switcher',
    hasSeen: jest.fn(),
    markSeen: jest.fn(),
    reset: mockResetProvider,
  },
  {
    id: 'future-popover',
    resetLabel: 'Future Server Label',
    hasSeen: jest.fn(),
    markSeen: jest.fn(),
    reset: mockResetFuture,
  },
];

jest.mock('../../src/services/seedHealthData', () => ({
  get seedHealthData() {
    return mockSeedHealthData;
  },
  get seedHistoricalSteps() {
    return mockSeedHistoricalSteps;
  },
}));
jest.mock('../../src/services/backgroundSyncService', () => ({
  get triggerManualSync() {
    return mockTriggerManualSync;
  },
}));
jest.mock('../../src/services/api/authService', () => ({
  get notifySessionExpired() {
    return mockNotifySessionExpired;
  },
}));
jest.mock('../../src/services/storage', () => ({
  get getActiveServerConfig() {
    return mockGetActiveServerConfig;
  },
}));
jest.mock('../../src/services/whatsNewBanner', () => ({
  get resetWhatsNewBanner() {
    return mockResetWhatsNewBanner;
  },
}));
jest.mock('../../src/components/AnnouncementModal', () => ({
  get resetAnnouncementModal() {
    return mockResetAnnouncementModal;
  },
}));
jest.mock('../../src/services/foodSearchPreferences', () => ({
  get FOOD_SEARCH_POPOVERS() {
    return mockPopovers;
  },
}));
jest.mock('react-native-health-connect', () => ({
  get openHealthConnectSettings() {
    return mockOpenHealthConnectSettings;
  },
  get openHealthConnectDataManagement() {
    return mockOpenHealthConnectDataManagement;
  },
  get getGrantedPermissions() {
    return mockGetGrantedPermissions;
  },
}));

const originalPlatformOS = Platform.OS;

function setPlatform(os: string): void {
  Object.defineProperty(Platform, 'OS', {
    configurable: true,
    value: os,
  });
}

function setTestLocale(locale: 'en' | 'pl'): void {
  globalThis.__setTestLocale(locale);
}

function findDisabledAncestor(
  node: ReactTestInstance,
): ReactTestInstance | null {
  let current: ReactTestInstance | null = node;
  while (current) {
    if (current.props.disabled !== undefined) return current;
    current = current.parent;
  }
  return null;
}

describe('DevTools', () => {
  beforeEach(() => {
    setPlatform('android');
    setTestLocale('en');
    mockSeedHealthData.mockReset();
    mockSeedHistoricalSteps.mockReset();
    mockTriggerManualSync.mockReset();
    mockNotifySessionExpired.mockReset();
    mockGetActiveServerConfig.mockReset();
    mockResetWhatsNewBanner.mockReset();
    mockResetAnnouncementModal.mockReset();
    mockOpenHealthConnectSettings.mockReset();
    mockOpenHealthConnectDataManagement.mockReset();
    mockGetGrantedPermissions.mockReset();
    mockResetSources.mockReset();
    mockResetProvider.mockReset();
    mockResetFuture.mockReset();
    mockToastShow.mockClear();
    mockGetActiveServerConfig.mockResolvedValue(null);
    mockGetGrantedPermissions.mockResolvedValue([]);
  });

  afterEach(() => {
    setPlatform(originalPlatformOS);
  });

  it('renders every diagnostic section and updates all visible labels from EN to PL', () => {
    const view = render(<DevTools />);
    expect(view.getByText('Dev Tools')).toBeTruthy();
    expect(
      view.getByText('These tools are only visible in development builds.'),
    ).toBeTruthy();
    expect(view.getByText('Seed Health Data')).toBeTruthy();
    expect(
      view.getByText('Insert sample health data for testing.'),
    ).toBeTruthy();
    expect(view.getByText('7 Days')).toBeTruthy();
    expect(view.getByText('14 Days')).toBeTruthy();
    expect(view.getByText('30 Days')).toBeTruthy();
    expect(view.getByText(/1 Year/)).toBeTruthy();
    expect(view.getByText('Health Connect')).toBeTruthy();
    expect(view.getByText('Health Connect Data')).toBeTruthy();
    expect(view.getByText('Background Sync')).toBeTruthy();
    expect(
      view.getByText('Manually trigger the background sync process.'),
    ).toBeTruthy();
    expect(view.getByText('Trigger Sync')).toBeTruthy();
    expect(view.getByText('Check BG Permission')).toBeTruthy();
    expect(view.getByText('Auth')).toBeTruthy();
    expect(view.getByText('Trigger auth modals for testing.')).toBeTruthy();
    expect(view.getByText('Show ReauthModal')).toBeTruthy();
    expect(view.getByText("What's New Banner")).toBeTruthy();
    expect(view.getByText('Reset Banner')).toBeTruthy();
    expect(view.getByText('System Announcement')).toBeTruthy();
    expect(view.getByText('Reset Announcement')).toBeTruthy();
    expect(view.getByText('Food Search Popovers')).toBeTruthy();
    expect(view.getByText('Sources Intro')).toBeTruthy();
    expect(view.getByText('Source Switcher')).toBeTruthy();
    expect(view.getByText('Future Server Label')).toBeTruthy();

    setTestLocale('pl');
    view.rerender(<DevTools />);
    expect(view.getByText('Narzędzia deweloperskie')).toBeTruthy();
    expect(view.getByText('Dodaj testowe dane zdrowotne')).toBeTruthy();
    expect(view.getByText('7 dni')).toBeTruthy();
    expect(view.getByText('14 dni')).toBeTruthy();
    expect(view.getByText('30 dni')).toBeTruthy();
    expect(view.getByText(/1 rok/)).toBeTruthy();
    expect(view.getByText('Dane Health Connect')).toBeTruthy();
    expect(view.getByText('Synchronizacja w tle')).toBeTruthy();
    expect(view.getByText('Uruchom synchronizację')).toBeTruthy();
    expect(view.getByText('Sprawdź uprawnienie w tle')).toBeTruthy();
    expect(view.getByText('Uwierzytelnianie')).toBeTruthy();
    expect(view.getByText('Pokaż ReauthModal')).toBeTruthy();
    expect(view.getByText('Baner „Co nowego”')).toBeTruthy();
    expect(view.getByText('Zresetuj baner')).toBeTruthy();
    expect(view.getByText('Ogłoszenie systemowe')).toBeTruthy();
    expect(view.getByText('Zresetuj ogłoszenie')).toBeTruthy();
    expect(view.getByText('Podpowiedzi wyszukiwania żywności')).toBeTruthy();
    expect(view.getByText('Wprowadzenie do źródeł')).toBeTruthy();
    expect(view.getByText('Przełącznik źródeł')).toBeTruthy();
    expect(view.getByText('Future Server Label')).toBeTruthy();
  });

  it.each([
    [1, 'Seeded 1 health record for the past 7 days.'],
    [2, 'Seeded 2 health records for the past 7 days.'],
  ] as const)('shows EN health seed plural %s', async (count, message) => {
    mockSeedHealthData.mockResolvedValue({
      success: true,
      recordsInserted: count,
    });
    const view = render(<DevTools />);
    await act(async () => {
      fireEvent.press(view.getByText('7 Days'));
    });
    expect(mockSeedHealthData).toHaveBeenCalledWith(7);
    expect(mockToastShow).toHaveBeenCalledWith({
      type: 'success',
      text1: 'Success',
      text2: message,
    });
  });

  it.each([
    [1, 'Dodano 1 rekord danych zdrowotnych z ostatnich 7 dni.'],
    [2, 'Dodano 2 rekordy danych zdrowotnych z ostatnich 7 dni.'],
    [5, 'Dodano 5 rekordów danych zdrowotnych z ostatnich 7 dni.'],
    [22, 'Dodano 22 rekordy danych zdrowotnych z ostatnich 7 dni.'],
  ] as const)('shows PL health seed plural %s', async (count, message) => {
    setTestLocale('pl');
    mockSeedHealthData.mockResolvedValue({
      success: true,
      recordsInserted: count,
    });
    const view = render(<DevTools />);
    await act(async () => {
      fireEvent.press(view.getByText('7 dni'));
    });
    expect(mockToastShow).toHaveBeenCalledWith({
      type: 'success',
      text1: 'Sukces',
      text2: message,
    });
  });

  it('uses literal health seed diagnostics, localized fallback, and interpolated catch errors', async () => {
    const view = render(<DevTools />);
    mockSeedHealthData.mockResolvedValue({
      success: false,
      recordsInserted: 0,
      error: 'Diagnostic detail',
    });
    await act(async () => {
      fireEvent.press(view.getByText('7 Days'));
    });
    expect(mockToastShow).toHaveBeenLastCalledWith({
      type: 'error',
      text1: 'Error',
      text2: 'Diagnostic detail',
    });

    mockSeedHealthData.mockResolvedValue({
      success: false,
      recordsInserted: 0,
    });
    await act(async () => {
      fireEvent.press(view.getByText('14 Days'));
    });
    expect(mockToastShow).toHaveBeenLastCalledWith({
      type: 'error',
      text1: 'Error',
      text2: 'Failed to seed health data.',
    });

    mockSeedHealthData.mockRejectedValue(new Error('seed exploded'));
    await act(async () => {
      fireEvent.press(view.getByText('30 Days'));
    });
    expect(mockToastShow).toHaveBeenLastCalledWith({
      type: 'error',
      text1: 'Error',
      text2: 'Failed to seed health data: seed exploded',
    });
  });

  it.each([
    [1, 'Seeded 1 historical step record across the past year.'],
    [2, 'Seeded 2 historical step records across the past year.'],
  ] as const)('shows EN historical step plural %s', async (count, message) => {
    mockSeedHistoricalSteps.mockResolvedValue({
      success: true,
      recordsInserted: count,
    });
    const view = render(<DevTools />);
    await act(async () => {
      fireEvent.press(view.getByText(/1 Year/));
    });
    expect(mockSeedHistoricalSteps).toHaveBeenCalledTimes(1);
    expect(mockToastShow).toHaveBeenCalledWith({
      type: 'success',
      text1: 'Success',
      text2: message,
    });
  });

  it.each([
    [1, 'Dodano 1 historyczny rekord kroków z ostatniego roku.'],
    [2, 'Dodano 2 historyczne rekordy kroków z ostatniego roku.'],
    [5, 'Dodano 5 historycznych rekordów kroków z ostatniego roku.'],
  ] as const)('shows PL historical step plural %s', async (count, message) => {
    setTestLocale('pl');
    mockSeedHistoricalSteps.mockResolvedValue({
      success: true,
      recordsInserted: count,
    });
    const view = render(<DevTools />);
    await act(async () => {
      fireEvent.press(view.getByText(/1 rok/));
    });
    expect(mockToastShow).toHaveBeenCalledWith({
      type: 'success',
      text1: 'Sukces',
      text2: message,
    });
  });

  it('handles historical step diagnostics and interpolated catch errors', async () => {
    const view = render(<DevTools />);
    mockSeedHistoricalSteps.mockResolvedValue({
      success: false,
      recordsInserted: 0,
      error: 'Historical diagnostic',
    });
    await act(async () => {
      fireEvent.press(view.getByText(/1 Year/));
    });
    expect(mockToastShow).toHaveBeenLastCalledWith({
      type: 'error',
      text1: 'Error',
      text2: 'Historical diagnostic',
    });

    mockSeedHistoricalSteps.mockResolvedValue({
      success: false,
      recordsInserted: 0,
    });
    await act(async () => {
      fireEvent.press(view.getByText(/1 Year/));
    });
    expect(mockToastShow).toHaveBeenLastCalledWith({
      type: 'error',
      text1: 'Error',
      text2: 'Failed to seed historical step data.',
    });

    mockSeedHistoricalSteps.mockRejectedValue(new Error('history exploded'));
    await act(async () => {
      fireEvent.press(view.getByText(/1 Year/));
    });
    expect(mockToastShow).toHaveBeenLastCalledWith({
      type: 'error',
      text1: 'Error',
      text2: 'Failed to seed historical step data: history exploded',
    });
  });

  it('disables every seed button while one seed is pending and restores all buttons', async () => {
    let resolveSeed: ((result: SeedResult) => void) | undefined;
    mockSeedHealthData.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveSeed = resolve;
        }),
    );
    const view = render(<DevTools />);
    fireEvent.press(view.getByText('7 Days'));
    await waitFor(() => expect(mockSeedHealthData).toHaveBeenCalledWith(7));
    for (const label of ['7 Days', '14 Days', '30 Days']) {
      const button =
        label === '7 Days'
          ? findDisabledAncestor(view.UNSAFE_getByType(ActivityIndicator))
          : findDisabledAncestor(view.getByText(label));
      expect(button?.props.disabled).toBe(true);
    }
    expect(findDisabledAncestor(view.getByText(/1 Year/))?.props.disabled).toBe(
      true,
    );
    expect(mockSeedHistoricalSteps).not.toHaveBeenCalled();
    resolveSeed?.({ success: true, recordsInserted: 1 });
    await waitFor(() => {
      expect(
        findDisabledAncestor(view.getByText('14 Days'))?.props.disabled,
      ).toBe(false);
      expect(
        findDisabledAncestor(view.getByText(/1 Year/))?.props.disabled,
      ).toBe(false);
    });
  });

  it.each([
    ['en', 'Background sync completed. Check Logs for details.'],
    ['pl', 'Synchronizacja w tle zakończona. Szczegóły znajdziesz w logach.'],
  ] as const)(
    'handles background sync success in %s',
    async (locale, message) => {
      setTestLocale(locale);
      mockTriggerManualSync.mockResolvedValue(undefined);
      const view = render(<DevTools />);
      await act(async () => {
        fireEvent.press(
          view.getByText(
            locale === 'en' ? 'Trigger Sync' : 'Uruchom synchronizację',
          ),
        );
      });
      expect(mockTriggerManualSync).toHaveBeenCalledTimes(1);
      expect(mockToastShow).toHaveBeenCalledWith({
        type: 'success',
        text1: locale === 'en' ? 'Success' : 'Sukces',
        text2: message,
      });
    },
  );

  it.each([
    ['en', 'Sync failed: sync exploded'],
    ['pl', 'Synchronizacja nie powiodła się: sync exploded'],
  ] as const)(
    'handles background sync errors and pending state in %s',
    async (locale, message) => {
      setTestLocale(locale);
      let rejectSync: ((reason: Error) => void) | undefined;
      mockTriggerManualSync.mockImplementation(
        () =>
          new Promise((_resolve, reject) => {
            rejectSync = reject;
          }),
      );
      const view = render(<DevTools />);
      const trigger = view.getByText(
        locale === 'en' ? 'Trigger Sync' : 'Uruchom synchronizację',
      );
      fireEvent.press(trigger);
      await waitFor(() =>
        expect(mockTriggerManualSync).toHaveBeenCalledTimes(1),
      );
      expect(
        findDisabledAncestor(view.UNSAFE_getByType(ActivityIndicator))?.props
          .disabled,
      ).toBe(true);
      rejectSync?.(new Error('sync exploded'));
      await waitFor(() => {
        expect(mockToastShow).toHaveBeenCalledWith({
          type: 'error',
          text1: locale === 'en' ? 'Error' : 'Błąd',
          text2: message,
        });
        expect(
          findDisabledAncestor(
            view.getByText(
              locale === 'en' ? 'Trigger Sync' : 'Uruchom synchronizację',
            ),
          )?.props.disabled,
        ).toBe(false);
      });
    },
  );

  it.each([
    [
      'en',
      [{ accessType: 'read', recordType: 'BackgroundAccessPermission' }],
      'Background access permission is granted.',
    ],
    [
      'en',
      [{ accessType: 'write', recordType: 'BackgroundAccessPermission' }],
      'Background access permission is NOT granted.',
    ],
    [
      'pl',
      [{ accessType: 'read', recordType: 'BackgroundAccessPermission' }],
      'Uprawnienie dostępu w tle zostało przyznane.',
    ],
    [
      'pl',
      [{ accessType: 'read', recordType: 'Steps' }],
      'Uprawnienie dostępu w tle NIE zostało przyznane.',
    ],
  ] as const)(
    'checks the exact background permission predicate in %s',
    async (locale, permissions, message) => {
      setTestLocale(locale);
      mockGetGrantedPermissions.mockResolvedValue(permissions);
      const view = render(<DevTools />);
      await act(async () => {
        fireEvent.press(
          view.getByText(
            locale === 'en'
              ? 'Check BG Permission'
              : 'Sprawdź uprawnienie w tle',
          ),
        );
      });
      expect(mockGetGrantedPermissions).toHaveBeenCalledTimes(1);
      expect(mockToastShow).toHaveBeenLastCalledWith({
        type:
          message.includes('NIE') || message.includes('NOT')
            ? 'error'
            : 'success',
        text1:
          locale === 'en'
            ? 'Background Access Permission'
            : 'Uprawnienie dostępu w tle',
        text2: message,
      });
    },
  );

  it('renders Health Connect actions only on Android and calls exact functions', async () => {
    const androidView = render(<DevTools />);
    await act(async () => {
      fireEvent.press(androidView.getByText('Health Connect'));
      fireEvent.press(androidView.getByText('Health Connect Data'));
    });
    expect(mockOpenHealthConnectSettings).toHaveBeenCalledTimes(1);
    expect(mockOpenHealthConnectDataManagement).toHaveBeenCalledTimes(1);

    setPlatform('ios');
    const iosView = render(<DevTools />);
    expect(iosView.queryByText('Health Connect')).toBeNull();
    expect(iosView.queryByText('Health Connect Data')).toBeNull();
    expect(iosView.queryByText('Check BG Permission')).toBeNull();
  });

  it.each([
    ['server-123', 'server-123'],
    [null, 'dev-test'],
  ] as const)(
    'passes the active config id to auth expiry notification',
    async (config, expectedId) => {
      mockGetActiveServerConfig.mockResolvedValue(
        config ? { id: config } : null,
      );
      const view = render(<DevTools />);
      await act(async () => {
        fireEvent.press(view.getByText('Show ReauthModal'));
      });
      expect(mockGetActiveServerConfig).toHaveBeenCalledTimes(1);
      expect(mockNotifySessionExpired).toHaveBeenCalledWith(expectedId);
    },
  );

  it.each([
    ['en', 'Reset Banner', "What's New banner will re-appear."],
    ['pl', 'Zresetuj baner', 'Baner „Co nowego” pojawi się ponownie.'],
  ] as const)(
    "resets the What's New banner in %s",
    async (locale, label, message) => {
      setTestLocale(locale);
      mockResetWhatsNewBanner.mockResolvedValue(undefined);
      const view = render(<DevTools />);
      await act(async () => {
        fireEvent.press(view.getByText(label));
      });
      expect(mockResetWhatsNewBanner).toHaveBeenCalledTimes(1);
      expect(mockToastShow).toHaveBeenCalledWith({
        type: 'success',
        text1: locale === 'en' ? 'Reset' : 'Zresetowano',
        text2: message,
      });
    },
  );

  it.each([
    [
      'en',
      'Reset Announcement',
      'System announcement modal will re-appear.',
      'Could not reset announcement.',
    ],
    [
      'pl',
      'Zresetuj ogłoszenie',
      'Modal ogłoszenia systemowego pojawi się ponownie.',
      'Nie udało się zresetować ogłoszenia.',
    ],
  ] as const)(
    'handles announcement reset success and error in %s',
    async (locale, label, success, failure) => {
      setTestLocale(locale);
      const view = render(<DevTools />);
      mockResetAnnouncementModal.mockResolvedValueOnce(undefined);
      await act(async () => {
        fireEvent.press(view.getByText(label));
      });
      expect(mockResetAnnouncementModal).toHaveBeenCalledTimes(1);
      expect(mockToastShow).toHaveBeenLastCalledWith({
        type: 'success',
        text1: locale === 'en' ? 'Reset' : 'Zresetowano',
        text2: success,
      });
      mockResetAnnouncementModal.mockRejectedValueOnce(
        new Error('reset failed'),
      );
      await act(async () => {
        fireEvent.press(view.getByText(label));
      });
      expect(mockResetAnnouncementModal).toHaveBeenCalledTimes(2);
      expect(mockToastShow).toHaveBeenLastCalledWith({
        type: 'error',
        text1: locale === 'en' ? 'Error' : 'Błąd',
        text2: failure,
      });
    },
  );

  it.each([
    ['sources', 'Sources Intro', 'Sources Intro', mockResetSources],
    ['provider', 'Source Switcher', 'Source Switcher', mockResetProvider],
    [
      'future-popover',
      'Future Server Label',
      'Future Server Label',
      mockResetFuture,
    ],
  ] as const)(
    'resets only the exact %s popover and preserves its label',
    async (id, label, toastLabel, reset) => {
      const view = render(<DevTools />);
      await act(async () => {
        fireEvent.press(view.getByText(label));
      });
      expect(reset).toHaveBeenCalledTimes(1);
      for (const otherReset of [
        mockResetSources,
        mockResetProvider,
        mockResetFuture,
      ]) {
        if (otherReset !== reset) expect(otherReset).not.toHaveBeenCalled();
      }
      expect(mockToastShow).toHaveBeenCalledWith({
        type: 'success',
        text1: 'Reset',
        text2: `${toastLabel} popover will re-appear.`,
      });
    },
  );

  it.each([
    ['en', 'Sources Intro', mockResetSources, 'Could not reset popover.'],
    [
      'pl',
      'Wprowadzenie do źródeł',
      mockResetSources,
      'Nie udało się zresetować podpowiedzi.',
    ],
    ['en', 'Source Switcher', mockResetProvider, 'Could not reset popover.'],
    [
      'pl',
      'Przełącznik źródeł',
      mockResetProvider,
      'Nie udało się zresetować podpowiedzi.',
    ],
  ] as const)(
    'shows localized popover reset errors in %s',
    async (locale, label, reset, message) => {
      setTestLocale(locale);
      reset.mockRejectedValueOnce(new Error('popover failed'));
      const view = render(<DevTools />);
      await act(async () => {
        fireEvent.press(view.getByText(label));
      });
      expect(mockToastShow).toHaveBeenLastCalledWith({
        type: 'error',
        text1: locale === 'en' ? 'Error' : 'Błąd',
        text2: message,
      });
    },
  );
});
