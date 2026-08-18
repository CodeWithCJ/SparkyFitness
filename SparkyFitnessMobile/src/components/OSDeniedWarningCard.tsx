import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useCSSVariable } from 'uniwind';

import Icon from './Icon';

interface Props {
  onPress: () => void;
  actionLabel: string;
}


const OSDeniedWarningCard: React.FC<Props> = ({ onPress, actionLabel }) => {
  const { t } = useTranslation();
  const [iconWarning] = useCSSVariable(['--color-icon-warning']) as [string];
  const title = t('notificationSettings.permissionTitle', 'Grant permissions');
  const body = t(
    'notificationSettings.permissionBody',
    "SparkyFitness alerts (rest timers, fasting goals, medication reminders) won't fire.",
  );

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('notificationSettings.permissionWarningAccessibility', {
        defaultValue: '{{title}}. {{body}} {{action}}.',
        title,
        body,
        action: actionLabel,
      })}
      className="bg-surface rounded-xl p-4 mb-4 shadow-sm flex-row items-start"
    >
      <Icon name="warning" size={20} color={iconWarning} style={{ marginTop: 2 }} />
      <View className="flex-1 ml-3">
        <Text className="text-base font-semibold text-text-primary">{title}</Text>
        <Text className="text-text-primary text-sm mt-1 opacity-80">{body}</Text>
        <Text className="text-sm font-semibold text-accent-primary self-end mt-2">{actionLabel}</Text>
      </View>
    </Pressable>
  );
};

export default OSDeniedWarningCard;
