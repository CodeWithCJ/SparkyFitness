import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useCSSVariable } from 'uniwind';
import FormInput from './FormInput';
import Icon from './Icon';
import PercentSlider from './PercentSlider';
import Button from './ui/Button';
import {
  clampPercent,
  distributeRemaining,
  sumPercentages,
  type MealPercentages,
} from '../utils/mealDistribution';

export interface MealDistributionMeal {
  key: string;
  label: string;
}

interface MealDistributionEditorProps {
  meals: MealDistributionMeal[];
  values: MealPercentages;
  onChange: (values: MealPercentages) => void;
  /** Daily calorie goal, used to show each meal's share in kcal. */
  totalCalories: number;
}

const MealDistributionEditor: React.FC<MealDistributionEditorProps> = ({
  meals,
  values,
  onChange,
  totalCalories,
}) => {
  const { t } = useTranslation();
  const [textPrimary, textMuted] = useCSSVariable([
    '--color-text-primary',
    '--color-text-muted',
  ]) as [string, string];
  const [locked, setLocked] = useState<Record<string, boolean>>({});
  const keys = meals.map(({ key }) => key);
  const total = sumPercentages(values, keys);
  const totalValid = Math.round(total) === 100;

  const setMeal = (key: string, value: number) =>
    onChange({ ...values, [key]: clampPercent(value) });

  return (
    <View className="gap-4">
      <Button
        variant="secondary"
        onPress={() => onChange(distributeRemaining(values, keys, locked))}
        className="py-2"
        textClassName="text-sm"
        testID="meal-distribute-remaining"
      >
        {t('goals.meals.distributeRemaining', {
          defaultValue: 'Distribute remaining evenly',
        })}
      </Button>
      {meals.map(({ key, label }) => {
        const percent = values[key] ?? 0;
        const isLocked = !!locked[key];
        return (
          <View key={key} className="gap-1">
            <Text className="text-sm font-medium text-text-primary">
              {t('goals.meals.mealCalories', {
                defaultValue: '{{meal}} ({{calories}} kcal)',
                meal: label,
                calories: Math.round((percent / 100) * totalCalories),
              })}
            </Text>
            <View className="flex-row items-center gap-2">
              <Pressable
                onPress={() =>
                  setLocked((prev) => ({ ...prev, [key]: !prev[key] }))
                }
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={
                  isLocked
                    ? t('goals.meals.unlock', {
                        defaultValue: 'Unlock {{meal}}',
                        meal: label,
                      })
                    : t('goals.meals.lock', {
                        defaultValue: 'Lock {{meal}}',
                        meal: label,
                      })
                }
                accessibilityState={{ selected: isLocked }}
                testID={`meal-lock-${key}`}
              >
                <Icon
                  name={isLocked ? 'lock-closed' : 'lock-open'}
                  size={20}
                  color={isLocked ? textPrimary : textMuted}
                />
              </Pressable>
              <View className="flex-1">
                <PercentSlider
                  value={percent}
                  onChange={(next) => setMeal(key, next)}
                  disabled={isLocked}
                  accessibilityLabel={label}
                  testID={`meal-slider-${key}`}
                />
              </View>
              <View className="w-16">
                <FormInput
                  value={String(percent)}
                  onChangeText={(text) =>
                    setMeal(key, parseInt(text.replace(/\D/g, ''), 10) || 0)
                  }
                  keyboardType="number-pad"
                  editable={!isLocked}
                  selectTextOnFocus
                  accessibilityLabel={t('goals.meals.mealPercent', {
                    defaultValue: '{{meal}} (%)',
                    meal: label,
                  })}
                  testID={`goal-input-meal-${key}`}
                  style={{ textAlign: 'center', paddingHorizontal: 4 }}
                />
              </View>
              <Text className="text-sm text-text-secondary">%</Text>
            </View>
          </View>
        );
      })}
      <Text
        className={`text-right text-sm font-semibold ${
          totalValid ? 'text-green-600' : 'text-red-500'
        }`}
        testID="meal-total"
      >
        {totalValid
          ? t('goals.meals.totalOk', {
              defaultValue: 'Total: {{total}}%',
              total: Math.round(total),
            })
          : t('goals.meals.total', {
              defaultValue: 'Total: {{total}}% (must be 100% to save)',
              total: Math.round(total),
            })}
      </Text>
    </View>
  );
};

export default MealDistributionEditor;
