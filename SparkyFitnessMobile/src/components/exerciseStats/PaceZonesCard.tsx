import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { PACE_ZONE_IDS, type PaceZoneId } from '@workspace/shared';
import { formatLocalizedNumber } from '../../localization';
import { formatPace } from '../../utils/gpsRecording';
import type { PaceZonesResult } from '../../utils/paceZones';

interface PaceZonesCardProps {
  result: PaceZonesResult;
  distanceUnit: 'km' | 'miles';
}

/** Easy to hard, matching the heart-rate zone colors. */
const ZONE_COLORS: Record<PaceZoneId, string> = {
  easy: '#94a3b8',
  steady: '#3b82f6',
  threshold: '#22c55e',
  interval: '#f59e0b',
  repetition: '#ef4444',
};

/**
 * The runner's training paces, one row per zone, easy to hard, in their
 * distance unit. Zones are estimates from recent runs, said so on the card.
 */
const PaceZonesCard: React.FC<PaceZonesCardProps> = ({
  result,
  distanceUnit,
}) => {
  const { t } = useTranslation();
  const perUnit = distanceUnit === 'miles' ? 1.609344 : 1;
  const unitLabel =
    distanceUnit === 'miles'
      ? t('exerciseStatistics.paceZones.perMile', { defaultValue: '/mi' })
      : t('exerciseStatistics.paceZones.perKm', { defaultValue: '/km' });

  const zoneName = (id: PaceZoneId): string => {
    switch (id) {
      case 'easy':
        return t('exerciseStatistics.paceZones.easy', {
          defaultValue: 'Easy',
        });
      case 'steady':
        return t('exerciseStatistics.paceZones.steady', {
          defaultValue: 'Steady',
        });
      case 'threshold':
        return t('exerciseStatistics.paceZones.threshold', {
          defaultValue: 'Threshold',
        });
      case 'interval':
        return t('exerciseStatistics.paceZones.interval', {
          defaultValue: 'Interval',
        });
      default:
        return t('exerciseStatistics.paceZones.repetition', {
          defaultValue: 'Repetition',
        });
    }
  };

  return (
    <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
      <Text className="text-text-primary text-base font-semibold mb-1">
        {t('exerciseStatistics.paceZones.title', {
          defaultValue: 'Pace zones',
        })}
      </Text>
      <Text className="text-text-secondary text-xs mb-3">
        {result.source === 'effort'
          ? t('exerciseStatistics.paceZones.fromEffort', {
              pace: formatPace(result.thresholdSecondsPerKm * perUnit),
              unit: unitLabel,
              defaultValue:
                'Built from your best recent run. Threshold pace is about {{pace}} {{unit}}.',
            })
          : t('exerciseStatistics.paceZones.fromTypical', {
              count: result.sessions,
              formattedCount: formatLocalizedNumber(result.sessions),
              defaultValue_one:
                'Estimated from your last {{formattedCount}} run, so less precise. A hard run of 3 km or more sharpens it.',
              defaultValue_other:
                'Estimated from your last {{formattedCount}} runs, so less precise. A hard run of 3 km or more sharpens it.',
              defaultValue:
                'Estimated from your last {{formattedCount}} runs, so less precise. A hard run of 3 km or more sharpens it.',
            })}
      </Text>
      {PACE_ZONE_IDS.map((id) => {
        const zone = result.zones.find((z) => z.id === id);
        if (!zone) return null;
        return (
          <View
            key={id}
            testID={`pace-zone-${id}`}
            className="flex-row items-center justify-between py-1.5"
          >
            <View className="flex-row items-center">
              <View
                className="w-2.5 h-2.5 rounded-full mr-2"
                style={{ backgroundColor: ZONE_COLORS[id] }}
              />
              <Text className="text-text-primary text-sm">{zoneName(id)}</Text>
            </View>
            <Text className="text-text-secondary text-sm">
              {t('exerciseStatistics.paceZones.range', {
                fast: formatPace(zone.minSecondsPerKm * perUnit),
                slow: formatPace(zone.maxSecondsPerKm * perUnit),
                unit: unitLabel,
                defaultValue: '{{fast}} – {{slow}} {{unit}}',
              })}
            </Text>
          </View>
        );
      })}
    </View>
  );
};

export default PaceZonesCard;
