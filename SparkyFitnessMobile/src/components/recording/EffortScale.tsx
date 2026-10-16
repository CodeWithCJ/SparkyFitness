import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

/** The 1 to 10 "How hard was that?" row, shared by the summary and the Diary. */
const EffortScale: React.FC<{
  rating: number | null;
  disabled?: boolean;
  onSelect: (value: number) => void;
}> = ({ rating, disabled, onSelect }) => {
  const { t } = useTranslation();
  return (
    <View>
      <Text className="text-text-primary text-sm font-semibold mb-2">
        {t('runSummary.effortQuestion', {
          defaultValue: 'How hard was that?',
        })}
      </Text>
      <View className="flex-row flex-wrap" style={{ gap: 6 }}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <Pressable
            key={n}
            accessibilityRole="button"
            accessibilityState={{ selected: rating === n }}
            accessibilityLabel={t('runSummary.effortA11y', {
              defaultValue: 'Effort {{rating}} of 10',
              rating: n,
            })}
            disabled={disabled}
            onPress={() => onSelect(n)}
            className={`h-10 rounded-lg items-center justify-center ${
              rating === n ? 'bg-accent-primary' : 'bg-raised'
            }`}
            style={{ width: '17.5%' }}
          >
            <Text
              className={`text-base font-semibold ${
                rating === n ? 'text-white' : 'text-text-primary'
              }`}
            >
              {n}
            </Text>
          </Pressable>
        ))}
      </View>
      <View className="flex-row justify-between mt-1">
        <Text className="text-text-muted text-xs">
          {t('runSummary.effortLow', { defaultValue: '1 = very easy' })}
        </Text>
        <Text className="text-text-muted text-xs">
          {t('runSummary.effortHigh', { defaultValue: '10 = all out' })}
        </Text>
      </View>
    </View>
  );
};

export default EffortScale;
