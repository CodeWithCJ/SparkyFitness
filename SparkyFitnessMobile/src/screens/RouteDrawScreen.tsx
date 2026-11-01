import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
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
  ROUTE_MAX_CUES,
  countRouteTurns,
  hasRouteStyleControls,
  restrictRouteStyle,
  type RouteStyle,
} from '@workspace/shared';
import RouteStyleControls from '../components/RouteStyleControls';
import Button from '../components/ui/Button';
import Switch from '../components/ui/Switch';
import { useFollowRoadsRoute } from '../hooks/useFollowRoadsRoute';
import { usePreferences } from '../hooks/usePreferences';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import MapSurface from '../components/maps/MapSurface';
import type { MapSurfaceHandle } from '../components/maps/mapSurfaceTypes';
import { addLog } from '../services/LogService';
import {
  saveDrawnRoute,
  saveRouteEdits,
  useRoute,
  useRouteGenerationCapabilities,
} from '../services/routeService';
import {
  EMPTY_EDITOR_STATE,
  ROUTE_EDITOR_MAX_POINTS,
  addPoint,
  deletePoint,
  emptyHistory,
  hitTestLine,
  insertPoint,
  movePoint,
  pushHistory,
  redoHistory,
  setLegStraight,
  stateFromRoute,
  undoHistory,
  type EditorHistory,
  type EditorState,
} from '../utils/routeEditor';
import { routeGenerateKindMessage } from '../utils/routeGenerateError';
import { formatRouteDistance } from '../utils/routeDisplay';
import { canShowRouteMap, canShowSatelliteMap } from '../utils/routeMapSupport';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'RouteDraw'>;

/** Shows most of a continent until the person's position is known. */
const FALLBACK_VIEWPORT = {
  center: { lat: 39.8, lon: -98.6 },
  latitudeDelta: 40,
  longitudeDelta: 40,
};
const MIN_ROUTE_METERS = 10;
const METERS_PER_DEGREE_LAT = 111320;
/** A tap this close (share of the visible height) to the line adds a point on it. */
const LINE_TAP_SHARE = 0.04;

/**
 * Draw or edit a route on the map. Tap to add points, tap the line to insert
 * one on it, drag a point to move it, select a point to delete it. Undo, redo
 * and clear cover every change. When the person has a routing provider,
 * "Follow roads" snaps each stretch to roads or trails (a selected point can
 * make the stretch before or after it straight); the engine's line, with its
 * turn cues, replaces the straight ones. Without one every stretch is a
 * straight line. With a `routeId` the saved route opens for editing and saving
 * replaces its line.
 */
const RouteDrawScreen: React.FC<Props> = ({ navigation, route: nav }) => {
  const routeId = nav.params?.routeId;
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const { preferences } = usePreferences();
  const unit = preferences?.default_distance_unit ?? 'km';
  const lineColor = useCSSVariable('--color-accent-primary') as string;
  const { theme } = useUniwind();
  const isDark = theme === 'dark' || theme === 'amoled';
  const mapRef = useRef<MapSurfaceHandle>(null);
  // Degrees of latitude on screen: a tap this close to the line inserts a
  // point on it instead of appending one.
  const visibleDeltaRef = useRef(FALLBACK_VIEWPORT.latitudeDelta);
  const [history, setHistory] = useState<EditorHistory>(() =>
    emptyHistory(EMPTY_EDITOR_STATE)
  );
  const editor = history.present;
  const [selected, setSelected] = useState<number | null>(null);
  const [satellite, setSatellite] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [followRoads, setFollowRoads] = useState(false);
  const [style, setStyle] = useState<RouteStyle>(DEFAULT_ROUTE_STYLE);
  const { capabilities, isLoading: checkingCapabilities } =
    useRouteGenerationCapabilities();
  const available = capabilities.available;
  const snapping = available && followRoads;
  const saved = useRoute(routeId ?? '');
  const followStyle = useMemo(
    () => restrictRouteStyle(style, capabilities.style),
    [style, capabilities.style]
  );
  const snap = useFollowRoadsRoute(snapping, editor, followStyle);
  const line = snap.line;
  const atPointLimit = editor.points.length >= ROUTE_EDITOR_MAX_POINTS;

  // Open a saved route once it has loaded. Set during render, not in an
  // effect, so the first frame already shows the route.
  const [opened, setOpened] = useState(false);
  if (saved.route && !opened) {
    setOpened(true);
    setHistory(emptyHistory(stateFromRoute(saved.route)));
    setName(saved.route.name);
    setFollowRoads(saved.route.cues.length > 0);
  }
  // Until a saved route has loaded, edits would be thrown away by opening it.
  const editable = routeId === undefined || opened;
  const savedPoints = saved.route?.points;
  useEffect(() => {
    if (!opened || !savedPoints) return;
    mapRef.current?.fitPoints(
      savedPoints.map((p) => ({ lat: p.lat, lon: p.lon })),
      { top: 60, right: 40, bottom: 320, left: 40 },
      false
    );
  }, [opened, savedPoints]);

  const edit = (change: (state: EditorState) => EditorState) =>
    setHistory((current) => pushHistory(current, change(current.present)));

  // Following roads saves what the engine returned, so wait until every
  // snapped stretch has its routed line.
  const canSave =
    editable &&
    editor.points.length >= 2 &&
    line.distanceM >= MIN_ROUTE_METERS &&
    name.trim() !== '' &&
    (!snapping || snap.isCurrent);

  const centerOnPerson = () => {
    if (routeId) return;
    void (async () => {
      const permission = await Location.getForegroundPermissionsAsync();
      if (!permission.granted) return;
      const last = await Location.getLastKnownPositionAsync();
      if (!last) return;
      mapRef.current?.centerOn(
        { lat: last.coords.latitude, lon: last.coords.longitude },
        0.03
      );
    })().catch(() => undefined);
  };

  const save = () => {
    setSaving(true);
    // A route keeps up to ROUTE_MAX_CUES cues; a line with more is saved
    // without them rather than refused.
    const cues = line.cues.length > ROUTE_MAX_CUES ? [] : line.cues;
    const body = {
      name: name.trim(),
      points: line.points,
      ...(cues.length > 0 || routeId ? { cues } : {}),
    };
    const done = routeId
      ? saveRouteEdits(routeId, body).then(() => navigation.goBack())
      : saveDrawnRoute(body).then((route) =>
          navigation.replace('RouteDetail', { id: route.id })
        );
    void done
      .catch((error: unknown) => {
        addLog(`[Routes] Could not save a drawn route: ${error}`, 'WARNING');
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
    title: routeId
      ? t('screens.routeEdit', { defaultValue: 'Edit route' })
      : t('screens.routeDraw', { defaultValue: 'Draw a route' }),
    left: { kind: 'back' },
    right: {
      kind: 'primary',
      onPress: save,
      disabled: !canSave || saving,
      busy: saving,
    },
  });

  const onMapPress = (latitude: number, longitude: number) => {
    setSelected(null);
    if (!editable || atPointLimit) return;
    const point = { lat: latitude, lon: longitude };
    const reach =
      visibleDeltaRef.current * METERS_PER_DEGREE_LAT * LINE_TAP_SHARE;
    const hit = hitTestLine(line, point, reach);
    if (hit) {
      edit((state) => insertPoint(state, hit.leg, hit.point));
    } else {
      edit((state) => addPoint(state, point));
    }
  };

  const lastIndex = editor.points.length - 1;
  const markerColor = (index: number) =>
    index === selected
      ? 'yellow'
      : index === 0
        ? 'green'
        : index === lastIndex
          ? 'red'
          : '#0284c7';
  const selectedPoint = selected !== null ? editor.points[selected] : undefined;
  const legBefore = selected !== null ? editor.legs[selected - 1] : undefined;
  const legAfter = selected !== null ? editor.legs[selected] : undefined;

  // Fallback for non-mobile platforms (e.g. web) where real route maps
  // are unavailable; this covers a stale link or unsupported screen state.
  if (!canShowRouteMap()) {
    return (
      <View
        className="flex-1 bg-background"
        style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
      >
        {header}
        <View className="flex-1 bg-background items-center justify-center px-6">
          <Text className="text-text-secondary text-base text-center">
            {t('routes.mapUnavailable', {
              defaultValue: 'Routes cannot be drawn on a map in this build.',
            })}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <View className="flex-1 bg-background">
        <MapSurface
          ref={mapRef}
          initialViewport={FALLBACK_VIEWPORT}
          dark={isDark}
          satellite={canShowSatelliteMap() && satellite}
          onReady={centerOnPerson}
          onViewportChange={(latitudeDelta) => {
            visibleDeltaRef.current = latitudeDelta;
          }}
          onPress={(point) => onMapPress(point.lat, point.lon)}
          showUserLocation
          lines={line.legLines.map((leg, index) => ({
            points: leg.map((p) => ({ lat: p.lat, lon: p.lon })),
            color: lineColor,
            width: 4,
            dashed: snapping && editor.legs[index]?.straight,
          }))}
          markers={editor.points.map((point, index) => ({
            point,
            shape: 'pin',
            color: markerColor(index),
            draggable: true,
            onPress: () => setSelected(index),
            onDragEnd: (moved) =>
              edit((state) => movePoint(state, index, moved)),
            opacity:
              index === 0 || index === lastIndex || index === selected
                ? 1
                : 0.7,
          }))}
        />
        {/* Apple Maps and (keyed) Google Maps have imagery; the keyless OSM
            styles have none. */}
        {canShowSatelliteMap() ? (
          <View
            className="absolute right-3 bg-surface rounded-xl"
            style={{ top: 12 }}
          >
            <Button variant="secondary" onPress={() => setSatellite((v) => !v)}>
              {satellite
                ? t('routes.mapStandard', { defaultValue: 'Map' })
                : t('routes.mapSatellite', { defaultValue: 'Satellite' })}
            </Button>
          </View>
        ) : null}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          className="absolute left-0 right-0 bottom-0 bg-surface"
        >
          {/* The padding lives inside: on iOS the avoiding view sets its own
              paddingBottom and would replace the safe-area one. */}
          <View
            className="px-4 pt-3"
            style={{ paddingBottom: insets.bottom + 12 }}
          >
            {routeId && !opened ? (
              saved.isError ? (
                <View className="flex-row items-center justify-between mb-3">
                  <Text className="text-text-secondary text-sm flex-1 mr-3">
                    {t('routes.loadOneFailed', {
                      defaultValue: 'Could not load this route.',
                    })}
                  </Text>
                  <Button
                    variant="secondary"
                    onPress={() => void saved.refetch()}
                  >
                    {t('common.retry', { defaultValue: 'Retry' })}
                  </Button>
                </View>
              ) : (
                <ActivityIndicator className="mb-3" />
              )
            ) : null}
            <TextInput
              className="border-b border-border-subtle text-text-primary py-1"
              style={{ fontSize: 16 }}
              value={name}
              onChangeText={setName}
              maxLength={100}
              placeholder={t('routes.namePlaceholder', {
                defaultValue: 'Name this route',
              })}
              accessibilityLabel={t('routes.nameLabel', {
                defaultValue: 'Route name',
              })}
            />
            {available ? (
              <View className="flex-row items-center justify-between mt-3">
                <Text className="text-text-primary text-base">
                  {t('routes.followRoads', { defaultValue: 'Follow roads' })}
                </Text>
                <Switch
                  value={followRoads}
                  onValueChange={setFollowRoads}
                  accessibilityLabel={t('routes.followRoads', {
                    defaultValue: 'Follow roads',
                  })}
                />
              </View>
            ) : !checkingCapabilities ? (
              <View
                className="mt-3 opacity-60"
                accessible
                accessibilityState={{ disabled: true }}
                accessibilityLabel={`${t('routes.followRoads', {
                  defaultValue: 'Follow roads',
                })}. ${t('routes.followRoadsNeedsProvider', {
                  defaultValue:
                    'A routing provider is needed. Add one in Settings > External Providers on the web app.',
                })}`}
              >
                <View className="flex-row items-center justify-between">
                  <Text className="text-text-primary text-base">
                    {t('routes.followRoads', { defaultValue: 'Follow roads' })}
                  </Text>
                  <Switch value={false} disabled />
                </View>
                <Text className="text-text-secondary text-sm mt-1">
                  {t('routes.followRoadsNeedsProvider', {
                    defaultValue:
                      'A routing provider is needed. Add one in Settings > External Providers on the web app.',
                  })}
                </Text>
              </View>
            ) : null}
            {snapping && hasRouteStyleControls(capabilities.style) ? (
              <View className="mt-3">
                <RouteStyleControls
                  value={style}
                  onChange={setStyle}
                  supported={capabilities.style}
                  activity="run"
                />
              </View>
            ) : null}
            {snapping && snap.errorKind ? (
              <View className="mt-2" testID="route-snap-error">
                <View className="flex-row items-center justify-between">
                  <Text className="text-text-secondary text-sm flex-1 mr-3">
                    {routeGenerateKindMessage(snap.errorKind, t)}
                  </Text>
                  <Button variant="secondary" onPress={snap.retry}>
                    {t('common.retry', { defaultValue: 'Retry' })}
                  </Button>
                </View>
                <Text className="text-text-secondary text-sm mt-1">
                  {t('routes.followRoadsUnrouted', {
                    defaultValue:
                      'Stretches without a road line show straight. Retry, or turn off Follow roads to save them straight.',
                  })}
                </Text>
              </View>
            ) : null}
            {atPointLimit ? (
              <Text className="text-text-secondary text-sm mt-2">
                {t('routes.editorPointLimit', {
                  defaultValue:
                    'A route takes up to {{max}} points. Delete a point to add another.',
                  max: ROUTE_EDITOR_MAX_POINTS,
                })}
              </Text>
            ) : null}
            {selectedPoint !== undefined && selected !== null ? (
              <View className="flex-row flex-wrap gap-2 mt-3">
                <Button
                  variant="destructive"
                  onPress={() => {
                    edit((state) => deletePoint(state, selected));
                    setSelected(null);
                  }}
                >
                  {t('routes.deletePoint', { defaultValue: 'Delete point' })}
                </Button>
                {snapping && legBefore ? (
                  <Button
                    variant="secondary"
                    onPress={() =>
                      edit((state) =>
                        setLegStraight(state, selected - 1, !legBefore.straight)
                      )
                    }
                  >
                    {legBefore.straight
                      ? t('routes.followBefore', {
                          defaultValue: 'Follow roads before',
                        })
                      : t('routes.straightBefore', {
                          defaultValue: 'Straight before',
                        })}
                  </Button>
                ) : null}
                {snapping && legAfter ? (
                  <Button
                    variant="secondary"
                    onPress={() =>
                      edit((state) =>
                        setLegStraight(state, selected, !legAfter.straight)
                      )
                    }
                  >
                    {legAfter.straight
                      ? t('routes.followAfter', {
                          defaultValue: 'Follow roads after',
                        })
                      : t('routes.straightAfter', {
                          defaultValue: 'Straight after',
                        })}
                  </Button>
                ) : null}
              </View>
            ) : null}
            <View className="flex-row items-center justify-between mt-3">
              <View className="flex-1 mr-3 flex-row items-center">
                <Text className="text-text-primary text-base font-semibold">
                  {editor.points.length < 2
                    ? t('routes.drawHint', {
                        defaultValue: 'Tap the map to add points',
                      })
                    : formatRouteDistance(line.distanceM, unit)}
                  {snapping && line.cues.length > 0
                    ? ` · ${t('routes.turnCount', {
                        count: countRouteTurns(line.cues),
                        defaultValue: '{{count}} turns',
                        defaultValue_one: '{{count}} turn',
                        defaultValue_other: '{{count}} turns',
                      })}`
                    : ''}
                </Text>
                {snap.isLoading ? (
                  <ActivityIndicator
                    className="ml-2"
                    accessibilityLabel={t('routes.findingRoute', {
                      defaultValue: 'Finding a route',
                    })}
                  />
                ) : null}
              </View>
              <View className="flex-row gap-2">
                <Button
                  variant="secondary"
                  disabled={history.past.length === 0}
                  onPress={() => {
                    setSelected(null);
                    setHistory(undoHistory);
                  }}
                >
                  {t('routes.undo', { defaultValue: 'Undo' })}
                </Button>
                <Button
                  variant="secondary"
                  disabled={history.future.length === 0}
                  onPress={() => {
                    setSelected(null);
                    setHistory(redoHistory);
                  }}
                >
                  {t('routes.redo', { defaultValue: 'Redo' })}
                </Button>
                <Button
                  variant="secondary"
                  disabled={editor.points.length === 0}
                  onPress={() => {
                    setSelected(null);
                    edit(() => EMPTY_EDITOR_STATE);
                  }}
                >
                  {t('routes.clear', { defaultValue: 'Clear' })}
                </Button>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </View>
  );
};

export default RouteDrawScreen;
