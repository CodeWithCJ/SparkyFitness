import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import SegmentedControl from '../SegmentedControl';
import { CHECK_IN_CHOICES } from '../../utils/coachingCues';

/**
 * How often the voice coach gives a spoken update (time, distance and average
 * pace): off, or every 5, 10 or 15 minutes. Splits and plan steps are spoken
 * either way.
 */
const CheckInCard: React.FC<{
  minutes: number;
  onChange: (minutes: number) => void;
  testID?: string;
}> = ({ minutes, onChange, testID = 'recording-check-in' }) => {
  const { t } = useTranslation();
  return (
    <View className="bg-surface rounded-xl p-4 mt-4" testID={testID}>
      <Text className="text-text-primary text-sm font-semibold">
        {t('recordActivity.checkIn.title', { defaultValue: 'Spoken updates' })}
      </Text>
      <Text className="text-text-secondary text-xs mt-1 mb-2">
        {t('recordActivity.checkIn.description', {
          defaultValue:
            'Hear your time, distance and average pace every few minutes.',
        })}
      </Text>
      <SegmentedControl<string>
        segments={CHECK_IN_CHOICES.map((value) => ({
          key: String(value),
          label:
            value === 0
              ? t('recordActivity.checkIn.off', { defaultValue: 'Off' })
              : t('recordActivity.checkIn.minutes', {
                  minutes: value,
                  defaultValue: '{{minutes}} min',
                }),
        }))}
        activeKey={String(minutes)}
        onSelect={(key) => onChange(Number(key))}
      />
    </View>
  );
};

export default CheckInCard;
