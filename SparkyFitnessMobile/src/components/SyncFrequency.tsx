import React from 'react';
import { View, Text, Platform } from 'react-native';
import Switch from './ui/Switch';
import { useTranslation } from 'react-i18next';

interface SyncFrequencyProps {
  isEnabled: boolean;
  onToggle: (enabled: boolean) => void;
}

const SyncFrequency: React.FC<SyncFrequencyProps> = ({ isEnabled, onToggle }) => {
  const { t } = useTranslation();

  return (
    <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
      <Text className="text-lg font-bold mb-3 text-text-primary">{t('syncSettings.backgroundTitle')}</Text>
      <View className="flex-row justify-between items-center">
        <Text className="text-base text-text-primary">{t('syncSettings.enableBackground')}</Text>
        <Switch
          onValueChange={onToggle}
          value={isEnabled}
        />
      </View>
      {Platform.OS === 'ios' && (
        <Text className="text-[13px] text-text-muted leading-4.5 mt-1">
          {t('syncSettings.backgroundDescription')}
        </Text>
      )}
    </View>
  );
};

export default SyncFrequency;
