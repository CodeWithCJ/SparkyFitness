import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import Button from '../components/ui/Button';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import type { RootStackScreenProps } from '../types/navigation';
import {
  calculateFamilyCopyTotals,
  familyDiaryUserName,
} from '../utils/familyDiary';

type FamilyMealDetailScreenProps = RootStackScreenProps<'FamilyMealDetail'>;

function formatNutritionValue(value: number): number {
  return Number(value.toFixed(1));
}

const FamilyMealDetailScreen: React.FC<FamilyMealDetailScreenProps> = ({
  navigation,
  route,
}) => {
  const { familyUser, sourceDate, mealTypeId, mealTypeName, entries } =
    route.params;
  const { t } = useTranslation();
  const displayName = familyDiaryUserName(
    familyUser,
    t('familyDiary.unnamedMember', { defaultValue: 'Family member' })
  );
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();
  const [selectedIds, setSelectedIds] = useState(
    () => new Set(entries.map((entry) => entry.id))
  );
  const header = useScreenHeader({
    title: mealTypeName,
    nativeTitle: mealTypeName,
    left: { kind: 'back' },
  });
  const selectedEntries = useMemo(
    () => entries.filter((entry) => selectedIds.has(entry.id)),
    [entries, selectedIds]
  );
  const selectedTotals = calculateFamilyCopyTotals(
    selectedEntries.map((entry) => ({ entry, quantity: entry.quantity }))
  );
  const allSelected = entries.length > 0 && selectedIds.size === entries.length;
  const selectAllLabel = allSelected
    ? t('familyDiary.deselectAll', { defaultValue: 'Deselect all' })
    : t('familyDiary.selectAll', { defaultValue: 'Select all' });

  const toggleEntry = (entryId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(entryId)) {
        next.delete(entryId);
      } else {
        next.add(entryId);
      }
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedIds(
      allSelected ? new Set() : new Set(entries.map((entry) => entry.id))
    );
  };

  const continueToReview = () => {
    navigation.navigate('FamilyCopyReview', {
      familyUser,
      sourceDate,
      mealTypeId,
      mealTypeName,
      sourceEntries: entries,
      selectedEntryIds: entries
        .filter((entry) => selectedIds.has(entry.id))
        .map((entry) => entry.id),
    });
  };

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + activeWorkoutBarPadding + 24,
        }}
      >
        <Text className="text-sm text-text-secondary">{displayName}</Text>
        <Text className="mt-1 text-2xl font-bold text-text-primary">
          {mealTypeName}
        </Text>
        <Text className="mt-1 text-text-secondary">
          {t('familyDiary.selectedNutrition', {
            calories: formatNutritionValue(selectedTotals.calories),
            protein: formatNutritionValue(selectedTotals.protein),
            carbs: formatNutritionValue(selectedTotals.carbs),
            fat: formatNutritionValue(selectedTotals.fat),
            defaultValue:
              'Selected: {{calories}} kcal · P {{protein}} g · C {{carbs}} g · F {{fat}} g',
          })}
        </Text>

        {familyUser.canCopy ? (
          <Button
            variant="secondary"
            className="mt-5"
            accessibilityRole="button"
            accessibilityState={{ selected: allSelected }}
            accessibilityLabel={selectAllLabel}
            onPress={toggleAll}
          >
            {selectAllLabel}
          </Button>
        ) : (
          <Text className="mt-5 text-sm font-medium text-text-secondary">
            {t('familyDiary.viewingOnly', { defaultValue: 'Viewing only' })}
          </Text>
        )}

        <View className="mt-4 gap-2">
          {entries.map((entry) => {
            const selected = selectedIds.has(entry.id);
            const foodName =
              entry.food_name ??
              t('familyDiary.unnamedFood', {
                defaultValue: 'Unnamed food',
              });
            const selectionLabel = selected
              ? t('familyDiary.deselectFood', {
                  food: foodName,
                  defaultValue: 'Deselect {{food}}',
                })
              : t('familyDiary.selectFood', {
                  food: foodName,
                  defaultValue: 'Select {{food}}',
                });
            const entryTotals = calculateFamilyCopyTotals([
              { entry, quantity: entry.quantity },
            ]);
            const row = (
              <>
                <View>
                  <Text className="text-base font-medium text-text-primary">
                    {foodName}
                  </Text>
                  <Text className="mt-1 text-sm text-text-secondary">
                    {entry.quantity} {entry.unit}
                  </Text>
                  <Text className="mt-1 text-sm text-text-secondary">
                    {t('familyDiary.nutritionSummary', {
                      calories: formatNutritionValue(entryTotals.calories),
                      protein: formatNutritionValue(entryTotals.protein),
                      carbs: formatNutritionValue(entryTotals.carbs),
                      fat: formatNutritionValue(entryTotals.fat),
                      defaultValue:
                        '{{calories}} kcal · P {{protein}} g · C {{carbs}} g · F {{fat}} g',
                    })}
                  </Text>
                </View>
                {familyUser.canCopy ? (
                  <Text className="text-sm text-accent-primary">
                    {selected ? '✓' : '○'}
                  </Text>
                ) : null}
              </>
            );

            if (!familyUser.canCopy) {
              return (
                <View
                  key={entry.id}
                  className="flex-row items-center justify-between rounded-xl bg-surface p-4"
                >
                  {row}
                </View>
              );
            }

            return (
              <Pressable
                key={entry.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={selectionLabel}
                className="flex-row items-center justify-between rounded-xl bg-surface p-4"
                onPress={() => toggleEntry(entry.id)}
              >
                {row}
              </Pressable>
            );
          })}
        </View>

        {familyUser.canCopy ? (
          <Button
            className="mt-6"
            disabled={selectedIds.size === 0}
            accessibilityRole="button"
            onPress={continueToReview}
          >
            {t('familyDiary.continue', { defaultValue: 'Continue' })}
          </Button>
        ) : null}
      </ScrollView>
    </View>
  );
};

export default FamilyMealDetailScreen;
