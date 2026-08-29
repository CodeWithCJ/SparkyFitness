import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useCSSVariable } from 'uniwind';
import BottomSheetPicker, { type PickerOption } from '../components/BottomSheetPicker';
import CalendarSheet, { type CalendarSheetRef } from '../components/CalendarSheet';
import { FooterSaveBar } from '../components/FormScreenChrome';
import FormInput from '../components/FormInput';
import Icon from '../components/Icon';
import StatusView from '../components/StatusView';
import Button from '../components/ui/Button';
import Switch from '../components/ui/Switch';
import { useMealTypes } from '../hooks/useMealTypes';
import { useCreateMealPlan, useUpdateMealPlan } from '../hooks/useMealPlans';
import { useMeals } from '../hooks/useMeals';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import type {
  MealPlanDraft,
  MealPlanDraftAssignment,
  MealPlanValidationErrors,
} from '../types/mealPlans';
import type { RootStackScreenProps } from '../types/navigation';
import { formatDateLabel, toLocalDateString } from '../utils/dateUtils';
import { DECIMAL_INPUT_REGEX, parseDecimalInput } from '../utils/numericInput';
import {
  buildMealPlanPayload,
  createMealAssignment,
  createMealPlanDraft,
  validateMealPlanDraft,
} from '../utils/mealPlanForm';

type MealPlanFormScreenProps = RootStackScreenProps<'MealPlanForm'>;

interface DateFieldProps {
  label: string;
  date: string;
  emptyLabel?: string;
  onPress: () => void;
  formattedDate: string;
}

const DateField: React.FC<DateFieldProps> = ({ label, date, emptyLabel, onPress, formattedDate }) => (
  <View className="flex-1">
    <Text className="text-sm font-medium text-text-secondary mb-2">{label}</Text>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      className="min-h-11 px-3 py-2.5 rounded-lg border border-border-subtle bg-raised flex-row items-center justify-between"
      onPress={onPress}
    >
      <Text className={date ? 'text-base text-text-primary' : 'text-base text-text-muted'}>
        {date ? formattedDate : emptyLabel}
      </Text>
      <Icon name="calendar" size={18} color="#737373" />
    </Pressable>
  </View>
);

const MealPlanFormScreen: React.FC<MealPlanFormScreenProps> = ({ navigation, route }) => {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const [dangerColor] = useCSSVariable(['--color-icon-danger']) as [string];
  const template = route.params?.template;
  const initialMeal = route.params?.initialMeal;
  const initialDate = useMemo(() => toLocalDateString(new Date()), []);
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
        assignments: [createMealAssignment(initialMeal, defaultMealTypeId, 1)],
      };
    }
    return initialDraft;
  });
  const [appliedInitialMealId, setAppliedInitialMealId] = useState<string | null>(() =>
    !template && initialMeal && defaultMealTypeId ? initialMeal.id : null);
  const [errors, setErrors] = useState<MealPlanValidationErrors>({});
  const startCalendarRef = useRef<CalendarSheetRef>(null);
  const endCalendarRef = useRef<CalendarSheetRef>(null);
  const { createMealPlanAsync, isPending: isCreating } = useCreateMealPlan();
  const { updateMealPlanAsync, isPending: isUpdating } = useUpdateMealPlan(template?.id);
  const isSaving = isCreating || isUpdating;
  const planningOptionsUnavailable =
    isMealsLoading ||
    isMealTypesLoading ||
    isMealsError ||
    isMealTypesError ||
    (!template && (meals.length === 0 || mealTypes.length === 0));
  const dateLocale = i18n.language.startsWith('pl') ? 'pl-PL' : 'en-US';
  const dayOptions = useMemo<PickerOption<number>[]>(() => [
    { label: t('mealPlans.weekdays.sunday', { defaultValue: 'Sunday' }), value: 0 },
    { label: t('mealPlans.weekdays.monday', { defaultValue: 'Monday' }), value: 1 },
    { label: t('mealPlans.weekdays.tuesday', { defaultValue: 'Tuesday' }), value: 2 },
    { label: t('mealPlans.weekdays.wednesday', { defaultValue: 'Wednesday' }), value: 3 },
    { label: t('mealPlans.weekdays.thursday', { defaultValue: 'Thursday' }), value: 4 },
    { label: t('mealPlans.weekdays.friday', { defaultValue: 'Friday' }), value: 5 },
    { label: t('mealPlans.weekdays.saturday', { defaultValue: 'Saturday' }), value: 6 },
  ], [t]);

  if (!template && initialMeal && defaultMealTypeId && appliedInitialMealId !== initialMeal.id) {
    setAppliedInitialMealId(initialMeal.id);
    setDraft((current) => ({
      ...current,
      planName: current.planName || initialMeal.name,
      assignments: current.assignments.length > 0
        ? current.assignments
        : [createMealAssignment(initialMeal, defaultMealTypeId, 1)],
    }));
  }

  const mealOptions = useMemo(
    () => meals.map((meal) => ({ label: meal.name, value: meal.id })),
    [meals],
  );
  const mealTypeOptions = useMemo(
    () => mealTypes.map((mealType) => ({ label: mealType.name, value: mealType.id })),
    [mealTypes],
  );

  const updateDraft = useCallback(<K extends keyof MealPlanDraft>(key: K, value: MealPlanDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key === 'planName' ? 'planName' : key === 'startDate' ? 'startDate' : key === 'endDate' ? 'endDate' : 'assignments']: undefined }));
  }, []);

  const updateAssignment = useCallback((index: number, next: MealPlanDraftAssignment) => {
    setDraft((current) => ({
      ...current,
      assignments: current.assignments.map((assignment, assignmentIndex) =>
        assignmentIndex === index ? next : assignment),
    }));
    setErrors((current) => ({ ...current, assignments: undefined }));
  }, []);

  const addMeal = useCallback(() => {
    const meal = meals[0];
    const mealTypeId = defaultMealTypeId ?? mealTypes[0]?.id;
    if (!meal || !mealTypeId) {
      Toast.show({
        type: 'error',
        text1: t('mealPlans.assignmentUnavailable', { defaultValue: 'A reusable meal and meal type are required' }),
      });
      return;
    }
    setDraft((current) => ({
      ...current,
      assignments: [...current.assignments, createMealAssignment(meal, mealTypeId, 1)],
    }));
    setErrors((current) => ({ ...current, assignments: undefined }));
  }, [defaultMealTypeId, mealTypes, meals, t]);

  const changeMeal = useCallback((index: number, assignment: MealPlanDraftAssignment, mealId: string) => {
    const meal = meals.find((candidate) => candidate.id === mealId);
    if (!meal) return;
    updateAssignment(index, createMealAssignment(meal, assignment.meal_type_id, assignment.day_of_week));
  }, [meals, updateAssignment]);

  const removeAssignment = useCallback((index: number) => {
    setDraft((current) => ({
      ...current,
      assignments: current.assignments.filter((_, assignmentIndex) => assignmentIndex !== index),
    }));
  }, []);

  const save = useCallback(async () => {
    const nextErrors = validateMealPlanDraft(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    try {
      const payload = buildMealPlanPayload(draft);
      const currentClientDate = toLocalDateString(new Date());
      if (template) {
        await updateMealPlanAsync(payload, currentClientDate);
      } else {
        await createMealPlanAsync(payload, currentClientDate);
      }
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
          ? t('mealPlans.updateFailed', { defaultValue: 'Failed to update meal plan' })
          : t('mealPlans.createFailed', { defaultValue: 'Failed to create meal plan' }),
        text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
      });
    }
  }, [createMealPlanAsync, draft, navigation, t, template, updateMealPlanAsync]);

  const retryPlanningOptions = useCallback(() => {
    void Promise.all([refetchMeals(), refetchMealTypes()]);
  }, [refetchMealTypes, refetchMeals]);

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

  if (!template && (meals.length === 0 || mealTypes.length === 0)) {
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
          subtitle={
            meals.length === 0
              ? t('mealPlans.noReusableMeals', {
                  defaultValue: 'Create a reusable meal before creating a plan.',
                })
              : t('mealPlans.noMealTypes', {
                  defaultValue: 'Add a visible meal type before creating a plan.',
                })
          }
          action={{
            label: t('common.retry', { defaultValue: 'Retry' }),
            onPress: retryPlanningOptions,
          }}
        />
      </View>
    );
  }

  const renderMealAssignment = (assignment: MealPlanDraftAssignment, index: number) => {
    if (assignment.item_type === 'food') {
      return (
        <View key={assignment.id ?? `food-${index}`} className="bg-surface rounded-xl p-4 mb-3 border border-border-subtle">
          <View className="flex-row items-start justify-between">
            <View className="flex-1 mr-3">
              <Text className="text-base font-semibold text-text-primary">
                {assignment.food_name || t('mealPlans.foodAssignment', { defaultValue: 'Food assignment' })}
              </Text>
              <Text className="text-sm text-text-secondary mt-1">
                {dayOptions.find((day) => day.value === assignment.day_of_week)?.label} · {assignment.meal_type || assignment.meal_type_id} · {assignment.quantity} {assignment.unit}
              </Text>
            </View>
            <View className="bg-raised rounded-full px-2.5 py-1">
              <Text className="text-xs font-semibold text-text-secondary">
                {t('mealPlans.managedOnWeb', { defaultValue: 'Managed on web' })}
              </Text>
            </View>
          </View>
          <Text className="text-sm text-text-secondary mt-3">
            {t('mealPlans.foodPreserved', { defaultValue: 'This food assignment is preserved when you save. Edit it in the web app.' })}
          </Text>
        </View>
      );
    }

    const selectedMeal = meals.find((meal) => meal.id === assignment.meal_id);
    return (
      <View key={assignment.id ?? `meal-${index}`} className="bg-surface rounded-xl p-4 mb-3 border border-border-subtle">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-base font-semibold text-text-primary">
            {t('mealPlans.mealAssignment', { defaultValue: 'Meal assignment' })}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('mealPlans.removeAssignment', { defaultValue: 'Remove meal assignment' })}
            hitSlop={8}
            onPress={() => removeAssignment(index)}
          >
            <Icon name="trash" size={19} color={dangerColor} />
          </Pressable>
        </View>

        <Text className="text-sm font-medium text-text-secondary mb-2">
          {t('mealPlans.weekday', { defaultValue: 'Weekday' })}
        </Text>
        <BottomSheetPicker<number>
          value={assignment.day_of_week}
          options={dayOptions}
          title={t('mealPlans.selectWeekday', { defaultValue: 'Select weekday' })}
          onSelect={(day) => updateAssignment(index, { ...assignment, day_of_week: day })}
        />

        <Text className="text-sm font-medium text-text-secondary mt-4 mb-2">
          {t('mealPlans.mealType', { defaultValue: 'Meal type' })}
        </Text>
        <BottomSheetPicker<string>
          value={assignment.meal_type_id}
          options={mealTypeOptions}
          title={t('mealPlans.selectMealType', { defaultValue: 'Select meal type' })}
          onSelect={(mealTypeId) => updateAssignment(index, {
            ...assignment,
            meal_type_id: mealTypeId,
            meal_type: mealTypes.find((mealType) => mealType.id === mealTypeId)?.name ?? null,
          })}
        />

        <Text className="text-sm font-medium text-text-secondary mt-4 mb-2">
          {t('mealPlans.reusableMeal', { defaultValue: 'Reusable meal' })}
        </Text>
        <BottomSheetPicker<string>
          value={assignment.meal_id ?? ''}
          options={mealOptions}
          title={t('mealPlans.selectMeal', { defaultValue: 'Select meal' })}
          onSelect={(mealId) => changeMeal(index, assignment, mealId)}
        />

        <View className="flex-row items-end mt-4">
          <View className="flex-1 mr-3">
            <Text className="text-sm font-medium text-text-secondary mb-2">
              {t('mealPlans.quantity', { defaultValue: 'Quantity' })}
            </Text>
            <FormInput
              accessibilityLabel={t('mealPlans.quantityFor', { defaultValue: 'Quantity for {{name}}', name: selectedMeal?.name || assignment.meal_name || '' })}
              keyboardType="decimal-pad"
              value={assignment.quantityText ?? (assignment.quantity > 0 ? String(assignment.quantity) : '')}
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
            <Text className="text-base text-text-primary">{assignment.unit}</Text>
          </View>
        </View>
        <Text className="text-xs text-text-secondary mt-2">
          {t('mealPlans.quantityHint', {
            defaultValue: 'Use the meal serving unit. For weighed meal prep, enter the amount placed in one container.',
          })}
        </Text>
      </View>
    );
  };

  return (
    <View className="flex-1 bg-background" style={!usesNativeHeader ? { paddingTop: insets.top } : undefined}>
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
          placeholder={t('mealPlans.namePlaceholder', { defaultValue: 'Meal plan name' })}
          onChangeText={(value) => updateDraft('planName', value)}
        />
        {errors.planName ? (
          <Text className="text-sm text-icon-danger mt-1">
            {t('mealPlans.nameRequired', { defaultValue: 'Plan name is required.' })}
          </Text>
        ) : null}

        <Text className="text-sm font-medium text-text-secondary mt-4 mb-2">
          {t('mealPlans.description', { defaultValue: 'Description' })}
        </Text>
        <FormInput
          value={draft.description}
          placeholder={t('mealPlans.descriptionPlaceholder', { defaultValue: 'Optional notes about this plan' })}
          multiline
          onChangeText={(value) => updateDraft('description', value)}
          style={{ minHeight: 84, textAlignVertical: 'top' }}
        />

        <View className="flex-row mt-4 gap-3">
          <DateField
            label={t('mealPlans.startDate', { defaultValue: 'Start date' })}
            date={draft.startDate}
            formattedDate={formatDateLabel(draft.startDate, t, dateLocale)}
            onPress={() => startCalendarRef.current?.present()}
          />
          <DateField
            label={t('mealPlans.endDate', { defaultValue: 'End date' })}
            date={draft.endDate}
            emptyLabel={t('mealPlans.noEndDate', { defaultValue: 'No end date' })}
            formattedDate={draft.endDate ? formatDateLabel(draft.endDate, t, dateLocale) : ''}
            onPress={() => endCalendarRef.current?.present()}
          />
        </View>
        {draft.endDate ? (
          <Button variant="link" className="self-end px-0 py-2" onPress={() => updateDraft('endDate', '')}>
            {t('mealPlans.clearEndDate', { defaultValue: 'Clear end date' })}
          </Button>
        ) : null}
        {errors.endDate ? (
          <Text className="text-sm text-icon-danger mt-1">
            {t('mealPlans.endBeforeStart', { defaultValue: 'End date cannot be before the start date.' })}
          </Text>
        ) : null}

        <View className="bg-surface rounded-xl px-4 py-4 mt-4 flex-row items-center justify-between">
          <View className="flex-1 mr-4">
            <Text className="text-base font-semibold text-text-primary">
              {t('mealPlans.activePlan', { defaultValue: 'Active plan' })}
            </Text>
            <Text className="text-sm text-text-secondary mt-1">
              {t('mealPlans.activePlanHint', { defaultValue: 'Active plans populate matching future diary days.' })}
            </Text>
          </View>
          <Switch
            accessibilityLabel={t('mealPlans.activePlan', { defaultValue: 'Active plan' })}
            value={draft.isActive}
            onValueChange={(value) => updateDraft('isActive', value)}
          />
        </View>

        <View className="flex-row items-center justify-between mt-6 mb-3">
          <View className="flex-1 mr-3">
            <Text className="text-lg font-semibold text-text-primary">
              {t('mealPlans.assignments', { defaultValue: 'Weekly assignments' })}
            </Text>
            <Text className="text-sm text-text-secondary mt-1">
              {t('mealPlans.assignmentsHint', { defaultValue: 'Choose what amount of a reusable meal should appear on each day.' })}
            </Text>
          </View>
          <Button
            variant="secondary"
            disabled={isMealsLoading || isMealTypesLoading}
            onPress={addMeal}
            className="px-3 py-2.5"
            textClassName="text-sm"
          >
            {t('mealPlans.addMeal', { defaultValue: 'Add meal' })}
          </Button>
        </View>

        {draft.assignments.map(renderMealAssignment)}
        {errors.assignments ? (
          <Text className="text-sm text-icon-danger mb-3">
            {t('mealPlans.assignmentRequired', { defaultValue: 'Add at least one complete meal assignment.' })}
          </Text>
        ) : null}

        <View className="bg-raised rounded-xl px-4 py-3 mt-1">
          <Text className="text-sm text-text-secondary">
            {t('mealPlans.familyNotice', { defaultValue: 'You can schedule your own meals plus family or public meals already visible in your meal library. The plan stays private to this account and does not change meal sharing.' })}
          </Text>
        </View>
      </KeyboardAwareScrollView>

      {!usesNativeHeader ? (
        <FooterSaveBar onPress={() => void save()} busy={isSaving} disabled={isSaving} />
      ) : null}

      <CalendarSheet
        ref={startCalendarRef}
        selectedDate={draft.startDate}
        onSelectDate={(date) => updateDraft('startDate', date)}
      />
      <CalendarSheet
        ref={endCalendarRef}
        selectedDate={draft.endDate || draft.startDate}
        onSelectDate={(date) => updateDraft('endDate', date)}
      />
    </View>
  );
};

export default MealPlanFormScreen;
