import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import Icon from './Icon';

interface Props {
  onPress: () => void;
  body?: string;
}

const TITLE = 'Grant permissions';
const DEFAULT_BODY =
  "SparkyFitness alerts (rest timers, fasting goals, medication reminders) won't fire. Tap to fix.";

const OSDeniedWarningCard: React.FC<Props> = ({ onPress }) => {
  const [iconWarning, iconDecorative] = useCSSVariable([
    '--color-icon-warning',
    '--color-icon-decorative',
  ]) as [string, string];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${TITLE}. Tap to open Settings.`}
      className="bg-surface rounded-xl p-4 mb-4 shadow-sm border flex-row items-start"
      style={{ borderColor: iconWarning }}
    >
      <Icon name="warning" size={20} color={iconWarning} style={{ marginTop: 2 }} />
      <View className="flex-1 ml-3">
        <Text className="text-base font-semibold text-text-primary">{TITLE}</Text>
        <Text className="text-text-primary text-sm mt-1 opacity-80">{DEFAULT_BODY}</Text>
      </View>
      <Icon name="chevron-forward" size={16} color={iconDecorative} />
    </Pressable>
  );
};

export default OSDeniedWarningCard;
