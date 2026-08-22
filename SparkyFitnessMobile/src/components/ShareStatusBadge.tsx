import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';

interface ShareStatusBadgeProps {
  status: 'public' | 'family' | 'private' | null | undefined;
  style?: StyleProp<ViewStyle>;
}

const ShareStatusBadge: React.FC<ShareStatusBadgeProps> = ({ status, style }) => {
  const { t } = useTranslation();
  const [accentColor, successColor] = useCSSVariable([
    '--color-accent-primary',
    '--color-icon-success',
  ]) as [string, string];

  if (status !== 'public' && status !== 'family') return null;

  const isPublic = status === 'public';

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={isPublic
        ? t('shareStatus.public', { defaultValue: 'Shared publicly' })
        : t('shareStatus.family', { defaultValue: 'Shared with family' })}
      testID={`share-status-${status}`}
      style={[{ flexShrink: 0 }, style]}
    >
      <Icon
        name={isPublic ? 'globe' : 'people'}
        size={16}
        color={isPublic ? successColor : accentColor}
      />
    </View>
  );
};

export default ShareStatusBadge;
