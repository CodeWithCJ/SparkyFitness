import React from 'react';
import { View, Text, Switch } from 'react-native';
import { useCSSVariable } from 'uniwind';

interface SyncOnOpenProps {
  isEnabled: boolean;
  onToggle: (enabled: boolean) => void;
}

const SyncOnOpen: React.FC<SyncOnOpenProps> = ({ isEnabled, onToggle }) => {
  const [formEnabled, formDisabled] = useCSSVariable([
    '--color-form-enabled',
    '--color-form-disabled',
  ]) as [string, string];

  return (
    <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
      <Text className="text-lg font-bold mb-3 text-text-primary">Sync on Open</Text>
      <View className="flex-row justify-between items-center">
        <Text className="text-base text-text-primary">Sync when app opens</Text>
        <Switch
          onValueChange={onToggle}
          value={isEnabled}
          trackColor={{ false: formDisabled, true: formEnabled }}
          thumbColor="#FFFFFF"
        />
      </View>
      <Text className="text-[13px] text-text-muted leading-4.5 mt-1">
        When enabled, health data will sync automatically when you open the app.
      </Text>
    </View>
  );
};

export default SyncOnOpen;
