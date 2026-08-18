import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, Platform } from 'react-native';
import Switch from './ui/Switch';

interface SyncFrequencyProps {
  isEnabled: boolean;
  onToggle: (enabled: boolean) => void;
}

const SyncFrequency: React.FC<SyncFrequencyProps> = ({ isEnabled, onToggle }) => {
  const { t } = useTranslation();
  return (
    <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
      <Text className="text-lg font-bold mb-3 text-text-primary">{t('syncFrequency.title', { defaultValue: 'Background Sync' })}</Text>
      <View className="flex-row justify-between items-center">
        <Text className="text-base text-text-primary">{t('syncFrequency.enable', { defaultValue: 'Enable Background Sync' })}</Text>
        <Switch
          accessibilityLabel={t('syncFrequency.toggleLabel', { defaultValue: 'Background sync' })}
          accessibilityHint={t('syncFrequency.toggleHint', { defaultValue: 'Toggles background health data synchronization.' })}
          onValueChange={onToggle}
          value={isEnabled}
        />
      </View>
      {Platform.OS === 'ios' && (
        <Text className="text-[13px] text-text-muted leading-4.5 mt-1">
          {t('syncFrequency.iosNote', { defaultValue: 'When enabled, the app will update in the background when your phone allows it. Manually syncing will always update right away.' })}
        </Text>
      )}
    </View>
  );
};

export default SyncFrequency;
