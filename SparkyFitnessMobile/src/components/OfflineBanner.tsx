import React from 'react';
import { Pressable, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';
import { useServerConnection } from '../hooks';

/**
 * A slim strip shown above a screen that is working from data saved on the
 * phone because the server is not answering. Tapping it checks the
 * connection again.
 */
const OfflineBanner: React.FC = () => {
  const { t } = useTranslation();
  const { refetch } = useServerConnection();
  const textSecondary = useCSSVariable('--color-text-secondary') as string;

  return (
    <Pressable
      testID="offline-banner"
      accessibilityRole="button"
      accessibilityLabel={t('offline.banner', {
        defaultValue: 'Offline: showing data saved on this phone',
      })}
      accessibilityHint={t('offline.bannerHint', {
        defaultValue: 'Checks the connection again',
      })}
      onPress={() => void refetch()}
      className="flex-row items-center gap-2 px-4 py-2 bg-surface"
    >
      <Icon name="cloud-offline" size={16} color={textSecondary} />
      <Text className="flex-1 text-sm text-text-secondary">
        {t('offline.banner', {
          defaultValue: 'Offline: showing data saved on this phone',
        })}
      </Text>
    </Pressable>
  );
};

export default OfflineBanner;
