import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import FormInput from './FormInput';
import Button from './ui/Button';
import { useProfile, useSetTargetWeight } from '../hooks/useProfile';
import { usePreferences } from '../hooks/usePreferences';
import { resolveWeightGoal } from '../utils/healthTrendGoals';
import { weightToKg } from '../utils/unitConversions';
import { formatLocalizedNumber } from '../localization/i18n';

/** Largest goal the server accepts: its numeric(5,2) column's maximum. */
const MAX_GOAL_WEIGHT_KG = 999.99;

const GoalWeightSection: React.FC = () => {
  const { t } = useTranslation();
  const { profile } = useProfile();
  const { preferences, isLoading: isPreferencesLoading } = usePreferences();
  const { saveTargetWeight, isSaving } = useSetTargetWeight();
  const unit: 'kg' | 'lbs' =
    (preferences?.default_weight_unit ?? 'kg') === 'kg' ? 'kg' : 'lbs';

  const saved = resolveWeightGoal(profile?.target_weight, unit);
  const savedText =
    saved === undefined
      ? ''
      : formatLocalizedNumber(saved, {
          maximumFractionDigits: 1,
          useGrouping: false,
        });
  // null means "not edited": show what is saved.
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? savedText;

  const parsed = Number(text.replace(',', '.'));
  const kg = weightToKg(parsed, unit);
  const isValid =
    text.trim() !== '' &&
    Number.isFinite(parsed) &&
    Math.round(kg * 100) / 100 > 0 &&
    kg <= MAX_GOAL_WEIGHT_KG;

  const submit = async (value: number | null) => {
    // Clear the draft only if it is still the one this save sent, so an
    // edit typed while the request was pending is kept.
    const submitted = draft;
    try {
      await saveTargetWeight(value);
      setDraft((current) => (current === submitted ? null : current));
      Toast.show({
        type: 'success',
        text1: t('goals.goalWeight.saved', {
          defaultValue: 'Goal weight saved.',
        }),
      });
    } catch {
      Toast.show({
        type: 'error',
        text1: t('common.error', { defaultValue: 'Error' }),
        text2: t('goals.goalWeight.saveFailed', {
          defaultValue: 'Failed to save goal weight.',
        }),
      });
    }
  };

  return (
    <View className="gap-3">
      <Text className="text-sm text-text-secondary">
        {t('goals.goalWeight.description', {
          defaultValue:
            'Your target weight. Weight charts use it to show your progress.',
        })}
      </Text>
      <FormInput
        value={text}
        onChangeText={setDraft}
        // Until preferences load the unit is unknown, so a typed value could
        // be read in the wrong unit.
        editable={!isPreferencesLoading}
        keyboardType="decimal-pad"
        placeholder={t('goals.goalWeight.placeholder', {
          unit,
          defaultValue: 'Goal weight ({{unit}})',
        })}
        accessibilityLabel={t('goals.goalWeight.placeholder', {
          unit,
          defaultValue: 'Goal weight ({{unit}})',
        })}
        testID="goal-weight-input"
      />
      {draft !== null && draft.trim() !== '' && !isValid && (
        <Text className="text-sm text-icon-danger">
          {t('goals.goalWeight.invalid', {
            defaultValue: 'Enter a weight above zero.',
          })}
        </Text>
      )}
      <View className="flex-row gap-2">
        <Button
          variant="primary"
          onPress={() => submit(kg)}
          disabled={isSaving || draft === null || !isValid}
          testID="goal-weight-save"
        >
          {t('goals.goalWeight.save', { defaultValue: 'Save goal weight' })}
        </Button>
        {saved !== undefined && (
          <Button
            variant="outline"
            onPress={() => submit(null)}
            disabled={isSaving}
            testID="goal-weight-clear"
          >
            {t('goals.goalWeight.clear', { defaultValue: 'Clear' })}
          </Button>
        )}
      </View>
    </View>
  );
};

export default GoalWeightSection;
