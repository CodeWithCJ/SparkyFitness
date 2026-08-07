import React from 'react';
import { Text } from 'react-native';
import { useTranslation } from 'react-i18next';

/**
 * Footer note for health features (cycle, pregnancy, medications) clarifying
 * the app is a tracker, not a source of medical advice.
 */
const MedicalDisclaimer: React.FC = () => {
  const { t } = useTranslation();
  return (
    <Text className="text-text-secondary text-xs text-left leading-normal">
      {t('common.medicalDisclaimer')}
    </Text>
  );
};

export default MedicalDisclaimer;
