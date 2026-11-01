import React from 'react';
import { Platform, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Button from './ui/Button';

interface NfcWaitingCardProps {
  visible: boolean;
  onCancel: () => void;
}

/**
 * Shown while the app waits for the phone to touch an NFC tag. iPhone draws
 * its own "hold near the tag" sheet; Android draws nothing, so without this
 * the screen just spins and nothing says what it is waiting for.
 */
const NfcWaitingCard: React.FC<NfcWaitingCardProps> = ({
  visible,
  onCancel,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  if (!visible || Platform.OS !== 'android') return null;

  return (
    <View
      accessibilityLiveRegion="polite"
      className="absolute left-4 right-4 bg-surface rounded-2xl p-4 shadow-lg border border-border-subtle"
      style={{ bottom: insets.bottom + 96 }}
    >
      <Text className="text-base font-semibold text-text-primary text-center">
        {t('actionTags.waiting.title', {
          defaultValue: 'Hold your phone to the NFC tag',
        })}
      </Text>
      <Text className="text-sm text-text-secondary text-center mt-1 mb-3">
        {t('actionTags.waiting.hint', {
          defaultValue:
            'Keep the back of the phone still against the tag until it finishes.',
        })}
      </Text>
      <Button variant="secondary" onPress={onCancel}>
        {t('common.cancel', { defaultValue: 'Cancel' })}
      </Button>
    </View>
  );
};

export default NfcWaitingCard;
