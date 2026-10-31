import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import Button from '../components/ui/Button';
import Icon from '../components/Icon';
import { useRefetchOnFocus } from '../hooks/useRefetchOnFocus';
import { usePreferences } from '../hooks/usePreferences';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { addLog } from '../services/LogService';
import {
  GpxFileTooLargeError,
  pickAndImportGpx,
  useRouteGenerationAvailable,
  useRoutes,
} from '../services/routeService';
import { formatRouteDistance } from '../utils/routeDisplay';
import { canShowRouteMap } from '../utils/routeMapSupport';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'Routes'>;

/** The person's saved routes: draw one, import a GPX file, or open one. */
const RoutesScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { routes, isLoading, isError, refetch } = useRoutes();
  const { preferences } = usePreferences();
  const unit = preferences?.default_distance_unit ?? 'km';
  const { available: canGenerate } = useRouteGenerationAvailable();
  const [importing, setImporting] = useState(false);
  useRefetchOnFocus(refetch, true);

  const importGpx = () => {
    setImporting(true);
    void pickAndImportGpx()
      .then((route) => {
        if (route) navigation.navigate('RouteDetail', { id: route.id });
      })
      .catch((error: unknown) => {
        addLog(`[Routes] Could not import a GPX file: ${error}`, 'WARNING');
        const tooLarge = error instanceof GpxFileTooLargeError;
        Toast.show({
          type: 'error',
          text1: tooLarge
            ? t('routes.fileTooLarge', {
                defaultValue: 'That file is too large',
              })
            : t('routes.importFailed', {
                defaultValue: 'Could not import that file',
              }),
          text2: tooLarge
            ? t('routes.fileTooLargeHint', {
                defaultValue: 'A route file can be up to 10 MB.',
              })
            : t('routes.importFailedHint', {
                defaultValue: 'Choose a GPX file with a track or route in it.',
              }),
        });
      })
      .finally(() => setImporting(false));
  };

  // Drawing and generating both need a map to show the route on (iOS, and
  // Android using keyless OpenStreetMap tiles or a Google Maps key).
  const add = () =>
    Alert.alert(t('routes.addTitle', { defaultValue: 'Add a route' }), '', [
      ...(canShowRouteMap()
        ? [
            {
              text: t('routes.draw', { defaultValue: 'Draw on a map' }),
              onPress: () => navigation.navigate('RouteDraw'),
            },
          ]
        : []),
      ...(canGenerate && canShowRouteMap()
        ? [
            {
              text: t('routes.generateRoute', {
                defaultValue: 'Generate a loop or out-and-back',
              }),
              onPress: () => navigation.navigate('RouteGenerate'),
            },
          ]
        : []),
      {
        text: t('routes.importGpx', { defaultValue: 'Import a GPX file' }),
        onPress: importGpx,
      },
      { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
    ]);

  const header = useScreenHeader({
    title: t('screens.routes', { defaultValue: 'Routes' }),
    left: { kind: 'back' },
    right: {
      kind: 'text',
      label: t('common.add', { defaultValue: 'Add' }),
      role: 'primary',
      onPress: add,
      disabled: importing,
      accessibilityLabel: t('routes.addTitle', {
        defaultValue: 'Add a route',
      }),
      identifier: 'routes-add',
    },
  });

  return (
    <>
      {header}
      <ScrollView
        className="flex-1 bg-background"
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 24,
        }}
      >
        {isLoading || importing ? (
          <ActivityIndicator />
        ) : isError && routes.length === 0 ? (
          <View className="items-center py-8">
            <Text className="text-text-secondary text-base mb-3">
              {t('routes.loadFailed', {
                defaultValue: 'Could not load your routes.',
              })}
            </Text>
            <Button variant="secondary" onPress={() => void refetch()}>
              {t('common.retry', { defaultValue: 'Retry' })}
            </Button>
          </View>
        ) : routes.length === 0 ? (
          <Text className="text-text-secondary text-base text-center py-8">
            {t('routes.empty', {
              defaultValue:
                'No routes yet. Draw one on a map, import a GPX file, or save a recorded run or walk from its details.',
            })}
          </Text>
        ) : (
          <View className="bg-surface rounded-xl overflow-hidden">
            {routes.map((route) => (
              <Pressable
                key={route.id}
                className="px-4 py-4 flex-row items-center justify-between border-b border-border-subtle"
                onPress={() =>
                  navigation.navigate('RouteDetail', { id: route.id })
                }
                style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
                accessibilityRole="button"
              >
                <View className="flex-1 mr-3">
                  <Text className="text-base font-semibold text-text-primary">
                    {route.name}
                  </Text>
                  <Text className="text-sm text-text-secondary mt-0.5">
                    {formatRouteDistance(route.distanceM, unit)}
                  </Text>
                </View>
                <Icon name="chevron-forward" size={20} color="#999" />
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </>
  );
};

export default RoutesScreen;
