import React from 'react';
import type { RootStackScreenProps } from '../types/navigation';
import { CreateFoodMode } from './foodForm/CreateFoodMode';
import { AdjustNutritionMode } from './foodForm/AdjustNutritionMode';
import { EditFoodMode } from './foodForm/EditFoodMode';

export type FoodFormScreenProps = RootStackScreenProps<'FoodForm'>;

const FoodFormScreen: React.FC<FoodFormScreenProps> = ({ route, navigation }) => {
  if (route.params.mode === 'adjust-entry-nutrition') {
    return <AdjustNutritionMode params={route.params} navigation={navigation} />;
  }
  if (route.params.mode === 'edit-food') {
    return <EditFoodMode params={route.params} navigation={navigation} />;
  }
  return <CreateFoodMode params={route.params} navigation={navigation} routeKey={route.key} />;
};

export default FoodFormScreen;
