import { Alert } from 'react-native';
import i18n from '../../localization/i18n';
import Toast from 'react-native-toast-message';
import type { QueryClient } from '@tanstack/react-query';
import type { FoodFormData } from '../../components/FoodForm';
import { parseOptional } from '../../types/foodInfo';
import {
  updateFoodVariant,
  updateFood,
} from '../../services/api/foodsApi';
import { foodVariantsQueryKey, foodsQueryKey } from '../../hooks/queryKeys';
import type { FoodVariantDetail } from '../../types/foods';
import type {
  EquivalentUnit,
  FoodUnitSelectionResult,
  FoodUnitVariant,
} from '../../types/foodUnitVariants';
import { parseDecimalInput } from '../../utils/numericInput';

export const FOOD_VARIANT_FIELDS: (keyof FoodFormData)[] = [
  'servingSize',
  'servingUnit',
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

const FOOD_METADATA_FIELDS: (keyof FoodFormData)[] = ['name', 'brand'];
const NUMERIC_FOOD_FIELDS = new Set<keyof FoodFormData>([
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
]);

export function isBlankEquivalent(eq: EquivalentUnit): boolean {
  return !eq.serving_unit || eq.serving_size <= 0;
}

export function equivalentsDiffer(a: EquivalentUnit[], b: EquivalentUnit[]): boolean {
  const left = a.filter((eq) => !isBlankEquivalent(eq));
  const right = b.filter((eq) => !isBlankEquivalent(eq));
  if (left.length !== right.length) return true;
  for (let i = 0; i < left.length; i++) {
    if ((left[i].id ?? '') !== (right[i].id ?? '')) return true;
    if (Number(left[i].serving_size) !== Number(right[i].serving_size)) return true;
    if ((left[i].serving_unit ?? '') !== (right[i].serving_unit ?? '')) return true;
  }
  return false;
}

export function confirmDiscardEquivalents(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      i18n.t('foodFormPersistence.discardTitle', { defaultValue: 'Discard unsaved equivalents?' }),
      i18n.t('foodFormPersistence.discardMessage', { defaultValue: 'You have unsaved equivalent sizes. Discard them to continue?' }),
      [
        { text: i18n.t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel', onPress: () => resolve(false) },
        { text: i18n.t('foodFormPersistence.discard', { defaultValue: 'Discard' }), style: 'destructive', onPress: () => resolve(true) },
      ],
      { onDismiss: () => resolve(false) },
    );
  });
}

export type SyncPastEntriesChoice = 'none' | 'nutrition' | 'nutrition-and-photos';

/**
 * Asks whether to rewrite past diary entries with the food's new values.
 *
 * Entries store a snapshot from when they were logged, so editing a food
 * leaves history untouched by default — a logged meal records what was eaten.
 * Mirrors the web "Sync Past Entries?" dialog, including asking only after the
 * save has succeeded, so the food is saved either way.
 *
 * `photosChanged` splits the prompt in two. When the save left the food's
 * photos alone there is nothing to decide about them, so the dialog stays a
 * plain yes/no about nutrition. When photos did change, the user gets the
 * third option, because the two photo outcomes are genuinely different:
 *
 *  - `nutrition-and-photos` forces the new photo onto every past entry,
 *    INCLUDING entries where the user picked their own photo in the diary.
 *    Those replaced photos are deleted server-side; this is not reversible.
 *  - `nutrition` rewrites nutrition only, so every entry keeps the photo it
 *    is showing today, custom or inherited.
 */
export function confirmSyncPastEntries(
  photosChanged = false,
): Promise<SyncPastEntriesChoice> {
  if (!photosChanged) {
    return new Promise((resolve) => {
      Alert.alert(
        i18n.t('foodFormPersistence.updateTitle', { defaultValue: 'Update past entries?' }),
        i18n.t('foodFormPersistence.updateMessage', { defaultValue: "Your library food is saved. Do you also want to update past diary entries for this food with the new nutrition? Entries you don't update keep their original values." }),
        [
          // "Update"/"Don't Update" rather than two parallel "… past entries"
          // labels: the negation lands on the first word, so the options are
          // told apart at a glance instead of by diffing similar phrases.
          { text: i18n.t('foodFormPersistence.dontUpdate', { defaultValue: "Don't Update" }), style: 'cancel', onPress: () => resolve('none') },
          // Photos did not change, so syncing them would be a no-op — ask for
          // the nutrition-only sync and leave every entry's photo alone.
          { text: i18n.t('foodFormPersistence.update', { defaultValue: 'Update' }), onPress: () => resolve('nutrition') },
        ],
        { onDismiss: () => resolve('none') },
      );
    });
  }

  return new Promise((resolve) => {
    Alert.alert(
      i18n.t('foodFormPersistence.updateTitle', { defaultValue: 'Update past entries?' }),
      i18n.t('foodFormPersistence.updatePhotosMessage', { defaultValue: 'Your library food is saved. What should past diary entries for this food use?' }),
      [
        { text: i18n.t('foodFormPersistence.dontUpdate', { defaultValue: "Don't Update" }), style: 'cancel', onPress: () => resolve('none') },
        { text: i18n.t('foodFormPersistence.updateNutrition', { defaultValue: 'Update nutrition only' }), onPress: () => resolve('nutrition') },
        // Destructive: this is the one path that discards a photo the user
        // chose for a specific diary entry, so it is styled as such.
        {
          text: i18n.t('foodFormPersistence.updateNutritionPhotos', { defaultValue: 'Update nutrition & photos' }),
          style: 'destructive',
          onPress: () => resolve('nutrition-and-photos'),
        },
      ],
      { onDismiss: () => resolve('none') },
    );
  });
}

export function confirmVariantOverwrite(unitLabel: string): Promise<'overwrite' | 'new' | 'cancel'> {
  return new Promise((resolve) => {
    Alert.alert(
      i18n.t('foodFormPersistence.saveNutritionTitle', { defaultValue: 'Save nutrition' }),
      i18n.t('foodFormPersistence.overwriteMessage', { defaultValue: '"{{unitLabel}}" is already a saved variant. Do you want to update it with these values, or save as a new variant?', unitLabel }),
      [
        { text: i18n.t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel', onPress: () => resolve('cancel') },
        { text: i18n.t('foodFormPersistence.saveAsNew', { defaultValue: 'Save as new' }), onPress: () => resolve('new') },
        { text: i18n.t('foodFormPersistence.updateExisting', { defaultValue: 'Update existing' }), style: 'destructive', onPress: () => resolve('overwrite') },
      ],
      { onDismiss: () => resolve('cancel') },
    );
  });
}

export function validateFoodForm(data: FoodFormData): boolean {
  if (!data.name.trim()) {
    Toast.show({ type: 'error', text1: i18n.t('foodFormPersistence.missingName', { defaultValue: 'Missing name' }), text2: i18n.t('foodFormPersistence.nameRequired', { defaultValue: 'Please enter a food name.' }) });
    return false;
  }

  const servingSize = parseDecimalInput(data.servingSize);
  if (!Number.isFinite(servingSize) || servingSize <= 0) {
    Toast.show({ type: 'error', text1: i18n.t('foodFormPersistence.invalidServingSize', { defaultValue: 'Invalid serving size' }), text2: i18n.t('foodFormPersistence.servingSizeRequired', { defaultValue: 'Serving size must be greater than zero.' }) });
    return false;
  }

  return true;
}

export function hasFoodFormChanges(
  initialValues: Partial<FoodFormData>,
  data: FoodFormData,
  fields: (keyof FoodFormData)[],
): boolean {
  return fields.some((field) => {
    if (!NUMERIC_FOOD_FIELDS.has(field)) {
      return (initialValues[field] ?? '') !== data[field];
    }

    const initialValue = initialValues[field] ?? '';
    const nextValue = data[field];
    if (initialValue === '' && nextValue === '') {
      return false;
    }
    if (initialValue === '' || nextValue === '') {
      return true;
    }

    return parseDecimalInput(initialValue) !== parseDecimalInput(nextValue);
  });
}

export function invalidateFoodCaches(queryClient: QueryClient, foodId: string) {
  void queryClient.invalidateQueries({ queryKey: foodVariantsQueryKey(foodId), refetchType: 'all' });
  void queryClient.invalidateQueries({ queryKey: foodsQueryKey, refetchType: 'all' });
  void queryClient.invalidateQueries({ queryKey: ['foodsLibrary'], refetchType: 'all' });
  void queryClient.invalidateQueries({ queryKey: ['foodSearch'], refetchType: 'all' });
}

function updateFoodVariantCache(queryClient: QueryClient, updatedVariant: FoodVariantDetail) {
  queryClient.setQueryData<FoodVariantDetail[] | undefined>(
    foodVariantsQueryKey(updatedVariant.food_id),
    (current) => {
      if (!current) return current;
      return current.map((variant) => (
        variant.id === updatedVariant.id ? updatedVariant : variant
      ));
    },
  );
}

export function buildVariantFromFormData(
  data: FoodFormData,
  selection?: FoodUnitSelectionResult | null,
): FoodUnitVariant {
  return {
    ...selection?.variant,
    serving_size: parseDecimalInput(data.servingSize) || 0,
    serving_unit: data.servingUnit || 'serving',
    calories: parseDecimalInput(data.calories) || 0,
    protein: parseDecimalInput(data.protein) || 0,
    carbs: parseDecimalInput(data.carbs) || 0,
    fat: parseDecimalInput(data.fat) || 0,
    dietary_fiber: parseOptional(data.fiber),
    saturated_fat: parseOptional(data.saturatedFat),
    sodium: parseOptional(data.sodium),
    sugars: parseOptional(data.sugars),
    trans_fat: parseOptional(data.transFat),
    potassium: parseOptional(data.potassium),
    calcium: parseOptional(data.calcium),
    iron: parseOptional(data.iron),
    cholesterol: parseOptional(data.cholesterol),
    vitamin_a: parseOptional(data.vitaminA),
    vitamin_c: parseOptional(data.vitaminC),
  };
}

export function buildVariantFromInitialValues(
  initialValues?: Partial<FoodFormData>,
  id?: string,
): FoodUnitVariant | null {
  if (!initialValues) {
    return null;
  }

  const servingSize = parseDecimalInput(initialValues.servingSize ?? '');
  const servingUnit = initialValues.servingUnit?.trim();

  if (!servingSize || !servingUnit) {
    return null;
  }

  return {
    id,
    serving_size: servingSize,
    serving_unit: servingUnit,
    calories: parseDecimalInput(initialValues.calories ?? '') || 0,
    protein: parseDecimalInput(initialValues.protein ?? '') || 0,
    carbs: parseDecimalInput(initialValues.carbs ?? '') || 0,
    fat: parseDecimalInput(initialValues.fat ?? '') || 0,
    dietary_fiber: parseOptional(initialValues.fiber ?? ''),
    saturated_fat: parseOptional(initialValues.saturatedFat ?? ''),
    sodium: parseOptional(initialValues.sodium ?? ''),
    sugars: parseOptional(initialValues.sugars ?? ''),
    trans_fat: parseOptional(initialValues.transFat ?? ''),
    potassium: parseOptional(initialValues.potassium ?? ''),
    calcium: parseOptional(initialValues.calcium ?? ''),
    iron: parseOptional(initialValues.iron ?? ''),
    cholesterol: parseOptional(initialValues.cholesterol ?? ''),
    vitamin_a: parseOptional(initialValues.vitaminA ?? ''),
    vitamin_c: parseOptional(initialValues.vitaminC ?? ''),
  };
}

export function buildFormValuesFromVariant(
  variant: FoodUnitVariant,
): Partial<FoodFormData> {
  return {
    servingSize: String(variant.serving_size),
    servingUnit: variant.serving_unit,
    calories: String(variant.calories),
    protein: String(variant.protein),
    carbs: String(variant.carbs),
    fat: String(variant.fat),
    fiber: variant.dietary_fiber != null ? String(variant.dietary_fiber) : '',
    saturatedFat:
      variant.saturated_fat != null ? String(variant.saturated_fat) : '',
    transFat: variant.trans_fat != null ? String(variant.trans_fat) : '',
    sodium: variant.sodium != null ? String(variant.sodium) : '',
    sugars: variant.sugars != null ? String(variant.sugars) : '',
    potassium: variant.potassium != null ? String(variant.potassium) : '',
    cholesterol:
      variant.cholesterol != null ? String(variant.cholesterol) : '',
    calcium: variant.calcium != null ? String(variant.calcium) : '',
    iron: variant.iron != null ? String(variant.iron) : '',
    vitaminA: variant.vitamin_a != null ? String(variant.vitamin_a) : '',
    vitaminC: variant.vitamin_c != null ? String(variant.vitamin_c) : '',
  };
}

export async function persistFoodEdits({
  queryClient,
  foodId,
  variantId,
  customNutrients,
  data,
  variantInitialValues,
  foodInitialValues,
}: {
  queryClient: QueryClient;
  foodId: string;
  variantId: string;
  customNutrients?: Record<string, string | number> | null;
  data: FoodFormData;
  variantInitialValues: Partial<FoodFormData>;
  foodInitialValues: Partial<FoodFormData>;
}): Promise<boolean> {
  const shouldUpdateVariant = hasFoodFormChanges(
    variantInitialValues,
    data,
    FOOD_VARIANT_FIELDS,
  );
  const shouldUpdateFood = hasFoodFormChanges(
    foodInitialValues,
    data,
    FOOD_METADATA_FIELDS,
  );

  if (!shouldUpdateVariant && !shouldUpdateFood) {
    return false;
  }

  const updates: Promise<unknown>[] = [];

  if (shouldUpdateVariant) {
    updates.push(
      updateFoodVariant(variantId, {
        food_id: foodId,
        serving_size: parseDecimalInput(data.servingSize) || 0,
        serving_unit: data.servingUnit || 'serving',
        calories: parseDecimalInput(data.calories) || 0,
        protein: parseDecimalInput(data.protein) || 0,
        carbs: parseDecimalInput(data.carbs) || 0,
        fat: parseDecimalInput(data.fat) || 0,
        dietary_fiber: parseOptional(data.fiber),
        saturated_fat: parseOptional(data.saturatedFat),
        sodium: parseOptional(data.sodium),
        sugars: parseOptional(data.sugars),
        trans_fat: parseOptional(data.transFat),
        potassium: parseOptional(data.potassium),
        calcium: parseOptional(data.calcium),
        iron: parseOptional(data.iron),
        cholesterol: parseOptional(data.cholesterol),
        vitamin_a: parseOptional(data.vitaminA),
        vitamin_c: parseOptional(data.vitaminC),
        custom_nutrients: customNutrients || undefined,
      }).then((updatedVariant) => {
        updateFoodVariantCache(queryClient, updatedVariant);
        return updatedVariant;
      }),
    );
  }

  if (shouldUpdateFood) {
    const foodPayload: { name?: string; brand?: string } = {};
    if (data.name !== foodInitialValues.name) foodPayload.name = data.name;
    if (data.brand !== foodInitialValues.brand) foodPayload.brand = data.brand || '';
    updates.push(updateFood(foodId, foodPayload));
  }

  await Promise.all(updates);
  invalidateFoodCaches(queryClient, foodId);
  return true;
}

export async function persistFoodMetadataEdits({
  queryClient,
  foodId,
  data,
  initialValues,
}: {
  queryClient: QueryClient;
  foodId: string;
  data: FoodFormData;
  initialValues: Partial<FoodFormData>;
}): Promise<boolean> {
  const shouldUpdateFood = hasFoodFormChanges(initialValues, data, FOOD_METADATA_FIELDS);

  if (!shouldUpdateFood) {
    return false;
  }

  const foodPayload: { name?: string; brand?: string } = {};
  if (data.name !== initialValues.name) foodPayload.name = data.name;
  if (data.brand !== initialValues.brand) foodPayload.brand = data.brand || '';

  await updateFood(foodId, foodPayload);
  invalidateFoodCaches(queryClient, foodId);
  return true;
}
