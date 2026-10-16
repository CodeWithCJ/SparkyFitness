import React from 'react';
import { Alert, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Button from './ui/Button';
import type { GoalPreset } from '../types/goals';

interface GoalPresetsSectionProps {
  presets: GoalPreset[];
  isBusy: boolean;
  /** Fills the goals form with the preset's values (nothing is saved yet). */
  onApply: (preset: GoalPreset) => void;
  onCreate: () => void;
  onEdit: (preset: GoalPreset) => void;
  onDelete: (preset: GoalPreset) => Promise<void>;
}

const GoalPresetsSection: React.FC<GoalPresetsSectionProps> = ({
  presets,
  isBusy,
  onApply,
  onCreate,
  onEdit,
  onDelete,
}) => {
  const { t } = useTranslation();

  const confirmDelete = (preset: GoalPreset) =>
    Alert.alert(
      t('goals.presets.deleteTitle', { defaultValue: 'Delete preset?' }),
      t('goals.presets.deleteMessage', {
        defaultValue:
          'Delete "{{name}}"? Weekly plan days that use it will have no preset.',
        name: preset.preset_name,
      }),
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: t('common.delete', { defaultValue: 'Delete' }),
          style: 'destructive',
          onPress: () => void onDelete(preset),
        },
      ]
    );

  return (
    <View className="gap-3">
      <Text className="text-sm text-text-secondary">
        {t('goals.presets.description', {
          defaultValue:
            'A preset is a saved set of goals. Apply fills the form above with it (tap Save to make it your goals); Edit changes the preset itself.',
        })}
      </Text>
      {presets.length === 0 && (
        <Text className="text-sm text-text-muted">
          {t('goals.presets.empty', { defaultValue: 'No goal presets yet.' })}
        </Text>
      )}
      {presets.map((preset) => {
        const id = preset.id ?? preset.preset_name;
        return (
          <View key={id} className="gap-2 rounded-lg bg-raised p-3">
            <Text className="text-base font-semibold text-text-primary">
              {preset.preset_name}
            </Text>
            <Text className="text-sm text-text-secondary">
              {t('goals.presets.summary', {
                defaultValue:
                  '{{calories}} kcal, {{protein}}g P, {{carbs}}g C, {{fat}}g F',
                calories: Math.round(preset.calories ?? 0),
                protein: Math.round(preset.protein ?? 0),
                carbs: Math.round(preset.carbs ?? 0),
                fat: Math.round(preset.fat ?? 0),
              })}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              <Button
                variant="secondary"
                onPress={() => onApply(preset)}
                className="py-2"
                textClassName="text-xs"
                testID={`goal-preset-apply-${id}`}
              >
                {t('goals.presets.apply', { defaultValue: 'Apply' })}
              </Button>
              <Button
                variant="secondary"
                disabled={isBusy}
                onPress={() => onEdit(preset)}
                className="py-2"
                textClassName="text-xs"
                testID={`goal-preset-edit-${id}`}
              >
                {t('goals.presets.edit', { defaultValue: 'Edit' })}
              </Button>
              <Button
                variant="destructive"
                disabled={isBusy}
                onPress={() => confirmDelete(preset)}
                className="py-2"
                textClassName="text-xs"
              >
                {t('common.delete', { defaultValue: 'Delete' })}
              </Button>
            </View>
          </View>
        );
      })}
      <Button
        variant="secondary"
        onPress={onCreate}
        className="py-2"
        textClassName="text-sm"
        testID="goal-preset-create"
      >
        {t('goals.presets.create', { defaultValue: 'New preset' })}
      </Button>
    </View>
  );
};

export default GoalPresetsSection;
