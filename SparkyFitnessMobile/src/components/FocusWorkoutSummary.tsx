import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { HEART_RATE_ZONE_COLORS } from '@workspace/shared';
import { useCSSVariable } from 'uniwind';

import { RPE_TONE_VARS } from './ActiveWorkoutSetRow';
import { useEnergyUnit } from '../hooks/useEnergyUnit';
import { useHeartRateZoneColor } from '../hooks/useHeartRateZoneColor';
import { formatLocalizedNumber } from '../localization';
import { energyUnitLabel, formatEnergyNumber } from '../utils/energyUnit';
import { weightFromKg } from '../utils/unitConversions';
import {
  formatDuration,
  type WorkoutHeartRateSummary,
} from '../utils/workoutSession';

export type EffortBand = 'easy' | 'moderate' | 'hard' | 'max';

/** Apple Health's workout effort bands, as the watch shows them: 1-3, 4-6, 7-8, 9-10. */
export function effortBand(rating: number): EffortBand {
  if (rating <= 3) return 'easy';
  if (rating <= 6) return 'moderate';
  if (rating <= 8) return 'hard';
  return 'max';
}

export interface PresetChangesOffer {
  /** Lines on what differs from the preset. */
  changes: string[];
  onUpdate: () => void;
  onKeep: () => void;
  updating: boolean;
}

interface Props {
  sessionName: string;
  completedSetCount: number;
  totalSetCount: number;
  durationMinutes: number;
  volumeKg: number;
  weightUnit: 'kg' | 'lbs';
  caloriesKcal: number | null;
  heartRate: WorkoutHeartRateSummary | null;
  /** The workout's effort, 1 to 10, or null when not rated. */
  effort: number | null;
  onRateEffort: (rating: number) => void;
  presetOffer: PresetChangesOffer | null;
}

function Tile({
  value,
  label,
  color,
}: {
  value: string;
  label: string;
  color?: string;
}) {
  return (
    <View className="flex-1 items-center rounded-[14px] bg-raised px-1 py-2.5">
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        maxFontSizeMultiplier={1.1}
        className="text-[22px] font-bold text-text-primary"
        style={{ fontVariant: ['tabular-nums'], ...(color ? { color } : null) }}
      >
        {value}
      </Text>
      <Text
        maxFontSizeMultiplier={1.1}
        className="text-[11px] font-bold uppercase tracking-wide text-text-secondary"
      >
        {label}
      </Text>
    </View>
  );
}

/**
 * The focus view's workout summary (Phone-Summary board): a Nice work heading,
 * time / volume / kcal / average heart rate tiles (the heart rate in its zone
 * colour, with the zone legend), the How hard rating, and the "You changed
 * this workout" Update / Keep original card.
 */
function FocusWorkoutSummary({
  sessionName,
  completedSetCount,
  totalSetCount,
  durationMinutes,
  volumeKg,
  weightUnit,
  caloriesKcal,
  heartRate,
  effort,
  onRateEffort,
  presetOffer,
}: Props) {
  const { t } = useTranslation();
  const energyUnit = useEnergyUnit();
  const avgBpm = heartRate != null ? Math.round(heartRate.avgBpm) : null;
  const zoneColor = useHeartRateZoneColor(avgBpm);
  const [heartRateColor, ...toneColors] = useCSSVariable([
    '--color-heart-rate',
    RPE_TONE_VARS.easy,
    RPE_TONE_VARS.moderate,
    RPE_TONE_VARS.hard,
    RPE_TONE_VARS.max,
  ]) as string[];
  const [trackColor] = useCSSVariable(['--color-border-strong']) as string[];
  const bandColor: Record<EffortBand, string> = {
    easy: toneColors[0],
    moderate: toneColors[1],
    hard: toneColors[2],
    max: toneColors[3],
  };
  const bandLabel: Record<EffortBand, string> = {
    easy: t('workoutComplete.effort.easy', { defaultValue: 'Easy' }),
    moderate: t('workoutComplete.effort.moderate', {
      defaultValue: 'Moderate',
    }),
    hard: t('workoutComplete.effort.hard', { defaultValue: 'Hard' }),
    max: t('workoutComplete.effort.allOut', { defaultValue: 'All Out' }),
  };

  const volumeText =
    volumeKg <= 0
      ? '—'
      : weightUnit === 'kg' && volumeKg >= 1000
        ? `${formatLocalizedNumber(volumeKg / 1000, { maximumFractionDigits: 1 })} t`
        : `${formatLocalizedNumber(Math.round(weightFromKg(volumeKg, weightUnit)))} ${weightUnit}`;

  return (
    <View className="gap-3.5">
      <View className="items-center">
        <View className="max-w-full rounded-full bg-raised px-5 py-2.5">
          <Text
            numberOfLines={1}
            className="text-[17px] font-bold text-text-primary"
          >
            {sessionName}
          </Text>
        </View>
      </View>
      <View>
        <Text
          accessibilityRole="header"
          className="text-[28px] font-extrabold text-text-primary"
        >
          {t('workoutComplete.focus.niceWork', { defaultValue: 'Nice work' })}
        </Text>
        <Text className="text-[16px] text-text-secondary">
          {t('workoutComplete.focus.setsDone', {
            defaultValue: '{{done}} of {{total}} sets done',
            done: completedSetCount,
            total: totalSetCount,
          })}
        </Text>
      </View>

      <View className="flex-row gap-2">
        <Tile
          label={t('workoutComplete.focus.time', { defaultValue: 'Time' })}
          value={durationMinutes > 0 ? formatDuration(durationMinutes) : '—'}
        />
        <Tile
          label={t('workoutComplete.stats.volume', { defaultValue: 'Volume' })}
          value={volumeText}
        />
        <Tile
          label={energyUnitLabel(energyUnit, t).toUpperCase()}
          value={
            caloriesKcal != null && caloriesKcal > 0
              ? formatEnergyNumber(caloriesKcal, energyUnit)
              : '—'
          }
        />
        <Tile
          label={t('workoutComplete.focus.avgBpm', { defaultValue: 'Avg bpm' })}
          value={avgBpm != null ? String(avgBpm) : '—'}
          color={avgBpm != null ? (zoneColor ?? heartRateColor) : undefined}
        />
      </View>
      {avgBpm != null && (
        <View
          className="flex-row items-center gap-2 px-1"
          testID="focus-summary-zone-legend"
        >
          <View className="flex-row gap-1.5" accessible={false}>
            {HEART_RATE_ZONE_COLORS.map((color) => (
              <View
                key={color}
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: color }}
              />
            ))}
          </View>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            className="flex-1 text-[12px] text-text-secondary"
          >
            {t('workoutComplete.focus.zoneLegend', {
              defaultValue: 'Heart rate takes its zone colour (Zone 1–5)',
            })}
          </Text>
        </View>
      )}

      <View className="gap-2.5 rounded-3xl bg-surface p-4">
        <View className="flex-row items-baseline justify-between">
          <Text className="text-[13px] font-extrabold uppercase tracking-wider text-text-secondary">
            {t('workoutComplete.focus.howHard', { defaultValue: 'How hard' })}
          </Text>
          {effort != null && (
            <Text
              testID="focus-summary-effort"
              className="text-[22px] font-extrabold"
              style={{ color: bandColor[effortBand(effort)] }}
            >
              {`${effort} · ${bandLabel[effortBand(effort)]}`}
            </Text>
          )}
        </View>
        <View className="flex-row gap-1.5">
          {Array.from({ length: 10 }, (_, i) => {
            const rating = i + 1;
            const filled = effort != null && rating <= effort;
            return (
              <Pressable
                key={rating}
                testID={`focus-summary-effort-${rating}`}
                onPress={() => onRateEffort(rating)}
                accessibilityRole="button"
                accessibilityLabel={t('workoutComplete.focus.rateEffort', {
                  defaultValue: 'Rate the workout {{rating}} of 10',
                  rating,
                })}
                hitSlop={{ top: 12, bottom: 12 }}
                className="h-3.5 flex-1 rounded-full"
                style={{
                  backgroundColor: filled
                    ? bandColor[effortBand(rating)]
                    : trackColor,
                }}
              />
            );
          })}
        </View>
        <View className="flex-row justify-between">
          {(['easy', 'moderate', 'hard', 'max'] as const).map((band) => (
            <Text key={band} className="text-[13px] text-text-secondary">
              {bandLabel[band]}
            </Text>
          ))}
        </View>
      </View>

      {presetOffer != null && (
        <View
          className="gap-3 rounded-3xl bg-surface p-4"
          testID="focus-summary-preset-card"
        >
          <Text className="text-[19px] font-extrabold text-text-primary">
            {t('workoutComplete.focus.changedTitle', {
              defaultValue: 'You changed this workout',
            })}
          </Text>
          {presetOffer.changes.length > 0 && (
            <Text className="text-[15px] text-text-secondary">
              {presetOffer.changes.join(' ')}
            </Text>
          )}
          <View className="flex-row gap-3">
            <Pressable
              testID="focus-summary-update-preset"
              onPress={presetOffer.onUpdate}
              disabled={presetOffer.updating}
              accessibilityRole="button"
              className={`h-12 flex-1 items-center justify-center rounded-full bg-accent-primary active:opacity-80 ${presetOffer.updating ? 'opacity-60' : ''}`}
            >
              <Text className="text-[17px] font-bold text-white">
                {t('workoutComplete.actions.update', {
                  defaultValue: 'Update',
                })}
              </Text>
            </Pressable>
            <Pressable
              testID="focus-summary-keep-preset"
              onPress={presetOffer.onKeep}
              disabled={presetOffer.updating}
              accessibilityRole="button"
              className="h-12 flex-1 items-center justify-center rounded-full bg-raised active:opacity-70"
            >
              <Text className="text-[17px] font-bold text-text-primary">
                {t('workoutComplete.focus.keepOriginal', {
                  defaultValue: 'Keep original',
                })}
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

export default React.memo(FocusWorkoutSummary);
