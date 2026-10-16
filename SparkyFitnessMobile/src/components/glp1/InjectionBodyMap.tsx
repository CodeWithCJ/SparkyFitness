import React from 'react';
import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { useCSSVariable } from 'uniwind';
import {
  INJECTION_BODY_MAP_VIEWBOX,
  INJECTION_BODY_SILHOUETTE_PATH,
  INJECTION_SITE_ZONES,
  type InjectionSite,
} from '@workspace/shared';

interface InjectionBodyMapProps {
  sites: InjectionSite[];
  selectedSiteId: string | null;
  suggestedSiteId?: string | null;
  restingSiteIds?: string[];
  onSelect: (siteId: string) => void;
  /** Rendered width in dp; the map keeps the 1:2 aspect of its viewBox. */
  width?: number;
}

type ZoneState = 'selected' | 'suggested' | 'resting' | 'default';

/**
 * Tappable front-view injection-site body map. The silhouette and zone
 * geometry come from `@workspace/shared`, the same source the web map draws
 * from, so both clients cover the same sites. State colors match web:
 * selected = accent, suggested = green, resting = amber.
 */
const InjectionBodyMap: React.FC<InjectionBodyMapProps> = ({
  sites,
  selectedSiteId,
  suggestedSiteId = null,
  restingSiteIds = [],
  onSelect,
  width = 200,
}) => {
  const [accent, success, warning, silhouette, zoneBase] = useCSSVariable([
    '--color-accent-primary',
    '--color-icon-success',
    '--color-icon-warning',
    '--color-progress-track',
    '--color-border-strong',
  ]) as [string, string, string, string, string];

  const resting = new Set(restingSiteIds);
  const fillFor = (state: ZoneState) =>
    state === 'selected'
      ? accent
      : state === 'suggested'
        ? success
        : state === 'resting'
          ? warning
          : zoneBase;

  return (
    <View className="items-center">
      <Svg
        width={width}
        height={width * 2}
        viewBox={INJECTION_BODY_MAP_VIEWBOX}
      >
        <Path d={INJECTION_BODY_SILHOUETTE_PATH} fill={silhouette} />
        {sites.map((site) => {
          const zone = INJECTION_SITE_ZONES[site.id];
          if (!zone) return null;
          const state: ZoneState =
            selectedSiteId === site.id
              ? 'selected'
              : suggestedSiteId === site.id
                ? 'suggested'
                : resting.has(site.id)
                  ? 'resting'
                  : 'default';
          return (
            <Rect
              key={site.id}
              x={zone.x}
              y={zone.y}
              width={zone.w}
              height={zone.h}
              rx={5}
              transform={
                zone.rotate
                  ? `rotate(${zone.rotate} ${zone.x + zone.w / 2} ${zone.y})`
                  : undefined
              }
              fill={fillFor(state)}
              fillOpacity={state === 'default' ? 0.55 : 0.9}
              stroke={fillFor(state)}
              strokeWidth={state === 'selected' ? 3 : 1}
              onPress={() => onSelect(site.id)}
            />
          );
        })}
      </Svg>
    </View>
  );
};

export default InjectionBodyMap;
