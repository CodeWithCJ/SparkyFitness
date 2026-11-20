import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { TFunction } from 'i18next';

import WatchConnectivity, {
  type GarminDevice,
  type GarminOpenAppResult,
  type GarminStatus,
} from '../../modules/watch-connectivity';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import Button from '../components/ui/Button';
import { WatchGoalNutrientsSection } from '../components/WatchGoalNutrientsSection';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { addLog } from '../services/LogService';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import type { RootStackScreenProps } from '../types/navigation';

type GarminSettingsScreenProps = RootStackScreenProps<'GarminSettings'>;

const OPEN_APP_RESULTS: readonly GarminOpenAppResult[] = [
  'promptShown',
  'promptNotShown',
  'notInstalled',
  'alreadyRunning',
  'noDevice',
  'failed',
];

function isOpenAppResult(value: string): value is GarminOpenAppResult {
  return (OPEN_APP_RESULTS as readonly string[]).includes(value);
}

/**
 * The Garmin link and its watches. Null until the native side has answered,
 * and for good where the module has no Garmin transport (iOS).
 */
function useGarminStatus(): GarminStatus | null {
  const [status, setStatus] = useState<GarminStatus | null>(null);

  useEffect(() => {
    const watch = WatchConnectivity;
    if (!watch?.garminStatus) return;
    let active = true;
    // Counts status events, so an answer to `garminStatus()` that lands after
    // a newer event does not put the older state back.
    let events = 0;
    const sub = watch.addListener('onGarminStatusChange', (next) => {
      events += 1;
      if (active) setStatus(next);
    });
    // Asking also makes the native side look for watches again, and what it
    // finds arrives through the event above.
    const refresh = () => {
      const eventsBefore = events;
      watch
        .garminStatus?.()
        .then((next) => {
          if (active && events === eventsBefore) setStatus(next);
        })
        .catch((error: unknown) => {
          addLog(`Garmin status failed: ${String(error)}`, 'WARNING');
        });
    };
    refresh();
    // Pairing a watch or installing the app happens in Garmin Connect, so
    // coming back from it is when the list is most likely to have changed.
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      active = false;
      sub.remove();
      appStateSub.remove();
    };
  }, []);

  return status;
}

function linkStateLabel(t: TFunction, state: GarminStatus['state']): string {
  switch (state) {
    case 'ready':
      return t('garminSettings.linkReady', {
        defaultValue: 'Connected to Garmin Connect',
      });
    case 'starting':
      return t('garminSettings.linkStarting', {
        defaultValue: 'Connecting to Garmin Connect…',
      });
    case 'error':
      return t('garminSettings.linkError', {
        defaultValue: "Can't reach Garmin Connect",
      });
    case 'unavailable':
      return t('garminSettings.linkUnavailable', {
        defaultValue: 'Garmin Connect is not available',
      });
  }
}

function linkStateHint(
  t: TFunction,
  state: GarminStatus['state'],
  error: string | undefined
): string | null {
  switch (state) {
    case 'error':
      // Garmin's own upgrade prompt is turned off natively (`autoUI`), so
      // this is the only place the person learns what to do.
      if (error === 'garminConnectUpgradeNeeded') {
        return t('garminSettings.linkUpgradeHint', {
          defaultValue:
            'Update Garmin Connect from Google Play. SparkyFitness keeps trying to reach it.',
        });
      }
      if (error === 'bindTimeout') {
        return t('garminSettings.linkBindTimeoutHint', {
          defaultValue:
            'Garmin Connect is not answering. Open it once, then come back here. SparkyFitness keeps trying to reach it.',
        });
      }
      return t('garminSettings.linkErrorHint', {
        defaultValue:
          'Check that Garmin Connect is installed and signed in. SparkyFitness keeps trying to reach it.',
      });
    case 'unavailable':
      return t('garminSettings.linkUnavailableHint', {
        defaultValue:
          'Install Garmin Connect on this phone and pair your watch there.',
      });
    case 'ready':
    case 'starting':
      return null;
  }
}

/**
 * What the link's delivery mode means for the person, once it is ready. With
 * the binder delivery Garmin Connect starts SparkyFitness to hand it a watch
 * message; in broadcast mode (no approval from Garmin yet, an older Garmin
 * Connect) only a running app receives, so the watch is answered only while
 * SparkyFitness stays open in the background. Broadcast is also reported
 * while Garmin Connect may still hold a registration the link has not probed
 * again yet (no watch connected when it became ready, or a slow probe), when
 * the hint says more than is needed, never less. `none`, a native build that
 * does not report it, and a mode a newer one adds say nothing.
 */
function deliveryHint(
  t: TFunction,
  delivery: GarminStatus['delivery']
): string | null {
  if (delivery === 'binder') {
    return t('garminSettings.deliveryBinder', {
      defaultValue:
        'Garmin Connect can wake SparkyFitness to receive from your watch.',
    });
  }
  if (delivery === 'broadcast') {
    return t('garminSettings.deliveryBroadcast', {
      defaultValue:
        'Keep SparkyFitness open in the background to receive from your watch.',
    });
  }
  return null;
}

function appStateLabel(t: TFunction, app: GarminDevice['app']): string {
  switch (app) {
    case 'installed':
      return t('garminSettings.appInstalled', {
        defaultValue: 'SparkyFitness installed',
      });
    case 'notInstalled':
      return t('garminSettings.appNotInstalled', {
        defaultValue: 'SparkyFitness not installed',
      });
    case 'unknown':
      return t('garminSettings.appUnknown', {
        defaultValue: 'Not known yet whether SparkyFitness is installed',
      });
  }
}

function openResultMessage(t: TFunction, result: GarminOpenAppResult): string {
  switch (result) {
    case 'promptShown':
      return t('garminSettings.openPromptShown', {
        defaultValue: 'Check your watch: it is asking to open SparkyFitness.',
      });
    case 'promptNotShown':
      return t('garminSettings.openPromptNotShown', {
        defaultValue:
          'Your watch did not show the prompt. Open SparkyFitness from its app list.',
      });
    case 'notInstalled':
      return t('garminSettings.openNotInstalled', {
        defaultValue: 'SparkyFitness is not installed on this watch.',
      });
    case 'alreadyRunning':
      return t('garminSettings.openAlreadyRunning', {
        defaultValue: 'SparkyFitness is already open on this watch.',
      });
    case 'noDevice':
      return t('garminSettings.openNoDevice', {
        defaultValue: 'This watch is not connected.',
      });
    case 'failed':
      return t('garminSettings.openFailed', {
        defaultValue: 'Could not reach this watch. Try again.',
      });
  }
}

/**
 * Settings → Garmin: whether the phone can reach Garmin Connect, each Garmin
 * watch with its connection and whether SparkyFitness is on it, and the Goals
 * page nutrients, which are the same preference every watch app reads.
 * Shown from Settings only where `isGarminWatchEnabled()`: Android with
 * Garmin Connect, in development builds until the watch app is published.
 */
const GarminSettingsScreen: React.FC<GarminSettingsScreenProps> = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();
  const status = useGarminStatus();
  const [openingIds, setOpeningIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [openResults, setOpenResults] = useState<
    Readonly<Record<string, GarminOpenAppResult>>
  >({});
  // The latest open request per watch. Taps queued behind a busy JS thread can
  // land before the spinner blocks the button, so only the newest request's
  // answer is shown.
  const openRequestsRef = useRef<Record<string, number>>({});

  const header = useScreenHeader({
    title: t('screens.garminSettings', { defaultValue: 'Garmin' }),
    left: { kind: 'back' },
  });

  const openOnWatch = useCallback(async (deviceId: string) => {
    const watch = WatchConnectivity;
    if (!watch?.openGarminApp) return;
    const request = (openRequestsRef.current[deviceId] ?? 0) + 1;
    openRequestsRef.current[deviceId] = request;
    setOpeningIds((ids) => new Set(ids).add(deviceId));
    setOpenResults(({ [deviceId]: _previous, ...rest }) => rest);
    let result: GarminOpenAppResult = 'failed';
    try {
      const answer = await watch.openGarminApp(deviceId);
      if (isOpenAppResult(answer)) result = answer;
    } catch (error) {
      addLog(`Garmin open app failed: ${String(error)}`, 'WARNING');
    }
    if (openRequestsRef.current[deviceId] !== request) return;
    setOpeningIds((ids) => {
      const next = new Set(ids);
      next.delete(deviceId);
      return next;
    });
    setOpenResults((results) => ({ ...results, [deviceId]: result }));
  }, []);

  const linkState: GarminStatus['state'] =
    status?.state ??
    (WatchConnectivity?.garminStatus ? 'starting' : 'unavailable');
  const hint = linkStateHint(t, linkState, status?.error);
  const deliveryNote =
    linkState === 'ready' ? deliveryHint(t, status?.delivery) : null;
  const devices = status?.devices ?? [];
  // While the link is not ready its list is empty because nothing has been
  // read yet, not because there is no watch; the link card says why.
  const showWatches = linkState === 'ready' || devices.length > 0;

  return (
    <View className="flex-1 bg-background">
      {header}
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingTop: 16,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        contentInsetAdjustmentBehavior={
          usesNativeHeader ? 'automatic' : 'never'
        }
      >
        <Text className="text-text-primary text-base font-semibold mb-1">
          {t('garminSettings.linkTitle', { defaultValue: 'Garmin Connect' })}
        </Text>
        <View className="bg-surface rounded-xl p-4 gap-1">
          <Text
            testID="garmin-link-state"
            className="text-text-primary text-sm font-semibold"
            accessibilityLiveRegion="polite"
          >
            {linkStateLabel(t, linkState)}
          </Text>
          {hint ? (
            <Text className="text-text-secondary text-sm">{hint}</Text>
          ) : null}
          {deliveryNote ? (
            <Text
              testID="garmin-delivery"
              className="text-text-secondary text-sm"
            >
              {deliveryNote}
            </Text>
          ) : null}
        </View>

        {showWatches ? (
          <>
            <Text className="text-text-primary text-base font-semibold mt-6 mb-1">
              {t('garminSettings.watchesTitle', { defaultValue: 'Watches' })}
            </Text>
            {devices.length === 0 ? (
              <Text
                testID="garmin-no-watches"
                className="text-text-secondary text-sm"
              >
                {t('garminSettings.noWatches', {
                  defaultValue:
                    'No Garmin watch found. Pair your watch in the Garmin Connect app.',
                })}
              </Text>
            ) : (
              <View className="gap-3">
                {devices.map((device) => {
                  const name =
                    device.name.trim() ||
                    t('garminSettings.unnamedWatch', {
                      defaultValue: 'Garmin watch',
                    });
                  // Every connected watch: Garmin Connect's answer about the app
                  // is not trusted for a sideloaded one, so even 'notInstalled'
                  // keeps this, and the open request's own answer
                  // ('notInstalled') says when the app is really missing.
                  const canOpen = device.connected;
                  const opening = openingIds.has(device.id);
                  const result = openResults[device.id];
                  return (
                    <View
                      key={device.id}
                      testID={`garmin-device-${device.id}`}
                      className="bg-surface rounded-xl p-4 gap-2"
                    >
                      <Text className="text-text-primary text-sm font-semibold">
                        {name}
                      </Text>
                      <Text className="text-text-secondary text-sm">
                        {device.connected
                          ? t('garminSettings.connected', {
                              defaultValue: 'Connected',
                            })
                          : t('garminSettings.notConnected', {
                              defaultValue: 'Not connected',
                            })}
                      </Text>
                      <Text className="text-text-secondary text-sm">
                        {appStateLabel(t, device.app)}
                      </Text>
                      {device.app === 'notInstalled' ? (
                        <Text
                          testID={`garmin-not-installed-hint-${device.id}`}
                          className="text-text-secondary text-sm"
                        >
                          {t('garminSettings.appNotInstalledHint', {
                            defaultValue:
                              'The watch app is not in the Connect IQ Store yet. For now it is installed by hand: see targets/garmin/README.md in the SparkyFitness repository.',
                          })}
                        </Text>
                      ) : null}
                      {canOpen ? (
                        // Primary: its spinner is white, so it shows on the accent
                        // fill while the watch is asked (up to 30 s).
                        <Button
                          testID={`garmin-open-${device.id}`}
                          variant="primary"
                          loading={opening}
                          accessibilityRole="button"
                          accessibilityLabel={t(
                            'garminSettings.openOnWatchA11y',
                            {
                              name,
                              defaultValue: 'Open SparkyFitness on {{name}}',
                            }
                          )}
                          accessibilityState={{ busy: opening }}
                          onPress={() => void openOnWatch(device.id)}
                        >
                          {t('garminSettings.openOnWatch', {
                            defaultValue: 'Open on watch',
                          })}
                        </Button>
                      ) : null}
                      {result ? (
                        <Text
                          testID={`garmin-open-result-${device.id}`}
                          className="text-text-secondary text-sm"
                          accessibilityLiveRegion="polite"
                        >
                          {openResultMessage(t, result)}
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            )}
          </>
        ) : null}

        <Text className="text-text-primary text-base font-semibold mt-6 mb-1">
          {t('garminSettings.aboutTitle', { defaultValue: 'On your watch' })}
        </Text>
        <Text className="text-text-secondary text-sm mb-2">
          {t('garminSettings.aboutGoals', {
            defaultValue:
              "The SparkyFitness app on your Garmin watch shows the Goals page: today's calories and the nutrients chosen below. More pages are coming.",
          })}
        </Text>
        <Text className="text-text-secondary text-sm">
          {t('garminSettings.aboutBackground', {
            defaultValue:
              'Your phone sends the numbers through Garmin Connect, so keep Garmin Connect allowed to run in the background.',
          })}
        </Text>

        <WatchGoalNutrientsSection />
      </ScrollView>
    </View>
  );
};

export default GarminSettingsScreen;
