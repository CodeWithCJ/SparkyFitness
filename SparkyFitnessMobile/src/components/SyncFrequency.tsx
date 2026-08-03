import React from 'react';
import { View, Text, Platform } from 'react-native';
import Switch from './ui/Switch';

interface SyncFrequencyProps {
  isEnabled: boolean;
  onToggle: (enabled: boolean) => void;
}

const SyncFrequency: React.FC<SyncFrequencyProps> = ({ isEnabled, onToggle }) => {
  return (
    <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
      <Text className="text-lg font-bold mb-3 text-text-primary">Background Sync</Text>
      <View className="flex-row justify-between items-center">
        <Text className="text-base text-text-primary">Enable Background Sync</Text>
        <Switch
          onValueChange={onToggle}
          value={isEnabled}
        />
      </View>
      {Platform.OS === 'ios' && (
        <Text className="text-[13px] text-text-muted leading-4.5 mt-1">
          When enabled, the app will update in the background when your phone allows it. Manually syncing will always update right away.
        </Text>
      )}
    </View>
  );
};

export default SyncFrequency;
