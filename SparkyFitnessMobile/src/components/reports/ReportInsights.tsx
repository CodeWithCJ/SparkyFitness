import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

/** At most this many lines, so the card stays a glance rather than a list. */
const MAX_INSIGHTS = 4;

/**
 * A few plain-language lines about what stood out in the window, written by the report
 * from numbers it already computed. Renders nothing when there is nothing to say.
 */
const ReportInsights: React.FC<{ lines: string[]; testIDPrefix: string }> = ({
  lines,
  testIDPrefix,
}) => {
  const { t } = useTranslation();
  if (lines.length === 0) return null;
  return (
    <View className="bg-surface rounded-xl p-4 my-2 shadow-sm">
      <Text className="text-text-primary text-lg font-semibold mb-2">
        {t('reports.insights', { defaultValue: 'What stood out' })}
      </Text>
      {lines.slice(0, MAX_INSIGHTS).map((line, index) => (
        <View key={`${index}-${line}`} className="flex-row py-1">
          <Text className="text-text-muted text-sm mr-2">•</Text>
          <Text
            testID={`${testIDPrefix}-insight-${index}`}
            className="text-text-secondary text-sm flex-1"
          >
            {line}
          </Text>
        </View>
      ))}
    </View>
  );
};

export default ReportInsights;
