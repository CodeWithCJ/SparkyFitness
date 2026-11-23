import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Button from '../ui/Button';

interface ChallengeRefreshFailedProps {
  message: string;
  onRetry: () => void;
  testID?: string;
}

/**
 * A read failed while older data is on screen: keep showing it, say so, and
 * offer a retry.
 */
const ChallengeRefreshFailed: React.FC<ChallengeRefreshFailedProps> = ({
  message,
  onRetry,
  testID,
}) => {
  const { t } = useTranslation();
  return (
    <View
      testID={testID}
      className="flex-row items-center justify-between rounded-lg bg-raised px-3 py-2 mb-2"
    >
      <Text className="flex-1 mr-3 text-xs text-text-secondary">{message}</Text>
      <Button variant="secondary" onPress={onRetry}>
        {t('common.retry', { defaultValue: 'Retry' })}
      </Button>
    </View>
  );
};

export default ChallengeRefreshFailed;
