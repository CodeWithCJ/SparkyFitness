import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useCSSVariable } from 'uniwind';

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
  sodium: string;
  sugars: string;
}

export interface FoodFormProps {
  initialValues?: Partial<FoodFormData>;
  onSubmit: (data: FoodFormData) => void;
  submitLabel?: string;
  isSubmitting?: boolean;
}

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
  sodium: '',
  sugars: '',
};

const FoodForm: React.FC<FoodFormProps> = ({
  initialValues,
  onSubmit,
  submitLabel = 'Add Food',
  isSubmitting = false,
}) => {
  const [form, setForm] = useState<FoodFormData>({ ...EMPTY_FORM, ...initialValues });
  const [textMuted] = useCSSVariable(['--color-text-muted']) as [string];

  const update = (field: keyof FoodFormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const renderTextField = (label: string, field: keyof FoodFormData, placeholder: string, required?: boolean) => (
    <View className="gap-1.5">
      <Text className="text-text-secondary text-sm font-medium">
        {label}{required ? ' *' : ''}
      </Text>
      <TextInput
        className="bg-raised rounded-lg border border-border-subtle px-3 py-2.5 text-text-primary"
        style={{ fontSize: 16, lineHeight: 20 }}
        placeholder={placeholder}
        placeholderTextColor={textMuted}
        value={form[field]}
        onChangeText={(v) => update(field, v)}
        autoCapitalize="words"
        autoCorrect={false}
      />
    </View>
  );

  const renderNumericField = (label: string, field: keyof FoodFormData, unit?: string) => (
    <View className="gap-1.5 flex-1">
      <Text className="text-text-secondary text-sm font-medium">
        {label}{unit ? ` (${unit})` : ''}
      </Text>
      <TextInput
        className="bg-raised rounded-lg border border-border-subtle px-3 py-2.5 text-text-primary"
        style={{ fontSize: 16, lineHeight: 20 }}
        placeholder="0"
        placeholderTextColor={textMuted}
        value={form[field]}
        onChangeText={(v) => {
          if (/^\d*\.?\d*$/.test(v)) update(field, v);
        }}
        keyboardType="decimal-pad"
      />
    </View>
  );

  return (
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : 'height' }>
    <ScrollView
      className="flex-1"
      contentContainerClassName="px-4 py-4 gap-4"
      keyboardShouldPersistTaps="handled"
    >
      {/* Food info */}
      {renderTextField('Food Name', 'name', 'e.g. Chicken Breast', true)}
      {renderTextField('Brand', 'brand', 'Optional')}

      {/* Serving */}
      <View className="flex-row gap-3">
        {renderNumericField('Serving Size', 'servingSize')}
        <View className="gap-1.5 flex-1">
          <Text className="text-text-secondary text-sm font-medium">Serving Unit</Text>
          <TextInput
            className="bg-raised rounded-lg border border-border-subtle px-3 py-2.5 text-text-primary"
            style={{ fontSize: 16, lineHeight: 20 }}
            placeholder="e.g. g, ml, oz"
            placeholderTextColor={textMuted}
            value={form.servingUnit}
            onChangeText={(v) => update('servingUnit', v)}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      </View>

      {/* Nutrition */}
      <Text className="text-text-secondary text-sm font-semibold uppercase tracking-wider mt-2">
        Nutrition
      </Text>

      {renderNumericField('Calories', 'calories', 'kcal')}

      <View className="flex-row gap-3">
        {renderNumericField('Protein', 'protein', 'g')}
        {renderNumericField('Carbs', 'carbs', 'g')}
        {renderNumericField('Fat', 'fat', 'g')}
      </View>

      {renderNumericField('Fiber', 'fiber', 'g')}
      {renderNumericField('Saturated Fat', 'saturatedFat', 'g')}
      {renderNumericField('Sodium', 'sodium', 'mg')}
      {renderNumericField('Sugars', 'sugars', 'g')}

      {/* Submit */}
      <TouchableOpacity
        className="bg-accent-primary rounded-[10px] py-3.5 items-center mt-2"
        activeOpacity={0.8}
        disabled={isSubmitting}
        onPress={() => onSubmit(form)}
      >
        {isSubmitting ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text className="text-white text-base font-semibold">{submitLabel}</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default FoodForm;
