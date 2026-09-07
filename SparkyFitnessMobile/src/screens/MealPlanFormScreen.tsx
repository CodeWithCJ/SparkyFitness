import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useCSSVariable } from 'uniwind';
import { FooterSaveBar } from '../components/FormScreenChrome';
import FormInput from '../components/FormInput';
import Icon from '../components/Icon';
import StatusView from '../components/StatusView';
import Button from '../components/ui/Button';
import Switch from '../components/ui/Switch';
import {
  useCreateMealPlan,
  useMealPlanNutrition,
  useMeals,
  useMealTypes,
  useUpdateMealPlan,
} from '../hooks';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { consumePendingMealPlanSelection } from '../services/mealPlanSelection';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import type {
  MealPlanDraft,
  MealPlanDraftAssignment,
  MealPlanValidationErrors,
} from '../types/mealPlans';
import type { RootStackScreenProps } from '../types/navigation';
import { toLocalDateString } from '../utils/dateUtils';
import { DECIMAL_INPUT_REGEX, parseDecimalInput } from '../utils/numericInput';
import { getMealTypeDisplayLabel } from '../utils/mealNutrition';
import {
  buildMealPlanPayload,
  calculateMealPlanDayNutrition,
  createMealAssignment,
  createMealPlanDraft,
  validateMealPlanDraft,
  type MealPlanNutritionTotals,
} from '../utils/mealPlanForm';

type MealPlanFormScreenProps = RootStackScreenProps<'MealPlanForm'>;

interface NutritionStatProps {
  accessibilityLabel: string;
  label: string;
  value: string;
  color: string;
}

const NutritionStat: React.FC<NutritionStatProps> = ({
  accessibilityLabel,
  color,
  label,
  value,
}) => (
  <View className="flex-1 items-center" accessibilityLabel={accessibilityLabel}>
    <Text className="text-base font-bold" style={{ color }}>
      {value}
    </Text>
    <Text className="text-xs text-text-secondary mt-0.5">{label}</Text>
  </View>
);

function formatNutritionValue(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

const MealPlanFormScreen: React.FC<MealPlanFormScreenProps> = ({
  navigation,
  route,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const [dangerColor, caloriesColor, proteinColor, carbsColor, fatColor] =
    useCSSVariable([
      '--color-icon-danger',
      '--color-cat-orange',
      '--color-cat-blue',
      '--color-cat-amber',
      '--color-cat-purple',
    ]) as [string, string, string, string, string];
  const template = route.params?.template;
  const initialMeal = route.params?.initialMeal;
  const initialDate = useMemo(() => toLocalDateString(new Date()), []);
  const initialDay =
    template?.assignments[0]?.day_of_week ??
    (initialMeal ? 1 : new Date().getDay());
  const {
    meals,
    isLoading: isMealsLoading,
    isError: isMealsError,
    refetch: refetchMeals,
  } = useMeals();
  const {
    mealTypes,
    defaultMealTypeId,
    isLoading: isMealTypesLoading,
    isError: isMealTypesError,
    refetch: refetchMealTypes,
  } = useMealTypes();
  const [draft, setDraft] = useState<MealPlanDraft>(() => {
    const initialDraft = createMealPlanDraft(initialDate, template);
    if (!template && initialMeal && defaultMealTypeId) {
      return {
        ...initialDraft,
        planName: initialMeal.name,
        assignments: [
          createMealAssignment(initialMeal, defaultMealTypeId, initialDay),
        ],
      };
    }
    return initialDraft;
  });
  const [selectedDay, setSelectedDay] = useState(initialDay);
  const [appliedInitialMealId, setAppliedInitialMealId] = useState<
    string | null
  >(() =>
    !template && initialMeal && defaultMealTypeId ? initialMeal.id : null
  );
  const [errors, setErrors] = useState<MealPlanValidationErrors>({});
  const { createMealPlanAsync, isPending: isCreating } = useCreateMealPlan();
  const { updateMealPlanAsync, isPending: isUpdating } = useUpdateMealPlan(
    template?.id
  );
  const isSaving = isCreating || isUpdating;
  const dayOptions = useMemo(
    () => [
      t('mealPlans.weekdays.sunday', { defaultValue: 'Sunday' }),
      t('mealPlans.weekdays.monday', { defaultValue: 'Monday' }),
      t('mealPlans.weekdays.tuesday', { defaultValue: 'Tuesday' }),
      t('mealPlans.weekdays.wednesday', { defaultValue: 'Wednesday' }),
      t('mealPlans.weekdays.thursday', { defaultValue: 'Thursday' }),
      t('mealPlans.weekdays.friday', { defaultValue: 'Friday' }),
      t('mealPlans.weekdays.saturday', { defaultValue: 'Saturday' }),
    ],
    [t]
  );

  if (
    !template &&
    initialMeal &&
    defaultMealTypeId &&
    appliedInitialMealId !== initialMeal.id
  ) {
    setAppliedInitialMealId(initialMeal.id);
    setDraft((current) => ({
      ...current,
      planName: current.planName || initialMeal.name,
      assignments:
        current.assignments.length > 0
          ? current.assignments
          : [createMealAssignment(initialMeal, defaultMealTypeId, initialDay)],
    }));
  }

  useFocusEffect(
    useCallback(() => {
      const selection = consumePendingMealPlanSelection();
      if (!selection) return;
      setSelectedDay(selection.assignment.day_of_week);
      setDraft((current) => {
        if (selection.assignmentIndex === undefined) {
          return {
            ...current,
            assignments: [...current.assignments, selection.assignment],
          };
        }
        if (!current.assignments[selection.assignmentIndex]) return current;
        return {
          ...current,
          assignments: current.assignments.map((assignment, index) =>
            index === selection.assignmentIndex
              ? selection.assignment
              : assignment
          ),
        };
      });
      setErrors((current) => ({ ...current, assignments: undefined }));
    }, [])
  );

  const {
    resolveNutrition,
    isLoading: isNutritionLoading,
    isError: isNutritionError,
    refetch: refetchNutrition,
  } = useMealPlanNutrition(draft.assignments, meals);
  const planningOptionsUnavailable =
    isMealsLoading ||
    isMealsError ||
    isMealTypesLoading ||
    isMealTypesError ||
    mealTypes.length === 0;
  const resolvedAssignments = useMemo(
    () =>
      draft.assignments.map((assignment) => ({
        ...assignment,
        nutrition: resolveNutrition(assignment),
      })),
    [draft.assignments, resolveNutrition]
  );
  const dayTotals = useMemo(
    () => calculateMealPlanDayNutrition(resolvedAssignments, selectedDay),
    [resolvedAssignments, selectedDay]
  );

  const updateDraft = useCallback(
    <K extends keyof MealPlanDraft>(key: K, value: MealPlanDraft[K]) => {
      setDraft((current) => ({ ...current, [key]: value }));
      setErrors((current) => ({
        ...current,
        [key === 'planName'
          ? 'planName'
          : key === 'startDate'
            ? 'startDate'
            : key === 'endDate'
              ? 'endDate'
              : 'assignments']: undefined,
      }));
    },
    []
  );

  const updateAssignment = useCallback(
    (index: number, next: MealPlanDraftAssignment) => {
      setDraft((current) => ({
        ...current,
        assignments: current.assignments.map((assignment, assignmentIndex) =>
          assignmentIndex === index ? next : assignment
        ),
      }));
      setErrors((current) => ({ ...current, assignments: undefined }));
    },
    []
  );

  const removeAssignment = useCallback((index: number) => {
    setDraft((current) => ({
      ...current,
      assignments: current.assignments.filter(
        (_, assignmentIndex) => assignmentIndex !== index
      ),
    }));
  }, []);

  const openUnifiedSearch = useCallback(
    (mealTypeId: string, mealTypeName: string, assignmentIndex?: number) => {
      navigation.navigate('FoodSearch', {
        pickerMode: 'meal-plan',
        mealPlanTarget: {
          dayOfWeek: selectedDay,
          mealTypeId,
          mealTypeName,
          ...(assignmentIndex === undefined ? {} : { assignmentIndex }),
        },
      });
    },
    [navigation, selectedDay]
  );

  const save = useCallback(async () => {
    const nextErrors = validateMealPlanDraft(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    try {
      const currentClientDate = toLocalDateString(new Date());
      const payload = buildMealPlanPayload(
        template ? draft : { ...draft, startDate: currentClientDate }
      );
      if (template) await updateMealPlanAsync(payload, currentClientDate);
      else await createMealPlanAsync(payload, currentClientDate);
      Toast.show({
        type: 'success',
        text1: template
          ? t('mealPlans.updateSuccess', { defaultValue: 'Meal plan updated' })
          : t('mealPlans.createSuccess', { defaultValue: 'Meal plan created' }),
      });
      navigation.goBack();
    } catch {
      Toast.show({
        type: 'error',
        text1: template
          ? t('mealPlans.updateFailed', {
              defaultValue: 'Failed to update meal plan',
            })
          : t('mealPlans.createFailed', {
              defaultValue: 'Failed to create meal plan',
            }),
        text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
      });
    }
  }, [
    createMealPlanAsync,
    draft,
    navigation,
    t,
    template,
    updateMealPlanAsync,
  ]);

  const retryPlanningOptions = useCallback(() => {
    void Promise.all([refetchMeals(), refetchMealTypes(), refetchNutrition()]);
  }, [refetchMealTypes, refetchMeals, refetchNutrition]);

  const header = useScreenHeader({
    title: template
      ? t('mealPlans.editTitle', { defaultValue: 'Edit meal plan' })
      : t('mealPlans.createTitle', { defaultValue: 'Create meal plan' }),
    left: { kind: 'back', disabled: isSaving },
    right: {
      kind: 'primary',
      placement: 'native-only',
      busy: isSaving,
      disabled: isSaving || planningOptionsUnavailable,
      onPress: () => void save(),
    },
  });

  if (isMealsLoading || isMealTypesLoading) {
    return (
      <View
        className="flex-1 bg-background"
        style={!usesNativeHeader ? { paddingTop: insets.top } : undefined}
      >
        {header}
        <StatusView
          loading
          title={t('mealPlans.loadingPlanningOptions', {
            defaultValue: 'Loading planning options...',
          })}
        />
      </View>
    );
  }

  if (isMealsError || isMealTypesError) {
    return (
      <View
        className="flex-1 bg-background"
        style={!usesNativeHeader ? { paddingTop: insets.top } : undefined}
      >
        {header}
        <StatusView
          icon="alert-circle"
          iconTone="danger"
          title={t('mealPlans.planningOptionsFailed', {
            defaultValue: 'Failed to load planning options',
          })}
          subtitle={t('mealPlans.planningOptionsFailedSubtitle', {
            defaultValue: 'Check your connection and try again.',
          })}
          action={{
            label: t('common.retry', { defaultValue: 'Retry' }),
            onPress: retryPlanningOptions,
            variant: 'primary',
          }}
        />
      </View>
    );
  }

  if (mealTypes.length === 0) {
    return (
      <View
        className="flex-1 bg-background"
        style={!usesNativeHeader ? { paddingTop: insets.top } : undefined}
      >
        {header}
        <StatusView
          icon="meal"
          title={t('mealPlans.planningSetupNeeded', {
            defaultValue: 'Meal planning setup needed',
          })}
          subtitle={t('mealPlans.noMealTypes', {
            defaultValue: 'Add a visible meal type before creating a plan.',
          })}
          action={{
            label: t('common.retry', { defaultValue: 'Retry' }),
            onPress: retryPlanningOptions,
          }}
        />
      </View>
    );
  }

  const nutritionStats: {
    key: keyof MealPlanNutritionTotals;
    label: string;
    unit: string;
    color: string;
  }[] = [
    {
      key: 'calories',
      label: t('mealPlans.caloriesLabel', { defaultValue: 'Calories' }),
      unit: 'kcal',
      color: caloriesColor,
    },
    {
      key: 'protein',
      label: t('mealPlans.proteinLabel', { defaultValue: 'Protein' }),
      unit: 'g',
      color: proteinColor,
    },
    {
      key: 'carbs',
      label: t('mealPlans.carbsLabel', { defaultValue: 'Carbs' }),
      unit: 'g',
      color: carbsColor,
    },
    {
      key: 'fat',
      label: t('mealPlans.fatLabel', { defaultValue: 'Fat' }),
      unit: 'g',
      color: fatColor,
    },
  ];

  const renderAssignment = (
    assignment: MealPlanDraftAssignment,
    index: number,
    mealTypeName: string
  ) => {
    const name =
      assignment.item_type === 'meal'
        ? assignment.meal_name
        : assignment.food_name;
    const totals = calculateMealPlanDayNutrition([assignment], selectedDay);
    return (
      <View
        key={assignment.id ?? `${assignment.item_type}-${index}`}
        className="border-t border-border-subtle pt-3 mt-3"
      >
        <View className="flex-row items-start justify-between">
          <View className="flex-1 mr-3">
            <View className="flex-row items-center gap-2">
              <Text className="text-base font-semibold text-text-primary">
                {name}
              </Text>
              <View className="bg-raised rounded-full px-2 py-0.5">
                <Text className="text-xs font-medium text-text-secondary">
                  {assignment.item_type === 'meal'
                    ? t('mealPlans.mealBadge', { defaultValue: 'Meal' })
                    : t('mealPlans.foodBadge', { defaultValue: 'Food' })}
                </Text>
              </View>
            </View>
            {assignment.nutrition ? (
              <Text className="text-xs text-text-secondary mt-1">
                {t('mealPlans.nutritionLine', {
                  defaultValue:
                    '{{calories}} kcal · {{protein}} g P · {{carbs}} g C · {{fat}} g F',
                  calories: formatNutritionValue(totals.calories),
                  protein: formatNutritionValue(totals.protein),
                  carbs: formatNutritionValue(totals.carbs),
                  fat: formatNutritionValue(totals.fat),
                })}
              </Text>
            ) : null}
          </View>
          <View className="flex-row items-center gap-4">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('mealPlans.replaceAssignmentFor', {
                defaultValue: 'Replace {{name}}',
                name: name ?? '',
              })}
              hitSlop={8}
              onPress={() =>
                openUnifiedSearch(assignment.meal_type_id, mealTypeName, index)
              }
            >
              <Icon name="pencil" size={19} color={proteinColor} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('mealPlans.removeAssignmentFor', {
                defaultValue: 'Remove {{name}}',
                name: name ?? '',
              })}
              hitSlop={8}
              onPress={() => removeAssignment(index)}
            >
              <Icon name="trash" size={19} color={dangerColor} />
            </Pressable>
          </View>
        </View>
        <View className="flex-row items-end mt-3">
          <View className="flex-1 mr-3">
            <Text className="text-sm font-medium text-text-secondary mb-2">
              {t('mealPlans.quantity', { defaultValue: 'Quantity' })}
            </Text>
            <FormInput
              accessibilityLabel={t('mealPlans.quantityFor', {
                defaultValue: 'Quantity for {{name}}',
                name: name ?? '',
              })}
              keyboardType="decimal-pad"
              value={
                assignment.quantityText ??
                (assignment.quantity > 0 ? String(assignment.quantity) : '')
              }
              onChangeText={(value) => {
                if (!DECIMAL_INPUT_REGEX.test(value)) return;
                const parsed = parseDecimalInput(value);
                updateAssignment(index, {
                  ...assignment,
                  quantityText: value,
                  quantity: Number.isFinite(parsed) ? parsed : 0,
                });
              }}
            />
          </View>
          <View className="min-w-20 min-h-11 px-3 py-2.5 rounded-lg border border-border-subtle bg-raised items-center justify-center">
            <Text className="text-base text-text-primary">
              {assignment.unit}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View
      className="flex-1 bg-background"
      style={!usesNativeHeader ? { paddingTop: insets.top } : undefined}
    >
      {header}
      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 24,
        }}
        keyboardShouldPersistTaps="handled"
        bottomOffset={20}
      >
        <Text className="text-sm font-medium text-text-secondary mb-2">
          {t('mealPlans.name', { defaultValue: 'Plan name' })}
        </Text>
        <FormInput
          value={draft.planName}
          placeholder={t('mealPlans.namePlaceholder', {
            defaultValue: 'Meal plan name',
          })}
          onChangeText={(value) => updateDraft('planName', value)}
        />
        {errors.planName ? (
          <Text className="text-sm text-icon-danger mt-1">
            {t('mealPlans.nameRequired', {
              defaultValue: 'Plan name is required.',
            })}
          </Text>
        ) : null}

        <Text className="text-sm font-medium text-text-secondary mt-4 mb-2">
          {t('mealPlans.description', { defaultValue: 'Description' })}
        </Text>
        <FormInput
          value={draft.description}
          placeholder={t('mealPlans.descriptionPlaceholder', {
            defaultValue: 'Optional notes about this plan',
          })}
          multiline
          onChangeText={(value) => updateDraft('description', value)}
          style={{ minHeight: 84, textAlignVertical: 'top' }}
        />

        <View className="bg-surface rounded-xl px-4 py-4 mt-4 flex-row items-center justify-between">
          <View className="flex-1 mr-4">
            <Text className="text-base font-semibold text-text-primary">
              {t('mealPlans.activePlan', { defaultValue: 'Active plan' })}
            </Text>
            <Text className="text-sm text-text-secondary mt-1">
              {t('mealPlans.activePlanHint', {
                defaultValue:
                  'Active plans populate matching future diary days.',
              })}
            </Text>
          </View>
          <Switch
            accessibilityLabel={t('mealPlans.activePlan', {
              defaultValue: 'Active plan',
            })}
            value={draft.isActive}
            onValueChange={(value) => updateDraft('isActive', value)}
          />
        </View>

        <Text className="text-lg font-semibold text-text-primary mt-6">
          {t('mealPlans.weeklyPlan', { defaultValue: 'Weekly plan' })}
        </Text>
        <Text className="text-sm text-text-secondary mt-1 mb-3">
          {t('mealPlans.oneDayHint', {
            defaultValue:
              'Choose a day, then add foods or reusable meals to each meal type.',
          })}
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
        >
          {dayOptions.map((label, day) => {
            const isSelected = day === selectedDay;
            const hasAssignments = draft.assignments.some(
              (assignment) => assignment.day_of_week === day
            );
            return (
              <Pressable
                key={label}
                accessibilityRole="tab"
                accessibilityState={{ selected: isSelected }}
                onPress={() => setSelectedDay(day)}
                className={
                  isSelected
                    ? 'min-w-24 rounded-xl bg-accent-primary px-3 py-2.5 items-center'
                    : 'min-w-24 rounded-xl bg-raised px-3 py-2.5 items-center'
                }
              >
                <Text
                  className={
                    isSelected
                      ? 'text-sm font-semibold text-white'
                      : 'text-sm font-semibold text-text-primary'
                  }
                >
                  {label}
                </Text>
                <View
                  className={
                    hasAssignments
                      ? isSelected
                        ? 'w-1.5 h-1.5 rounded-full bg-white mt-1'
                        : 'w-1.5 h-1.5 rounded-full bg-accent-primary mt-1'
                      : 'w-1.5 h-1.5 mt-1'
                  }
                />
              </Pressable>
            );
          })}
        </ScrollView>

        <View className="bg-surface rounded-xl px-3 py-4 mt-4 flex-row border border-border-subtle">
          {nutritionStats.map((stat) => {
            const value = formatNutritionValue(dayTotals[stat.key]);
            return (
              <NutritionStat
                key={stat.key}
                accessibilityLabel={t('mealPlans.dailyNutritionAccessibility', {
                  defaultValue: 'Daily {{nutrient}} {{value}} {{unit}}',
                  nutrient: stat.label,
                  value,
                  unit: stat.unit,
                })}
                color={stat.color}
                label={stat.label}
                value={`${value} ${stat.unit}`}
              />
            );
          })}
        </View>

        {isNutritionLoading || isNutritionError ? (
          <View
            accessibilityLiveRegion="polite"
            className="bg-raised rounded-xl px-4 py-3 mt-3 border border-border-subtle"
          >
            <Text className="text-sm text-text-secondary">
              {isNutritionError
                ? t('mealPlans.nutritionLoadFailed', {
                    defaultValue:
                      "Some nutrition details couldn't be loaded. Totals may be incomplete.",
                  })
                : t('mealPlans.nutritionLoading', {
                    defaultValue:
                      'Loading missing nutrition details. Totals may be incomplete.',
                  })}
            </Text>
            {isNutritionError ? (
              <Button
                variant="secondary"
                onPress={() => void refetchNutrition()}
                className="mt-3"
              >
                {t('common.retry', { defaultValue: 'Retry' })}
              </Button>
            ) : null}
          </View>
        ) : null}

        {mealTypes.map((mealType) => {
          const mealTypeLabel = getMealTypeDisplayLabel(mealType, t);
          const assignmentEntries = resolvedAssignments
            .map((assignment, index) => ({ assignment, index }))
            .filter(
              ({ assignment }) =>
                assignment.day_of_week === selectedDay &&
                assignment.meal_type_id === mealType.id
            );
          const sectionTotals = calculateMealPlanDayNutrition(
            assignmentEntries.map(({ assignment }) => assignment),
            selectedDay
          );
          return (
            <View
              key={mealType.id}
              className="bg-surface rounded-xl px-4 py-4 mt-4 border border-border-subtle"
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-2">
                  <Icon name="meal" size={20} color={proteinColor} />
                  <Text className="text-lg font-semibold text-text-primary">
                    {mealTypeLabel}
                  </Text>
                </View>
                <Text className="text-sm font-semibold text-text-secondary">
                  {t('mealPlans.caloriesValue', {
                    defaultValue: '{{value}} kcal',
                    value: formatNutritionValue(sectionTotals.calories),
                  })}
                </Text>
              </View>
              <Text
                className="text-xs text-text-secondary mt-1"
                accessibilityLabel={t(
                  'mealPlans.mealTypeNutritionAccessibility',
                  {
                    defaultValue:
                      '{{mealType}} total {{calories}} kcal, {{protein}} g protein, {{carbs}} g carbs, {{fat}} g fat',
                    mealType: mealTypeLabel,
                    calories: formatNutritionValue(sectionTotals.calories),
                    protein: formatNutritionValue(sectionTotals.protein),
                    carbs: formatNutritionValue(sectionTotals.carbs),
                    fat: formatNutritionValue(sectionTotals.fat),
                  }
                )}
              >
                {t('mealPlans.mealTypeMacros', {
                  defaultValue: '{{protein}} g P · {{carbs}} g C · {{fat}} g F',
                  protein: formatNutritionValue(sectionTotals.protein),
                  carbs: formatNutritionValue(sectionTotals.carbs),
                  fat: formatNutritionValue(sectionTotals.fat),
                })}
              </Text>
              {assignmentEntries.map(({ assignment, index }) =>
                renderAssignment(assignment, index, mealTypeLabel)
              )}
              <Button
                variant="secondary"
                accessibilityLabel={t('mealPlans.addToMealType', {
                  defaultValue: 'Add food or meal to {{mealType}}',
                  mealType: mealTypeLabel,
                })}
                onPress={() => openUnifiedSearch(mealType.id, mealTypeLabel)}
                className="mt-4"
              >
                {t('mealPlans.addFoodOrMeal', {
                  defaultValue: 'Add food or meal',
                })}
              </Button>
            </View>
          );
        })}

        {errors.assignments ? (
          <Text className="text-sm text-icon-danger mt-3">
            {t('mealPlans.assignmentRequired', {
              defaultValue: 'Add at least one complete meal assignment.',
            })}
          </Text>
        ) : null}
        <View className="bg-raised rounded-xl px-4 py-3 mt-4">
          <Text className="text-sm text-text-secondary">
            {t('mealPlans.familyNotice', {
              defaultValue:
                'You can schedule your own meals plus family or public meals already visible in your meal library. The plan stays private to this account and does not change meal sharing.',
            })}
          </Text>
        </View>
      </KeyboardAwareScrollView>

      {!usesNativeHeader ? (
        <FooterSaveBar
          onPress={() => void save()}
          busy={isSaving}
          disabled={isSaving || planningOptionsUnavailable}
        />
      ) : null}
    </View>
  );
};

export default MealPlanFormScreen;
