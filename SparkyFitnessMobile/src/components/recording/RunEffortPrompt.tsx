import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import Button from '../ui/Button';
import EffortScale from './EffortScale';
import {
  rateProgramWorkout,
  useRunProgram,
} from '../../services/runProgramService';
import { addLog } from '../../services/LogService';

// Workouts the person chose not to rate, kept for the life of the app so the
// card does not come back every time the Diary re-renders.
const skipped = new Set<string>();

/**
 * Asks how hard the latest program workout felt when nobody has said yet. A
 * run from the watch ends with a short message on the phone, so the question
 * on the summary screen is easy to miss; this keeps asking, in the Diary,
 * until the workout is rated or skipped (for two days after it was done).
 */
const RunEffortPrompt: React.FC<{ date: string; today: string }> = ({
  date,
  today,
}) => {
  const { t } = useTranslation();
  const { pendingEffort } = useRunProgram();
  const [saving, setSaving] = useState(false);
  const [, setVersion] = useState(0);
  if (date !== today || !pendingEffort) return null;
  const key = `${pendingEffort.programId}:${pendingEffort.index}`;
  if (skipped.has(key)) return null;

  const rate = async (value: number) => {
    setSaving(true);
    try {
      await rateProgramWorkout(
        pendingEffort.programId,
        pendingEffort.index,
        value
      );
    } catch (error) {
      addLog(`[Run Program] Could not save the effort: ${error}`, 'WARNING');
      Toast.show({
        type: 'error',
        text1: t('runSummary.rateFailed', {
          defaultValue: 'Could not save how hard that was.',
        }),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View
      className="bg-surface rounded-xl p-4 mb-2 shadow-sm"
      testID="run-effort-prompt"
    >
      <Text className="text-xs font-semibold text-text-secondary mb-2">
        {t('runPrograms.effortPrompt.title', {
          defaultValue: 'Your last program workout',
        })}
      </Text>
      <EffortScale rating={null} disabled={saving} onSelect={rate} />
      <View className="flex-row justify-end mt-2">
        <Button
          variant="ghost"
          onPress={() => {
            skipped.add(key);
            setVersion((v) => v + 1);
          }}
        >
          {t('runPrograms.effortPrompt.skip', { defaultValue: 'Skip' })}
        </Button>
      </View>
    </View>
  );
};

export default RunEffortPrompt;
