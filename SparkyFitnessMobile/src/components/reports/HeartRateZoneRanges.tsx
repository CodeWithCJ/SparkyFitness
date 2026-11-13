import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, TouchableOpacity, View } from 'react-native';
import {
  heartRateDisplayBands,
  type HrZoneDisplayCount,
  type ResolvedHeartRateZones,
} from '@workspace/shared';
import { formatLocalizedNumber } from '../../localization';
import {
  displayBandLabel,
  maxHrSourceLabel,
  methodName,
} from '../../utils/heartRateZoneLabels';

interface HeartRateZoneRangesProps {
  resolved: ResolvedHeartRateZones;
  /** Five zones or four tiers. */
  displayZones: HrZoneDisplayCount;
  /** True until the person's own zones have loaded. */
  isDefault: boolean;
  onOpenSettings: () => void;
}

/**
 * The person's five heart rate zones with their bpm ranges, and where they
 * come from. The report only has daily summaries, so there is no time in zone
 * here; that lives on each workout.
 */
const HeartRateZoneRanges: React.FC<HeartRateZoneRangesProps> = ({
  resolved,
  displayZones,
  isDefault,
  onOpenSettings,
}) => {
  const { t } = useTranslation();
  const bands = heartRateDisplayBands(resolved.zones, displayZones);

  return (
    <View testID="heart-rate-zone-ranges">
      {bands.map((band, i) => (
        <View
          key={band.index}
          testID={`heart-rate-zone-row-${band.index}`}
          className={`flex-row items-center justify-between py-1.5 ${
            i < bands.length - 1 ? 'border-b border-border-subtle' : ''
          }`}
        >
          <View className="flex-row items-center gap-2">
            <View
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: band.color }}
            />
            <Text className="text-text-primary text-sm font-medium">
              {displayBandLabel(t, band)}
            </Text>
          </View>
          <Text className="text-text-secondary text-xs">
            {band.upperBpm === null
              ? t('heartRateZones.zoneRangeOpen', {
                  defaultValue: '{{lower}}+ bpm',
                  lower: formatLocalizedNumber(band.lowerBpm),
                })
              : t('heartRateZones.zoneRange', {
                  defaultValue: '{{lower}}–{{upper}} bpm',
                  lower: formatLocalizedNumber(band.lowerBpm),
                  upper: formatLocalizedNumber(band.upperBpm),
                })}
          </Text>
        </View>
      ))}
      <Text
        testID="heart-rate-zone-source"
        className="text-text-muted text-xs mt-3"
      >
        {isDefault
          ? t('reports.zoneSourceDefault', {
              defaultValue:
                'Typical zones (% of a 190 bpm max) until your own zones load.',
            })
          : t('reports.zoneSource', {
              defaultValue:
                'Your zones: {{method}}, max heart rate {{max}} bpm ({{source}}).',
              method: methodName(t, resolved.effectiveMethod),
              max: formatLocalizedNumber(resolved.maxHr),
              source: maxHrSourceLabel(t, resolved.maxHrSource),
            })}
      </Text>
      <TouchableOpacity
        testID="heart-rate-zone-settings-link"
        onPress={onOpenSettings}
        accessibilityRole="link"
        className="mt-1"
      >
        <Text className="text-text-link text-xs">
          {t('reports.zoneSettingsLink', {
            defaultValue: 'Heart rate zone settings',
          })}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

export default HeartRateZoneRanges;
