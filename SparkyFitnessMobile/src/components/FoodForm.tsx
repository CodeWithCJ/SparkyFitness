import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useCSSVariable } from 'uniwind';
import BottomSheetPicker from './BottomSheetPicker';
import Button from './ui/Button';
import Icon from './Icon';

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
  children?: React.ReactNode;
}

const SERVING_UNIT_OPTIONS = [
  'serving', 'g', 'oz', 'cup', 'piece', 'slice', 'scoop', 'tbsp', 'tsp',
  'bowl', 'plate', 'handful', 'bar', 'stick', 'can', 'bottle', 'packet', 'bag',
  'ml', 'l', 'kg', 'lb', 'mg',
].map((u) => ({ label: u, value: u }));

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

const FoodForm: React.FC<FoodFormProps> = ({
  initialValues,
  onSubmit,
  onServingChange,
  submitLabel = 'Add Food',
  isSubmitting = false,
  children,
}) => {
  const [form, setForm] = useState<FoodFormData>({ ...EMPTY_FORM, ...initialValues });
  const [showMoreNutrients, setShowMoreNutrients] = useState(false);
  const [textMuted, accentColor] = useCSSVariable(['--color-text-muted', '--color-accent-primary']) as [string, string];

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
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  useEffect(() => {
    if (form.servingSize || form.servingUnit) {
      onServingChange?.(form.servingSize, form.servingUnit);
    }
  }, [form.servingSize, form.servingUnit, onServingChange]);

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
      <TextInput
        ref={fieldRefs[field as keyof typeof fieldRefs]}
        className="bg-raised rounded-lg border border-border-subtle px-3 py-2.5 text-text-primary"
        style={{ fontSize: 16, lineHeight: 20 }}
        placeholder={placeholder}
        placeholderTextColor={textMuted}
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
      <TextInput
        ref={fieldRefs[field as keyof typeof fieldRefs]}
        className="bg-raised rounded-lg border border-border-subtle px-3 py-2.5 text-text-primary"
        style={{ fontSize: 16, lineHeight: 20 }}
        placeholder="0"
        placeholderTextColor={textMuted}
        value={form[field]}
        onChangeText={(v) => {
          if (/^\d*\.?\d*$/.test(v)) update(field, v);
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
              <BottomSheetPicker
                value={form.servingUnit}
                options={SERVING_UNIT_OPTIONS}
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
                    <Icon name="chevron-down" size={12} color={textMuted} weight="medium" />
                  </TouchableOpacity>
                )}
              />
            </View>
          </View>

          <View className="gap-1.5 mt-1.5">
            <Text className="text-text-primary text-sm font-bold">
              Calories (kcal) *
            </Text>
            <TextInput
              ref={fieldRefs.calories}
              className="bg-raised rounded-lg px-3 py-2.5 text-text-primary border border-border-strong"
              style={{ fontSize: 16, lineHeight: 20 }}
              placeholder="0"
              placeholderTextColor={textMuted}
              value={form.calories}
              onChangeText={(v) => {
                if (/^\d*\.?\d*$/.test(v)) update('calories', v);
              }}
              keyboardType="decimal-pad"
              returnKeyType="next"
              onSubmitEditing={() => focusField('protein')}
            />
          </View>
          <View className="flex-row gap-3">
            {renderNumericField('Protein', 'protein', 'g', false, 'fat')}
            {renderNumericField('Fat', 'fat', 'g', false, 'carbs')}
          </View>
          <View className="flex-row gap-3">
            {renderNumericField('Carbs', 'carbs', 'g', false, 'fiber')}
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
                {renderNumericField('Trans Fat', 'transFat', 'g', false, 'sodium')}
              </View>
              <View className="flex-row gap-3">
                {renderNumericField('Sodium', 'sodium', 'mg', false, 'sugars')}
                {renderNumericField('Sugars', 'sugars', 'g', false, 'cholesterol')}
              </View>
              <View className="flex-row gap-3">
                {renderNumericField('Cholesterol', 'cholesterol', 'mg', false, 'potassium')}
                {renderNumericField('Potassium', 'potassium', 'mg', false, 'calcium')}
              </View>
              <View className="flex-row gap-3">
                {renderNumericField('Calcium', 'calcium', 'mg', false, 'iron')}
                {renderNumericField('Iron', 'iron', 'mg', false, 'vitaminA')}
              </View>
              <View className="flex-row gap-3">
                {renderNumericField('Vitamin A', 'vitaminA', 'mcg', false, 'vitaminC')}
                {renderNumericField('Vitamin C', 'vitaminC', 'mg')}
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
          onPress={() => onSubmit(form)}
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
