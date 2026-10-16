import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import Button from '../ui/Button';
import { useGlp1CheckIn } from '../../hooks/useGlp1';
import {
  GLP1_CHECKIN_METRICS,
  type Glp1CheckInMetricKey,
} from '../../utils/glp1';
import { glp1CheckInMetricLabel } from '../../utils/medicationLocalization';
import { addLog } from '../../services/LogService';

const SCORES = Array.from({ length: 11 }, (_, i) => i);

interface Glp1CheckInCardProps {
  /** Remount the card (key={date}) when the day changes so edits never leak across days. */
  date: string;
}

/**
 * Daily GLP-1 check-in: hunger, food noise, fullness and energy on a 0-10
 * scale, saved as the `GLP *` daily custom measurements web also uses.
 */
const Glp1CheckInCard: React.FC<Glp1CheckInCardProps> = ({ date }) => {
  const { t } = useTranslation();
  const { loadedValues, isLoading, save } = useGlp1CheckIn(date);
  const [edits, setEdits] = useState<
    Partial<Record<Glp1CheckInMetricKey, number>>
  >({});

  const valueFor = (key: Glp1CheckInMetricKey) =>
    edits[key] ?? loadedValues[key];

  const handleSave = () => {
    const values = { ...loadedValues, ...edits };
    save.mutate(values, {
      onSuccess: () => {
        setEdits({});
        Toast.show({
          type: 'success',
          text1: t('medications.glp1.checkIn.saved', {
            defaultValue: 'Check-in saved',
          }),
        });
      },
      onError: (error) => {
        addLog(`Failed to save GLP-1 check-in: ${error.message}`, 'ERROR');
        Toast.show({
          type: 'error',
          text1: t('medications.glp1.checkIn.saveFailed', {
            defaultValue: 'Failed to save check-in',
          }),
        });
      },
    });
  };

  return (
    <View className="bg-surface rounded-xl p-4 mb-3 shadow-sm">
      <Text className="text-base font-semibold text-text-primary">
        {t('medications.glp1.checkIn.title', {
          defaultValue: 'Daily check-in',
        })}
      </Text>
      <Text className="text-xs text-text-muted mt-0.5 mb-3">
        {t('medications.glp1.checkIn.subtitle', {
          defaultValue:
            'How the medication is affecting you today. Saved to your daily measurements.',
        })}
      </Text>
      {GLP1_CHECKIN_METRICS.map((metric) => {
        const current = valueFor(metric.key);
        const label = glp1CheckInMetricLabel(metric.key, t);
        return (
          <View key={metric.key} className="mb-3">
            <View className="flex-row justify-between mb-1.5">
              <Text className="text-sm font-medium text-text-primary">
                {label}
              </Text>
              <Text className="text-sm font-semibold text-text-primary">
                {current} / 10
              </Text>
            </View>
            <View className="flex-row gap-1">
              {SCORES.map((score) => (
                <TouchableOpacity
                  key={score}
                  onPress={() =>
                    setEdits((prev) => ({ ...prev, [metric.key]: score }))
                  }
                  disabled={isLoading}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`${label} ${score}`}
                  accessibilityState={{ selected: current === score }}
                  className={`flex-1 h-9 rounded-md items-center justify-center ${
                    current === score ? 'bg-accent-primary' : 'bg-raised'
                  }`}
                >
                  <Text
                    className={`text-xs font-medium ${
                      current === score ? 'text-white' : 'text-text-secondary'
                    }`}
                  >
                    {score}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );
      })}
      <Button
        variant="primary"
        onPress={handleSave}
        loading={save.isPending}
        disabled={isLoading}
      >
        {t('medications.glp1.checkIn.save', { defaultValue: 'Save check-in' })}
      </Button>
    </View>
  );
};

export default Glp1CheckInCard;
