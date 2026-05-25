import React, { useEffect, useRef, useState } from 'react';
import { Alert, View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform, Switch } from 'react-native';
import { useCSSVariable } from 'uniwind';
import BottomSheetPicker from './BottomSheetPicker';
import Button from './ui/Button';
import FormInput from './FormInput';
import Icon from './Icon';
import FoodUnitSelectorSheet from './FoodUnitSelectorSheet';
import type {
  EquivalentUnit,
  FoodUnitSelectionResult,
  FoodUnitVariant,
} from '../types/foodUnitVariants';
import { formatFoodFormNumber } from '../utils/foodDetails';
import { DECIMAL_INPUT_REGEX, parseDecimalInput } from '../utils/numericInput';
import {
  FOOD_FORM_UNIT_GROUPS,
  getConversionFactor,
} from '../utils/servingSizeConversions';

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
  /**
   * When the user picks a new serving unit compatible with the current one
   * (e.g. g ↔ oz), convert the serving size value to keep the same quantity
   * expressed in the new unit. Incompatible swaps (g → cup) leave the value
   * alone — the user is relabeling, not converting.
   */
  convertServingSizeOnUnitChange?: boolean;
  equivalents?: {
    items: EquivalentUnit[];
    onChange: (next: EquivalentUnit[]) => void;
    disabled?: boolean;
  };
  headerChildren?: React.ReactNode;
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

function applyCompatibleDraftToFormState(
  previous: FoodFormData,
  variant: FoodUnitVariant,
  scaledVariant: FoodUnitVariant,
): FoodFormData {
  return {
    ...previous,
    servingUnit: variant.serving_unit,
    calories: formatFoodFormNumber(scaledVariant.calories, 'calories'),
    protein: formatFoodFormNumber(scaledVariant.protein, 'nutrient'),
    carbs: formatFoodFormNumber(scaledVariant.carbs, 'nutrient'),
    fat: formatFoodFormNumber(scaledVariant.fat, 'nutrient'),
    fiber: formatFoodFormNumber(scaledVariant.dietary_fiber, 'nutrient'),
    saturatedFat: formatFoodFormNumber(scaledVariant.saturated_fat, 'nutrient'),
    transFat: formatFoodFormNumber(scaledVariant.trans_fat, 'nutrient'),
    sodium: formatFoodFormNumber(scaledVariant.sodium, 'nutrient'),
    sugars: formatFoodFormNumber(scaledVariant.sugars, 'nutrient'),
    potassium: formatFoodFormNumber(scaledVariant.potassium, 'nutrient'),
    cholesterol: formatFoodFormNumber(scaledVariant.cholesterol, 'nutrient'),
    calcium: formatFoodFormNumber(scaledVariant.calcium, 'nutrient'),
    iron: formatFoodFormNumber(scaledVariant.iron, 'nutrient'),
    vitaminA: formatFoodFormNumber(scaledVariant.vitamin_a, 'nutrient'),
    vitaminC: formatFoodFormNumber(scaledVariant.vitamin_c, 'nutrient'),
  };
}

function buildPreciseNumericValuesFromVariant(
  variant: FoodUnitVariant,
): Partial<Record<NumericFoodFormField, number>> {
  return buildPreciseNumericValues({
    servingSize: toPreciseFormString(variant.serving_size),
    calories: toPreciseFormString(variant.calories),
    protein: toPreciseFormString(variant.protein),
    carbs: toPreciseFormString(variant.carbs),
    fat: toPreciseFormString(variant.fat),
    fiber: toPreciseFormString(variant.dietary_fiber),
    saturatedFat: toPreciseFormString(variant.saturated_fat),
    transFat: toPreciseFormString(variant.trans_fat),
    sodium: toPreciseFormString(variant.sodium),
    sugars: toPreciseFormString(variant.sugars),
    potassium: toPreciseFormString(variant.potassium),
    cholesterol: toPreciseFormString(variant.cholesterol),
    calcium: toPreciseFormString(variant.calcium),
    iron: toPreciseFormString(variant.iron),
    vitaminA: toPreciseFormString(variant.vitamin_a),
    vitaminC: toPreciseFormString(variant.vitamin_c),
  });
}

function isPositiveNumber(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function scaleCompatibleDraftVariant(
  variant: FoodUnitVariant,
  servingSize: number,
): FoodUnitVariant {
  const ratio =
    variant.serving_size > 0 && Number.isFinite(servingSize)
      ? servingSize / variant.serving_size
      : 1;

  return {
    ...variant,
    calories: (variant.calories ?? 0) * ratio,
    protein: (variant.protein ?? 0) * ratio,
    carbs: (variant.carbs ?? 0) * ratio,
    fat: (variant.fat ?? 0) * ratio,
    saturated_fat: (variant.saturated_fat ?? 0) * ratio,
    trans_fat: (variant.trans_fat ?? 0) * ratio,
    sodium: (variant.sodium ?? 0) * ratio,
    sugars: (variant.sugars ?? 0) * ratio,
    potassium: (variant.potassium ?? 0) * ratio,
    cholesterol: (variant.cholesterol ?? 0) * ratio,
    calcium: (variant.calcium ?? 0) * ratio,
    iron: (variant.iron ?? 0) * ratio,
    vitamin_a: (variant.vitamin_a ?? 0) * ratio,
    vitamin_c: (variant.vitamin_c ?? 0) * ratio,
    dietary_fiber: (variant.dietary_fiber ?? 0) * ratio,
    polyunsaturated_fat: (variant.polyunsaturated_fat ?? 0) * ratio,
    monounsaturated_fat: (variant.monounsaturated_fat ?? 0) * ratio,
    glycemic_index: variant.glycemic_index,
    custom_nutrients: Object.fromEntries(
      Object.entries(variant.custom_nutrients || {}).map(([key, value]) => [
        key,
        (Number(value) || 0) * ratio,
      ]),
    ),
  };
}

function getScaledVariantNumericValue(
  field: Exclude<NumericFoodFormField, 'servingSize'>,
  variant: FoodUnitVariant,
): number {
  switch (field) {
    case 'calories':
      return variant.calories ?? 0;
    case 'protein':
      return variant.protein ?? 0;
    case 'carbs':
      return variant.carbs ?? 0;
    case 'fat':
      return variant.fat ?? 0;
    case 'fiber':
      return variant.dietary_fiber ?? 0;
    case 'saturatedFat':
      return variant.saturated_fat ?? 0;
    case 'transFat':
      return variant.trans_fat ?? 0;
    case 'sodium':
      return variant.sodium ?? 0;
    case 'sugars':
      return variant.sugars ?? 0;
    case 'potassium':
      return variant.potassium ?? 0;
    case 'cholesterol':
      return variant.cholesterol ?? 0;
    case 'calcium':
      return variant.calcium ?? 0;
    case 'iron':
      return variant.iron ?? 0;
    case 'vitaminA':
      return variant.vitamin_a ?? 0;
    case 'vitaminC':
      return variant.vitamin_c ?? 0;
  }
}

function formatScaledInput(value: number): string {
  return formatFoodFormNumber(value, 'nutrient') || '0';
}

interface EquivalentsSectionProps {
  items: EquivalentUnit[];
  onChange: (next: EquivalentUnit[]) => void;
  disabled?: boolean;
  textMuted: string;
  accentColor: string;
}

const EquivalentsSection: React.FC<EquivalentsSectionProps> = ({
  items,
  onChange,
  disabled = false,
  textMuted,
  accentColor,
}) => {
  const updateRow = (index: number, patch: Partial<EquivalentUnit>) => {
    const next = items.slice();
    next[index] = { ...next[index], ...patch };
    onChange(next);
  };

  const removeRow = (index: number) => {
    const next = items.slice();
    next.splice(index, 1);
    onChange(next);
  };

  const addRow = () => {
    onChange([...items, { serving_size: 0, serving_unit: '' }]);
  };

  return (
    <View className="gap-2 mt-1.5" pointerEvents={disabled ? 'none' : 'auto'} style={disabled ? { opacity: 0.5 } : undefined}>
      <Text className="text-text-secondary text-sm font-medium">
        Equivalent sizes
      </Text>
      {items.map((item, index) => {
        const sizeText = item.serving_size > 0 ? String(item.serving_size) : '';
        return (
          <View
            key={`${index}-${item.id ?? 'new'}`}
            className="flex-row gap-2 items-center"
          >
            <View className="flex-1">
              <FormInput
                placeholder="0"
                value={sizeText}
                onChangeText={(text) => {
                  if (!DECIMAL_INPUT_REGEX.test(text)) return;
                  updateRow(index, { serving_size: parseDecimalInput(text) || 0 });
                }}
                keyboardType="decimal-pad"
                returnKeyType="done"
              />
            </View>
            <View className="flex-1">
              <BottomSheetPicker
                value={item.serving_unit}
                sections={SERVING_UNIT_SECTIONS}
                onSelect={(value) => updateRow(index, { serving_unit: value })}
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
            </View>
            <TouchableOpacity
              onPress={() => removeRow(index)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="Remove equivalent"
            >
              <Icon name="remove-circle" size={22} color={textMuted} />
            </TouchableOpacity>
          </View>
        );
      })}
      <Button
        variant="ghost"
        onPress={addRow}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        className="self-start py-0 px-0"
      >
        <Text style={{ color: accentColor }} className="text-sm font-medium">
          + Add equivalent
        </Text>
      </Button>
    </View>
  );
};

const FoodForm: React.FC<FoodFormProps> = ({
  initialValues,
  onSubmit,
  onServingChange,
  submitLabel = 'Add Food',
  isSubmitting = false,
  showAutoScaleNutrition = false,
  initialAutoScaleNutritionEnabled = false,
  unitSelector,
  convertServingSizeOnUnitChange = false,
  equivalents,
  headerChildren,
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
  const [showManualUpdateBanner, setShowManualUpdateBanner] = useState(() => {
    const initial = normalizeSelectedUnitSelection(unitSelector?.selectedSelection);
    return Boolean(
      initial?.kind === 'draft' && initial.requiresNutritionUpdate,
    );
  });
  const [selectedSavedVariantId, setSelectedSavedVariantId] = useState<
    string | undefined
  >(
    unitSelector?.selectedSelection?.kind === 'existing'
      ? unitSelector.selectedSelection.variant.id
      : unitSelector?.variants[0]?.id,
  );
  const [textMuted, accentColor, formEnabled, formDisabled, infoBg, infoText] = useCSSVariable([
    '--color-text-muted',
    '--color-accent-primary',
    '--color-form-enabled',
    '--color-form-disabled',
    '--color-bg-info',
    '--color-text-info',
  ]) as [string, string, string, string, string, string];
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

  const applyCompatibleDraftSelection = (variant: FoodUnitVariant) => {
    setForm((previous) => {
      const currentServingSize =
        preciseNumericValuesRef.current.servingSize ??
        parseDecimalInput(previous.servingSize);
      const nextServingSize = isPositiveNumber(currentServingSize)
        ? currentServingSize
        : variant.serving_size;
      const scaledVariant = scaleCompatibleDraftVariant(
        variant,
        nextServingSize,
      );
      NUTRITION_FIELDS.forEach((field) => {
        preciseNumericValuesRef.current[field as NumericFoodFormField] =
          getScaledVariantNumericValue(
            field as Exclude<NumericFoodFormField, 'servingSize'>,
            scaledVariant,
          );
      });
      preciseNumericValuesRef.current.servingSize = nextServingSize;
      if (isPositiveNumber(nextServingSize)) {
        lastServingSizeRef.current = nextServingSize;
      }
      return applyCompatibleDraftToFormState(
        previous,
        variant,
        scaledVariant,
      );
    });
  };

  const update = (field: keyof FoodFormData, value: string) => {
    setForm((prev) => {
      if (
        NUMERIC_FOOD_FORM_FIELD_SET.has(field) &&
        (field !== 'servingSize' || !autoScaleNutrition)
      ) {
        const parsedValue = parseDecimalInput(value);
        if (Number.isFinite(parsedValue)) {
          preciseNumericValuesRef.current[field as NumericFoodFormField] =
            parsedValue;
        } else {
          delete preciseNumericValuesRef.current[field as NumericFoodFormField];
        }
      }

      if (
        field === 'servingUnit' &&
        convertServingSizeOnUnitChange &&
        value !== prev.servingUnit
      ) {
        const current = parseDecimalInput(prev.servingSize);
        // getConversionFactor returns null for incompatible units (e.g. g→cup),
        // in which case we leave the size value alone — the user is relabeling.
        const factor =
          Number.isFinite(current) && current > 0
            ? getConversionFactor(prev.servingUnit, value)
            : null;
        if (factor !== null && factor !== 0) {
          const converted = current / factor;
          const rounded = Math.round(converted * 10) / 10;
          preciseNumericValuesRef.current.servingSize = converted;
          return {
            ...prev,
            servingUnit: value,
            servingSize: String(rounded),
          };
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
    setShowManualUpdateBanner(
      Boolean(
        normalizedSelection?.kind === 'draft' &&
          normalizedSelection.requiresNutritionUpdate,
      ),
    );
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

  const selection = unitSelector?.selectedSelection;
  const selectionRequiresNutritionUpdate =
    selection?.kind === 'draft' ? selection.requiresNutritionUpdate : false;

  useEffect(() => {
    if (!selection) return;
    if (selection.kind === 'draft' && selection.requiresNutritionUpdate) {
      setForm((prev) =>
        prev.servingUnit === selection.variant.serving_unit
          ? prev
          : { ...prev, servingUnit: selection.variant.serving_unit },
      );
      return;
    }
    if (selection.kind === 'draft') {
      applyCompatibleDraftSelection(selection.variant);
      return;
    }
    preciseNumericValuesRef.current = {
      ...preciseNumericValuesRef.current,
      ...buildPreciseNumericValuesFromVariant(selection.variant),
    };
    lastServingSizeRef.current = selection.variant.serving_size;
    setForm((prev) => applyVariantToFormState(prev, selection.variant));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selection?.kind,
    selection?.variant?.id,
    selection?.variant?.serving_unit,
    selectionRequiresNutritionUpdate,
  ]);

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
    setShowManualUpdateBanner(
      Boolean(
        nextSelection.kind === 'draft' &&
          nextSelection.requiresNutritionUpdate,
      ),
    );
    if (nextSelection.kind === 'existing') {
      setSelectedSavedVariantId(nextSelection.variant.id);
    }
    if (nextSelection.kind === 'existing') {
      preciseNumericValuesRef.current = {
        ...preciseNumericValuesRef.current,
        ...buildPreciseNumericValuesFromVariant(nextSelection.variant),
      };
      lastServingSizeRef.current = nextSelection.variant.serving_size;
    }
    if (nextSelection.kind === 'draft') {
      if (nextSelection.requiresNutritionUpdate) {
        setForm((previous) =>
          applyVariantUnitToFormState(previous, nextSelection.variant),
        );
        return;
      }

      applyCompatibleDraftSelection(nextSelection.variant);
      return;
    }

    setForm((previous) =>
      applyVariantToFormState(previous, nextSelection.variant),
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

  const submitForm = () =>
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
    });

  const handleSubmitPress = () => {
    if (!showManualUpdateBanner) {
      submitForm();
      return;
    }

    Alert.alert(
      'Manual Nutrition Update',
      "Can't convert between units. Update nutrition values manually before saving.",
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Save Anyway',
          onPress: submitForm,
        },
      ],
    );
  };

  return (
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 pt-4 pb-20 gap-4"
        keyboardShouldPersistTaps="handled"
      >
        {headerChildren}
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
                      <Text
                        className="text-text-primary flex-1 pr-2"
                        style={{ fontSize: 16 }}
                        numberOfLines={1}
                      >
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

          {equivalents ? (
            <EquivalentsSection
              items={equivalents.items}
              onChange={equivalents.onChange}
              disabled={equivalents.disabled}
              textMuted={textMuted}
              accentColor={accentColor}
            />
          ) : null}

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

          {showManualUpdateBanner ? (
            <View className="mt-1.5">
              <View
                className="rounded-lg px-3 py-3 flex-row items-center gap-2.5"
                style={{ backgroundColor: infoBg }}
              >
                <Icon name="info-circle" size={18} color={infoText} />
                <Text
                  className="text-sm font-medium flex-1"
                  style={{ color: infoText }}
                >
                  {"Can't convert between units. Update nutrition values manually."}
                </Text>
              </View>
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
          onPress={handleSubmitPress}
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
