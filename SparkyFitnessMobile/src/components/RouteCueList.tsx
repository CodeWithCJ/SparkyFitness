import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { RouteCue, RouteCueKind } from '@workspace/shared';
import { formatRouteDistance, type DistanceUnit } from '../utils/routeDisplay';

const COLLAPSED_COUNT = 8;

/** Cues worth listing: every instruction except "carry straight on". */
export function listableRouteCues(cues: readonly RouteCue[]): RouteCue[] {
  return cues.filter((cue) => cue.kind !== 'straight');
}

interface Props {
  cues: readonly RouteCue[];
  unit: DistanceUnit;
}

/** The turns of a route as a numbered list with the distance to each. */
const RouteCueList: React.FC<Props> = ({ cues, unit }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const listed = listableRouteCues(cues);
  if (listed.length === 0) return null;

  const kindLabel: Record<RouteCueKind, string> = {
    depart: t('routes.cue.depart', { defaultValue: 'Start' }),
    straight: t('routes.cue.straight', { defaultValue: 'Continue straight' }),
    slight_left: t('routes.cue.slight_left', { defaultValue: 'Bear left' }),
    left: t('routes.cue.left', { defaultValue: 'Turn left' }),
    sharp_left: t('routes.cue.sharp_left', { defaultValue: 'Sharp left' }),
    slight_right: t('routes.cue.slight_right', { defaultValue: 'Bear right' }),
    right: t('routes.cue.right', { defaultValue: 'Turn right' }),
    sharp_right: t('routes.cue.sharp_right', { defaultValue: 'Sharp right' }),
    uturn: t('routes.cue.uturn', { defaultValue: 'Make a U-turn' }),
    arrive: t('routes.cue.arrive', { defaultValue: 'Arrive' }),
  };
  const shown = expanded ? listed : listed.slice(0, COLLAPSED_COUNT);

  return (
    <View className="bg-surface rounded-xl p-4 mt-4">
      <Text className="text-text-primary text-base font-bold mb-2">
        {t('routes.turns', { defaultValue: 'Turns' })}
      </Text>
      {shown.map((cue, index) => (
        <View
          key={`${cue.index}-${index}`}
          className="flex-row items-start py-1.5"
        >
          <Text className="text-text-secondary text-sm w-7">{index + 1}.</Text>
          <Text className="text-text-primary text-sm flex-1">
            {cue.text?.trim() ? cue.text : kindLabel[cue.kind]}
          </Text>
          {cue.distanceM !== undefined ? (
            <Text className="text-text-secondary text-sm ml-2">
              {formatRouteDistance(cue.distanceM, unit)}
            </Text>
          ) : null}
        </View>
      ))}
      {listed.length > COLLAPSED_COUNT ? (
        <Pressable
          onPress={() => setExpanded((value) => !value)}
          accessibilityRole="button"
          className="pt-2"
        >
          <Text className="text-accent-primary text-sm font-semibold">
            {expanded
              ? t('routes.showFewerTurns', { defaultValue: 'Show fewer' })
              : t('routes.showAllTurns', {
                  count: listed.length,
                  defaultValue: 'Show all {{count}} turns',
                  defaultValue_one: 'Show all {{count}} turn',
                  defaultValue_other: 'Show all {{count}} turns',
                })}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
};

export default RouteCueList;
