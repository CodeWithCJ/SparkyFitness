import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text } from 'react-native';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';
import { useAllergenPreferences } from '../hooks/useAllergenPreferences';
import { matchAllergens } from '../utils/allergens';

interface AllergenWarningProps {
  allergens?: string[] | null;
  traces?: string[] | null;
}

/**
 * Prominent warning shown when a food (for example one just scanned by
 * barcode) contains an allergen the user tracks. Renders nothing otherwise.
 */
const AllergenWarning: React.FC<AllergenWarningProps> = ({
  allergens,
  traces,
}) => {
  const { t } = useTranslation();
  const { preferences } = useAllergenPreferences();
  const [dangerColor] = useCSSVariable(['--color-text-danger-subtle']) as [
    string,
  ];
  const matched = matchAllergens(
    preferences?.map((p) => p.allergen_name),
    allergens,
    traces
  );

  if (matched.allergens.length === 0 && matched.traces.length === 0) {
    return null;
  }

  return (
    <View
      className="bg-bg-danger-subtle rounded-xl p-3 flex-row gap-2"
      accessibilityRole="alert"
      testID="allergen-warning"
    >
      <Icon name="warning" size={20} color={dangerColor} />
      <View className="flex-1">
        <Text className="text-text-danger-subtle text-base font-semibold">
          {matched.allergens.length > 0
            ? t('allergens.warningTitle', {
                defaultValue: 'Contains an allergen you track',
              })
            : t('allergens.traceWarningTitle', {
                defaultValue: 'May contain an allergen you track',
              })}
        </Text>
        {matched.allergens.length > 0 ? (
          <Text className="text-text-danger-subtle text-sm mt-0.5 capitalize">
            {matched.allergens.join(', ')}
          </Text>
        ) : null}
        {matched.traces.length > 0 ? (
          <Text className="text-text-danger-subtle text-sm mt-0.5">
            {t('allergens.mayContainTraces', {
              defaultValue: 'May contain traces of: {{names}}',
              names: matched.traces.join(', '),
            })}
          </Text>
        ) : null}
      </View>
    </View>
  );
};

export default AllergenWarning;
