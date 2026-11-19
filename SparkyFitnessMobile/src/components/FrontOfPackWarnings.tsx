import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type {
  FrontOfPackWarning,
  FrontOfPackWarningRegion,
} from '@workspace/shared';
import Icon from './Icon';

interface FrontOfPackWarningsProps {
  region: FrontOfPackWarningRegion;
  warnings: readonly FrontOfPackWarning[];
}

/** The region's "high in ..." seals for one food; renders nothing when none apply. */
const FrontOfPackWarnings: React.FC<FrontOfPackWarningsProps> = ({
  region,
  warnings,
}) => {
  const { t } = useTranslation();
  const [dangerColor] = useCSSVariable(['--color-text-danger-subtle']) as [
    string,
  ];
  if (warnings.length === 0) return null;

  const labels: Record<FrontOfPackWarning, string> = {
    calories: t('foodDetail.warning.calories', {
      defaultValue: 'High in calories',
    }),
    sugars: t('foodDetail.warning.sugars', { defaultValue: 'High in sugars' }),
    added_sugars: t('foodDetail.warning.addedSugars', {
      defaultValue: 'High in added sugar',
    }),
    saturated_fat: t('foodDetail.warning.saturatedFat', {
      defaultValue: 'High in saturated fat',
    }),
    trans_fat: t('foodDetail.warning.transFat', {
      defaultValue: 'High in trans fat',
    }),
    sodium: t('foodDetail.warning.sodium', { defaultValue: 'High in sodium' }),
  };

  return (
    <View
      testID={`front-of-pack-warnings-${region}`}
      className="flex-row flex-wrap gap-2"
    >
      {warnings.map((warning) => (
        <View
          key={warning}
          className="flex-row items-center gap-1 rounded-full bg-bg-danger-subtle px-3 py-1"
        >
          <Icon
            name={region === 'brazil' ? 'search' : 'warning'}
            size={14}
            color={dangerColor}
          />
          <Text className="text-xs font-semibold text-text-danger-subtle">
            {labels[warning]}
          </Text>
        </View>
      ))}
    </View>
  );
};

export default FrontOfPackWarnings;
