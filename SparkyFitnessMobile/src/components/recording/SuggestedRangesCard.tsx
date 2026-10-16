import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { HeartRateBand, PaceReferenceRace } from '@workspace/shared';
import { formatLocalizedNumber } from '../../localization';
import { formatClock } from '../../utils/gpsRecording';
import { raceResultText } from '../../utils/paceReference';
import type { PaceBandChoice } from './PaceBandCard';

export interface SuggestedRangesCardProps {
  unit: 'km' | 'miles';
  /**
   * Pace ranges in the display unit; null when there is no history or race to
   * base them on. `race` is set when they come from a recent race result, and
   * `efforts` has the ranges for tempo, marathon-pace and stride stretches.
   */
  pace: {
    work: PaceBandChoice;
    easy: PaceBandChoice;
    warm: PaceBandChoice;
    sessions: number;
    race?: PaceReferenceRace | null;
    efforts?: {
      tempo?: PaceBandChoice;
      marathon?: PaceBandChoice;
      stride?: PaceBandChoice;
    };
  } | null;
  /** Heart-rate ranges; null without a birth date, or without a watch to read them. */
  heartRate: {
    work: HeartRateBand;
    easy: HeartRateBand;
    warm: HeartRateBand;
    maxHeartRate: number;
  } | null;
  onUse: () => void;
}

/**
 * Starting ranges for a plan's fast and easy stretches and its warm-up and cool-down, with where they came
 * from. Nothing is switched on until the person taps Use.
 */
const SuggestedRangesCard: React.FC<SuggestedRangesCardProps> = ({
  unit,
  pace,
  heartRate,
  onUse,
}) => {
  const { t } = useTranslation();
  if (!pace && !heartRate) return null;
  const unitLabel =
    unit === 'miles'
      ? t('recordActivity.unitMi', { defaultValue: 'mi' })
      : t('recordActivity.unitKm', { defaultValue: 'km' });
  const paceUnit = t('recordActivity.perUnit', {
    defaultValue: '/{{unit}}',
    unit: unitLabel,
  });
  const bpmLabel = t('recordActivity.unitBpm', { defaultValue: 'bpm' });
  const paceText = (band: PaceBandChoice) =>
    `${formatClock(band.fastest)}–${formatClock(band.slowest)}${paceUnit}`;
  const bpmText = (band: HeartRateBand) =>
    `${band.minBpm}–${band.maxBpm} ${bpmLabel}`;

  return (
    <View
      testID="suggested-ranges-card"
      className="bg-surface rounded-xl p-4 mt-4"
    >
      <Text className="text-text-primary text-base font-semibold">
        {t('recordActivity.suggestedRanges.title', {
          defaultValue: 'Suggested ranges',
        })}
      </Text>
      {pace ? (
        <View className="mt-2">
          <Text className="text-text-primary text-sm">
            {t('recordActivity.suggestedRanges.pace', {
              fast: paceText(pace.work),
              easy: paceText(pace.easy),
              warm: paceText(pace.warm),
              defaultValue:
                'Pace: fast {{fast}}, easy {{easy}}, warm-up and cool-down {{warm}}',
            })}
          </Text>
          {pace.efforts && Object.keys(pace.efforts).length > 0 ? (
            <Text className="text-text-primary text-sm mt-0.5">
              {[
                pace.efforts.tempo
                  ? t('recordActivity.suggestedRanges.tempo', {
                      range: paceText(pace.efforts.tempo),
                      defaultValue: 'tempo {{range}}',
                    })
                  : null,
                pace.efforts.marathon
                  ? t('recordActivity.suggestedRanges.marathonPace', {
                      range: paceText(pace.efforts.marathon),
                      defaultValue: 'marathon pace {{range}}',
                    })
                  : null,
                pace.efforts.stride
                  ? t('recordActivity.suggestedRanges.strides', {
                      range: paceText(pace.efforts.stride),
                      defaultValue: 'strides {{range}}',
                    })
                  : null,
              ]
                .filter(Boolean)
                .join(', ')}
            </Text>
          ) : null}
          <Text className="text-text-secondary text-xs mt-0.5">
            {pace.race
              ? t('recordActivity.suggestedRanges.paceSourceRace', {
                  race: raceResultText(t, pace.race),
                  defaultValue: 'Based on your recent race: {{race}}.',
                })
              : t('recordActivity.suggestedRanges.paceSource', {
                  count: pace.sessions,
                  formattedCount: formatLocalizedNumber(pace.sessions),
                  defaultValue_one:
                    'Based on your last {{formattedCount}} session.',
                  defaultValue_other:
                    'Based on your last {{formattedCount}} sessions.',
                  defaultValue:
                    'Based on your last {{formattedCount}} sessions.',
                })}
          </Text>
        </View>
      ) : null}
      {heartRate ? (
        <View className="mt-2">
          <Text className="text-text-primary text-sm">
            {t('recordActivity.suggestedRanges.heartRate', {
              fast: bpmText(heartRate.work),
              easy: bpmText(heartRate.easy),
              warm: bpmText(heartRate.warm),
              defaultValue:
                'Heart rate: fast {{fast}}, easy {{easy}}, warm-up and cool-down {{warm}}',
            })}
          </Text>
          <Text className="text-text-secondary text-xs mt-0.5">
            {t('recordActivity.suggestedRanges.heartRateSource', {
              max: heartRate.maxHeartRate,
              defaultValue:
                'From an estimated maximum of {{max}} bpm for your age.',
            })}
          </Text>
        </View>
      ) : null}
      <TouchableOpacity
        testID="suggested-ranges-use"
        accessibilityRole="button"
        onPress={onUse}
        activeOpacity={0.7}
        className="self-start mt-3 bg-accent-primary rounded-lg px-4 py-2"
      >
        <Text className="text-white font-semibold">
          {t('recordActivity.suggestedRanges.use', {
            defaultValue: 'Use these',
          })}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

export default SuggestedRangesCard;
