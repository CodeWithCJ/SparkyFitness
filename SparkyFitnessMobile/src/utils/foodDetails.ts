import { FOOD_VARIANT_NUTRIENT_FIELDS } from '@workspace/shared';
import type { ExternalFoodVariant } from '../types/externalFoods';
import type { FoodInfoItem } from '../types/foodInfo';
import type { FoodVariantDetail } from '../types/foods';
import type { EquivalentUnit, FoodUnitVariant } from '../types/foodUnitVariants';
import type { CreateFoodVariantPayload } from '../services/api/foodsApi';

export interface FoodDisplayValues {
  servingSize: number;
  servingUnit: string;
  servingDescription?: string;
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
}

export interface FoodVariantOptionData extends FoodDisplayValues {
  id: string;
  label: string;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function trimTrailingZeros(value: string): string {
  return value.replace(/\.?0+$/, '');
}

function formatPreciseNumber(value: number, decimals: number): string {
  const rounded = roundTo(value, decimals);
  if (Object.is(rounded, -0)) {
    return '0';
  }

  return trimTrailingZeros(rounded.toFixed(decimals));
}

export function formatServingSizeDisplay(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return formatPreciseNumber(value, 4);
}

export function formatCaloriesDisplay(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) >= 1) {
    return String(Math.round(value));
  }
  return formatPreciseNumber(value, 4);
}

export function formatMacroDisplay(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) >= 1) {
    return formatPreciseNumber(value, 1);
  }
  return formatPreciseNumber(value, 4);
}

export function formatFoodFormNumber(
  value: number | undefined,
  kind: 'servingSize' | 'calories' | 'nutrient' = 'nutrient',
): string {
  if (value == null) return '';

  switch (kind) {
    case 'servingSize':
      return formatServingSizeDisplay(value);
    case 'calories':
      return formatCaloriesDisplay(value);
    case 'nutrient':
    default:
      return formatMacroDisplay(value);
  }
}

export function formatServingDescription(desc: string): string {
  return desc
    .replace(/\./g, ' ')
    .replace(/_/g, ' ')
    .trim()
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export function foodInfoToDisplayValues(item: FoodInfoItem): FoodDisplayValues {
  return {
    servingSize: item.servingSize,
    servingUnit: item.servingUnit,
    servingDescription: item.servingDescription,
    calories: item.calories,
    protein: item.protein,
    carbs: item.carbs,
    fat: item.fat,
    fiber: item.fiber,
    saturatedFat: item.saturatedFat,
    sodium: item.sodium,
    sugars: item.sugars,
    transFat: item.transFat,
    potassium: item.potassium,
    calcium: item.calcium,
    iron: item.iron,
    cholesterol: item.cholesterol,
    vitaminA: item.vitaminA,
    vitaminC: item.vitaminC,
  };
}

export function unitVariantToDisplayValues(variant: FoodUnitVariant): FoodDisplayValues {
  return {
    servingSize: variant.serving_size,
    servingUnit: variant.serving_unit,
    servingDescription: variant.serving_description,
    calories: variant.calories,
    protein: variant.protein,
    carbs: variant.carbs,
    fat: variant.fat,
    fiber: variant.dietary_fiber,
    saturatedFat: variant.saturated_fat,
    sodium: variant.sodium,
    sugars: variant.sugars,
    transFat: variant.trans_fat,
    potassium: variant.potassium,
    calcium: variant.calcium,
    iron: variant.iron,
    cholesterol: variant.cholesterol,
    vitaminA: variant.vitamin_a,
    vitaminC: variant.vitamin_c,
  };
}

export function foodInfoToUnitVariant(item: FoodInfoItem): FoodUnitVariant {
  return {
    id: item.variantId,
    serving_size: item.servingSize,
    serving_unit: item.servingUnit,
    calories: item.calories,
    protein: item.protein,
    carbs: item.carbs,
    fat: item.fat,
    saturated_fat: item.saturatedFat,
    trans_fat: item.transFat,
    cholesterol: item.cholesterol,
    sodium: item.sodium,
    potassium: item.potassium,
    dietary_fiber: item.fiber,
    sugars: item.sugars,
    vitamin_a: item.vitaminA,
    vitamin_c: item.vitaminC,
    calcium: item.calcium,
    iron: item.iron,
    custom_nutrients: item.customNutrients ?? null,
  };
}

export function localVariantToUnitVariant(variant: FoodVariantDetail): FoodUnitVariant {
  return {
    id: variant.id,
    food_id: variant.food_id,
    is_default: variant.is_default,
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
    glycemic_index: variant.glycemic_index,
    custom_nutrients: variant.custom_nutrients ?? null,
    // Forward AI provenance so the sheet's `selectedVariant.source` check
    // recognizes AI variants on reopen — without this, an AI cup variant
    // loaded from the server would look like a regular math source and
    // sibling volume units would all show green checkmarks.
    source: variant.source,
    ai_confidence: variant.ai_confidence,
  };
}

export function externalVariantToUnitVariant(
  variant: ExternalFoodVariant,
  id?: string,
): FoodUnitVariant {
  return {
    id,
    serving_size: variant.serving_size,
    serving_unit: variant.serving_unit,
    serving_description: variant.serving_description,
    calories: variant.calories,
    protein: variant.protein,
    carbs: variant.carbs,
    fat: variant.fat,
    saturated_fat: variant.saturated_fat,
    trans_fat: variant.trans_fat,
    cholesterol: variant.cholesterol,
    sodium: variant.sodium,
    potassium: variant.potassium,
    dietary_fiber: variant.fiber,
    sugars: variant.sugars,
    vitamin_a: variant.vitamin_a,
    vitamin_c: variant.vitamin_c,
    calcium: variant.calcium,
    iron: variant.iron,
  };
}

export function formatServingUnit(unit: string): string {
  return /[._]/.test(unit) ? formatServingDescription(unit) : unit;
}

export function formatVariantLabel(values: Pick<FoodDisplayValues, 'servingSize' | 'servingUnit' | 'calories'>): string {
  return `${formatServingSizeDisplay(values.servingSize)} ${formatServingUnit(values.servingUnit)} (${formatCaloriesDisplay(values.calories)} cal)`;
}

export function buildLocalVariantOptions(
  variants?: FoodVariantDetail[],
): FoodVariantOptionData[] {
  return (variants ?? []).map((variant) => ({
    id: variant.id,
    label: formatVariantLabel({
      servingSize: variant.serving_size,
      servingUnit: variant.serving_unit,
      calories: variant.calories,
    }),
    servingSize: variant.serving_size,
    servingUnit: variant.serving_unit,
    calories: variant.calories,
    protein: variant.protein,
    carbs: variant.carbs,
    fat: variant.fat,
    fiber: variant.dietary_fiber,
    saturatedFat: variant.saturated_fat,
    sodium: variant.sodium,
    sugars: variant.sugars,
    transFat: variant.trans_fat,
    potassium: variant.potassium,
    calcium: variant.calcium,
    iron: variant.iron,
    cholesterol: variant.cholesterol,
    vitaminA: variant.vitamin_a,
    vitaminC: variant.vitamin_c,
  }));
}

export function buildExternalVariantOptions(
  variants?: ExternalFoodVariant[],
): FoodVariantOptionData[] {
  return (variants ?? []).map((variant, index) => {
    const desc = variant.serving_description || '';
    const cleanDesc = desc.replace(/\./g, ' ').replace(/_/g, ' ').trim();
    const formatted = cleanDesc
      .split(/\s+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
    return {
      id: `ext-${index}`,
      label: `${formatted} (${variant.calories} cal)`,
      servingDescription: variant.serving_description,
      servingSize: variant.serving_size,
      servingUnit: variant.serving_unit,
      calories: variant.calories,
      protein: variant.protein,
      carbs: variant.carbs,
      fat: variant.fat,
      fiber: variant.fiber,
      saturatedFat: variant.saturated_fat,
      sodium: variant.sodium,
      sugars: variant.sugars,
      transFat: variant.trans_fat,
      potassium: variant.potassium,
      calcium: variant.calcium,
      iron: variant.iron,
      cholesterol: variant.cholesterol,
      vitaminA: variant.vitamin_a,
      vitaminC: variant.vitamin_c,
    };
  });
}

export function buildLocalUnitVariants(
  variants?: FoodVariantDetail[],
): FoodUnitVariant[] {
  return (variants ?? []).map(localVariantToUnitVariant);
}

export function buildExternalUnitVariants(
  variants?: ExternalFoodVariant[],
): FoodUnitVariant[] {
  return (variants ?? []).map((variant, index) =>
    externalVariantToUnitVariant(variant, `ext-${index}`),
  );
}

export function buildCreateFoodVariantInput(
  variant: FoodUnitVariant,
): Omit<CreateFoodVariantPayload, 'food_id'> {
  return {
    serving_size: variant.serving_size,
    serving_unit: variant.serving_unit,
    calories: variant.calories,
    protein: variant.protein,
    carbs: variant.carbs,
    fat: variant.fat,
    dietary_fiber: variant.dietary_fiber,
    saturated_fat: variant.saturated_fat,
    polyunsaturated_fat: variant.polyunsaturated_fat,
    monounsaturated_fat: variant.monounsaturated_fat,
    sodium: variant.sodium,
    sugars: variant.sugars,
    trans_fat: variant.trans_fat,
    potassium: variant.potassium,
    calcium: variant.calcium,
    iron: variant.iron,
    cholesterol: variant.cholesterol,
    vitamin_a: variant.vitamin_a,
    vitamin_c: variant.vitamin_c,
    glycemic_index: variant.glycemic_index,
    custom_nutrients: variant.custom_nutrients ?? undefined,
    // AI-Assisted Unit Conversions provenance — when the variant originated
    // from an AI estimate (deferred draft from FoodUnitSelectorSheet), preserve
    // source/ai_confidence so the persisted row carries the provenance +
    // badge surfaces on the picker next time.
    source: variant.source,
    ai_confidence: variant.ai_confidence,
  };
}

export function buildCreateFoodVariantPayload(
  foodId: string,
  variant: FoodUnitVariant,
): CreateFoodVariantPayload {
  return {
    food_id: foodId,
    ...buildCreateFoodVariantInput(variant),
  };
}

export function resolveFoodDisplayValues({
  item,
  selectedVariantId,
  localVariantOptions = [],
  externalVariantOptions = [],
}: {
  item: FoodInfoItem;
  selectedVariantId?: string;
  localVariantOptions?: FoodVariantOptionData[];
  externalVariantOptions?: FoodVariantOptionData[];
}): FoodDisplayValues {
  if (selectedVariantId) {
    const selectedVariant =
      localVariantOptions.find((variant) => variant.id === selectedVariantId)
      ?? externalVariantOptions.find((variant) => variant.id === selectedVariantId);

    if (selectedVariant) {
      return selectedVariant;
    }
  }

  return foodInfoToDisplayValues(item);
}

type NutritionLike = Partial<Record<(typeof FOOD_VARIANT_NUTRIENT_FIELDS)[number], unknown>> & {
  custom_nutrients?: Record<string, string | number> | null;
};

function coerceNumber(value: unknown): number {
  if (value == null || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function nutritionMatches(a: NutritionLike, b: NutritionLike): boolean {
  for (const field of FOOD_VARIANT_NUTRIENT_FIELDS) {
    if (coerceNumber(a[field]) !== coerceNumber(b[field])) return false;
  }
  const ac = a.custom_nutrients ?? {};
  const bc = b.custom_nutrients ?? {};
  const keys = new Set([...Object.keys(ac), ...Object.keys(bc)]);
  for (const key of keys) {
    if (coerceNumber(ac[key]) !== coerceNumber(bc[key])) return false;
  }
  return true;
}

export function toEquivalentUnit(variant: FoodVariantDetail): EquivalentUnit {
  return {
    id: variant.id,
    serving_size: variant.serving_size,
    serving_unit: variant.serving_unit,
  };
}

export interface VariantGroup {
  base: FoodVariantDetail;
  equivalents: EquivalentUnit[];
}

export function groupEquivalentVariants(
  variants: FoodVariantDetail[] | undefined,
): VariantGroup[] {
  const groups: VariantGroup[] = [];
  for (const variant of variants ?? []) {
    const match = groups.find((g) => nutritionMatches(g.base, variant));
    if (match) {
      match.equivalents.push(toEquivalentUnit(variant));
    } else {
      groups.push({ base: variant, equivalents: [] });
    }
  }
  return groups;
}

type DesiredSiblingRow = Partial<FoodVariantDetail> & { id?: string };

export interface DiffSiblingRowsResult {
  creates: DesiredSiblingRow[];
  updates: (DesiredSiblingRow & { id: string })[];
  deletes: string[];
}

function rowsEqual(
  current: FoodVariantDetail,
  desired: DesiredSiblingRow,
): boolean {
  if (coerceNumber(current.serving_size) !== coerceNumber(desired.serving_size)) return false;
  if ((current.serving_unit ?? '') !== (desired.serving_unit ?? '')) return false;
  if ((current.glycemic_index ?? '') !== (desired.glycemic_index ?? '')) return false;
  return nutritionMatches(current, desired);
}

export function diffSiblingRows(
  current: FoodVariantDetail[],
  desired: DesiredSiblingRow[],
): DiffSiblingRowsResult {
  const currentById = new Map<string, FoodVariantDetail>();
  for (const row of current) {
    currentById.set(row.id, row);
  }

  const creates: DesiredSiblingRow[] = [];
  const updates: (DesiredSiblingRow & { id: string })[] = [];
  const desiredIds = new Set<string>();

  for (const row of desired) {
    if (!row.id) {
      creates.push(row);
      continue;
    }
    desiredIds.add(row.id);
    const currentRow = currentById.get(row.id);
    if (!currentRow) {
      creates.push(row);
      continue;
    }
    if (rowsEqual(currentRow, row)) continue;
    updates.push(row as DesiredSiblingRow & { id: string });
  }

  const deletes = current
    .filter((row) => !desiredIds.has(row.id))
    .map((row) => row.id);

  return { creates, updates, deletes };
}

export function applyDisplayValuesToFoodInfo(
  item: FoodInfoItem,
  displayValues: FoodDisplayValues,
  variantId?: string,
): FoodInfoItem {
  return {
    ...item,
    servingSize: displayValues.servingSize,
    servingUnit: displayValues.servingUnit,
    calories: displayValues.calories,
    protein: displayValues.protein,
    carbs: displayValues.carbs,
    fat: displayValues.fat,
    fiber: displayValues.fiber,
    saturatedFat: displayValues.saturatedFat,
    sodium: displayValues.sodium,
    sugars: displayValues.sugars,
    transFat: displayValues.transFat,
    potassium: displayValues.potassium,
    calcium: displayValues.calcium,
    iron: displayValues.iron,
    cholesterol: displayValues.cholesterol,
    vitaminA: displayValues.vitaminA,
    vitaminC: displayValues.vitaminC,
    variantId,
  };
}
