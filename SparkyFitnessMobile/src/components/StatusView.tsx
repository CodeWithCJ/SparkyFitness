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
  /** Icon color theme intent (default 'accent') */
  iconTone?: 'accent' | 'muted' | 'danger';
  /** Explicit icon color; overrides iconTone */
  iconColor?: string;
  /** Icon size (default 48) */
  iconSize?: number;
  /** Primary message */
  title?: string;
  /** Secondary message below the title */
  subtitle?: string;
  /** Action button */
  action?: StatusViewAction;
  /** Compact block for use inside lists/sections instead of filling the screen */
  inline?: boolean;
  /** Additional className for the outer container */
  className?: string;
}

export default function StatusView({
  loading,
  icon,
  iconTone = 'accent',
  iconColor,
  iconSize = 48,
  title,
  subtitle,
  action,
  inline,
  className,
}: StatusViewProps) {
  const [accentColor, mutedColor, dangerColor] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
    '--color-icon-danger',
  ]) as [string, string, string];
  const toneColor =
    iconTone === 'muted' ? mutedColor : iconTone === 'danger' ? dangerColor : accentColor;

  const containerClassName = inline
    ? 'px-6 py-10 items-center'
    : 'flex-1 justify-center items-center px-6';
  const titleClassName = inline
    ? `text-text-primary text-base font-medium text-center ${loading || icon ? 'mt-4' : ''}`
    : 'text-text-secondary text-base mt-4 text-center';

  return (
    <View className={`${containerClassName} ${className ?? ''}`}>
      {loading ? (
        <ActivityIndicator size="large" color={accentColor} />
      ) : icon ? (
        <Icon name={icon} size={iconSize} color={iconColor ?? toneColor} />
      ) : null}
      {title && (
        <Text className={titleClassName}>
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
