import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform, Switch } from 'react-native';
import { useCSSVariable } from 'uniwind';
import BottomSheetPicker from './BottomSheetPicker';
import Button from './ui/Button';
import FormInput from './FormInput';
import Icon from './Icon';
import FoodUnitSelectorSheet from './FoodUnitSelectorSheet';
import type {
  FoodUnitSelectionResult,
  FoodUnitVariant,
} from '../types/foodUnitVariants';
import { formatFoodFormNumber } from '../utils/foodDetails';
import { DECIMAL_INPUT_REGEX, parseDecimalInput } from '../utils/numericInput';
import { FOOD_FORM_UNIT_GROUPS } from '../utils/servingSizeConversions';

export interface FoodFormData {
  name: string;
  brand: string;
  servingSize: string;
  servingUnit: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  fiber: string;
  saturatedFat: string;
  transFat: string;
  sodium: string;
  sugars: string;
  potassium: string;
  cholesterol: string;
  calcium: string;
  iron: string;
  vitaminA: string;
  vitaminC: string;
}

export interface FoodFormProps {
  initialValues?: Partial<FoodFormData>;
  onSubmit: (data: FoodFormData) => void;
  onServingChange?: (servingSize: string, servingUnit: string) => void;
  submitLabel?: string;
  isSubmitting?: boolean;
  showAutoScaleNutrition?: boolean;
  initialAutoScaleNutritionEnabled?: boolean;
  unitSelector?: {
    variants: FoodUnitVariant[];
    selectedSelection?: FoodUnitSelectionResult | null;
    onUnitSelectionChange?: (
      selection: FoodUnitSelectionResult,
    ) =>
      | Promise<FoodUnitSelectionResult | void>
      | FoodUnitSelectionResult
      | void;
  };
  children?: React.ReactNode;
}

type NumericFoodFormField =
  | 'servingSize'
  | 'calories'
  | 'protein'
  | 'carbs'
  | 'fat'
  | 'fiber'
  | 'saturatedFat'
  | 'transFat'
  | 'sodium'
  | 'sugars'
  | 'potassium'
  | 'cholesterol'
  | 'calcium'
  | 'iron'
  | 'vitaminA'
  | 'vitaminC';

const NUMERIC_FOOD_FORM_FIELDS: NumericFoodFormField[] = [
  'servingSize',
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

const NUMERIC_FOOD_FORM_FIELD_SET = new Set<keyof FoodFormData>(
  NUMERIC_FOOD_FORM_FIELDS,
);

const SERVING_UNIT_SECTIONS = FOOD_FORM_UNIT_GROUPS.map((group) => ({
  title: group.label,
  options: group.units.map((unit) => ({ label: unit, value: unit })),
}));

const NUTRITION_FIELDS: (keyof FoodFormData)[] = [
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

const EMPTY_FORM: FoodFormData = {
  name: '',
  brand: '',
  servingSize: '',
  servingUnit: '',
  calories: '',
  protein: '',
  carbs: '',
  fat: '',
  fiber: '',
  saturatedFat: '',
  transFat: '',
  sodium: '',
  sugars: '',
  potassium: '',
  cholesterol: '',
  calcium: '',
  iron: '',
  vitaminA: '',
  vitaminC: '',
};

const FORM_DRAFT_UNIT_ID = '__food-form-draft-unit__';

function buildDisplayFormState(
  initialValues?: Partial<FoodFormData>,
): FoodFormData {
  const merged = { ...EMPTY_FORM, ...initialValues };
  const formatInitialNumericValue = (
    rawValue: string | undefined,
    kind: 'servingSize' | 'calories' | 'nutrient',
  ) => {
    const parsedValue = parseDecimalInput(rawValue ?? '');
    return Number.isFinite(parsedValue)
      ? formatFoodFormNumber(parsedValue, kind)
      : '';
  };

  return {
    ...merged,
    servingSize: formatInitialNumericValue(
      initialValues?.servingSize,
      'servingSize',
    ),
    calories: formatInitialNumericValue(initialValues?.calories, 'calories'),
    protein: formatInitialNumericValue(initialValues?.protein, 'nutrient'),
    carbs: formatInitialNumericValue(initialValues?.carbs, 'nutrient'),
    fat: formatInitialNumericValue(initialValues?.fat, 'nutrient'),
    fiber: formatInitialNumericValue(initialValues?.fiber, 'nutrient'),
    saturatedFat: formatInitialNumericValue(
      initialValues?.saturatedFat,
      'nutrient',
    ),
    transFat: formatInitialNumericValue(initialValues?.transFat, 'nutrient'),
    sodium: formatInitialNumericValue(initialValues?.sodium, 'nutrient'),
    sugars: formatInitialNumericValue(initialValues?.sugars, 'nutrient'),
    potassium: formatInitialNumericValue(initialValues?.potassium, 'nutrient'),
    cholesterol: formatInitialNumericValue(
      initialValues?.cholesterol,
      'nutrient',
    ),
    calcium: formatInitialNumericValue(initialValues?.calcium, 'nutrient'),
    iron: formatInitialNumericValue(initialValues?.iron, 'nutrient'),
    vitaminA: formatInitialNumericValue(initialValues?.vitaminA, 'nutrient'),
    vitaminC: formatInitialNumericValue(initialValues?.vitaminC, 'nutrient'),
  };
}

function buildPreciseNumericValues(
  initialValues?: Partial<FoodFormData>,
): Partial<Record<NumericFoodFormField, number>> {
  const preciseValues: Partial<Record<NumericFoodFormField, number>> = {};

  NUMERIC_FOOD_FORM_FIELDS.forEach((field) => {
    const parsed = parseDecimalInput(initialValues?.[field] ?? '');
    if (Number.isFinite(parsed)) {
      preciseValues[field] = parsed;
    }
  });

  return preciseValues;
}

function toPreciseFormString(value: number | undefined): string {
  if (!Number.isFinite(value)) return '';
  if (Object.is(value, -0)) return '0';
  return String(value);
}

function normalizeSelectedUnitSelection(
  selection?: FoodUnitSelectionResult | null,
): FoodUnitSelectionResult | null {
  if (!selection) return null;
  if (selection.kind === 'existing' || selection.variant.id) {
    return selection;
  }

  return {
    ...selection,
    variant: {
      ...selection.variant,
      id: FORM_DRAFT_UNIT_ID,
    },
  };
}

function applyVariantToFormState(
  previous: FoodFormData,
  variant: FoodUnitVariant,
): FoodFormData {
  return {
    ...previous,
    servingSize: formatFoodFormNumber(variant.serving_size, 'servingSize'),
    servingUnit: variant.serving_unit,
    calories: formatFoodFormNumber(variant.calories, 'calories'),
    protein: formatFoodFormNumber(variant.protein, 'nutrient'),
    carbs: formatFoodFormNumber(variant.carbs, 'nutrient'),
    fat: formatFoodFormNumber(variant.fat, 'nutrient'),
    fiber: formatFoodFormNumber(variant.dietary_fiber, 'nutrient'),
    saturatedFat: formatFoodFormNumber(variant.saturated_fat, 'nutrient'),
    transFat: formatFoodFormNumber(variant.trans_fat, 'nutrient'),
    sodium: formatFoodFormNumber(variant.sodium, 'nutrient'),
    sugars: formatFoodFormNumber(variant.sugars, 'nutrient'),
    potassium: formatFoodFormNumber(variant.potassium, 'nutrient'),
    cholesterol: formatFoodFormNumber(variant.cholesterol, 'nutrient'),
    calcium: formatFoodFormNumber(variant.calcium, 'nutrient'),
    iron: formatFoodFormNumber(variant.iron, 'nutrient'),
    vitaminA: formatFoodFormNumber(variant.vitamin_a, 'nutrient'),
    vitaminC: formatFoodFormNumber(variant.vitamin_c, 'nutrient'),
  };
}

function applyVariantUnitToFormState(
  previous: FoodFormData,
  variant: FoodUnitVariant,
): FoodFormData {
  return {
    ...previous,
    servingUnit: variant.serving_unit,
  };
}

function isPositiveNumber(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function formatScaledInput(value: number): string {
  return formatFoodFormNumber(value, 'nutrient') || '0';
}

const FoodForm: React.FC<FoodFormProps> = ({
  initialValues,
  onSubmit,
  onServingChange,
  submitLabel = 'Add Food',
  isSubmitting = false,
  showAutoScaleNutrition = false,
  initialAutoScaleNutritionEnabled = false,
  unitSelector,
  children,
}) => {
  const [form, setForm] = useState<FoodFormData>(() =>
    buildDisplayFormState(initialValues),
  );
  const [showMoreNutrients, setShowMoreNutrients] = useState(false);
  const [autoScaleNutrition, setAutoScaleNutrition] = useState(
    initialAutoScaleNutritionEnabled,
  );
  const [selectedUnitSelection, setSelectedUnitSelection] =
    useState<FoodUnitSelectionResult | null>(() =>
      normalizeSelectedUnitSelection(unitSelector?.selectedSelection),
    );
  const [selectedSavedVariantId, setSelectedSavedVariantId] = useState<
    string | undefined
  >(
    unitSelector?.selectedSelection?.kind === 'existing'
      ? unitSelector.selectedSelection.variant.id
      : unitSelector?.variants[0]?.id,
  );
  const [textMuted, accentColor, formEnabled, formDisabled] = useCSSVariable([
    '--color-text-muted',
    '--color-accent-primary',
    '--color-form-enabled',
    '--color-form-disabled',
  ]) as [string, string, string, string];
  const preciseNumericValuesRef = useRef<
    Partial<Record<NumericFoodFormField, number>>
  >(buildPreciseNumericValues(initialValues));
  const lastServingSizeRef = useRef(parseDecimalInput(initialValues?.servingSize ?? ''));
  const hasTouchedAutoScaleRef = useRef(false);

  const fieldRefs = {
    name: useRef<TextInput>(null),
    brand: useRef<TextInput>(null),
    servingSize: useRef<TextInput>(null),
    calories: useRef<TextInput>(null),
    protein: useRef<TextInput>(null),
    fat: useRef<TextInput>(null),
    carbs: useRef<TextInput>(null),
    fiber: useRef<TextInput>(null),
    saturatedFat: useRef<TextInput>(null),
    transFat: useRef<TextInput>(null),
    sodium: useRef<TextInput>(null),
    sugars: useRef<TextInput>(null),
    potassium: useRef<TextInput>(null),
    cholesterol: useRef<TextInput>(null),
    calcium: useRef<TextInput>(null),
    iron: useRef<TextInput>(null),
    vitaminA: useRef<TextInput>(null),
    vitaminC: useRef<TextInput>(null),
  };

  const focusField = (field: keyof typeof fieldRefs) => {
    fieldRefs[field].current?.focus();
  };

  const update = (field: keyof FoodFormData, value: string) => {
    setForm((prev) => {
      if (
        NUMERIC_FOOD_FORM_FIELD_SET.has(field) &&
        field !== 'servingSize'
      ) {
        const parsedValue = parseDecimalInput(value);
        if (Number.isFinite(parsedValue)) {
          preciseNumericValuesRef.current[field as NumericFoodFormField] =
            parsedValue;
        } else {
          delete preciseNumericValuesRef.current[field as NumericFoodFormField];
        }
      }

      if (field !== 'servingSize' || !autoScaleNutrition) {
        return { ...prev, [field]: value };
      }

      const nextServingSize = parseDecimalInput(value);
      const currentServingSize =
        preciseNumericValuesRef.current.servingSize ??
        parseDecimalInput(prev.servingSize);
      const previousServingSize = isPositiveNumber(currentServingSize)
        ? currentServingSize
        : lastServingSizeRef.current;

      if (!isPositiveNumber(nextServingSize) || !isPositiveNumber(previousServingSize)) {
        return { ...prev, servingSize: value };
      }

      const ratio = nextServingSize / previousServingSize;
      const nutritionUpdates: Partial<FoodFormData> = {};
      NUTRITION_FIELDS.forEach((nutritionField) => {
        const preciseValue =
          preciseNumericValuesRef.current[
            nutritionField as NumericFoodFormField
          ] ?? parseDecimalInput(prev[nutritionField]);

        if (!Number.isFinite(preciseValue)) {
          nutritionUpdates[nutritionField] = prev[nutritionField];
          return;
        }

        const scaledValue = preciseValue * ratio;
        preciseNumericValuesRef.current[
          nutritionField as NumericFoodFormField
        ] = scaledValue;
        nutritionUpdates[nutritionField] = formatScaledInput(scaledValue);
      });
      preciseNumericValuesRef.current.servingSize = nextServingSize;

      return { ...prev, servingSize: value, ...nutritionUpdates };
    });
  };

  useEffect(() => {
    if (form.servingSize || form.servingUnit) {
      onServingChange?.(form.servingSize, form.servingUnit);
    }
  }, [form.servingSize, form.servingUnit, onServingChange]);

  useEffect(() => {
    const servingSize = parseDecimalInput(form.servingSize);
    if (isPositiveNumber(servingSize)) {
      lastServingSizeRef.current = servingSize;
    }
  }, [form.servingSize]);

  useEffect(() => {
    const normalizedSelection = normalizeSelectedUnitSelection(
      unitSelector?.selectedSelection,
    );
    setSelectedUnitSelection(normalizedSelection);
    setSelectedSavedVariantId((previous) => {
      if (normalizedSelection?.kind === 'existing') {
        return normalizedSelection.variant.id;
      }

      if (normalizedSelection?.kind === 'draft') {
        return previous ?? unitSelector?.variants[0]?.id;
      }

      return unitSelector?.variants[0]?.id;
    });
  }, [unitSelector?.selectedSelection, unitSelector?.variants]);

  useEffect(() => {
    if (!unitSelector?.variants?.length) {
      setSelectedSavedVariantId(undefined);
      return;
    }

    setSelectedSavedVariantId((previous) =>
      previous && unitSelector.variants.some((variant) => variant.id === previous)
        ? previous
        : unitSelector.variants[0]?.id,
    );
  }, [unitSelector?.variants]);

  useEffect(() => {
    if (!showAutoScaleNutrition) {
      hasTouchedAutoScaleRef.current = false;
      setAutoScaleNutrition(false);
      return;
    }

    if (!hasTouchedAutoScaleRef.current) {
      setAutoScaleNutrition(initialAutoScaleNutritionEnabled);
    }
  }, [initialAutoScaleNutritionEnabled, showAutoScaleNutrition]);

  const handleUnitSelectorSelection = async (
    selection: FoodUnitSelectionResult,
  ) => {
    const nextSelection = normalizeSelectedUnitSelection(
      (await unitSelector?.onUnitSelectionChange?.(selection)) ?? selection,
    );

    if (!nextSelection) return;

    setSelectedUnitSelection(nextSelection);
    if (nextSelection.kind === 'existing') {
      setSelectedSavedVariantId(nextSelection.variant.id);
    }
    if (
      nextSelection.kind === 'existing' ||
      !nextSelection.requiresNutritionUpdate
    ) {
      preciseNumericValuesRef.current = {
        ...preciseNumericValuesRef.current,
        ...buildPreciseNumericValues({
          servingSize: toPreciseFormString(nextSelection.variant.serving_size),
          calories: toPreciseFormString(nextSelection.variant.calories),
          protein: toPreciseFormString(nextSelection.variant.protein),
          carbs: toPreciseFormString(nextSelection.variant.carbs),
          fat: toPreciseFormString(nextSelection.variant.fat),
          fiber: toPreciseFormString(nextSelection.variant.dietary_fiber),
          saturatedFat: toPreciseFormString(nextSelection.variant.saturated_fat),
          transFat: toPreciseFormString(nextSelection.variant.trans_fat),
          sodium: toPreciseFormString(nextSelection.variant.sodium),
          sugars: toPreciseFormString(nextSelection.variant.sugars),
          potassium: toPreciseFormString(nextSelection.variant.potassium),
          cholesterol: toPreciseFormString(nextSelection.variant.cholesterol),
          calcium: toPreciseFormString(nextSelection.variant.calcium),
          iron: toPreciseFormString(nextSelection.variant.iron),
          vitaminA: toPreciseFormString(nextSelection.variant.vitamin_a),
          vitaminC: toPreciseFormString(nextSelection.variant.vitamin_c),
        }),
      };
    }
    setForm((previous) =>
      nextSelection.kind === 'draft' && nextSelection.requiresNutritionUpdate
        ? applyVariantUnitToFormState(previous, nextSelection.variant)
        : applyVariantToFormState(previous, nextSelection.variant),
    );
  };

  const renderTextField = (
    label: string,
    field: keyof FoodFormData,
    placeholder: string,
    required?: boolean,
    nextField?: keyof typeof fieldRefs,
  ) => (
    <View className="gap-1.5">
      <Text className="text-text-secondary text-sm font-medium">
        {label}{required ? ' *' : ''}
      </Text>
      <FormInput
        ref={fieldRefs[field as keyof typeof fieldRefs]}
        placeholder={placeholder}
        value={form[field]}
        onChangeText={(v) => update(field, v)}
        autoCapitalize="words"
        autoCorrect={false}
        returnKeyType={nextField ? 'next' : 'done'}
        onSubmitEditing={nextField ? () => focusField(nextField) : undefined}
      />
    </View>
  );

  const renderNumericField = (
    label: string,
    field: keyof FoodFormData,
    unit?: string,
    required?: boolean,
    nextField?: keyof typeof fieldRefs,
  ) => (
    <View className="gap-1.5 flex-1">
      <Text className="text-text-secondary text-sm font-medium">
        {label}{unit ? ` (${unit})` : ''}{required ? ' *' : ''}
      </Text>
      <FormInput
        ref={fieldRefs[field as keyof typeof fieldRefs]}
        placeholder="0"
        value={form[field]}
        onChangeText={(v) => {
          if (DECIMAL_INPUT_REGEX.test(v)) update(field, v);
        }}
        keyboardType="decimal-pad"
        returnKeyType={nextField ? 'next' : 'done'}
        onSubmitEditing={nextField ? () => focusField(nextField) : undefined}
      />
    </View>
  );

  return (
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 pt-4 pb-20 gap-4"
        keyboardShouldPersistTaps="handled"
      >
        <View className="bg-surface rounded-xl p-4 gap-4 shadow-sm">
          {/* Food info */}
          {renderTextField('Food Name', 'name', 'e.g. Chicken Breast', true, 'brand')}
          {renderTextField('Brand', 'brand', 'Optional', false, 'servingSize')}

          {/* Serving */}
          <View className="flex-row gap-3">
            {renderNumericField('Serving Size', 'servingSize', undefined, false, 'calories')}
            <View className="gap-1.5 flex-1">
              <Text className="text-text-secondary text-sm font-medium">Serving Unit</Text>
              {unitSelector ? (
                <FoodUnitSelectorSheet
                  variants={unitSelector.variants}
                  selectedVariantId={selectedSavedVariantId}
                  selectedSelection={selectedUnitSelection}
                  title="Select Unit"
                  onSelect={handleUnitSelectorSelection}
                  renderTrigger={({ onPress }) => (
                    <TouchableOpacity
                      onPress={onPress}
                      activeOpacity={0.7}
                      className="bg-raised rounded-lg border border-border-subtle px-3 py-2.5 flex-row items-center justify-between"
                      style={{ height: 44 }}
                    >
                      <Text className="text-text-primary" style={{ fontSize: 16 }}>
                        {form.servingUnit || 'unit'}
                      </Text>
                      <Icon
                        name="chevron-down"
                        size={12}
                        color={textMuted}
                        weight="medium"
                      />
                    </TouchableOpacity>
                  )}
                />
              ) : (
                <BottomSheetPicker
                  value={form.servingUnit}
                  sections={SERVING_UNIT_SECTIONS}
                  onSelect={(v) => update('servingUnit', v)}
                  title="Select Unit"
                  placeholder="unit"
                  renderTrigger={({ onPress, selectedOption }) => (
                    <TouchableOpacity
                      onPress={onPress}
                      activeOpacity={0.7}
                      className="bg-raised rounded-lg border border-border-subtle px-3 py-2.5 flex-row items-center justify-between"
                      style={{ height: 44 }}
                    >
                      <Text
                        className={selectedOption ? 'text-text-primary' : 'text-text-muted'}
                        style={{ fontSize: 16 }}
                      >
                        {selectedOption?.label ?? 'unit'}
                      </Text>
                      <Icon
                        name="chevron-down"
                        size={12}
                        color={textMuted}
                        weight="medium"
                      />
                    </TouchableOpacity>
                  )}
                />
              )}
            </View>
          </View>

          {showAutoScaleNutrition ? (
            <View className="flex-row items-center justify-between mt-1.5">
              <Text className="text-text-secondary text-base">Auto Scale Nutrition</Text>
              <Switch
                accessibilityLabel="Auto Scale Nutrition"
                value={autoScaleNutrition}
                onValueChange={(value) => {
                  hasTouchedAutoScaleRef.current = true;
                  setAutoScaleNutrition(value);
                }}
                trackColor={{ false: formDisabled, true: formEnabled }}
                thumbColor="#FFFFFF"
              />
            </View>
          ) : null}

          <View className="gap-1.5 mt-1.5">
            <Text className="text-text-primary text-sm font-bold">
              Calories (kcal) *
            </Text>
            <FormInput
              ref={fieldRefs.calories}
              placeholder="0"
              value={form.calories}
              onChangeText={(v) => {
                if (DECIMAL_INPUT_REGEX.test(v)) update('calories', v);
              }}
              keyboardType="decimal-pad"
              returnKeyType="next"
              onSubmitEditing={() => focusField('fat')}
            />
          </View>
          <View className="flex-row gap-3">
            {renderNumericField('Fat', 'fat', 'g', false, 'carbs')}
            {renderNumericField('Carbs', 'carbs', 'g', false, 'protein')}
          </View>
          <View className="flex-row gap-3">
            {renderNumericField('Protein', 'protein', 'g', false, 'fiber')}
            {renderNumericField('Fiber', 'fiber', 'g', false, showMoreNutrients ? 'saturatedFat' : undefined)}
          </View>
          <Button
            variant="ghost"
            onPress={() => setShowMoreNutrients((prev) => !prev)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            className="self-start py-0 px-0"
            textClassName="text-sm"
          >
            <Text style={{ color: accentColor }} className="text-sm font-medium">
              {showMoreNutrients ? 'Hide extra nutrients ▴' : 'Show more nutrients ▾'}
            </Text>
          </Button>

          {showMoreNutrients && (
            <>
              <View className="flex-row gap-3">
                {renderNumericField('Saturated Fat', 'saturatedFat', 'g', false, 'transFat')}
                {renderNumericField('Trans Fat', 'transFat', 'g', false, 'cholesterol')}
              </View>
              <View className="flex-row gap-3">
                {renderNumericField('Cholesterol', 'cholesterol', 'mg', false, 'sodium')}
                {renderNumericField('Sodium', 'sodium', 'mg', false, 'sugars')}
              </View>
              <View className="flex-row gap-3">
                {renderNumericField('Sugars', 'sugars', 'g', false, 'calcium')}
                {renderNumericField('Calcium', 'calcium', 'mg', false, 'iron')}
              </View>
              <View className="flex-row gap-3">
                {renderNumericField('Iron', 'iron', 'mg', false, 'vitaminA')}
                {renderNumericField('Vitamin A', 'vitaminA', 'mcg', false, 'vitaminC')}
              </View>
              <View className="flex-row gap-3">
                {renderNumericField('Vitamin C', 'vitaminC', 'mg', false, 'potassium')}
                {renderNumericField('Potassium', 'potassium', 'mg')}
              </View>
            </>
          )}
        </View>

        {children}

        {/* Submit */}
        <Button
          variant="primary"
          className="mt-2"
          disabled={isSubmitting}
          onPress={() =>
            onSubmit({
              ...form,
              ...Object.fromEntries(
                NUMERIC_FOOD_FORM_FIELDS.map((field) => [
                  field,
                  preciseNumericValuesRef.current[field] != null
                    ? toPreciseFormString(preciseNumericValuesRef.current[field])
                    : form[field],
                ]),
              ),
            })
          }
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text className="text-white text-base font-semibold">{submitLabel}</Text>
          )}
        </Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default FoodForm;
