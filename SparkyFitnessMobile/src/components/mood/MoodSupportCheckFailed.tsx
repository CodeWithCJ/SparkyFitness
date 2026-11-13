import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Button from '../ui/Button';

interface MoodSupportCheckFailedProps {
  onRetry: () => void;
  retrying: boolean;
}

/**
 * Stands in for the mood screens while the server check has failed: until it
 * answers, neither the check-in form nor the one-entry form can be trusted to
 * save through the right contract.
 */
export default function MoodSupportCheckFailed({
  onRetry,
  retrying,
}: MoodSupportCheckFailedProps) {
  const { t } = useTranslation();
  return (
    <View className="items-center gap-3 py-8">
      <Text className="text-sm text-text-secondary text-center">
        {t('mood.serverCheckFailed', {
          defaultValue:
            "Couldn't reach your server. Check your connection and try again.",
        })}
      </Text>
      <Button
        variant="outline"
        onPress={onRetry}
        loading={retrying}
        accessibilityRole="button"
      >
        {t('common.retry', { defaultValue: 'Retry' })}
      </Button>
    </View>
  );
}
