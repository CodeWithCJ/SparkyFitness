import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { GeneratedRouteOption, RouteOptionLabel } from '@workspace/shared';
import {
  formatRouteClimb,
  formatRouteDistance,
  type DistanceUnit,
} from '../utils/routeDisplay';

interface RouteOptionCardsProps {
  options: readonly GeneratedRouteOption[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  unit: DistanceUnit;
}

/** The options of one request side by side; the chosen one is on the map. */
const RouteOptionCards: React.FC<RouteOptionCardsProps> = ({
  options,
  selectedIndex,
  onSelect,
  unit,
}) => {
  const { t } = useTranslation();
  const labelText: Record<RouteOptionLabel, string> = {
    flatter: t('routes.option.flatter', { defaultValue: 'Flatter' }),
    moreTrail: t('routes.option.moreTrail', { defaultValue: 'More trail' }),
    shorter: t('routes.option.shorter', { defaultValue: 'Shorter' }),
  };

  return (
    <View className="flex-row gap-2" testID="route-option-cards">
      {options.map((option, index) => {
        const selected = index === selectedIndex;
        const title = t('routes.option.title', {
          n: index + 1,
          defaultValue: 'Option {{n}}',
        });
        const distance = formatRouteDistance(option.route.distanceM, unit);
        const climb =
          option.route.elevationGainM !== null
            ? t('routes.climb', {
                climb: formatRouteClimb(option.route.elevationGainM, unit),
                defaultValue: '{{climb}} climb',
              })
            : null;
        return (
          <Pressable
            key={index}
            onPress={() => onSelect(index)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={[
              title,
              option.label ? labelText[option.label] : null,
              distance,
              climb,
            ]
              .filter(Boolean)
              .join(', ')}
            testID={`route-option-${index}`}
            className={`flex-1 rounded-xl border px-3 py-2 ${
              selected
                ? 'border-accent-primary bg-surface-secondary'
                : 'border-border-subtle'
            }`}
          >
            <Text className="text-text-primary text-sm font-semibold">
              {title}
            </Text>
            <Text className="text-text-primary text-sm mt-1">{distance}</Text>
            {climb ? (
              <Text className="text-text-secondary text-xs">{climb}</Text>
            ) : null}
            {option.label ? (
              <Text className="text-accent-primary text-xs font-semibold mt-1">
                {labelText[option.label]}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
};

export default RouteOptionCards;
