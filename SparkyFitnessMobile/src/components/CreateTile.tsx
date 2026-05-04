import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useCSSVariable } from 'uniwind';
import Icon, { type IconName } from './Icon';

interface CreateTileProps {
  icon: IconName;
  title: string;
  subtitle: string;
  onPress: () => void;
  className?: string;
}

const CreateTile: React.FC<CreateTileProps> = ({
  icon,
  title,
  subtitle,
  onPress,
  className = '',
}) => {
  const accentPrimary = useCSSVariable('--color-accent-primary') as string;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className={`bg-surface rounded-xl px-3 py-3 flex-row items-center shadow-sm ${className}`}
    >
      <Icon name={icon} size={24} color={accentPrimary} />
      <View className="flex-1 ml-4">
        <Text className="text-text-primary text-sm font-medium" numberOfLines={1}>
          {title}
        </Text>
        <Text className="text-text-secondary text-xs" numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

export default CreateTile;
