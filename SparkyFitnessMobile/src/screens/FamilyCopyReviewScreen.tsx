import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import CalendarSheet, {
  type CalendarSheetRef,
} from '../components/CalendarSheet';
import SettingsRow from '../components/SettingsRow';
import Button from '../components/ui/Button';
import { useCopyFamilyFoodEntries } from '../hooks/useCopyFamilyFoodEntries';
import { useMealTypes } from '../hooks/useMealTypes';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useDiaryDateStore } from '../stores/diaryDateStore';
import type { RootStackScreenProps } from '../types/navigation';
import {
  calculateFamilyCopyTotals,
  familyDiaryUserName,
  isUnchangedWholeMeal,
} from '../utils/familyDiary';
import { formatDate, getTodayDate } from '../utils/dateUtils';
import { parseDecimalInput } from '../utils/numericInput';

type FamilyCopyReviewScreenProps = RootStackScreenProps<'FamilyCopyReview'>;

function formatNutritionValue(value: number): number {
  return Number(value.toFixed(1));
}

function initialQuantityTextById(
  sourceEntries: FamilyCopyReviewScreenProps['route']['params']['sourceEntries'],
  selectedEntryIds: string[],
): Record<string, string> {
  const selectedIds = new Set(selectedEntryIds);
  return sourceEntries.reduce<Record<string, string>>((quantities, entry) => {
    if (selectedIds.has(entry.id))
      quantities[entry.id] = String(entry.quantity);
    return quantities;
  }, {});
}

const FamilyCopyReviewScreen: React.FC<FamilyCopyReviewScreenProps> = ({
  navigation,
  route,
}) => {
  const {
    familyUser,
    sourceDate,
    mealTypeId,
    mealTypeName,
    sourceEntries,
    selectedEntryIds,
  } = route.params;
  const { t, i18n } = useTranslation();
  const locale = i18n?.resolvedLanguage ?? i18n?.language ?? 'en-US';
  const displayName = familyDiaryUserName(
    familyUser,
    t('familyDiary.unnamedMember', { defaultValue: 'Family member' }),
  );
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();
  const calendarRef = useRef<CalendarSheetRef>(null);
  const submitInFlightRef = useRef(false);
  const wasPendingRef = useRef(false);
  const [targetDate, setTargetDate] = useState(getTodayDate);
  const [quantityTextById, setQuantityTextById] = useState(() =>
    initialQuantityTextById(sourceEntries, selectedEntryIds),
  );
  const { mealTypes, defaultMealTypeId } = useMealTypes();
  const [targetMealTypeId, setTargetMealTypeId] = useState<string | null>(null);
  const sourceMealExists = mealTypeId
    ? mealTypes.some(mealType => mealType.id === mealTypeId)
    : false;
  const selectedOwnMealTypeId =
    targetMealTypeId &&
    mealTypes.some(mealType => mealType.id === targetMealTypeId)
      ? targetMealTypeId
      : null;
  const resolvedTargetMealTypeId =
    selectedOwnMealTypeId ??
    (sourceMealExists ? mealTypeId : defaultMealTypeId);

  const sourceEntryById = useMemo(
    () => new Map(sourceEntries.map(entry => [entry.id, entry])),
    [sourceEntries],
  );
  const selectionIdsAreUnique =
    new Set(selectedEntryIds).size === selectedEntryIds.length;
  const selectedEntries = useMemo(() => {
    if (!selectionIdsAreUnique) return [];
    return selectedEntryIds.flatMap(entryId => {
      const entry = sourceEntryById.get(entryId);
      return entry ? [entry] : [];
    });
  }, [selectedEntryIds, selectionIdsAreUnique, sourceEntryById]);
  const hasInvalidSelection =
    !selectionIdsAreUnique ||
    selectedEntries.length !== selectedEntryIds.length;
  const quantitiesById = useMemo(
    () =>
      selectedEntries.reduce<Record<string, number>>((quantities, entry) => {
        quantities[entry.id] = parseDecimalInput(quantityTextById[entry.id]);
        return quantities;
      }, {}),
    [quantityTextById, selectedEntries],
  );
  const invalidEntryIds = useMemo(
    () =>
      selectedEntries
        .filter(entry => {
          const quantity = quantitiesById[entry.id];
          return !Number.isFinite(quantity) || quantity <= 0;
        })
        .map(entry => entry.id),
    [quantitiesById, selectedEntries],
  );
  const totals = useMemo(
    () =>
      calculateFamilyCopyTotals(
        selectedEntries
          .filter(entry => !invalidEntryIds.includes(entry.id))
          .map(entry => ({ entry, quantity: quantitiesById[entry.id] })),
      ),
    [invalidEntryIds, quantitiesById, selectedEntries],
  );
  const { copyFromFamilyAsync, isPending } = useCopyFamilyFoodEntries({
    onSuccess: request => {
      useDiaryDateStore.getState().setSelectedDate(request.payload.targetDate);
      navigation.navigate('Tabs', {
        screen: 'Diary',
        params: { selectedDate: request.payload.targetDate },
      });
    },
  });

  useEffect(() => {
    if (wasPendingRef.current && !isPending) submitInFlightRef.current = false;
    wasPendingRef.current = isPending;
  }, [isPending]);

  const header = useScreenHeader({
    title: t('familyDiary.copyReview', { defaultValue: 'Review copy' }),
    left: { kind: 'back' },
  });
  const selectedIds = new Set(selectedEntries.map(entry => entry.id));
  const cannotSubmit =
    isPending ||
    hasInvalidSelection ||
    selectedEntries.length === 0 ||
    invalidEntryIds.length > 0 ||
    !resolvedTargetMealTypeId;

  const submit = () => {
    if (cannotSubmit || submitInFlightRef.current || !resolvedTargetMealTypeId)
      return;

    submitInFlightRef.current = true;
    const request = isUnchangedWholeMeal(
      sourceEntries,
      selectedIds,
      quantitiesById,
    )
      ? {
          kind: 'whole' as const,
          payload: {
            familyUserId: familyUser.userId,
            sourceDate,
            sourceMealType: mealTypeId ?? mealTypeName,
            targetDate,
            targetMealType: resolvedTargetMealTypeId,
            entries: sourceEntries.map(entry => ({
              entryId: entry.id,
              quantity: entry.quantity,
            })),
          },
        }
      : {
          kind: 'selected' as const,
          payload: {
            familyUserId: familyUser.userId,
            sourceDate,
            targetDate,
            targetMealType: resolvedTargetMealTypeId,
            entries: selectedEntries.map(entry => ({
              entryId: entry.id,
              quantity: quantitiesById[entry.id],
            })),
          },
        };

    void copyFromFamilyAsync(request).catch(() => {
      submitInFlightRef.current = false;
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
        <Text className="text-sm text-text-secondary">
          {t('familyDiary.copyFrom', {
            name: displayName,
            defaultValue: 'Copying from {{name}}',
          })}
        </Text>
        <Text className="mt-1 text-2xl font-bold text-text-primary">
          {t('familyDiary.copyMealTitle', {
            meal: mealTypeName,
            defaultValue: '{{meal}} meal',
          })}
        </Text>

        <View className="mt-5 gap-3">
          {selectedEntries.map(entry => {
            const foodName =
              entry.food_name ??
              t('familyDiary.unnamedFood', { defaultValue: 'Unnamed food' });
            const invalid = invalidEntryIds.includes(entry.id);
            return (
              <View key={entry.id} className="rounded-xl bg-surface p-4">
                <Text className="text-base font-semibold text-text-primary">
                  {foodName}
                </Text>
                <View className="mt-3 flex-row items-center gap-3">
                  <TextInput
                    accessibilityLabel={t('familyDiary.quantityForFood', {
                      food: foodName,
                      defaultValue: 'Quantity for {{food}}',
                    })}
                    keyboardType="decimal-pad"
                    aria-invalid={invalid}
                    aria-describedby={
                      invalid
                        ? `family-copy-quantity-error-${entry.id}`
                        : undefined
                    }
                    value={quantityTextById[entry.id] ?? ''}
                    onChangeText={quantityText =>
                      setQuantityTextById(current => ({
                        ...current,
                        [entry.id]: quantityText,
                      }))
                    }
                    className="min-w-24 rounded-lg border border-border-subtle bg-background px-3 py-2 text-base text-text-primary"
                    style={{ minHeight: 44 }}
                  />
                  <Text className="text-text-secondary">{entry.unit}</Text>
                </View>
                {invalid ? (
                  <Text
                    nativeID={`family-copy-quantity-error-${entry.id}`}
                    accessibilityRole="alert"
                    accessibilityLiveRegion="assertive"
                    className="mt-2 text-sm text-icon-danger"
                  >
                    {t('familyDiary.quantityMustBePositive', {
                      defaultValue: 'Enter a quantity greater than zero.',
                    })}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>

        {hasInvalidSelection ? (
          <Text
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
            className="mt-3 text-sm text-icon-danger"
          >
            {t('familyDiary.copyInvalidSelection', {
              defaultValue: 'Selected foods are no longer available.',
            })}
          </Text>
        ) : null}

        <View className="mt-5 rounded-xl bg-surface p-4">
          <Text className="text-base font-semibold text-text-primary">
            {t('familyDiary.copyNutrition', { defaultValue: 'Copy nutrition' })}
          </Text>
          <Text className="mt-2 text-text-secondary">
            {t('familyDiary.copyCalories', {
              calories: formatNutritionValue(totals.calories),
              defaultValue: '{{calories}} kcal',
            })}
          </Text>
          <Text className="mt-1 text-text-secondary">
            {t('familyDiary.copyProtein', {
              protein: formatNutritionValue(totals.protein),
              defaultValue: '{{protein}} g protein',
            })}
          </Text>
          <Text className="mt-1 text-text-secondary">
            {t('familyDiary.copyCarbs', {
              carbs: formatNutritionValue(totals.carbs),
              defaultValue: '{{carbs}} g carbs',
            })}
          </Text>
          <Text className="mt-1 text-text-secondary">
            {t('familyDiary.copyFat', {
              fat: formatNutritionValue(totals.fat),
              defaultValue: '{{fat}} g fat',
            })}
          </Text>
        </View>

        <View className="mt-5">
          <SettingsRow
            icon="calendar"
            title={t('familyDiary.copyTargetDate', {
              defaultValue: 'Copy date',
            })}
            subtitle={formatDate(targetDate, locale)}
            accessibilityLabel={t('familyDiary.copyTargetDateLabel', {
              date: formatDate(targetDate, locale),
              defaultValue: 'Copy date: {{date}}',
            })}
            accessibilityHint={t('familyDiary.copyTargetDateHint', {
              defaultValue: 'Opens the date picker',
            })}
            onPress={() => calendarRef.current?.present()}
          />
        </View>

        <Text className="mb-2 text-base font-semibold text-text-primary">
          {t('familyDiary.copyTargetMeal', { defaultValue: 'Copy to meal' })}
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {mealTypes.map(mealType => {
            const selected = mealType.id === resolvedTargetMealTypeId;
            return (
              <Pressable
                key={mealType.id}
                accessibilityRole="button"
                accessibilityLabel={mealType.name}
                accessibilityState={{ selected }}
                className={`rounded-full px-4 py-2 ${
                  selected ? 'bg-accent-primary' : 'bg-surface'
                }`}
                style={{ minHeight: 44, minWidth: 44 }}
                onPress={() => setTargetMealTypeId(mealType.id)}
              >
                <Text className={selected ? 'text-white' : 'text-text-primary'}>
                  {mealType.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {!resolvedTargetMealTypeId ? (
          <Text className="mt-2 text-sm text-icon-danger">
            {t('familyDiary.copyTargetMealRequired', {
              defaultValue: 'Choose a meal before copying.',
            })}
          </Text>
        ) : null}

        <Button
          className="mt-6"
          disabled={cannotSubmit}
          loading={isPending}
          accessibilityRole="button"
          accessibilityLabel={t('familyDiary.copyToMyDiary', {
            defaultValue: 'Copy to my diary',
          })}
          accessibilityState={{ disabled: cannotSubmit }}
          onPress={submit}
        >
          {t('familyDiary.copyToMyDiary', { defaultValue: 'Copy to my diary' })}
        </Button>
      </ScrollView>
      <CalendarSheet
        ref={calendarRef}
        selectedDate={targetDate}
        onSelectDate={setTargetDate}
      />
    </View>
  );
};

export default FamilyCopyReviewScreen;
