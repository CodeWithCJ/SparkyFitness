import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useCSSVariable } from 'uniwind';
import Icon, { type IconName } from './Icon';
import Button from './ui/Button';

interface StatusViewAction {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
}

interface StatusViewProps {
  /** Show a loading spinner instead of an icon */
  loading?: boolean;
  /** Icon to display (ignored when loading) */
  icon?: IconName;
  /** Icon color (defaults to accent-primary) */
  iconColor?: string;
  /** Icon size (default 48) */
  iconSize?: number;
  /** Primary message */
  title?: string;
  /** Secondary message below the title */
  subtitle?: string;
  /** Action button */
  action?: StatusViewAction;
  /** Additional className for the outer container */
  className?: string;
}

export default function StatusView({
  loading,
  icon,
  iconColor,
  iconSize = 48,
  title,
  subtitle,
  action,
  className,
}: StatusViewProps) {
  const accentColor = useCSSVariable('--color-accent-primary') as string;

  return (
    <View className={`flex-1 justify-center items-center px-6 ${className ?? ''}`}>
      {loading ? (
        <ActivityIndicator size="large" color={accentColor} />
      ) : icon ? (
        <Icon name={icon} size={iconSize} color={iconColor ?? accentColor} />
      ) : null}
      {title && (
        <Text className="text-text-secondary text-base mt-4 text-center">
          {title}
        </Text>
      )}
      {subtitle && (
        <Text className="text-text-secondary text-sm mt-2 text-center">
          {subtitle}
        </Text>
      )}
      {action && (
        <Button
          variant={action.variant ?? 'secondary'}
          onPress={action.onPress}
          className="mt-4 px-6"
        >
          {action.label}
        </Button>
      )}
    </View>
  );
}
