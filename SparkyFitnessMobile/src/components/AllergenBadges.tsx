import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text } from 'react-native';
import { useAllergenPreferences } from '../hooks/useAllergenPreferences';
import { matchAllergens } from '../utils/allergens';

interface AllergenBadgesProps {
  allergens?: string[] | null;
  traces?: string[] | null;
}

/**
 * Warning badges for a food's allergens and traces, limited to the allergens
 * the user tracks. Renders nothing when the user tracks none, so it costs
 * nothing for people who do not use allergen tracking.
 */
const AllergenBadges: React.FC<AllergenBadgesProps> = ({
  allergens,
  traces,
}) => {
  const { t } = useTranslation();
  const { preferences } = useAllergenPreferences();
  const matched = matchAllergens(
    preferences?.map((p) => p.allergen_name),
    allergens,
    traces
  );

  if (matched.allergens.length === 0 && matched.traces.length === 0) {
    return null;
  }

  return (
    <View className="flex-row flex-wrap gap-1 mt-1" testID="allergen-badges">
      {matched.allergens.map((a) => (
        <View
          key={`allergen-${a}`}
          className="bg-bg-danger-subtle rounded-full px-2 py-0.5"
        >
          <Text className="text-xs font-semibold text-text-danger-subtle capitalize">
            {`⚠ ${a}`}
          </Text>
        </View>
      ))}
      {matched.traces.map((a) => (
        <View
          key={`trace-${a}`}
          className="bg-bg-danger-subtle rounded-full px-2 py-0.5"
        >
          <Text className="text-xs text-text-danger-subtle capitalize">
            {t('allergens.trace', {
              defaultValue: 'trace: {{name}}',
              name: a,
            })}
          </Text>
        </View>
      ))}
    </View>
  );
};

export default AllergenBadges;
