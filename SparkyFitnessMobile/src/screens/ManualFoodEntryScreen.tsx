import React from 'react';
import { View, TouchableOpacity, Platform, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Icon from '../components/Icon';
import FoodForm, { type FoodFormData } from '../components/FoodForm';
import type { RootStackScreenProps } from '../types/navigation';

type ManualFoodEntryScreenProps = RootStackScreenProps<'ManualFoodEntry'>;

const ManualFoodEntryScreen: React.FC<ManualFoodEntryScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [accentColor] = useCSSVariable(['--color-accent-primary']) as [string];

  const handleSubmit = (_data: FoodFormData) => {
    // Placeholder: API integration will be added later
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

      <FoodForm onSubmit={handleSubmit} />
    </View>
  );
};

export default ManualFoodEntryScreen;
