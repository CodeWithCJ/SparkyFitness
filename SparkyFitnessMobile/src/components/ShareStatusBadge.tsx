import React from 'react';
import { View, Text } from 'react-native';
import { useCSSVariable } from 'uniwind';

interface ShareStatusBadgeProps {
  status: 'public' | 'family' | 'private' | null | undefined;
}

const ShareStatusBadge: React.FC<ShareStatusBadgeProps> = ({ status }) => {
  const [accentColor, successColor, textSecondaryColor, borderSubtleColor] = useCSSVariable([
    '--color-accent-primary',
    '--color-icon-success',
    '--color-text-secondary',
    '--color-border-subtle',
  ]) as [string, string, string, string];

  if (!status) return null;

  let borderColor = borderSubtleColor;
  let textColor = textSecondaryColor;
  let label = 'Private';

  if (status === 'public') {
    borderColor = successColor || '#10B981';
    textColor = successColor || '#10B981';
    label = 'Public';
  } else if (status === 'family') {
    borderColor = accentColor || '#3B82F6';
    textColor = accentColor || '#3B82F6';
    label = 'Family';
  } else if (status === 'private') {
    borderColor = borderSubtleColor || '#E5E7EB';
    textColor = textSecondaryColor || '#6B7280';
    label = 'Private';
  }

  return (
    <View
      style={{
        borderColor,
        borderWidth: 1,
        borderRadius: 4,
        paddingHorizontal: 4,
        paddingVertical: 2,
        transform: [{ translateY: -2 }],
        flexShrink: 0,
      }}
    >
      <Text
        style={{
          color: textColor,
          fontSize: 9,
          fontWeight: '600',
        }}
      >
        {label}
      </Text>
    </View>
  );
};

export default ShareStatusBadge;
