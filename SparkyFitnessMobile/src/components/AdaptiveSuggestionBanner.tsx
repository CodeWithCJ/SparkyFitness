import React from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Pressable, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { AdaptiveAdjustment, AdaptiveReason } from '@workspace/shared';
import Icon from './Icon';

export function adaptiveReasonText(
  t: TFunction,
  reason: AdaptiveReason
): string {
  switch (reason) {
    case 'pain_reported':
      return t('adaptiveCoaching.reasons.painReported', {
        defaultValue: 'Lighter today: you reported pain here last time.',
      });
    case 'pain_repeated':
      return t('adaptiveCoaching.reasons.painRepeated', {
        defaultValue:
          'Lighter today: pain here two sessions running. Consider an alternative.',
      });
    case 'session_pain':
      return t('adaptiveCoaching.reasons.sessionPain', {
        defaultValue:
          'Holding weight: you reported discomfort in your last workout.',
      });
    case 'too_hard':
      return t('adaptiveCoaching.reasons.tooHard', {
        defaultValue: 'Holding weight: last time felt too hard.',
      });
    case 'too_hard_repeated':
      return t('adaptiveCoaching.reasons.tooHardRepeated', {
        defaultValue: 'Lighter today: too hard two sessions running.',
      });
    case 'high_effort':
      return t('adaptiveCoaching.reasons.highEffort', {
        defaultValue: 'Holding weight: your last sets were near max effort.',
      });
    case 'low_effort':
      return t('adaptiveCoaching.reasons.lowEffort', {
        defaultValue: 'A step heavier: your last sets were logged as easy.',
      });
    case 'too_easy_repeated':
      return t('adaptiveCoaching.reasons.tooEasyRepeated', {
        defaultValue: 'A step heavier: too easy two sessions running.',
      });
  }
}

interface AdaptiveSuggestionBannerProps {
  adjustment: AdaptiveAdjustment;
  /** The lifter declined this adjustment; offer to turn it back on. */
  declined: boolean;
  /** Suggest swapping for variety (no load change involved). */
  suggestVariation: boolean;
  onDecline: () => void;
  onRestore: () => void;
  onSeeAlternatives?: () => void;
}

/**
 * Why today's suggested weight differs from last time (issue #1560), with a
 * one-tap way back to the usual suggestion. An unexplained weight change
 * reads as a bug, so an adjustment is never applied without this.
 */
const AdaptiveSuggestionBanner: React.FC<AdaptiveSuggestionBannerProps> = ({
  adjustment,
  declined,
  suggestVariation,
  onDecline,
  onRestore,
  onSeeAlternatives,
}) => {
  const { t } = useTranslation();
  const [accentColor, textSecondary] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-secondary',
  ]) as [string, string];

  const showAlternatives =
    onSeeAlternatives != null &&
    ((adjustment.suggestAlternative && !declined) || suggestVariation);

  let message: string | null = null;
  if (adjustment.reason && !declined) {
    message = adaptiveReasonText(t, adjustment.reason);
  } else if (adjustment.reason && declined) {
    message = t('adaptiveCoaching.declined', {
      defaultValue: 'Using your usual suggestion.',
    });
  } else if (suggestVariation) {
    message = t('adaptiveCoaching.variation', {
      defaultValue:
        "You've done this in most recent workouts. Try a variation?",
    });
  }
  if (message == null) return null;

  return (
    <View
      className="mt-2.5 mb-1 px-2.5 py-2 rounded-lg bg-raised border border-border-subtle"
      testID="adaptive-suggestion-banner"
    >
      <View className="flex-row items-start gap-1.5">
        <Icon
          name={adjustment.kind === 'increase' ? 'arrow-up' : 'info-circle'}
          size={16}
          color={declined ? textSecondary : accentColor}
        />
        <Text className="text-xs font-medium text-text-primary flex-1">
          {message}
        </Text>
      </View>
      <View className="flex-row flex-wrap gap-3 mt-1.5 ml-5">
        {adjustment.reason && !declined && (
          <Pressable onPress={onDecline} accessibilityRole="button" hitSlop={6}>
            <Text className="text-xs font-semibold text-accent-primary">
              {t('adaptiveCoaching.useUsual', {
                defaultValue: 'Use my usual',
              })}
            </Text>
          </Pressable>
        )}
        {adjustment.reason && declined && (
          <Pressable onPress={onRestore} accessibilityRole="button" hitSlop={6}>
            <Text className="text-xs font-semibold text-accent-primary">
              {t('adaptiveCoaching.useAdjusted', {
                defaultValue: 'Use the adjusted suggestion',
              })}
            </Text>
          </Pressable>
        )}
        {showAlternatives && (
          <Pressable
            onPress={onSeeAlternatives}
            accessibilityRole="button"
            hitSlop={6}
          >
            <Text className="text-xs font-semibold text-accent-primary">
              {t('adaptiveCoaching.seeAlternatives', {
                defaultValue: 'See alternatives',
              })}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
};

export default AdaptiveSuggestionBanner;
