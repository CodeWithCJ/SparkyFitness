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
  transFat?: number;
  potassium?: number;
  calcium?: number;
  iron?: number;
  cholesterol?: number;
  vitaminA?: number;
  vitaminC?: number;
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
  fiber: item.default_variant.dietary_fiber,
  saturatedFat: item.default_variant.saturated_fat,
  sodium: item.default_variant.sodium,
  sugars: item.default_variant.sugars,
  transFat: item.default_variant.trans_fat,
  potassium: item.default_variant.potassium,
  calcium: item.default_variant.calcium,
  iron: item.default_variant.iron,
  cholesterol: item.default_variant.cholesterol,
  vitaminA: item.default_variant.vitamin_a,
  vitaminC: item.default_variant.vitamin_c,
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
  transFat: item.trans_fat,
  potassium: item.potassium,
  calcium: item.calcium,
  iron: item.iron,
  cholesterol: item.cholesterol,
  vitaminA: item.vitamin_a,
  vitaminC: item.vitamin_c,
  externalVariants: item.variants,
  source: 'external',
  originalItem: item,
});

export const mealToFoodInfo = (meal: Meal): FoodInfoItem => {
  const scale = (food: Meal['foods'][number]) =>
    food.serving_size === 0 ? 0 : food.quantity / food.serving_size;

  const sumField = (field: keyof Meal['foods'][number]) =>
    meal.foods.reduce((sum, f) => {
      const v = f[field];
      return typeof v === 'number' ? sum + v * scale(f) : sum;
    }, 0);

  const calories = sumField('calories');
  const protein = sumField('protein');
  const carbs = sumField('carbs');
  const fat = sumField('fat');

  const hasField = (field: keyof Meal['foods'][number]) =>
    meal.foods.some((f) => f[field] != null);

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
    transFat: hasField('trans_fat') ? Math.round(sumField('trans_fat')) : undefined,
    potassium: hasField('potassium') ? Math.round(sumField('potassium')) : undefined,
    calcium: hasField('calcium') ? Math.round(sumField('calcium')) : undefined,
    iron: hasField('iron') ? Math.round(sumField('iron')) : undefined,
    cholesterol: hasField('cholesterol') ? Math.round(sumField('cholesterol')) : undefined,
    vitaminA: hasField('vitamin_a') ? Math.round(sumField('vitamin_a')) : undefined,
    vitaminC: hasField('vitamin_c') ? Math.round(sumField('vitamin_c')) : undefined,
    source: 'meal',
    originalItem: meal,
  };
};
