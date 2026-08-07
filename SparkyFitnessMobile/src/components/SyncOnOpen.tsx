import React from 'react';
import { View, Text } from 'react-native';
import Switch from './ui/Switch';
import { useTranslation } from 'react-i18next';

interface SyncOnOpenProps {
  isEnabled: boolean;
  onToggle: (enabled: boolean) => void;
}

const SyncOnOpen: React.FC<SyncOnOpenProps> = ({ isEnabled, onToggle }) => {
  const { t } = useTranslation();

  return (
    <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
      <Text className="text-lg font-bold mb-3 text-text-primary">{t('syncSettings.openTitle')}</Text>
      <View className="flex-row justify-between items-center">
        <Text className="text-base text-text-primary">{t('syncSettings.openLabel')}</Text>
        <Switch
          onValueChange={onToggle}
          value={isEnabled}
        />
      </View>
      <Text className="text-[13px] text-text-muted leading-4.5 mt-1">
        {t('syncSettings.openDescription')}
      </Text>
    </View>
  );
};

export default SyncOnOpen;
