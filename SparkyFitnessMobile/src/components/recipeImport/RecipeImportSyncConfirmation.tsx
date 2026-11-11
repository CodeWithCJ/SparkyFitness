import { Modal, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  recipeImportSyncComparison,
  type RecipeImportSyncPreview,
} from '@workspace/shared';
import { useEnergyUnit } from '../../hooks/useEnergyUnit';
import { formatLocalizedNumber } from '../../localization';
import { formatEnergyNumber, energyUnitLabel } from '../../utils/energyUnit';
import Button from '../ui/Button';

export default function RecipeImportSyncConfirmation({
  preview,
  loading,
  busy,
  error,
  onCancel,
  onConfirm,
  onRefresh,
}: {
  preview?: RecipeImportSyncPreview;
  loading: boolean;
  busy: boolean;
  error: Error | null;
  onCancel: () => void;
  onConfirm: () => void;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const energyUnit = useEnergyUnit();
  const labels = {
    calories: t('recipeImport.syncEnergy', { defaultValue: 'Energy' }),
    protein: t('recipeImport.syncProtein', { defaultValue: 'Protein' }),
    carbs: t('recipeImport.syncCarbs', { defaultValue: 'Carbohydrates' }),
    fat: t('recipeImport.syncFat', { defaultValue: 'Fat' }),
  };
  function format(nutrient: keyof typeof labels, value: number | null) {
    if (value === null) return '?';
    return nutrient === 'calories'
      ? `${formatEnergyNumber(value, energyUnit)} ${energyUnitLabel(energyUnit, t)}`
      : `${formatLocalizedNumber(value, { maximumFractionDigits: 2 })} g`;
  }
  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!busy) onCancel();
      }}
    >
      <View className="flex-1 justify-center bg-black/50 p-5">
        <View
          accessibilityViewIsModal
          className="bg-background rounded-2xl p-5 gap-4"
          style={{ maxHeight: '85%' }}
        >
          <Text
            accessibilityRole="header"
            className="text-text-primary text-xl font-semibold"
          >
            {t('recipeImport.syncReviewTitle', {
              defaultValue: 'Review nutrition sync',
            })}
          </Text>
          <ScrollView contentContainerStyle={{ gap: 12 }}>
            <Text className="text-text-secondary">
              {t('recipeImport.syncReviewDescription', {
                defaultValue:
                  "Review the saved meal's nutrition before replacing the recipe's nutrition in Mealie. Only nutrition is sent.",
              })}
            </Text>
            {loading && (
              <Text className="text-text-secondary">
                {t('recipeImport.loadingSyncPreview', {
                  defaultValue: 'Loading current nutrition…',
                })}
              </Text>
            )}
            {preview && !loading && (
              <View className="gap-3">
                <Text className="text-text-primary font-semibold">
                  {preview.recipeName}
                </Text>
                <Text className="text-text-secondary">
                  {t('recipeImport.syncMeal', {
                    defaultValue: 'Saved meal: {{name}}',
                    name: preview.mealName,
                  })}
                </Text>
                <Text className="text-text-secondary">
                  {t('recipeImport.syncServings', {
                    defaultValue: 'Mealie servings: {{servings}}',
                    servings: formatLocalizedNumber(preview.recipeServings),
                  })}
                </Text>
                {preview.sourceChanged && (
                  <Text
                    accessibilityRole="alert"
                    className="text-text-secondary"
                  >
                    {t('recipeImport.syncSourceChanged', {
                      defaultValue:
                        'This recipe has changed in Mealie. Check the current recipe and serving count before confirming.',
                    })}
                  </Text>
                )}
                <Text className="text-text-primary">
                  {t('recipeImport.syncPerServing', {
                    defaultValue: 'Nutrition per Mealie serving',
                  })}
                </Text>
                <View className="flex-row gap-2">
                  <Text className="flex-1 text-text-secondary">
                    {t('recipeImport.syncNutrient', {
                      defaultValue: 'Nutrient',
                    })}
                  </Text>
                  <Text className="flex-1 text-text-secondary text-right">
                    {t('recipeImport.syncCurrent', {
                      defaultValue: 'In Mealie',
                    })}
                  </Text>
                  <Text className="flex-1 text-text-secondary text-right">
                    {t('recipeImport.syncProposed', {
                      defaultValue: 'From saved meal',
                    })}
                  </Text>
                </View>
                {recipeImportSyncComparison(preview).map((row) => (
                  <View
                    key={row.nutrient}
                    className="flex-row gap-2 py-2 border-t border-border-subtle"
                  >
                    <Text className="flex-1 text-text-primary">
                      {labels[row.nutrient]}
                    </Text>
                    <Text className="flex-1 text-text-secondary text-right">
                      {format(row.nutrient, row.previous)}
                    </Text>
                    <Text className="flex-1 text-text-primary font-semibold text-right">
                      {format(row.nutrient, row.proposed)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
            {error && (
              <Text accessibilityRole="alert" className="text-danger">
                {error.message}
              </Text>
            )}
          </ScrollView>
          {error && (
            <Button
              variant="secondary"
              disabled={busy || loading}
              onPress={onRefresh}
            >
              {t('recipeImport.refreshSyncPreview', {
                defaultValue: 'Refresh preview',
              })}
            </Button>
          )}
          <Button
            disabled={!preview || loading || busy || !!error}
            loading={busy}
            onPress={onConfirm}
          >
            {t('recipeImport.confirmSync', {
              defaultValue: 'Confirm nutrition sync',
            })}
          </Button>
          <Button variant="ghost" disabled={busy} onPress={onCancel}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
        </View>
      </View>
    </Modal>
  );
}
