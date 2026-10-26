import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type {
  RouteGenerateCapabilities,
  RouteHilliness,
  RouteStyle,
  RouteSurface,
} from '@workspace/shared';
import RouteChip from './RouteChip';

interface RouteStyleControlsProps {
  value: RouteStyle;
  onChange: (next: RouteStyle) => void;
  /** Only what the server's engine supports is shown. */
  supported: RouteGenerateCapabilities['style'];
  /** Steps never appear on a ride, so that choice is hidden for it. */
  activity: 'run' | 'walk' | 'ride' | 'hike';
}

const SURFACES: RouteSurface[] = ['any', 'trails', 'roads'];
const HILLS: RouteHilliness[] = ['any', 'flat', 'hilly'];

/** A compact "Route style" section: surface, hills, steps and busy roads. */
const RouteStyleControls: React.FC<RouteStyleControlsProps> = ({
  value,
  onChange,
  supported,
  activity,
}) => {
  const { t } = useTranslation();
  const showSteps = supported.avoidSteps && activity !== 'ride';
  if (
    !supported.surface &&
    !supported.hilliness &&
    !showSteps &&
    !supported.avoidBusyRoads
  ) {
    return null;
  }

  const surfaceLabel: Record<RouteSurface, string> = {
    any: t('routes.style.any', { defaultValue: 'Any' }),
    trails: t('routes.style.trails', { defaultValue: 'Trails' }),
    roads: t('routes.style.roads', { defaultValue: 'Roads' }),
  };
  const hillsLabel: Record<RouteHilliness, string> = {
    any: t('routes.style.any', { defaultValue: 'Any' }),
    flat: t('routes.style.flat', { defaultValue: 'Flatter' }),
    hilly: t('routes.style.hilly', { defaultValue: 'Hillier' }),
  };

  return (
    <View testID="route-style-controls">
      <Text className="text-text-primary text-base font-semibold">
        {t('routes.style.title', { defaultValue: 'Route style' })}
      </Text>
      {supported.surface ? (
        <View className="flex-row items-center flex-wrap gap-2 mt-2">
          <Text className="text-text-secondary text-sm w-14">
            {t('routes.style.surface', { defaultValue: 'Surface' })}
          </Text>
          {SURFACES.map((surface) => (
            <RouteChip
              key={surface}
              label={surfaceLabel[surface]}
              selected={value.surface === surface}
              onPress={() => onChange({ ...value, surface })}
            />
          ))}
        </View>
      ) : null}
      {supported.hilliness ? (
        <View className="flex-row items-center flex-wrap gap-2 mt-2">
          <Text className="text-text-secondary text-sm w-14">
            {t('routes.style.hills', { defaultValue: 'Hills' })}
          </Text>
          {HILLS.map((hilliness) => (
            <RouteChip
              key={hilliness}
              label={hillsLabel[hilliness]}
              selected={value.hilliness === hilliness}
              onPress={() => onChange({ ...value, hilliness })}
            />
          ))}
        </View>
      ) : null}
      {showSteps || supported.avoidBusyRoads ? (
        <View className="flex-row flex-wrap gap-2 mt-2">
          {showSteps ? (
            <RouteChip
              label={t('routes.style.avoidSteps', {
                defaultValue: 'Avoid steps',
              })}
              selected={value.avoidSteps}
              onPress={() =>
                onChange({ ...value, avoidSteps: !value.avoidSteps })
              }
            />
          ) : null}
          {supported.avoidBusyRoads ? (
            <RouteChip
              label={t('routes.style.avoidBusyRoads', {
                defaultValue: 'Avoid busy roads',
              })}
              selected={value.avoidBusyRoads}
              onPress={() =>
                onChange({ ...value, avoidBusyRoads: !value.avoidBusyRoads })
              }
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
};

export default RouteStyleControls;
