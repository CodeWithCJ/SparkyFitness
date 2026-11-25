import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import Button from './ui/Button';

interface FeatureOffViewProps {
  /** "Oral care is turned off"; the caller names the feature. */
  title: string;
  onTurnOn: () => void;
  /** The switch cannot be used yet (choices loading) or is saving. */
  turnOnDisabled: boolean;
  onOpenFeatures: () => void;
  /** The texts under the title, for a screen that already had its own. */
  description?: string;
  turnOnLabel?: string;
  openFeaturesLabel?: string;
}

/**
 * What a feature's own screen shows, instead of its content, while the
 * feature is turned off in Settings → Features and the screen is reached
 * anyway (a deep link, a Live Activity, a notification): the history is kept,
 * with a way to turn it back on and a way to Features.
 */
const FeatureOffView: React.FC<FeatureOffViewProps> = ({
  title,
  onTurnOn,
  turnOnDisabled,
  onOpenFeatures,
  description,
  turnOnLabel,
  openFeaturesLabel,
}) => {
  const { t } = useTranslation();
  return (
    <View
      testID="feature-off-view"
      className="flex-1 justify-center items-center px-6 gap-3"
    >
      <Text className="text-text-primary text-lg font-semibold text-center">
        {title}
      </Text>
      <Text className="text-text-secondary text-sm text-center">
        {description ??
          t('featureSettings.off.description', {
            defaultValue:
              'Your history is kept. Turn it back on to see it here again.',
          })}
      </Text>
      <Button
        variant="primary"
        className="mt-2 px-6"
        disabled={turnOnDisabled}
        onPress={onTurnOn}
      >
        {turnOnLabel ??
          t('featureSettings.off.turnOn', { defaultValue: 'Turn on' })}
      </Button>
      <Button variant="secondary" className="px-6" onPress={onOpenFeatures}>
        {openFeaturesLabel ??
          t('featureSettings.off.openFeatures', {
            defaultValue: 'Open Features',
          })}
      </Button>
    </View>
  );
};

export default FeatureOffView;
