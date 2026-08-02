import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import Icon from './Icon';

interface Props {
  onPress: () => void;
  actionLabel: string;
}

const TITLE = 'Grant permissions';
const DEFAULT_BODY =
  "SparkyFitness alerts (rest timers, fasting goals, medication reminders) won't fire.";

const OSDeniedWarningCard: React.FC<Props> = ({ onPress, actionLabel }) => {
  const [iconWarning] = useCSSVariable(['--color-icon-warning']) as [string];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${TITLE}. ${DEFAULT_BODY} ${actionLabel}.`}
      className="bg-surface rounded-xl p-4 mb-4 shadow-sm flex-row items-start"
    >
      <Icon name="warning" size={20} color={iconWarning} style={{ marginTop: 2 }} />
      <View className="flex-1 ml-3">
        <Text className="text-base font-semibold text-text-primary">{TITLE}</Text>
        <Text className="text-text-primary text-sm mt-1 opacity-80">{DEFAULT_BODY}</Text>
        <Text className="text-sm font-semibold text-accent-primary self-end mt-2">{actionLabel}</Text>
      </View>
    </Pressable>
  );
};

export default OSDeniedWarningCard;
