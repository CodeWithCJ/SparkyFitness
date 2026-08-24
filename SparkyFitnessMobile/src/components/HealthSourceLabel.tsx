import React from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Text } from 'react-native';

/**
 * Displays the platform's health data source ("Apple Health" on iOS, "Health Connect"
 * on Android). Single source of truth for the source label, shared by SyncScreen and the
 * external-BMR toggle on CalorieSettingsScreen.
 */
export const healthSourceName =
  Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect';

interface HealthSourceLabelProps {
  /** Extra classes for the wrapping Text (e.g. alignment / spacing per screen). */
  className?: string;
}

const HealthSourceLabel: React.FC<HealthSourceLabelProps> = ({ className }) => {
  const { t } = useTranslation();
  const sourceName = Platform.OS === 'ios'
    ? t('healthSync.appleHealth', { defaultValue: 'Apple Health' })
    : t('healthSync.healthConnect', { defaultValue: 'Health Connect' });
  return (
  <Text className={`text-text-muted text-xs ${className ?? ''}`}>
    <Text className="font-bold">{t('healthSync.source', { defaultValue: 'Source:' })}</Text> {sourceName}
  </Text>
  );
};

export default HealthSourceLabel;
