import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';
import { formatLocalizedNumber } from '../localization';
import { weightFromKg } from '../utils/unitConversions';

interface BodyweightBannerProps {
  /** The person's latest body weight in kg; null when none is logged. */
  bodyWeightKg: number | null;
  weightUnit: 'kg' | 'lbs';
}

/**
 * Explains how a bodyweight exercise counts: the body weight plus the weight
 * entered, negative for assistance. Shown above the set table by the list card
 * and the focus view.
 */
function BodyweightBanner({ bodyWeightKg, weightUnit }: BodyweightBannerProps) {
  const { t } = useTranslation();
  const accentPrimary = String(useCSSVariable('--color-accent-primary'));
  const unitLabel =
    weightUnit === 'kg'
      ? t('workout.kg', { defaultValue: 'kg' })
      : t('workout.lbs', { defaultValue: 'lbs' });
  return (
    <View
      className="mx-1 mb-1 flex-row items-start gap-2 rounded-lg bg-surface-secondary px-3 py-2"
      accessibilityRole="text"
      testID="bodyweight-banner"
    >
      <Icon name="info-circle" size={14} color={accentPrimary} />
      <Text className="flex-1 text-xs text-text-secondary">
        {bodyWeightKg != null
          ? t('workout.bodyweightBanner', {
              defaultValue:
                'Bodyweight exercise: counts your body weight ({{bodyWeight}} {{unit}}) plus the weight you enter. Use a minus sign for assistance.',
              bodyWeight: formatLocalizedNumber(
                weightFromKg(bodyWeightKg, weightUnit),
                { maximumFractionDigits: 1 }
              ),
              unit: unitLabel,
            })
          : t('workout.bodyweightBannerNoWeight', {
              defaultValue:
                'Bodyweight exercise: counts your body weight plus the weight you enter. Use a minus sign for assistance. Log a body weight so volume can be calculated.',
            })}
      </Text>
    </View>
  );
}

export default React.memo(BodyweightBanner);
