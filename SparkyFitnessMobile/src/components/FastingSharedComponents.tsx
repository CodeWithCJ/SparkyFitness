import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { localizeProtocolBadge } from '../utils/fastingLocalization';

export interface FastingStatCardProps {
  label: string;
  value: string;
  unit?: string;
}

export const FastingStatCard: React.FC<FastingStatCardProps> = ({ label, value, unit }) => (
  <View className="flex-1 bg-surface rounded-xl p-3 items-center border border-border-subtle shadow-sm">
    <Text className="text-xs font-semibold uppercase text-text-muted tracking-wide">{label}</Text>
    <View className="flex-row items-baseline mt-1">
      <Text className="text-xl font-bold text-text-primary">{value}</Text>
      {unit ? <Text className="text-sm text-text-muted ml-0.5">{unit}</Text> : null}
    </View>
  </View>
);

export interface FastingProtocolBadgeProps {
  protocol: string | null | undefined;
  variant?: 'pill' | 'subtle';
  className?: string;
}

export const FastingProtocolBadge: React.FC<FastingProtocolBadgeProps> = ({
  protocol,
  variant = 'pill',
  className = '',
}) => {
  const { t } = useTranslation();
  const badgeText = localizeProtocolBadge(t, protocol);

  if (variant === 'subtle') {
    return <Text className={`text-sm text-text-secondary ${className}`}>{badgeText}</Text>;
  }

  return (
    <View className={`bg-accent-primary/10 rounded-full px-3 py-1 ${className}`}>
      <Text className="text-xs font-semibold text-accent-primary">{badgeText}</Text>
    </View>
  );
};
