import { apiCall } from '../api';

import type { Food, FoodVariant } from '@/types/food';

export const loadFoodVariants = async (
  foodId: string
): Promise<FoodVariant[]> => {
  return apiCall(`/foods/food-variants?food_id=${foodId}`, {
    method: 'GET',
    suppress404Toast: true, // Suppress toast for 404 errors, return empty array instead
  });
};

export const saveFood = async (
  foodData: Food,
  variants: FoodVariant[],
  userId: string,
  foodId?: string
): Promise<Food> => {
  let savedFood: Food;

  if (foodId) {
    // Update existing food
    savedFood = await apiCall(`/foods/${foodId}`, {
      method: 'PUT',
      body: {
        ...foodData,
        provider_external_id: foodData.provider_external_id,
        provider_type: foodData.provider_type,
      },
    });

    // Fetch existing variants to determine what to update/delete/insert
    const existingVariants = await loadFoodVariants(foodId);

    const variantsToCreate = variants.filter((v) => !v.id);
    const variantsToUpdate = variants.filter((v) => v.id);
    const variantsToDelete = existingVariants.filter(
      (ev) => !variants.some((v) => v.id === ev.id)
    );

    // Update existing variants
    for (const variant of variantsToUpdate) {
      await apiCall(`/foods/food-variants/${variant.id}`, {
        method: 'PUT',
        body: {
          food_id: foodId, // Ensure food_id is passed for authorization/validation
          serving_size: variant.serving_size,
          serving_unit: variant.serving_unit,
          calories: variant.calories,
          protein: variant.protein,
          carbs: variant.carbs,
          fat: variant.fat,
          saturated_fat: variant.saturated_fat,
          polyunsaturated_fat: variant.polyunsaturated_fat,
          monounsaturated_fat: variant.monounsaturated_fat,
          trans_fat: variant.trans_fat,
          cholesterol: variant.cholesterol,
          sodium: variant.sodium,
          potassium: variant.potassium,
          dietary_fiber: variant.dietary_fiber,
          sugars: variant.sugars,
          vitamin_a: variant.vitamin_a,
          vitamin_c: variant.vitamin_c,
          calcium: variant.calcium,
          iron: variant.iron,
          is_default: variant.is_default || false, // Pass is_default flag
          glycemic_index: variant.glycemic_index,
          custom_nutrients: variant.custom_nutrients || {}, // Include custom nutrients
        },
      });
    }

    // Create new variants
    if (variantsToCreate.length > 0) {
      const newVariantsData = variantsToCreate.map((variant) => ({
        food_id: foodId,
        serving_size: variant.serving_size,
        serving_unit: variant.serving_unit,
        calories: variant.calories,
        protein: variant.protein,
        carbs: variant.carbs,
        fat: variant.fat,
        saturated_fat: variant.saturated_fat,
        polyunsaturated_fat: variant.polyunsaturated_fat,
        monounsaturated_fat: variant.monounsaturated_fat,
        trans_fat: variant.trans_fat,
        cholesterol: variant.cholesterol,
        sodium: variant.sodium,
        potassium: variant.potassium,
        dietary_fiber: variant.dietary_fiber,
        sugars: variant.sugars,
        vitamin_a: variant.vitamin_a,
        vitamin_c: variant.vitamin_c,
        calcium: variant.calcium,
        iron: variant.iron,
        is_default: variant.is_default || false, // Pass is_default flag
        glycemic_index: variant.glycemic_index,
        custom_nutrients: variant.custom_nutrients || {}, // Include custom nutrients
      }));
      await apiCall('/foods/food-variants/bulk', {
        method: 'POST',
        body: newVariantsData,
      });
    }

    // Delete removed variants
    for (const variantToDelete of variantsToDelete) {
      await apiCall(`/foods/food-variants/${variantToDelete.id}`, {
        method: 'DELETE',
      });
    }
  } else {
    // Create new food
    // The first variant in the array is always the primary unit for the food
    const primaryVariant = variants[0];
    const foodToCreate = {
      name: foodData.name,
      brand: foodData.brand,
      user_id: userId,
      is_custom: true,
      is_quick_food: foodData.is_quick_food || false,
      provider_external_id: foodData.provider_external_id,
      provider_type: foodData.provider_type,
      // Pass primary variant details to createFood, which will create the default variant
      serving_size: primaryVariant.serving_size,
      serving_unit: primaryVariant.serving_unit,
      calories: primaryVariant.calories,
      protein: primaryVariant.protein,
      carbs: primaryVariant.carbs,
      fat: primaryVariant.fat,
      saturated_fat: primaryVariant.saturated_fat,
      polyunsaturated_fat: primaryVariant.polyunsaturated_fat,
      monounsaturated_fat: primaryVariant.monounsaturated_fat,
      trans_fat: primaryVariant.trans_fat,
      cholesterol: primaryVariant.cholesterol,
      sodium: primaryVariant.sodium,
      potassium: primaryVariant.potassium,
      dietary_fiber: primaryVariant.dietary_fiber,
      sugars: primaryVariant.sugars,
      vitamin_a: primaryVariant.vitamin_a,
      vitamin_c: primaryVariant.vitamin_c,
      calcium: primaryVariant.calcium,
      iron: primaryVariant.iron,
      is_default: true, // Explicitly mark as default for new food creation
      glycemic_index: primaryVariant.glycemic_index,
      custom_nutrients: primaryVariant.custom_nutrients || {}, // Include custom nutrients
    };

    savedFood = await apiCall('/foods', {
      method: 'POST',
      body: foodToCreate,
    });

    // Insert additional variants (starting from the second variant)
    const additionalVariantsToInsert = variants.slice(1).map((variant) => ({
      food_id: savedFood.id,
      serving_size: variant.serving_size,
      serving_unit: variant.serving_unit,
      calories: variant.calories,
      protein: variant.protein,
      carbs: variant.carbs,
      fat: variant.fat,
      saturated_fat: variant.saturated_fat,
      polyunsaturated_fat: variant.polyunsaturated_fat,
      monounsaturated_fat: variant.monounsaturated_fat,
      trans_fat: variant.trans_fat,
      cholesterol: variant.cholesterol,
      sodium: variant.sodium,
      potassium: variant.potassium,
      dietary_fiber: variant.dietary_fiber,
      sugars: variant.sugars,
      vitamin_a: variant.vitamin_a,
      vitamin_c: variant.vitamin_c,
      calcium: variant.calcium,
      iron: variant.iron,
      is_default: false, // Explicitly mark as not default for additional variants
      glycemic_index: variant.glycemic_index,
      custom_nutrients: variant.custom_nutrients || {}, // Include custom nutrients
    }));

    if (additionalVariantsToInsert.length > 0) {
      await apiCall('/foods/food-variants/bulk', {
        method: 'POST',
        body: additionalVariantsToInsert,
      });
    }
  }
  return savedFood;
};
