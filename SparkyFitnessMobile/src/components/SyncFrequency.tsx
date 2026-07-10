import React from 'react';
import { View, Text, Switch, Platform } from 'react-native';
import { useCSSVariable } from 'uniwind';
import { mobileT } from '../localization';

interface SyncFrequencyProps {
  isEnabled: boolean;
  onToggle: (enabled: boolean) => void;
}

const SyncFrequency: React.FC<SyncFrequencyProps> = ({ isEnabled, onToggle }) => {
  const [formEnabled, formDisabled] = useCSSVariable([
    '--color-form-enabled',
    '--color-form-disabled',
  ]) as [string, string];

  return (
    <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
      <Text className="text-lg font-bold mb-3 text-text-primary">
        {mobileT('sync.backgroundTitle')}
      </Text>
      <View className="flex-row justify-between items-center">
        <Text className="text-base text-text-primary">
          {mobileT('sync.backgroundToggle')}
        </Text>
        <Switch
          onValueChange={onToggle}
          value={isEnabled}
          trackColor={{ false: formDisabled, true: formEnabled }}
          thumbColor="#FFFFFF"
          accessibilityLabel={mobileT('sync.backgroundToggle')}
        />
      </View>
      {Platform.OS === 'ios' && (
        <Text className="text-[13px] text-text-muted leading-4.5 mt-1">
          {mobileT('sync.backgroundDescriptionIos')}
        </Text>
      )}
    </View>
  );
};

export default SyncFrequency;
