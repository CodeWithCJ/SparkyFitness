import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text } from 'react-native';
import { HEART_RATE_ZONE_COLORS } from '@workspace/shared';
import { formatLocalizedNumber } from '../../localization';
import type { HeartRateZoneRow } from '../../utils/cardioSession';
import { zoneMethodLabel } from '../../utils/heartRateZoneLabels';

const HeartRateZones: React.FC<{ zones: readonly HeartRateZoneRow[] }> = ({
  zones,
}) => {
  const { t } = useTranslation();
  const methodLabel = zoneMethodLabel(t, zones[0]?.method ?? null);
  return (
    <View>
      {methodLabel ? (
        <Text
          testID="heart-rate-zones-method"
          className="text-text-muted text-xs mb-2.5"
        >
          {methodLabel}
        </Text>
      ) : null}
      {zones.map((zone) => {
        const minutes = Math.round(zone.seconds / 60);
        const color =
          HEART_RATE_ZONE_COLORS[
            Math.min(Math.max(zone.zone, 1), HEART_RATE_ZONE_COLORS.length) - 1
          ];
        return (
          <View key={zone.zone} className="mb-2.5">
            <View className="flex-row justify-between mb-1">
              <Text className="text-text-primary text-sm">
                {t('exerciseStatistics.cardio.zone', {
                  defaultValue: 'Zone {{zone}}',
                  zone: zone.zone,
                })}
                {zone.lowerBpm != null ? (
                  <Text className="text-text-muted text-xs">
                    {'  '}
                    {t('exerciseStatistics.cardio.zoneFrom', {
                      defaultValue: 'from {{bpm}} bpm',
                      bpm: formatLocalizedNumber(zone.lowerBpm),
                    })}
                  </Text>
                ) : null}
              </Text>
              <Text className="text-text-secondary text-sm">
                {/* Under a minute would round to "0 min" and read as none. */}
                {zone.seconds > 0 && zone.seconds < 60
                  ? t('exerciseStatistics.cardio.underOneMinute', {
                      defaultValue: '<1 min',
                    })
                  : t('exerciseStatistics.cardio.minutes', {
                      count: minutes,
                      formattedCount: formatLocalizedNumber(minutes),
                      defaultValue: '{{formattedCount}} min',
                      defaultValue_one: '{{formattedCount}} min',
                      defaultValue_other: '{{formattedCount}} min',
                    })}
              </Text>
            </View>
            <View className="h-2 rounded-full bg-progress-track overflow-hidden">
              <View
                className="h-2 rounded-full"
                style={{
                  width: `${Math.round(zone.share * 100)}%`,
                  backgroundColor: color,
                }}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
};

export default HeartRateZones;
