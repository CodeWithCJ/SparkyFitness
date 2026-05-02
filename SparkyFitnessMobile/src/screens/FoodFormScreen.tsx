import React, { useState, useRef } from 'react';
import { View, TouchableOpacity, Platform, Text, Switch } from 'react-native';
import Toast from 'react-native-toast-message';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import { CommonActions, StackActions } from '@react-navigation/native';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import Icon from '../components/Icon';
import StepperInput from '../components/StepperInput';
import FoodForm, { type FoodFormData } from '../components/FoodForm';
import BottomSheetPicker from '../components/BottomSheetPicker';
import CalendarSheet, { type CalendarSheetRef } from '../components/CalendarSheet';
import { setPendingMealIngredientSelection } from '../services/mealBuilderSelection';
import { useMealTypes } from '../hooks';
import { useSaveFood } from '../hooks/useSaveFood';
import { useAddFoodEntry } from '../hooks/useAddFoodEntry';
import { getMealTypeLabel } from '../constants/meals';
import { getTodayDate, normalizeDate, formatDateLabel } from '../utils/dateUtils';
import { parseOptional } from '../types/foodInfo';
import { updateFoodVariant, updateFood } from '../services/api/foodsApi';
import { foodVariantsQueryKey, foodsQueryKey } from '../hooks/queryKeys';
import type { RootStackScreenProps } from '../types/navigation';
import type { FoodInfoItem } from '../types/foodInfo';
import type { FoodVariantDetail } from '../types/foods';
import { buildMealIngredientDraftFromSavedFood } from '../utils/mealBuilderDraft';
import { DECIMAL_INPUT_REGEX, parseDecimalInput } from '../utils/numericInput';

type FoodFormScreenProps = RootStackScreenProps<'FoodForm'>;

type CreateFoodParams = Extract<FoodFormScreenProps['route']['params'], { mode: 'create-food' }>;
type AdjustNutritionParams = Extract<FoodFormScreenProps['route']['params'], { mode: 'adjust-entry-nutrition' }>;
type EditFoodParams = Extract<FoodFormScreenProps['route']['params'], { mode: 'edit-food' }>;

const FOOD_VARIANT_FIELDS: (keyof FoodFormData)[] = [
  'servingSize',
  'servingUnit',
  'calories',
  'protein',
  'carbs',
  'fat',
  'fiber',
  'saturatedFat',
  'transFat',
  'sodium',
  'sugars',
  'potassium',
  'cholesterol',
  'calcium',
  'iron',
  'vitaminA',
  'vitaminC',
];

const FOOD_METADATA_FIELDS: (keyof FoodFormData)[] = ['name', 'brand'];

function validateFoodForm(data: FoodFormData): boolean {
  if (!data.name.trim()) {
    Toast.show({ type: 'error', text1: 'Missing name', text2: 'Please enter a food name.' });
    return false;
  }

  if (!parseDecimalInput(data.servingSize)) {
    Toast.show({ type: 'error', text1: 'Invalid serving size', text2: 'Serving size must be greater than zero.' });
    return false;
  }

  return true;
}

function hasFoodFormChanges(
  initialValues: Partial<FoodFormData>,
  data: FoodFormData,
  fields: (keyof FoodFormData)[],
): boolean {
  return fields.some((field) => (initialValues[field] ?? '') !== data[field]);
}

function invalidateFoodCaches(queryClient: QueryClient, foodId: string) {
  void queryClient.invalidateQueries({ queryKey: foodVariantsQueryKey(foodId), refetchType: 'all' });
  void queryClient.invalidateQueries({ queryKey: foodsQueryKey, refetchType: 'all' });
  void queryClient.invalidateQueries({ queryKey: ['foodsLibrary'], refetchType: 'all' });
  void queryClient.invalidateQueries({ queryKey: ['foodSearch'], refetchType: 'all' });
}

function updateFoodVariantCache(queryClient: QueryClient, updatedVariant: FoodVariantDetail) {
  queryClient.setQueryData<FoodVariantDetail[] | undefined>(
    foodVariantsQueryKey(updatedVariant.food_id),
    (current) => {
      if (!current) return current;
      return current.map((variant) => (
        variant.id === updatedVariant.id ? updatedVariant : variant
      ));
    },
  );
}

function buildUpdatedFoodInfo(item: FoodInfoItem, data: FoodFormData, variantId: string): FoodInfoItem {
  return {
    ...item,
    name: data.name,
    brand: data.brand || null,
    servingSize: parseDecimalInput(data.servingSize) || item.servingSize,
    servingUnit: data.servingUnit || item.servingUnit,
    calories: parseDecimalInput(data.calories) || 0,
    protein: parseDecimalInput(data.protein) || 0,
    carbs: parseDecimalInput(data.carbs) || 0,
    fat: parseDecimalInput(data.fat) || 0,
    fiber: parseOptional(data.fiber),
    saturatedFat: parseOptional(data.saturatedFat),
    sodium: parseOptional(data.sodium),
    sugars: parseOptional(data.sugars),
    transFat: parseOptional(data.transFat),
    potassium: parseOptional(data.potassium),
    calcium: parseOptional(data.calcium),
    iron: parseOptional(data.iron),
    cholesterol: parseOptional(data.cholesterol),
    vitaminA: parseOptional(data.vitaminA),
    vitaminC: parseOptional(data.vitaminC),
    variantId,
  };
}

async function persistFoodEdits({
  queryClient,
  foodId,
  variantId,
  customNutrients,
  data,
  initialValues,
}: {
  queryClient: QueryClient;
  foodId: string;
  variantId: string;
  customNutrients?: Record<string, string | number> | null;
  data: FoodFormData;
  initialValues: Partial<FoodFormData>;
}): Promise<boolean> {
  const shouldUpdateVariant = hasFoodFormChanges(initialValues, data, FOOD_VARIANT_FIELDS);
  const shouldUpdateFood = hasFoodFormChanges(initialValues, data, FOOD_METADATA_FIELDS);

  if (!shouldUpdateVariant && !shouldUpdateFood) {
    return false;
  }

  const updates: Promise<unknown>[] = [];

  if (shouldUpdateVariant) {
    updates.push(
      updateFoodVariant(variantId, {
        food_id: foodId,
        serving_size: parseDecimalInput(data.servingSize) || 0,
        serving_unit: data.servingUnit || 'serving',
        calories: parseDecimalInput(data.calories) || 0,
        protein: parseDecimalInput(data.protein) || 0,
        carbs: parseDecimalInput(data.carbs) || 0,
        fat: parseDecimalInput(data.fat) || 0,
        dietary_fiber: parseOptional(data.fiber),
        saturated_fat: parseOptional(data.saturatedFat),
        sodium: parseOptional(data.sodium),
        sugars: parseOptional(data.sugars),
        trans_fat: parseOptional(data.transFat),
        potassium: parseOptional(data.potassium),
        calcium: parseOptional(data.calcium),
        iron: parseOptional(data.iron),
        cholesterol: parseOptional(data.cholesterol),
        vitamin_a: parseOptional(data.vitaminA),
        vitamin_c: parseOptional(data.vitaminC),
        custom_nutrients: customNutrients || undefined,
      }).then((updatedVariant) => {
        updateFoodVariantCache(queryClient, updatedVariant);
        return updatedVariant;
      }),
    );
  }

  if (shouldUpdateFood) {
    const foodPayload: { name?: string; brand?: string } = {};
    if (data.name !== initialValues.name) foodPayload.name = data.name;
    if (data.brand !== initialValues.brand) foodPayload.brand = data.brand || '';
    updates.push(updateFood(foodId, foodPayload));
  }

  await Promise.all(updates);
  invalidateFoodCaches(queryClient, foodId);
  return true;
}

function CreateFoodMode({ params, navigation }: { params: CreateFoodParams; navigation: FoodFormScreenProps['navigation'] }) {
  const insets = useSafeAreaInsets();
  const [accentColor, textPrimary, formEnabled, formDisabled] = useCSSVariable(['--color-accent-primary', '--color-text-primary', '--color-form-enabled', '--color-form-disabled']) as [string, string, string, string];
  const pickerMode = params.pickerMode ?? 'log-entry';
  const returnDepth = params.returnDepth ?? 1;
  const isMealBuilderMode = pickerMode === 'meal-builder';
  const isLibraryMode = pickerMode === 'library';
  const isLogEntryMode = !isMealBuilderMode && !isLibraryMode;

  const initialFood = params.initialFood;
  const barcode = params.barcode;
  const providerType = params.providerType;

  const [selectedDate, setSelectedDate] = useState(params.date ?? getTodayDate());
  const calendarRef = useRef<CalendarSheetRef>(null);
  const { mealTypes, defaultMealTypeId } = useMealTypes();
  const [selectedMealId, setSelectedMealId] = useState<string | undefined>();
  const effectiveMealId = selectedMealId ?? defaultMealTypeId;
  const selectedMealType = mealTypes.find((mt) => mt.id === effectiveMealId);

  const [saveToDatabase, setSaveToDatabase] = useState(true);
  const initialServingSize = parseDecimalInput(initialFood?.servingSize ?? '') || 100;
  const [formServingSize, setFormServingSize] = useState(initialServingSize);
  const [formServingUnit, setFormServingUnit] = useState(initialFood?.servingUnit ?? 'g');
  const [quantityText, setQuantityText] = useState(String(initialServingSize));
  const quantity = parseDecimalInput(quantityText) || 0;
  const servings = formServingSize > 0 ? quantity / formServingSize : 0;

  const handleServingChange = (sizeStr: string, unit: string) => {
    const size = parseDecimalInput(sizeStr) || 0;
    setFormServingSize(size);
    setFormServingUnit(unit);
    if (size > 0) setQuantityText(String(size));
  };

  const updateQuantityText = (text: string) => {
    if (DECIMAL_INPUT_REGEX.test(text)) setQuantityText(text);
  };

  const clampQuantity = () => {
    const step = formServingSize > 0 ? formServingSize : 1;
    const fallbackQuantity = step * 0.5;
    if (quantity <= 0) {
      setQuantityText(String(fallbackQuantity));
    }
  };

  const adjustQuantity = (delta: number) => {
    const step = formServingSize > 0 ? formServingSize : 1;
    const increment = step * 0.5;
    const minQuantity = increment;
    if (quantity < minQuantity) {
      if (delta > 0) setQuantityText(String(minQuantity));
      return;
    }
    const boundary =
      delta > 0
        ? Math.ceil(quantity / increment) * increment
        : Math.floor(quantity / increment) * increment;
    const next = boundary !== quantity ? boundary : quantity + delta * increment;
    setQuantityText(String(Math.max(minQuantity, next)));
  };

  const mealPickerOptions = mealTypes.map((mt) => ({ label: getMealTypeLabel(mt.name), value: mt.id }));

  const { saveFoodAsync, isPending: isSavePending } = useSaveFood();
  const { addEntry, isPending: isAddPending, invalidateCache } = useAddFoodEntry({
    onSuccess: (entry) => {
      invalidateCache(normalizeDate(entry.entry_date));
      navigation.dispatch(StackActions.popToTop());
    },
  });

  const isSubmitting = isAddPending || isSavePending;

  const handleSubmit = async (data: FoodFormData) => {
    if (!data.name.trim()) {
      Toast.show({ type: 'error', text1: 'Missing name', text2: 'Please enter a food name.' });
      return;
    }
    if (!parseDecimalInput(data.servingSize)) {
      Toast.show({ type: 'error', text1: 'Invalid serving size', text2: 'Serving size must be greater than zero.' });
      return;
    }
    const saveFoodPayload = {
      name: data.name,
      brand: data.brand || null,
      serving_size: parseDecimalInput(data.servingSize) || 0,
      serving_unit: data.servingUnit || 'serving',
      calories: parseDecimalInput(data.calories) || 0,
      protein: parseDecimalInput(data.protein) || 0,
      carbs: parseDecimalInput(data.carbs) || 0,
      fat: parseDecimalInput(data.fat) || 0,
      dietary_fiber: parseOptional(data.fiber),
      saturated_fat: parseOptional(data.saturatedFat),
      sodium: parseOptional(data.sodium),
      sugars: parseOptional(data.sugars),
      trans_fat: parseOptional(data.transFat),
      potassium: parseOptional(data.potassium),
      calcium: parseOptional(data.calcium),
      iron: parseOptional(data.iron),
      cholesterol: parseOptional(data.cholesterol),
      vitamin_a: parseOptional(data.vitaminA),
      vitamin_c: parseOptional(data.vitaminC),
      is_custom: true,
      is_quick_food: isLogEntryMode ? !saveToDatabase : false,
      is_default: true,
      barcode: barcode ?? null,
      provider_type: providerType ?? null,
    };

    if (isMealBuilderMode) {
      try {
        const savedFood = await saveFoodAsync(saveFoodPayload);
        setPendingMealIngredientSelection({
          ingredient: buildMealIngredientDraftFromSavedFood(
            savedFood,
            parseDecimalInput(data.servingSize) || 0,
            data.servingUnit || 'serving',
          ),
        });
        navigation.dispatch(StackActions.pop(returnDepth));
      } catch {
        // Error toast is handled in the save hook.
      }
      return;
    }

    if (isLibraryMode) {
      try {
        await saveFoodAsync(saveFoodPayload);
        Toast.show({ type: 'success', text1: 'Food saved' });
        navigation.dispatch(StackActions.pop(returnDepth));
      } catch {
        // Error toast is handled in the save hook.
      }
      return;
    }

    if (!quantity) {
      Toast.show({ type: 'error', text1: 'Invalid amount', text2: 'Amount must be greater than zero.' });
      return;
    }
    if (!effectiveMealId) {
      Toast.show({ type: 'error', text1: 'No meal type', text2: 'No meal types are available. Please check your account settings.' });
      return;
    }

    addEntry({
      saveFoodPayload,
      createEntryPayload: {
        meal_type_id: effectiveMealId,
        quantity,
        unit: data.servingUnit || 'serving',
        entry_date: selectedDate,
      },
    });
  };

  return (
    <View className="flex-1 bg-background" style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-border-subtle">
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="z-10"
        >
          <Icon name="chevron-back" size={22} color={accentColor} />
        </TouchableOpacity>
        <Text className="absolute left-0 right-0 text-center text-text-primary text-lg font-semibold">
          New Food
        </Text>
      </View>

      <FoodForm
        onSubmit={(data) => {
          void handleSubmit(data);
        }}
        onServingChange={handleServingChange}
        isSubmitting={isSubmitting}
        initialValues={initialFood}
        submitLabel={isLibraryMode ? 'Save Food' : undefined}
      >
        {isLogEntryMode ? (
          <View className="gap-4 bg-surface rounded-xl p-4 shadow-sm">

          <View className="flex-row items-start">
            {/* Date */}
            <TouchableOpacity
              onPress={() => calendarRef.current?.present()}
              activeOpacity={0.7}
              className="flex-1 flex-row items-center"
            >
              <Text className="text-text-secondary text-base mr-3">Date</Text>
              <Text className="text-text-primary text-base font-medium mx-1.5">
                {formatDateLabel(selectedDate)}
              </Text>
              <Icon name="chevron-down" size={12} color={textPrimary} weight="medium" />
            </TouchableOpacity>

            {/* Meal */}
            {selectedMealType ? (
              <View className="flex-1 flex-row items-center">
                <Text className="text-text-secondary text-base mx-3">Meal</Text>
                <BottomSheetPicker
                  value={effectiveMealId!}
                  options={mealPickerOptions}
                  onSelect={setSelectedMealId}
                  title="Select Meal"
                  renderTrigger={({ onPress }) => (
                    <TouchableOpacity
                      onPress={onPress}
                      activeOpacity={0.7}
                      className="flex-row items-center"
                    >
                      <Text className="text-text-primary text-base font-medium mx-1.5">
                        {getMealTypeLabel(selectedMealType.name)}
                      </Text>
                      <Icon name="chevron-down" size={12} color={textPrimary} weight="medium" />
                    </TouchableOpacity>
                  )}
                />
              </View>
            ) : null}
          </View>
          {/* Amount */}
          <View>
            <View className="flex-row items-center">
              <StepperInput
                value={quantityText}
                onChangeText={updateQuantityText}
                onBlur={clampQuantity}
                onDecrement={() => adjustQuantity(-1)}
                onIncrement={() => adjustQuantity(1)}
              />
              <Text className="text-text-primary text-base font-medium ml-2">
                {formServingUnit}
              </Text>
            </View>
            <Text className="text-text-secondary text-sm mt-2">
              {servings % 1 === 0 ? servings : servings.toFixed(1)} {servings === 1 ? 'serving' : 'servings'}
              {' · '}{formServingSize} {formServingUnit} per serving
            </Text>
          </View>
          {/* Save to Database */}
          <View className="flex-row items-center justify-between">
            <Text className="text-text-secondary text-base">Save to Database</Text>
            <Switch
              value={saveToDatabase}
              onValueChange={setSaveToDatabase}
              trackColor={{ false: formDisabled, true: formEnabled }}
              thumbColor="#FFFFFF"
            />
          </View>
          {barcode ? (
            <Text className="text-text-secondary text-base font-medium">Barcode will be saved.</Text>
          ) : null}
        </View>
        ) : null}
      </FoodForm>

      {isLogEntryMode ? (
        <CalendarSheet ref={calendarRef} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
      ) : null}
    </View>
  );
}

function AdjustNutritionMode({ params, navigation }: { params: AdjustNutritionParams; navigation: FoodFormScreenProps['navigation'] }) {
  const { initialValues, returnKey, foodId, variantId, customNutrients } = params;
  const insets = useSafeAreaInsets();
  const [accentColor, formEnabled, formDisabled] = useCSSVariable(['--color-accent-primary', '--color-form-enabled', '--color-form-disabled']) as [string, string, string];
  const queryClient = useQueryClient();

  const canUpdateVariant = !!(foodId && variantId && customNutrients !== undefined);
  const [updateFoodToggle, setUpdateFoodToggle] = useState(false);

  const handleSubmit = (data: FoodFormData) => {
    if (!validateFoodForm(data)) {
      return;
    }

    if (updateFoodToggle && canUpdateVariant) {
      const onError = () => {
        Toast.show({ type: 'error', text1: 'Could not update food' });
      };

      void persistFoodEdits({
        queryClient,
        foodId,
        variantId,
        customNutrients,
        data,
        initialValues,
      }).catch(onError);
    }

    navigation.dispatch({
      ...CommonActions.setParams({ adjustedValues: data }),
      source: returnKey,
    });
    navigation.goBack();
  };

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center px-4 py-3 border-b border-border-subtle">
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="z-10"
        >
          <Icon name="chevron-back" size={22} color={accentColor} />
        </TouchableOpacity>
        <Text className="absolute left-0 right-0 text-center text-text-primary text-lg font-semibold">
          Adjust Nutrition
        </Text>
      </View>

      <FoodForm
        onSubmit={handleSubmit}
        initialValues={initialValues}
        submitLabel="Update Values"
      >
        {canUpdateVariant && (
          <View className="bg-surface rounded-xl p-4 shadow-sm">
            <View className="flex-row items-center justify-between">
              <Text className="text-text-secondary text-base">Save nutrition for future use</Text>
              <Switch
                value={updateFoodToggle}
                onValueChange={setUpdateFoodToggle}
                trackColor={{ false: formDisabled, true: formEnabled }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>
        )}
      </FoodForm>
    </View>
  );
}

function EditFoodMode({ params, navigation }: { params: EditFoodParams; navigation: FoodFormScreenProps['navigation'] }) {
  const { item, initialValues, returnKey, foodId, variantId, customNutrients } = params;
  const insets = useSafeAreaInsets();
  const [accentColor] = useCSSVariable(['--color-accent-primary']) as [string];
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (data: FoodFormData) => {
    if (!validateFoodForm(data)) {
      return;
    }

    setIsSubmitting(true);
    try {
      const didPersist = await persistFoodEdits({
        queryClient,
        foodId,
        variantId,
        customNutrients,
        data,
        initialValues,
      });

      if (didPersist) {
        navigation.dispatch({
          ...CommonActions.setParams({
            updatedItem: buildUpdatedFoodInfo(item, data, variantId),
          }),
          source: returnKey,
        });
      }

      navigation.goBack();
    } catch {
      Toast.show({ type: 'error', text1: 'Could not update food' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center px-4 py-3 border-b border-border-subtle">
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="z-10"
        >
          <Icon name="chevron-back" size={22} color={accentColor} />
        </TouchableOpacity>
        <Text className="absolute left-0 right-0 text-center text-text-primary text-lg font-semibold">
          Edit Food
        </Text>
      </View>

      <FoodForm
        onSubmit={(data) => {
          void handleSubmit(data);
        }}
        initialValues={initialValues}
        submitLabel="Save Changes"
        isSubmitting={isSubmitting}
      />
    </View>
  );
}

const FoodFormScreen: React.FC<FoodFormScreenProps> = ({ route, navigation }) => {
  if (route.params.mode === 'adjust-entry-nutrition') {
    return <AdjustNutritionMode params={route.params} navigation={navigation} />;
  }
  if (route.params.mode === 'edit-food') {
    return <EditFoodMode params={route.params} navigation={navigation} />;
  }
  return <CreateFoodMode params={route.params} navigation={navigation} />;
};

export default FoodFormScreen;
