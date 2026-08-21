import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, TouchableOpacity, Platform, Text } from 'react-native';
import Toast from 'react-native-toast-message';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import { StackActions } from '@react-navigation/native';
import Icon from '../../components/Icon';
import StepperInput from '../../components/StepperInput';
import FoodForm, { type FoodFormData } from '../../components/FoodForm';
import FoodImagePicker from '../../components/FoodImagePicker';
import {
  splitPickerImages,
  type PickerImage,
} from '../../utils/pickerImages';
import BottomSheetPicker from '../../components/BottomSheetPicker';
import CalendarSheet, { type CalendarSheetRef } from '../../components/CalendarSheet';
import Switch from '../../components/ui/Switch';
import { setPendingMealIngredientSelection } from '../../services/mealBuilderSelection';
import { useMealTypes, usePreferences } from '../../hooks';
import { useSaveFood } from '../../hooks/useSaveFood';
import { useAddFoodEntry } from '../../hooks/useAddFoodEntry';
import { getLocalizedMealLabel } from '../../constants/meals';
import { getTodayDate, normalizeDate, formatDateLabel } from '../../utils/dateUtils';
import { parseOptional } from '../../types/foodInfo';
import { createFoodVariant } from '../../services/api/foodsApi';
import type { FoodFormScreenProps } from '../FoodFormScreen';
import type {
  EquivalentUnit,
  FoodUnitSelectionResult,
} from '../../types/foodUnitVariants';
import {
  formatServingSizeDisplay,
  formatServingUnit,
} from '../../utils/foodDetails';
import { buildMealIngredientDraftFromSavedFood } from '../../utils/mealBuilderDraft';
import { DECIMAL_INPUT_REGEX, parseDecimalInput } from '../../utils/numericInput';
import { useNativeIOSHeadersActive } from '../../services/nativeTabBarPreference';
import { useScreenHeader } from '../../hooks/useScreenHeader';
import { BarcodeField, BARCODE_REGEX } from './BarcodeField';
import {
  buildVariantFromFormData,
  buildVariantFromInitialValues,
  confirmDiscardEquivalents,
  equivalentsDiffer,
  isBlankEquivalent,
} from './persistence';

type CreateFoodParams = Extract<FoodFormScreenProps['route']['params'], { mode: 'create-food' }>;

const CREATE_FORM_SOURCE_VARIANT_ID = '__create-form-source-variant__';

export function CreateFoodMode({ params, navigation, routeKey }: { params: CreateFoodParams; navigation: FoodFormScreenProps['navigation']; routeKey: string }) {
  const { t , i18n: translationI18n } = useTranslation();
  const dateLocale = translationI18n.language.startsWith('pl') ? 'pl-PL' : 'en-US';
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const [textPrimary, textSecondary] = useCSSVariable(['--color-text-primary', '--color-text-secondary']) as [string, string];
  const pickerMode = params.pickerMode ?? 'log-entry';
  const returnDepth = params.returnDepth ?? 1;
  const isMealBuilderMode = pickerMode === 'meal-builder';
  const isLibraryMode = pickerMode === 'library';
  const isLogEntryMode = !isMealBuilderMode && !isLibraryMode;
  const showBarcodeField = !isMealBuilderMode;
  const initialFood = params.initialFood;
  const hasImportedInitialFood = !!initialFood;
  const showAutoScaleNutrition = isMealBuilderMode || hasImportedInitialFood;
  const { preferences } = usePreferences({ enabled: showAutoScaleNutrition });
  const initialAutoScaleNutritionEnabled =
    preferences?.auto_scale_online_imports ?? false;

  const providerType = params.providerType;
  const [barcodeInput, setBarcodeInput] = useState(params.barcode ?? '');
  const { pendingScannedBarcode, scannedBarcodeNonce } = params;

  useEffect(() => {
    if (scannedBarcodeNonce == null || pendingScannedBarcode == null) return;
    // Consume a one-shot navigation param: guarded by the nonce and paired with
    // clearing the param via setParams, so it can't move to a render-time derive.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBarcodeInput(pendingScannedBarcode);
    navigation.setParams({
      pendingScannedBarcode: undefined,
      scannedBarcodeNonce: undefined,
    });
  }, [scannedBarcodeNonce, pendingScannedBarcode, navigation]);
  const importedSourceVariant = useMemo(
    () => buildVariantFromInitialValues(initialFood, CREATE_FORM_SOURCE_VARIANT_ID),
    [initialFood],
  );
  const [pendingUnitSelection, setPendingUnitSelection] =
    useState<FoodUnitSelectionResult | null>(() =>
      importedSourceVariant
        ? {
            kind: 'existing',
            variant: importedSourceVariant,
          }
        : null,
    );

  const [equivalentDraft, setEquivalentDraft] = useState<EquivalentUnit[]>([]);
  // Baseline is always empty for a new food — use a stable ref so it doesn't
  // need to be listed as a useEffect dependency.
  const equivalentBaselineRef = useRef<EquivalentUnit[]>([]);
  const isSavingRef = useRef(false);
  // FoodForm assigns its submit handler here; the native header Save invokes it
  // (the body submit button is hidden on the native path).
  const submitRequestRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e) => {
      if (isSavingRef.current) return;
      if (!equivalentsDiffer(equivalentDraft, equivalentBaselineRef.current)) return;
      e.preventDefault();
      void confirmDiscardEquivalents().then((ok) => {
        if (ok) navigation.dispatch(e.data.action);
      });
    });
    return unsub;
  }, [navigation, equivalentDraft]);

  const [selectedDate, setSelectedDate] = useState(params.date ?? getTodayDate());
  const calendarRef = useRef<CalendarSheetRef>(null);
  const { mealTypes, defaultMealTypeId } = useMealTypes();
  const [selectedMealId, setSelectedMealId] = useState<string | undefined>();
  const effectiveMealId = selectedMealId ?? defaultMealTypeId;
  const selectedMealType = mealTypes.find((mt) => mt.id === effectiveMealId);
  const mealTypeLabel = (mealType: (typeof mealTypes)[number]) =>
    mealType.user_id == null
      ? getLocalizedMealLabel(t, mealType.name.toLowerCase() === 'snack' ? 'snacks' : mealType.name.toLowerCase())
      : mealType.name;

  const [saveToDatabase, setSaveToDatabase] = useState(true);
  const initialServingSize = parseDecimalInput(initialFood?.servingSize ?? '') || 100;
  const [formServingSize, setFormServingSize] = useState(initialServingSize);
  const [formServingUnit, setFormServingUnit] = useState(initialFood?.servingUnit ?? 'g');
  const [quantityText, setQuantityText] = useState(String(initialServingSize));
  const [quantityTouched, setQuantityTouched] = useState(false);
  const quantity = parseDecimalInput(quantityText) || 0;
  const servings = formServingSize > 0 ? quantity / formServingSize : 0;

  const handleServingChange = (sizeStr: string, unit: string) => {
    const size = parseDecimalInput(sizeStr) || 0;
    setFormServingSize(size);
    setFormServingUnit(unit);
    if (size > 0 && !quantityTouched) setQuantityText(String(size));
  };

  const handleImportedUnitSelectionChange = useCallback(
    async (selection: FoodUnitSelectionResult): Promise<FoodUnitSelectionResult> => {
      setPendingUnitSelection(selection);
      return selection;
    },
    [],
  );

  const updateQuantityText = (text: string) => {
    if (DECIMAL_INPUT_REGEX.test(text)) {
      setQuantityText(text);
      setQuantityTouched(true);
    }
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
      if (delta > 0) {
        setQuantityText(String(minQuantity));
        setQuantityTouched(true);
      }
      return;
    }
    const boundary =
      delta > 0
        ? Math.ceil(quantity / increment) * increment
        : Math.floor(quantity / increment) * increment;
    const next = boundary !== quantity ? boundary : quantity + delta * increment;
    setQuantityText(String(Math.max(minQuantity, next)));
    setQuantityTouched(true);
  };

  const mealPickerOptions = mealTypes.map((mt) => ({ label: mealTypeLabel(mt), value: mt.id }));

  const [customNutrientValues, setCustomNutrientValues] = useState<Record<string, number>>({});

  const [pickerImages, setPickerImages] = useState<PickerImage[]>([]);
  const imageArgs =
    pickerImages.length > 0 ? splitPickerImages(pickerImages) : undefined;

  const { saveFoodAsync, isPending: isSavePending } = useSaveFood();
  // Holds the equivalent-save function for the current submit so onSuccess can
  // fire it after the food+entry are both confirmed, without a separate pre-save.
  const pendingEquivalentSaveRef = useRef<((foodId: string) => void) | null>(null);
  const { addEntry, isPending: isAddPending, invalidateCache } = useAddFoodEntry({
    onSuccess: (entry) => {
      isSavingRef.current = true;
      if (entry.food_id && pendingEquivalentSaveRef.current) {
        pendingEquivalentSaveRef.current(entry.food_id);
        pendingEquivalentSaveRef.current = null;
      }
      invalidateCache(normalizeDate(entry.entry_date));
      navigation.dispatch(StackActions.popToTop());
    },
  });

  const isSubmitting = isAddPending || isSavePending;

  const handleSubmit = async (data: FoodFormData) => {
    if (!data.name.trim()) {
      Toast.show({ type: 'error', text1: t('createFood.errors.missingName', { defaultValue: 'Missing name' }), text2: t('createFood.errors.nameRequired', { defaultValue: 'Please enter a food name.' }) });
      return;
    }
    if (!parseDecimalInput(data.servingSize)) {
      Toast.show({ type: 'error', text1: t('createFood.errors.invalidServingSize', { defaultValue: 'Invalid serving size' }), text2: t('createFood.errors.servingSizeRequired', { defaultValue: 'Serving size must be greater than zero.' }) });
      return;
    }
    const trimmedBarcode = barcodeInput.trim();
    if (showBarcodeField && trimmedBarcode !== '' && !BARCODE_REGEX.test(trimmedBarcode)) {
      Toast.show({ type: 'error', text1: t('createFood.errors.invalidBarcode', { defaultValue: 'Invalid barcode' }), text2: t('createFood.errors.barcodeRequired', { defaultValue: 'Barcode must be 8-14 digits.' }) });
      return;
    }
    const resolvedBarcode = showBarcodeField
      ? trimmedBarcode || null
      : params.barcode ?? null;
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
      barcode: resolvedBarcode,
      provider_type: providerType ?? null,
      custom_nutrients: Object.keys(customNutrientValues).length > 0 ? customNutrientValues : undefined,
    };

    const cleanEquivalents = equivalentDraft.filter((eq) => !isBlankEquivalent(eq));

    // Schedules equivalent-variant creation after the food is saved. Fires
    // and forgets — navigation has already occurred. Any failures are shown
    // via toast; missing equivalents can be added later via the food detail
    // edit screen (same recovery path as EditFoodMode).
    const saveEquivalentsAsync = (foodId: string) => {
      if (cleanEquivalents.length === 0) return;
      const groupNutrition = buildVariantFromFormData(data);
      void Promise.all(
        cleanEquivalents.map((eq) =>
          createFoodVariant({
            food_id: foodId,
            serving_size: eq.serving_size,
            serving_unit: eq.serving_unit,
            calories: groupNutrition.calories,
            protein: groupNutrition.protein,
            carbs: groupNutrition.carbs,
            fat: groupNutrition.fat,
            dietary_fiber: groupNutrition.dietary_fiber,
            saturated_fat: groupNutrition.saturated_fat,
            sodium: groupNutrition.sodium,
            sugars: groupNutrition.sugars,
            trans_fat: groupNutrition.trans_fat,
            potassium: groupNutrition.potassium,
            calcium: groupNutrition.calcium,
            iron: groupNutrition.iron,
            cholesterol: groupNutrition.cholesterol,
            vitamin_a: groupNutrition.vitamin_a,
            vitamin_c: groupNutrition.vitamin_c,
          }),
        ),
      ).catch(() => {
        Toast.show({ type: 'error', text1: t('createFood.errors.equivalentsSaveFailed', { defaultValue: 'Some equivalent units could not be saved' }) });
      });
    };

    if (isMealBuilderMode) {
      try {
        const savedFood = await saveFoodAsync(saveFoodPayload, imageArgs);
        isSavingRef.current = true;
        saveEquivalentsAsync(savedFood.id);
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
        const savedFood = await saveFoodAsync(saveFoodPayload, imageArgs);
        isSavingRef.current = true;
        saveEquivalentsAsync(savedFood.id);
        Toast.show({ type: 'success', text1: t('createFood.success.foodSaved', { defaultValue: 'Food saved' }) });
        navigation.dispatch(StackActions.pop(returnDepth));
      } catch {
        // Error toast is handled in the save hook.
      }
      return;
    }

    if (!quantity) {
      Toast.show({ type: 'error', text1: t('createFood.errors.invalidAmount', { defaultValue: 'Invalid amount' }), text2: t('createFood.errors.amountRequired', { defaultValue: 'Amount must be greater than zero.' }) });
      return;
    }
    if (!effectiveMealId) {
      Toast.show({ type: 'error', text1: t('createFood.errors.noMealType', { defaultValue: 'No meal type' }), text2: t('createFood.errors.noMealTypesAvailable', { defaultValue: 'No meal types are available. Please check your account settings.' }) });
      return;
    }

    // Always overwrite the ref so a stale callback from a previous failed
    // attempt can never fire on this retry with the wrong equivalents.
    pendingEquivalentSaveRef.current = cleanEquivalents.length > 0 ? saveEquivalentsAsync : null;
    // isSavingRef is set in onSuccess so it stays false if addEntry fails.
    addEntry({
      saveFoodPayload,
      saveFoodImages: imageArgs,
      createEntryPayload: {
        meal_type_id: effectiveMealId,
        quantity,
        unit: data.servingUnit || 'serving',
        entry_date: selectedDate,
      },
    });
  };

  // Library mode saves a food record (a form Save); the diary/meal-builder
  // modes commit the food to the diary, so keep the "Add Food" verb there.
  const primaryLabel = isLibraryMode ? t('common.save', { defaultValue: 'Save' }) : t('createFood.actions.addFood', { defaultValue: 'Add Food' });

  const header = useScreenHeader({
    title: t('createFood.title', { defaultValue: 'New Food' }),
    left: {
      kind: 'dismiss',
      onPress: () => navigation.goBack(),
      disabled: isSubmitting,
      identifier: 'food-create-cancel',
    },
    right: {
      kind: 'primary',
      label: primaryLabel,
      busyLabel: t('common.saving', { defaultValue: 'Saving…' }),
      busy: isSubmitting,
      disabled: isSubmitting,
      placement: 'native-only',
      onPress: () => submitRequestRef.current?.(),
      identifier: 'food-create-save',
    },
  });

  return (
    <View className="flex-1 bg-background" style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}>
      {header}

      <FoodForm
        onSubmit={(data) => {
          void handleSubmit(data);
        }}
        onServingChange={handleServingChange}
        submitRequestRef={submitRequestRef}
        isSubmitting={isSubmitting}
        initialValues={initialFood}
        submitLabel={primaryLabel}
        hideSubmitButton={usesNativeHeader}
        headerChildren={
          <View className="mb-4">
            <FoodImagePicker
              items={pickerImages}
              onItemsChange={setPickerImages}
              disabled={isSubmitting}
            />
          </View>
        }
        showAutoScaleNutrition={showAutoScaleNutrition}
        initialAutoScaleNutritionEnabled={initialAutoScaleNutritionEnabled}
        unitSelector={
          importedSourceVariant
            ? {
                variants: [importedSourceVariant],
                selectedSelection: pendingUnitSelection,
                onUnitSelectionChange: handleImportedUnitSelectionChange,
              }
            : undefined
        }
        equivalents={{ items: equivalentDraft, onChange: setEquivalentDraft }}
        onCustomNutrientsChange={setCustomNutrientValues}
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
              <Text className="text-text-secondary text-base mr-3">{t('common.date', { defaultValue: 'Date' })}</Text>
              <Text className="text-text-primary text-base font-medium mx-1.5">
                {formatDateLabel(selectedDate, t, dateLocale)}
              </Text>
              <Icon name="chevron-down" size={12} color={textPrimary} weight="medium" />
            </TouchableOpacity>

            {/* Meal */}
            {selectedMealType ? (
              <View className="flex-1 flex-row items-center">
                <Text className="text-text-secondary text-base mx-3">{t('createFood.meal', { defaultValue: 'Meal' })}</Text>
                <BottomSheetPicker
                  value={effectiveMealId!}
                  options={mealPickerOptions}
                  onSelect={setSelectedMealId}
                  title={t('createFood.selectMeal', { defaultValue: 'Select Meal' })}
                  renderTrigger={({ onPress }) => (
                    <TouchableOpacity
                      onPress={onPress}
                      activeOpacity={0.7}
                      className="flex-row items-center"
                    >
                      <Text className="text-text-primary text-base font-medium mx-1.5">
                        {mealTypeLabel(selectedMealType)}
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
              {t('foodEntryAdd.labels.mealMakes', { defaultValue: 'meal makes {{count}} servings', defaultValue_one: 'meal makes {{count}} serving', defaultValue_other: 'meal makes {{count}} servings', count: servings, formattedCount: servings % 1 === 0 ? servings : servings.toFixed(1) })}
              {' \u00b7 '}{formatServingSizeDisplay(formServingSize)} {formatServingUnit(formServingUnit)} {t('foodEntryAdd.labels.perServing', { defaultValue: 'per serving' })}
            </Text>
          </View>
          {/* Save to Database */}
          <View className="flex-row items-center justify-between">
            <Text className="text-text-secondary text-base">{t('createFood.saveToDatabase', { defaultValue: 'Save to Database' })}</Text>
            <Switch
              accessibilityLabel={t('createFood.saveToDatabase', { defaultValue: 'Save to Database' })}
              value={saveToDatabase}
              onValueChange={setSaveToDatabase}
            />
          </View>
        </View>
        ) : null}
        {showBarcodeField ? (
          <BarcodeField
            value={barcodeInput}
            onChange={setBarcodeInput}
            onScan={() =>
              navigation.navigate('FoodScan', {
                mode: 'capture-barcode',
                returnKey: routeKey,
              })
            }
            textSecondary={textSecondary}
          />
        ) : null}
      </FoodForm>

      {isLogEntryMode ? (
        <CalendarSheet ref={calendarRef} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
      ) : null}
    </View>
  );
}
