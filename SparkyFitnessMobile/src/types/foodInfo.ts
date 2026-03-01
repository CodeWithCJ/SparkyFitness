import type { FoodItem, TopFoodItem } from './foods';
import type { ExternalFoodItem, ExternalFoodVariant } from './externalFoods';
import type { Meal } from './meals';
import type { BarcodeFood } from '../services/api/externalFoodSearchApi';

export interface FoodInfoItem {
  id: string;
  name: string;
  brand: string | null;
  servingSize: number;
  servingUnit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  saturatedFat?: number;
  sodium?: number;
  sugars?: number;
  variantId?: string;
  externalVariants?: ExternalFoodVariant[];
  source: 'local' | 'external' | 'meal';
  originalItem: FoodItem | TopFoodItem | ExternalFoodItem | Meal | BarcodeFood;
}

export const foodItemToFoodInfo = (item: FoodItem | TopFoodItem ): FoodInfoItem => ({
  id: item.id,
  name: item.name,
  brand: item.brand,
  servingSize: item.default_variant.serving_size,
  servingUnit: item.default_variant.serving_unit,
  calories: item.default_variant.calories,
  protein: item.default_variant.protein,
  carbs: item.default_variant.carbs,
  fat: item.default_variant.fat,
  fiber: item.default_variant.fiber,
  saturatedFat: item.default_variant.saturated_fat,
  sodium: item.default_variant.sodium,
  sugars: item.default_variant.sugars,
  variantId: item.default_variant.id,
  source: 'local',
  originalItem: item,
});

export const externalFoodItemToFoodInfo = (item: ExternalFoodItem): FoodInfoItem => ({
  id: item.id,
  name: item.name,
  brand: item.brand,
  servingSize: item.serving_size,
  servingUnit: item.serving_unit,
  calories: item.calories,
  protein: item.protein,
  carbs: item.carbs,
  fat: item.fat,
  fiber: item.fiber,
  saturatedFat: item.saturated_fat,
  sodium: item.sodium,
  sugars: item.sugars,
  externalVariants: item.variants,
  source: 'external',
  originalItem: item,
});

export const mealToFoodInfo = (meal: Meal): FoodInfoItem => {
  const scale = (food: Meal['foods'][number]) =>
    food.serving_size === 0 ? 0 : food.quantity / food.serving_size;

  const calories = meal.foods.reduce((sum, f) => sum + f.calories * scale(f), 0);
  const protein = meal.foods.reduce((sum, f) => sum + f.protein * scale(f), 0);
  const carbs = meal.foods.reduce((sum, f) => sum + f.carbs * scale(f), 0);
  const fat = meal.foods.reduce((sum, f) => sum + f.fat * scale(f), 0);

  return {
    id: meal.id,
    name: meal.name,
    brand: null,
    servingSize: meal.serving_size,
    servingUnit: meal.serving_unit,
    calories: Math.round(calories),
    protein: Math.round(protein),
    carbs: Math.round(carbs),
    fat: Math.round(fat),
    source: 'meal',
    originalItem: meal,
  };
};
