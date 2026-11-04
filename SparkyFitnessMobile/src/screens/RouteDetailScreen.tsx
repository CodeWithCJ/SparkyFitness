import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import RouteMap from '../components/exerciseStats/RouteMap';
import RouteCueList from '../components/RouteCueList';
import Button from '../components/ui/Button';
import { usePreferences } from '../hooks/usePreferences';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useWatchConnectivity } from '../hooks/useWatchConnectivity';
import { useWatchRouteStatus } from '../hooks/useWatchRouteStatus';
import { getRecordingPreferences } from '../services/gpsRecordingService';
import { addLog } from '../services/LogService';
import {
  removeRoute,
  renameRoute,
  shareRouteGpx,
  useRoute,
} from '../services/routeService';
import { startRunOnWatch } from '../services/watchRunControl';
import {
  removeRouteFromWatch,
  sendRouteToWatch,
} from '../services/watchRouteSync';
import { formatRouteClimb, formatRouteDistance } from '../utils/routeDisplay';
import { canShowRouteMap } from '../utils/routeMapSupport';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'RouteDetail'>;

/**
 * One saved route: its map and numbers, rename, share as GPX, delete and, with
 * a paired watch, start it there or keep a copy on it for runs without the phone.
 */
const RouteDetailScreen: React.FC<Props> = ({ navigation, route: nav }) => {
  const { id } = nav.params;
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const { route, isLoading, isError, refetch } = useRoute(id);
  const { preferences } = usePreferences();
  const unit = preferences?.default_distance_unit ?? 'km';
  const [name, setName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { isPaired: watchPaired } = useWatchConnectivity();
  const watchStatus = useWatchRouteStatus(route);
  const [watchBusy, setWatchBusy] = useState(false);

  const header = useScreenHeader({
    title: route?.name ?? t('screens.routes', { defaultValue: 'Routes' }),
    left: { kind: 'back' },
  });

  const fail = (text: string, error: unknown) => {
    addLog(`[Routes] ${text}: ${error}`, 'WARNING');
    Toast.show({ type: 'error', text1: text });
  };

  const saveName = () => {
    const next = name?.trim();
    if (!next) return;
    setBusy(true);
    void renameRoute(id, { name: next })
      .then(() => setName(null))
      .catch((error: unknown) =>
        fail(
          t('routes.renameFailed', { defaultValue: 'Could not rename' }),
          error
        )
      )
      .finally(() => setBusy(false));
  };

  const share = () => {
    if (!route) return;
    void shareRouteGpx(route).catch((error: unknown) =>
      fail(
        t('routes.shareFailed', { defaultValue: 'Could not share the route' }),
        error
      )
    );
  };

  const sendToWatch = () => {
    if (!route) return;
    setWatchBusy(true);
    void sendRouteToWatch(route)
      .then(() =>
        Toast.show({
          type: 'success',
          text1: t('routes.watch.sent', {
            defaultValue: 'Sent to your watch',
          }),
        })
      )
      .catch((error: unknown) =>
        fail(
          t('routes.watch.sendFailed', {
            defaultValue: 'Could not send the route to your watch',
          }),
          error
        )
      )
      .finally(() => setWatchBusy(false));
  };

  const removeFromWatch = () => {
    setWatchBusy(true);
    void removeRouteFromWatch(id)
      .catch((error: unknown) =>
        fail(
          t('routes.watch.removeFailed', {
            defaultValue: 'Could not remove the route from your watch',
          }),
          error
        )
      )
      .finally(() => setWatchBusy(false));
  };

  const startOnWatch = (kind: 'run' | 'walk') => {
    if (!route) return;
    setBusy(true);
    void getRecordingPreferences()
      .then((preferences) =>
        startRunOnWatch({
          kind,
          place: 'outdoor',
          autoPause: preferences.autoPause,
          voiceCues: preferences.audioCues,
          route,
        })
      )
      .then(() => navigation.navigate('WatchRunLive'))
      .catch((error: unknown) =>
        fail(
          t('routes.watch.startFailed', {
            defaultValue: 'Could not start on your watch',
          }),
          error
        )
      )
      .finally(() => setBusy(false));
  };

  const start = () => {
    Alert.alert(
      t('routes.watch.startTitle', { defaultValue: 'Start on your watch' }),
      t('routes.watch.startMessage', {
        defaultValue: 'Your watch follows the route and buzzes at each turn.',
      }),
      [
        {
          text: t('recordActivity.activity.run', { defaultValue: 'Run' }),
          onPress: () => startOnWatch('run'),
        },
        {
          text: t('recordActivity.activity.walk', { defaultValue: 'Walk' }),
          onPress: () => startOnWatch('walk'),
        },
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
      ]
    );
  };

  const watchStatusText: Record<typeof watchStatus, string | null> = {
    none: null,
    pending: t('routes.watch.pending', {
      defaultValue: 'Sent. Waiting for your watch to confirm.',
    }),
    onWatch: t('routes.watch.onWatch', { defaultValue: 'On your watch' }),
    outdated: t('routes.watch.outdated', {
      defaultValue: 'Out of date, send again',
    }),
    full: t('routes.watch.full', {
      defaultValue:
        'Your watch is full. Remove a route from it, then send this one again.',
    }),
  };

  const confirmDelete = () =>
    Alert.alert(
      t('routes.deleteTitle', { defaultValue: 'Delete this route?' }),
      t('routes.deleteMessage', {
        defaultValue: 'Recorded activities it was saved from are not affected.',
      }),
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: t('common.delete', { defaultValue: 'Delete' }),
          style: 'destructive',
          onPress: () => {
            setDeleting(true);
            void removeRoute(id)
              .then(() => navigation.goBack())
              .catch((error: unknown) => {
                setDeleting(false);
                fail(
                  t('routes.deleteFailed', {
                    defaultValue: 'Could not delete the route',
                  }),
                  error
                );
              });
          },
        },
      ]
    );

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <ScrollView
        className="flex-1 bg-background"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 24,
        }}
      >
        {isLoading ? (
          <ActivityIndicator />
        ) : isError || !route ? (
          <View className="items-center py-8">
            <Text className="text-text-secondary text-base mb-3">
              {t('routes.loadOneFailed', {
                defaultValue: 'Could not load this route.',
              })}
            </Text>
            <Button variant="secondary" onPress={() => void refetch()}>
              {t('common.retry', { defaultValue: 'Retry' })}
            </Button>
          </View>
        ) : (
          <>
            <RouteMap
              points={route.points}
              accessibilityLabel={t('routes.mapA11y', {
                defaultValue:
                  'Map of this route, from the green dot to the red ring',
              })}
            />
            <View className="bg-surface rounded-xl p-4 mt-4">
              {name === null ? (
                <Text className="text-text-primary text-lg font-bold">
                  {route.name}
                </Text>
              ) : (
                <TextInput
                  className="border-b border-border-subtle text-text-primary py-1"
                  style={{ fontSize: 17 }}
                  value={name}
                  onChangeText={setName}
                  maxLength={100}
                  autoFocus
                  accessibilityLabel={t('routes.nameLabel', {
                    defaultValue: 'Route name',
                  })}
                />
              )}
              <Text className="text-text-secondary text-sm mt-2">
                {formatRouteDistance(route.distanceM, unit)}
                {route.elevationGainM !== null
                  ? ` · ${t('routes.climb', {
                      climb: formatRouteClimb(route.elevationGainM, unit),
                      defaultValue: '{{climb}} climb',
                    })}`
                  : ''}
              </Text>
            </View>
            <RouteCueList cues={route.cues} unit={unit} />
            <View className="mt-4 gap-2">
              {canShowRouteMap() ? (
                <Button
                  variant="secondary"
                  onPress={() =>
                    navigation.navigate('RouteDraw', { routeId: id })
                  }
                >
                  {t('routes.editLine', { defaultValue: 'Edit route on map' })}
                </Button>
              ) : null}
              {watchPaired ? (
                <Button onPress={start} disabled={busy}>
                  {t('routes.watch.start', {
                    defaultValue: 'Start on watch',
                  })}
                </Button>
              ) : null}
              {watchPaired ? (
                <View className="bg-surface rounded-xl p-4 gap-2">
                  <Text className="text-text-primary text-sm font-semibold">
                    {t('routes.watch.title', {
                      defaultValue: 'Run it without your phone',
                    })}
                  </Text>
                  {watchStatusText[watchStatus] ? (
                    <Text
                      className="text-text-secondary text-sm"
                      testID="route-watch-status"
                    >
                      {watchStatusText[watchStatus]}
                    </Text>
                  ) : (
                    <Text className="text-text-secondary text-sm">
                      {t('routes.watch.hint', {
                        defaultValue:
                          'Keep a copy on your watch, then start it from Cardio on the watch with the phone left behind.',
                      })}
                    </Text>
                  )}
                  {watchStatus !== 'onWatch' ? (
                    <Button
                      variant="secondary"
                      loading={watchBusy}
                      onPress={sendToWatch}
                    >
                      {watchStatus === 'none'
                        ? t('routes.watch.send', {
                            defaultValue: 'Send to watch',
                          })
                        : t('routes.watch.sendAgain', {
                            defaultValue: 'Send again',
                          })}
                    </Button>
                  ) : null}
                  {watchStatus === 'onWatch' ||
                  watchStatus === 'outdated' ||
                  watchStatus === 'pending' ? (
                    <Button
                      variant="secondary"
                      loading={watchBusy}
                      onPress={removeFromWatch}
                    >
                      {t('routes.watch.remove', {
                        defaultValue: 'Remove from watch',
                      })}
                    </Button>
                  ) : null}
                </View>
              ) : null}
              {name === null ? (
                <Button variant="secondary" onPress={() => setName(route.name)}>
                  {t('routes.rename', { defaultValue: 'Rename' })}
                </Button>
              ) : (
                <>
                  <Button loading={busy} onPress={saveName}>
                    {t('common.save', { defaultValue: 'Save' })}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onPress={() => setName(null)}
                  >
                    {t('common.cancel', { defaultValue: 'Cancel' })}
                  </Button>
                </>
              )}
              <Button variant="secondary" onPress={share}>
                {t('routes.shareGpx', { defaultValue: 'Share as GPX' })}
              </Button>
              <Button
                variant="destructive"
                loading={deleting}
                onPress={confirmDelete}
              >
                {t('common.delete', { defaultValue: 'Delete' })}
              </Button>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
};

export default RouteDetailScreen;
