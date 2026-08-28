import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, type StyleProp, type ViewStyle } from 'react-native';

interface AiEstimateBadgeProps {
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Marks a food whose nutrition came from an AI estimate.
 *
 * Photo-created ingredients are ordinary and searchable on purpose, so a later
 * photo can match and reuse them — which also means an estimate is otherwise
 * indistinguishable from a barcode-scanned or provider-sourced food in the
 * library list, which has no other AI marker.
 *
 * Driven by the variant's `source` / `ai_confidence`, the same signal FoodForm
 * and the web result card already use, rather than a second provider_type
 * check that could drift from them.
 */
const AiEstimateBadge: React.FC<AiEstimateBadgeProps> = ({
  testID = 'ai-estimate-badge',
  style,
}) => {
  const { t } = useTranslation();
  return (
    <View
      testID={testID}
      style={style}
      className="px-1.5 py-0.5 rounded-full bg-bg-warning"
      accessibilityLabel={t('foodProvenance.aiEstimateAccessibility', {
        defaultValue: 'Nutrition estimated by AI',
      })}
    >
      <Text className="text-[10px] font-semibold text-text-warning">
        {t('foodProvenance.aiEstimate', { defaultValue: 'AI estimate' })}
      </Text>
    </View>
  );
};

export default AiEstimateBadge;
