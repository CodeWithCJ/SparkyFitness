import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

interface FeaturesOffNoticeProps {
  /** Opens Settings → Features; leave it out while offline, as the Settings
   * row to Features is. */
  onManage?: () => void;
  className?: string;
}

/**
 * The one line a per-place setting (Dashboard settings, Quick Actions) shows
 * when it leaves out the items of features turned off in Settings → Features.
 */
const FeaturesOffNotice: React.FC<FeaturesOffNoticeProps> = ({
  onManage,
  className = '',
}) => {
  const { t } = useTranslation();
  return (
    <View
      testID="features-off-notice"
      className={`flex-row flex-wrap items-center ${className}`}
    >
      <Text className="text-text-secondary text-sm">
        {t('featureSettings.someOff', {
          defaultValue: 'Some features are turned off',
        })}
      </Text>
      {onManage && (
        <>
          <Text
            className="text-text-secondary text-sm mx-1.5"
            accessibilityElementsHidden
            importantForAccessibility="no"
          >
            ·
          </Text>
          <Pressable
            testID="features-off-manage"
            accessibilityRole="button"
            hitSlop={8}
            onPress={onManage}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <Text className="text-accent-primary text-sm font-semibold">
              {t('featureSettings.manage', { defaultValue: 'Manage' })}
            </Text>
          </Pressable>
        </>
      )}
    </View>
  );
};

export default FeaturesOffNotice;
