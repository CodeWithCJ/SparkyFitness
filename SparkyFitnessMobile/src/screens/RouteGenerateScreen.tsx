import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useCSSVariable, useUniwind } from 'uniwind';
import {
  DEFAULT_ROUTE_STYLE,
  buildLoopRequest,
  countRouteTurns,
  generateDistanceRange,
  hasRouteStyleControls,
  nextBearingDeg,
  restrictRouteStyle,
  type GeneratedRouteOption,
  type GenerateRouteBody,
  type RoutePoint,
  type RouteStyle,
} from '@workspace/shared';
import RouteChip from '../components/RouteChip';
import RouteOptionCards from '../components/RouteOptionCards';
import MapSurface from '../components/maps/MapSurface';
import type { MapSurfaceHandle } from '../components/maps/mapSurfaceTypes';
import RouteStyleControls from '../components/RouteStyleControls';
import Button from '../components/ui/Button';
import { usePreferences } from '../hooks/usePreferences';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { addLog } from '../services/LogService';
import {
  generateRouteOptions,
  saveGeneratedRoute,
  useRouteGenerationCapabilities,
} from '../services/routeService';
import { routeGenerateErrorMessage } from '../utils/routeGenerateError';
import { formatRouteClimb, formatRouteDistance } from '../utils/routeDisplay';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'RouteGenerate'>;
type Activity = GenerateRouteBody['activity'];
type Shape = Extract<GenerateRouteBody, { mode: 'loop' }>['shape'];
type Start = Pick<RoutePoint, 'lat' | 'lon'>;

const FALLBACK_VIEWPORT = {
  center: { lat: 39.8, lon: -98.6 },
  latitudeDelta: 40,
  longitudeDelta: 40,
};
const ACTIVITIES: Activity[] = ['run', 'walk', 'ride', 'hike'];
const DEFAULT_DISTANCE: Record<'km' | 'miles', string> = {
  km: '5',
  miles: '3',
};

/**
 * Generate a loop or out-and-back of a chosen distance from the person's
 * position (or a point they tap on the map) with the server's routing engine.
 * Shows up to three distinct options as cards, the chosen one on the map, to
 * regenerate (other headings) or save; route style choices appear only for
 * what the engine supports. Needs the engine, so without one it only explains
 * that.
 */
const RouteGenerateScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { preferences } = usePreferences();
  const unit = preferences?.default_distance_unit ?? 'km';
  const lineColor = useCSSVariable('--color-accent-primary') as string;
  const { theme } = useUniwind();
  const isDark = theme === 'dark' || theme === 'amoled';
  const { capabilities, isLoading: checking } =
    useRouteGenerationCapabilities();
  const available = capabilities.available;
  const mapRef = useRef<MapSurfaceHandle>(null);
  const sequence = useRef(0);
  const pickedStart = useRef(false);

  const [activity, setActivity] = useState<Activity>('run');
  const [shape, setShape] = useState<Shape>('loop');
  const [distanceText, setDistanceText] = useState(DEFAULT_DISTANCE[unit]);
  const [start, setStart] = useState<Start | null>(null);
  const [bearing, setBearing] = useState<number | null>(null);
  const [options, setOptions] = useState<GeneratedRouteOption[]>([]);
  const [selected, setSelected] = useState(0);
  const [style, setStyle] = useState<RouteStyle>(DEFAULT_ROUTE_STYLE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [name, setName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const unitLabel =
    unit === 'miles'
      ? t('workout.mi', { defaultValue: 'mi' })
      : t('workout.km', { defaultValue: 'km' });
  const preview = options[selected]?.route ?? null;
  const showStyle = hasRouteStyleControls(capabilities.style);
  const range = generateDistanceRange(unit);
  const distance = Number.parseFloat(distanceText.replace(',', '.'));
  const distanceValid =
    Number.isFinite(distance) && distance >= range.min && distance <= range.max;

  // Only refs and state setters inside, so it never changes and can sit in an
  // effect's dependencies.
  const locateMe = useCallback(() => {
    pickedStart.current = false;
    void (async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) return;
      const position = await Location.getCurrentPositionAsync({});
      if (pickedStart.current) return;
      const here = {
        lat: position.coords.latitude,
        lon: position.coords.longitude,
      };
      setStart(here);
      mapRef.current?.centerOn({ lat: here.lat, lon: here.lon }, 0.03);
    })().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (available) locateMe();
  }, [available, locateMe]);

  useEffect(() => {
    if (!preview || preview.points.length < 2) return;
    mapRef.current?.fitPoints(
      preview.points.map((p) => ({ lat: p.lat, lon: p.lon })),
      { top: 40, right: 40, bottom: 40, left: 40 },
      true
    );
  }, [preview]);

  const generate = (heading: number) => {
    if (!start) return;
    const request = buildLoopRequest({
      start,
      activity,
      shape,
      distance,
      unit,
      bearingDeg: heading,
      alternatives: capabilities.maxAlternatives,
      style: restrictRouteStyle(style, capabilities.style),
    });
    if (!request) return;
    const mine = ++sequence.current;
    setBearing(heading);
    setLoading(true);
    setError(null);
    generateRouteOptions(request)
      .then((response) => {
        if (mine !== sequence.current) return;
        setOptions(response.options);
        setSelected(0);
        setName(null);
      })
      .catch((failure: unknown) => {
        if (mine !== sequence.current) return;
        addLog(`[Routes] Could not generate a route: ${failure}`, 'WARNING');
        // The last good options stay on screen.
        setError(failure);
      })
      .finally(() => {
        if (mine === sequence.current) setLoading(false);
      });
  };

  const routeName = (name ?? preview?.name ?? '').trim();
  const canSave = preview !== null && routeName !== '' && !loading;

  const save = () => {
    if (!preview) return;
    setSaving(true);
    void saveGeneratedRoute(preview, routeName)
      .then((route) => navigation.replace('RouteDetail', { id: route.id }))
      .catch((failure: unknown) => {
        addLog(
          `[Routes] Could not save a generated route: ${failure}`,
          'WARNING'
        );
        Toast.show({
          type: 'error',
          text1: t('routes.saveFailed', {
            defaultValue: 'Could not save the route',
          }),
        });
      })
      .finally(() => setSaving(false));
  };

  const header = useScreenHeader({
    title: t('screens.routeGenerate', { defaultValue: 'Generate a route' }),
    left: { kind: 'back' },
    right: available
      ? {
          kind: 'primary',
          onPress: save,
          disabled: !canSave || saving,
          busy: saving,
        }
      : undefined,
  });

  if (checking || !available) {
    return (
      <>
        {header}
        <View className="flex-1 bg-background items-center justify-center px-6">
          {checking ? (
            <ActivityIndicator />
          ) : (
            <>
              <Text className="text-text-secondary text-base text-center mb-4">
                {t('routes.generateUnavailable', {
                  defaultValue:
                    'Route generation needs a routing provider. Add one in Settings > External Providers on the web app. You can still draw a route on a map.',
                })}
              </Text>
              <Button variant="secondary" onPress={() => navigation.goBack()}>
                {t('routes.goBack', { defaultValue: 'Go back' })}
              </Button>
            </>
          )}
        </View>
      </>
    );
  }

  const previewPoints = (preview?.points ?? []).map((p) => ({
    lat: p.lat,
    lon: p.lon,
  }));
  const activityLabel: Record<Activity, string> = {
    run: t('routes.activity.run', { defaultValue: 'Run' }),
    walk: t('routes.activity.walk', { defaultValue: 'Walk' }),
    ride: t('routes.activity.ride', { defaultValue: 'Ride' }),
    hike: t('routes.activity.hike', { defaultValue: 'Hike' }),
  };

  return (
    <>
      {header}
      <View className="flex-1 bg-background">
        <View className="flex-1">
          <MapSurface
            ref={mapRef}
            initialViewport={FALLBACK_VIEWPORT}
            dark={isDark}
            onPress={(point) => {
              pickedStart.current = true;
              setStart(point);
            }}
            showUserLocation
            lines={
              previewPoints.length > 1
                ? [{ points: previewPoints, color: lineColor, width: 4 }]
                : []
            }
            markers={
              start ? [{ point: start, shape: 'pin', color: 'green' }] : []
            }
          />
        </View>
        {/* The distance field sits low on the screen; keep it above the keyboard. */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            className="bg-surface"
            style={{ maxHeight: 420, flexGrow: 0 }}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingTop: 12,
              paddingBottom: insets.bottom + 12,
            }}
            keyboardShouldPersistTaps="handled"
          >
            <View className="flex-row flex-wrap gap-2">
              {ACTIVITIES.map((value) => (
                <RouteChip
                  key={value}
                  label={activityLabel[value]}
                  selected={activity === value}
                  onPress={() => setActivity(value)}
                />
              ))}
            </View>
            <View className="flex-row gap-2 mt-3">
              <RouteChip
                label={t('routes.shape.loop', { defaultValue: 'Loop' })}
                selected={shape === 'loop'}
                onPress={() => setShape('loop')}
              />
              <RouteChip
                label={t('routes.shape.outAndBack', {
                  defaultValue: 'Out and back',
                })}
                selected={shape === 'out_and_back'}
                onPress={() => setShape('out_and_back')}
              />
            </View>
            <View className="flex-row items-center mt-3">
              <Text className="text-text-primary text-base mr-3">
                {t('routes.distanceLabel', { defaultValue: 'Distance' })}
              </Text>
              <TextInput
                className="border-b border-border-subtle text-text-primary py-1 min-w-16"
                style={{ fontSize: 16 }}
                value={distanceText}
                onChangeText={setDistanceText}
                keyboardType="decimal-pad"
                maxLength={6}
                accessibilityLabel={t('routes.distanceLabel', {
                  defaultValue: 'Distance',
                })}
              />
              <Text className="text-text-secondary text-base ml-2">
                {unitLabel}
              </Text>
            </View>
            {!distanceValid ? (
              <Text className="text-text-secondary text-sm mt-1">
                {t('routes.distanceRange', {
                  min: range.min,
                  max: range.max,
                  unit: unitLabel,
                  defaultValue: 'Choose between {{min}} and {{max}} {{unit}}.',
                })}
              </Text>
            ) : null}
            <View className="flex-row items-center justify-between mt-3">
              <Text className="text-text-secondary text-sm flex-1 mr-3">
                {start
                  ? t('routes.startFrom', {
                      defaultValue:
                        'Starting at the green pin. Tap the map to move it.',
                    })
                  : t('routes.startUnknown', {
                      defaultValue:
                        'Waiting for your location. Or tap the map to choose a start.',
                    })}
              </Text>
              <Button variant="secondary" onPress={locateMe}>
                {t('routes.useMyLocation', { defaultValue: 'My location' })}
              </Button>
            </View>
            {error ? (
              <Text className="text-text-secondary text-sm mt-3">
                {routeGenerateErrorMessage(error, t)}
              </Text>
            ) : null}
            {showStyle ? (
              <View className="mt-3">
                <RouteStyleControls
                  value={style}
                  onChange={setStyle}
                  supported={capabilities.style}
                  activity={activity}
                />
              </View>
            ) : null}
            {options.length > 1 ? (
              <View className="mt-3">
                <RouteOptionCards
                  options={options}
                  selectedIndex={selected}
                  onSelect={(index) => {
                    setSelected(index);
                    setName(null);
                  }}
                  unit={unit}
                />
              </View>
            ) : null}
            {preview ? (
              <View className="mt-3">
                <TextInput
                  className="border-b border-border-subtle text-text-primary py-1"
                  style={{ fontSize: 16 }}
                  value={name ?? preview.name}
                  onChangeText={setName}
                  maxLength={100}
                  accessibilityLabel={t('routes.nameLabel', {
                    defaultValue: 'Route name',
                  })}
                />
                <Text className="text-text-primary text-base font-semibold mt-2">
                  {formatRouteDistance(preview.distanceM, unit)}
                  {preview.elevationGainM !== null
                    ? ` · ${t('routes.climb', {
                        climb: formatRouteClimb(preview.elevationGainM, unit),
                        defaultValue: '{{climb}} climb',
                      })}`
                    : ''}
                  {` · ${t('routes.turnCount', {
                    count: countRouteTurns(preview.cues),
                    defaultValue: '{{count}} turns',
                    defaultValue_one: '{{count}} turn',
                    defaultValue_other: '{{count}} turns',
                  })}`}
                </Text>
              </View>
            ) : null}
            <View className="flex-row gap-2 mt-3">
              {preview ? (
                <View className="flex-1">
                  <Button
                    variant="secondary"
                    disabled={loading || !start || !distanceValid}
                    onPress={() => generate(nextBearingDeg(bearing))}
                  >
                    {t('routes.regenerate', {
                      defaultValue: 'Try another direction',
                    })}
                  </Button>
                </View>
              ) : (
                <View className="flex-1">
                  <Button
                    loading={loading}
                    disabled={!start || !distanceValid}
                    onPress={() => generate(nextBearingDeg(bearing))}
                  >
                    {t('routes.generate', { defaultValue: 'Generate' })}
                  </Button>
                </View>
              )}
              {loading && preview ? <ActivityIndicator /> : null}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </>
  );
};

export default RouteGenerateScreen;
