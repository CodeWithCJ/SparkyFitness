import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';
import { useTranslation } from 'react-i18next';

type VerifiedBadgeSize = 'sm' | 'md';

interface VerifiedBadgeProps {
  size?: VerifiedBadgeSize;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

const FALLBACK_CALORIES_COLOR = '#8792E3';

const SIZE_MAP: Record<VerifiedBadgeSize, number> = {
  sm: 18,
  md: 22,
};

const VerifiedBadge: React.FC<VerifiedBadgeProps> = ({
  size = 'sm',
  testID = 'verified-badge',
  style,
}) => {
  const caloriesColor = String(useCSSVariable('--color-calories') || FALLBACK_CALORIES_COLOR);
  const { t } = useTranslation();
  const badgeSize = SIZE_MAP[size];

  return (
    <View
      testID={testID}
      accessibilityRole="image"
      accessibilityLabel={t('mobileComponents.verifiedFood')}
      style={style}
    >
      <Icon
        name="checkmark-circle-filled"
        size={badgeSize}
        color={caloriesColor}
        weight="regular"
      />
    </View>
  );
};

export default VerifiedBadge;
