import React from 'react';
import { View, TouchableOpacity, Platform, Text, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Icon from '../components/Icon';
import FoodForm, { type FoodFormData } from '../components/FoodForm';
import { useEditFood } from '../hooks/useEditFood';
import type { RootStackScreenProps } from '../types/navigation';

type EditFoodScreenProps = RootStackScreenProps<'EditFood'>;

const EditFoodScreen: React.FC<EditFoodScreenProps> = ({ navigation, route }) => {
  const { entry, onEdited } = route.params;
  const insets = useSafeAreaInsets();
  const [accentColor] = useCSSVariable(['--color-accent-primary']) as [string];

  const { editFood, isPending, invalidateCache } = useEditFood({
    entry,
    onSuccess: (updatedEntry) => {
      invalidateCache();
      onEdited(updatedEntry);
      navigation.goBack();
    },
  });

  const initialValues: Partial<FoodFormData> = {
    name: entry.food_name ?? '',
    brand: entry.brand_name ?? '',
    servingSize: String(entry.serving_size ?? ''),
    servingUnit: entry.unit ?? '',
    calories: String(entry.calories ?? ''),
    protein: String(entry.protein ?? ''),
    carbs: String(entry.carbs ?? ''),
    fat: String(entry.fat ?? ''),
    fiber: entry.dietary_fiber != null ? String(entry.dietary_fiber) : '',
    saturatedFat: entry.saturated_fat != null ? String(entry.saturated_fat) : '',
    sodium: entry.sodium != null ? String(entry.sodium) : '',
    sugars: entry.sugars != null ? String(entry.sugars) : '',
  };

  const handleSubmit = (data: FoodFormData) => {
    if (!data.name.trim()) {
      Alert.alert('Missing name', 'Please enter a food name.');
      return;
    }
    if (!parseFloat(data.servingSize)) {
      Alert.alert('Invalid serving size', 'Serving size must be greater than zero.');
      return;
    }
    editFood(data);
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
          Edit Food
        </Text>
      </View>

      <FoodForm
        onSubmit={handleSubmit}
        isSubmitting={isPending}
        initialValues={initialValues}
        submitLabel="Save Changes"
      >
        <View className="bg-surface rounded-xl p-4 shadow-sm">
          <Text className="text-text-secondary text-sm">
            Changes will apply to all diary entries using this food.
          </Text>
        </View>
      </FoodForm>
    </View>
  );
};

export default EditFoodScreen;
