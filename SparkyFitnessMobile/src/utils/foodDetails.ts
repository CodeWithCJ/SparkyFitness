import { FOOD_VARIANT_NUTRIENT_FIELDS } from '@workspace/shared';
import type { ExternalFoodVariant } from '../types/externalFoods';
import type { FoodInfoItem } from '../types/foodInfo';
import type { FoodVariantDetail } from '../types/foods';
import type {
  EquivalentUnit,
  FoodUnitVariant,
} from '../types/foodUnitVariants';
import type { CreateFoodVariantPayload } from '../services/api/foodsApi';
import { formatLocalizedNumber } from '../localization';
import i18n from '../localization/i18n';
import {
  formatLocalizedUnitQuantity,
  localizeFoodUnit,
} from './foodUnitLocalization';

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
  /** Unit text for the quantity row, including a known metric equivalent. */
  quantityUnitLabel?: string;
  /** Full label for the secondary “per serving” row. */
  perServingLabel?: string;
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

/**
 * Locale-aware variant of formatPreciseNumber for presentation-only labels.
 * Keeps the same rounding and trailing-zero trimming but renders the decimal
 * separator per the active application locale (EN "1.5" / PL "1,5"). Grouping
 * is disabled so serving quantities keep compact presentation.
 */
function formatPreciseNumberForDisplay(value: number, decimals: number): string {
  const rounded = roundTo(value, decimals);
  if (Object.is(rounded, -0)) {
    return '0';
  }
  return formatLocalizedNumber(rounded, {
    maximumFractionDigits: decimals,
    useGrouping: false,
  });
}

export function formatServingSizeForDisplay(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return formatPreciseNumberForDisplay(value, 4);
}

export function formatCaloriesForDisplay(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) >= 1) {
    return formatLocalizedNumber(Math.round(value), { useGrouping: false });
  }
  return formatPreciseNumberForDisplay(value, 4);
}

export function formatMacroForDisplay(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) >= 1) {
    return formatPreciseNumberForDisplay(value, 1);
  }
  return formatPreciseNumberForDisplay(value, 4);
}


export function convertEquivalentVariantQuantity(
  quantity: number,
  fromServingSize: number | undefined,
  toServingSize: number | undefined,
): number | undefined {
  if (
    !Number.isFinite(quantity) ||
    !Number.isFinite(fromServingSize) ||
    !Number.isFinite(toServingSize) ||
    !fromServingSize ||
    !toServingSize
  ) {
    return undefined;
  }

  return (quantity / fromServingSize) * toServingSize;
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

/**
 * Locale-neutral formatters for editable numeric inputs / persisted values.
 * These intentionally keep a dot decimal separator so the numeric parser stays
 * deterministic regardless of the app language. Use the *ForDisplay variants
 * for pure presentation labels.
 */
export function formatServingSizeDisplay(value: number): string {
  if (!Number.isFinite(value)) return '0';
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
  return desc.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Check if a variant represents a standard reference serving (100g or 100ml). */
export function isReferenceServing(
  serving_size: number,
  serving_unit: string,
): boolean {
  return (
    serving_size === 100 && (serving_unit === 'g' || serving_unit === 'ml')
  );
}

/** Check if a variant has a meaningful serving description beyond just a numeric unit string. */
export function hasMeaningfulDescription(
  serving_description?: string | null,
): boolean {
  return !!(
    serving_description &&
    serving_description.length > 0 &&
    !/^\d+(\.\d+)?\s*(g|ml|kg|l)$/i.test(serving_description)
  );
}

/**
 * Compare two variants by their persisted serving identity. Provider variants
 * can share size/unit while differing by an explicit metric package weight.
 */
export function isSameVariant(a: ServingIdentity, b: ServingIdentity): boolean {
  if (servingVariantKey(a) === servingVariantKey(b)) return true;
  if (baseServingVariantKey(a) !== baseServingVariantKey(b)) return false;
  return !(
    hasDistinctMetricServingContext(a) && hasDistinctMetricServingContext(b)
  );
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

export function unitVariantToDisplayValues(
  variant: FoodUnitVariant,
): FoodDisplayValues {
  return {
    servingSize: variant.serving_size,
    servingUnit: variant.serving_unit,
    servingDescription: variant.serving_description ?? undefined,
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
    serving_description: item.servingDescription,
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

export function localVariantToUnitVariant(
  variant: FoodVariantDetail,
): FoodUnitVariant {
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

/**
 * Prefer a provider's named serving for display while preserving reference
 * servings such as 100g/100ml as selectable/importable variants.
 *
 * When `preferredServing` is given (the serving the user already saw, e.g. on
 * the tapped search-result row), a variant matching it wins over the named
 * serving heuristic so the detail view shows the serving that was promised.
 */
export function selectDisplayVariant<
  T extends {
    serving_size: number;
    serving_unit: string;
  },
>(
  defaultVariant: T,
  variants?: T[],
  preferredServing?: ServingIdentity,
): { displayVariant: T; orderedVariants: T[] | undefined } {
  if (!variants) {
    return { displayVariant: defaultVariant, orderedVariants: undefined };
  }

  const requestedVariant = preferredServing
    ? [defaultVariant, ...variants].find(variant =>
        isSameVariant(variant, preferredServing),
      )
    : undefined;

  const namedVariant =
    isReferenceServing(defaultVariant.serving_size, defaultVariant.serving_unit)
      ? variants.find(variant => !isMetricUnit(variant.serving_unit))
      : undefined;

  const displayVariant = requestedVariant ?? namedVariant ?? defaultVariant;
  const orderedVariants = [displayVariant];
  if (!isSameVariant(displayVariant, defaultVariant)) {
    orderedVariants.push(defaultVariant);
  }
  for (const variant of variants) {
    if (!orderedVariants.some(existing => isSameVariant(existing, variant))) {
      orderedVariants.push(variant);
    }
  }

  return { displayVariant, orderedVariants };
}

export function formatServingUnit(unit: string | undefined | null): string {
  if (!unit) return '';
  return /[._]/.test(unit) ? formatServingDescription(unit) : unit;
}

function isMetricUnit(unit: string | undefined | null): boolean {
  const normalized = unit?.trim().toLowerCase();
  return normalized === 'g' || normalized === 'ml';
}

function findMetricEquivalent(
  equivalents?: EquivalentUnit[],
): EquivalentUnit | undefined {
  return equivalents?.find(eq => isMetricUnit(eq.serving_unit));
}

export function formatVariantServingLabel(
  values: Pick<
    FoodDisplayValues,
    'servingSize' | 'servingUnit' | 'calories' | 'servingDescription'
  >,
  equivalents?: EquivalentUnit[],
): string {
  if (hasMeaningfulDescription(values.servingDescription)) {
    return formatServingDescription(values.servingDescription ?? '');
  }

  const servingLabel = formatLocalizedUnitQuantity(values.servingSize, values.servingUnit, i18n.t);
  const metricEquivalent = !isMetricUnit(values.servingUnit)
    ? findMetricEquivalent(equivalents)
    : undefined;

  if (metricEquivalent) {
    return `${servingLabel} (${formatLocalizedUnitQuantity(metricEquivalent.serving_size, metricEquivalent.serving_unit, i18n.t)})`;
  }

  return servingLabel;
}

/**
 * Format the unit beside the editable quantity. Unlike picker labels this omits
 * the redundant serving count, but retains a known metric equivalent.
 */
export function formatQuantityUnitLabel(
  values: Pick<FoodDisplayValues, 'servingUnit' | 'servingDescription'>,
  equivalents?: EquivalentUnit[],
): string {
  if (hasMeaningfulDescription(values.servingDescription)) {
    return formatServingDescription(values.servingDescription ?? '');
  }

  const metricEquivalent = !isMetricUnit(values.servingUnit)
    ? findMetricEquivalent(equivalents)
    : undefined;
  const unitLabel = localizeFoodUnit(formatServingUnit(values.servingUnit), i18n.t);

  if (metricEquivalent) {
    return `${unitLabel} (${formatLocalizedUnitQuantity(metricEquivalent.serving_size, metricEquivalent.serving_unit, i18n.t)})`;
  }

  return unitLabel;
}

export function formatVariantLabel(
  values: Pick<
    FoodDisplayValues,
    'servingSize' | 'servingUnit' | 'calories' | 'servingDescription'
  >,
  equivalents?: EquivalentUnit[],
): string {
  const servingLabel = formatVariantServingLabel(values, equivalents);
  return `${servingLabel} (${formatCaloriesForDisplay(values.calories)} cal)`;
}

function getVisibleLocalVariantGroups(groups: VariantGroup[]) {
  return groups;
}

export function resolveLocalPickerVariantId(
  variants: FoodVariantDetail[] | undefined,
  selectedVariantId?: string,
): string | undefined {
  if (!selectedVariantId) return undefined;

  const localVariants = variants ?? [];
  const groups = groupEquivalentVariants(localVariants);
  const visibleGroups = getVisibleLocalVariantGroups(groups);
  const selectedGroup = groups.find(
    ({ base, equivalents }) =>
      base.id === selectedVariantId ||
      equivalents.some((equivalent) => equivalent.id === selectedVariantId),
  );

  if (selectedGroup && visibleGroups.includes(selectedGroup)) {
    return selectedGroup.base.id;
  }

  return undefined;
}

export function buildLocalVariantOptions(
  variants?: FoodVariantDetail[],
): FoodVariantOptionData[] {
  const localVariants = variants ?? [];

  return getVisibleLocalVariantGroups(groupEquivalentVariants(localVariants)).map(({ base, equivalents }) => {
    const values = {
      servingSize: base.serving_size,
      servingUnit: base.serving_unit,
      calories: base.calories,
    };

    return {
      id: base.id,
      label: formatVariantLabel(values, equivalents),
      quantityUnitLabel: formatQuantityUnitLabel(values, equivalents),
      perServingLabel: formatVariantServingLabel(values, equivalents),
      servingSize: base.serving_size,
      servingUnit: base.serving_unit,
      calories: base.calories,
      protein: base.protein,
      carbs: base.carbs,
      fat: base.fat,
      fiber: base.dietary_fiber,
      saturatedFat: base.saturated_fat,
      sodium: base.sodium,
      sugars: base.sugars,
      transFat: base.trans_fat,
      potassium: base.potassium,
      calcium: base.calcium,
      iron: base.iron,
      cholesterol: base.cholesterol,
      vitaminA: base.vitamin_a,
      vitaminC: base.vitamin_c,
    };
  });
}

type ExternalOptionVariant = FoodVariantDetail & {
  serving_description?: string | null;
};

export function buildExternalVariantOptions(
  variants?: ExternalFoodVariant[],
): FoodVariantOptionData[] {
  const optionVariants: ExternalOptionVariant[] = (variants ?? []).map((variant, index) => ({
    ...variant,
    id: `ext-${index}`,
    food_id: '',
    dietary_fiber: variant.fiber,
  }));

  return groupEquivalentVariants(optionVariants).map(({ base, equivalents }) => {
    const servingDescription = base.serving_description ?? undefined;
    const values = {
      servingSize: base.serving_size,
      servingUnit: base.serving_unit,
      servingDescription,
      calories: base.calories,
    };
    return {
      id: base.id,
      label: formatVariantLabel(values, equivalents),
      quantityUnitLabel: formatQuantityUnitLabel(values, equivalents),
      perServingLabel: formatVariantServingLabel(values, equivalents),
      servingDescription,
      servingSize: base.serving_size,
      servingUnit: base.serving_unit,
      calories: base.calories,
      protein: base.protein,
      carbs: base.carbs,
      fat: base.fat,
      fiber: base.dietary_fiber,
      saturatedFat: base.saturated_fat,
      sodium: base.sodium,
      sugars: base.sugars,
      transFat: base.trans_fat,
      potassium: base.potassium,
      calcium: base.calcium,
      iron: base.iron,
      cholesterol: base.cholesterol,
      vitaminA: base.vitamin_a,
      vitaminC: base.vitamin_c,
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

export interface ServingIdentity {
  serving_size?: number;
  serving_unit?: string;
  serving_description?: string | null;
}

const METRIC_SERVING_UNIT_PATTERN = /^(?:g|kg|ml|l)$/i;
const METRIC_CONTEXT_PATTERN =
  /\(\s*(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l)\s*\)\s*$/i;

export function toPersistedServingUnit(variant: ServingIdentity): string {
  const servingUnit = variant.serving_unit?.trim() || 'serving';
  if (
    METRIC_SERVING_UNIT_PATTERN.test(servingUnit) ||
    METRIC_CONTEXT_PATTERN.test(servingUnit)
  ) {
    return servingUnit;
  }

  const metricContext = variant.serving_description
    ?.trim()
    .match(METRIC_CONTEXT_PATTERN);
  if (!metricContext) return servingUnit;

  const [, amount, unit] = metricContext;
  return `${servingUnit} (${amount} ${unit.toLowerCase()})`;
}

function normalizeServingUnitKey(servingUnit: string): string {
  return servingUnit.replace(/\s+/g, '').toLowerCase();
}

export function servingVariantKey(variant: ServingIdentity): string {
  return `${variant.serving_size}:${normalizeServingUnitKey(
    toPersistedServingUnit(variant),
  )}`;
}

export function baseServingVariantKey(variant: ServingIdentity): string {
  const servingUnit = toPersistedServingUnit(variant).replace(
    /\s+\(\s*\d+(?:[.,]\d+)?\s*(?:g|kg|ml|l)\s*\)\s*$/i,
    '',
  );
  return `${variant.serving_size}:${normalizeServingUnitKey(servingUnit)}`;
}

export function hasDistinctMetricServingContext(
  variant: ServingIdentity,
): boolean {
  return servingVariantKey(variant) !== baseServingVariantKey(variant);
}

export function buildCreateFoodVariantInput(
  variant: FoodUnitVariant,
): Omit<CreateFoodVariantPayload, 'food_id'> {
  return {
    serving_size: variant.serving_size,
    serving_unit: toPersistedServingUnit(variant),
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
      localVariantOptions.find(variant => variant.id === selectedVariantId) ??
      externalVariantOptions.find(variant => variant.id === selectedVariantId);

    if (selectedVariant) {
      return selectedVariant;
    }
  }

  return foodInfoToDisplayValues(item);
}

type NutritionLike = Partial<
  Record<(typeof FOOD_VARIANT_NUTRIENT_FIELDS)[number], unknown>
> & {
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

export interface VariantGroup<T extends FoodVariantDetail = FoodVariantDetail> {
  base: T;
  equivalents: EquivalentUnit[];
}

function hasConflictingMetricServingContext(
  a: ServingIdentity,
  b: ServingIdentity,
): boolean {
  return (
    hasDistinctMetricServingContext(a) &&
    hasDistinctMetricServingContext(b) &&
    baseServingVariantKey(a) === baseServingVariantKey(b) &&
    servingVariantKey(a) !== servingVariantKey(b)
  );
}

export function groupEquivalentVariants<
  T extends FoodVariantDetail & ServingIdentity = FoodVariantDetail,
>(variants: T[] | undefined): VariantGroup<T>[] {
  const groups: VariantGroup<T>[] = [];
  for (const variant of variants ?? []) {
    const match = groups.find(
      g =>
        nutritionMatches(g.base, variant) &&
        !hasConflictingMetricServingContext(g.base, variant),
    );
    if (match) {
      // Prefer a context-rich persisted serving over its matching legacy row so
      // variants such as package (200 g) and package (400 g) remain separate
      // visible options even when the undecorated package row was loaded first.
      const shouldPromoteMetricContext =
        !hasDistinctMetricServingContext(match.base) &&
        hasDistinctMetricServingContext(variant) &&
        baseServingVariantKey(match.base) === baseServingVariantKey(variant);

      // Also promote a non-reference variant when a reference serving
      // (100g/100ml) was matched first — the picker option should carry the
      // user-friendly name (e.g. "piece") with the metric equivalent inline,
      // not the other way around. Without this swap, the reference variant
      // becomes the lone base option and the selected non-reference variant
      // is pushed into a fallback, producing a duplicate "gram entry" in the
      // picker alongside the correct serving.
      if (
        shouldPromoteMetricContext ||
        (isReferenceServing(
          match.base.serving_size,
          match.base.serving_unit,
        ) &&
          !isReferenceServing(variant.serving_size, variant.serving_unit))
      ) {
        match.equivalents.push(toEquivalentUnit(match.base));
        match.base = variant;
      } else {
        match.equivalents.push(toEquivalentUnit(variant));
      }
    } else {
      // Fallback: the same persisted serving identity with different nutrition
      // (for example provider rounding) is still one picker option.
      const sizeMatch = groups.find(g => isSameVariant(g.base, variant));
      if (sizeMatch) {
        const shouldPromoteMetricContext =
          !hasDistinctMetricServingContext(sizeMatch.base) &&
          hasDistinctMetricServingContext(variant) &&
          baseServingVariantKey(sizeMatch.base) ===
            baseServingVariantKey(variant);
        if (shouldPromoteMetricContext) {
          sizeMatch.equivalents.push(toEquivalentUnit(sizeMatch.base));
          sizeMatch.base = variant;
        } else {
          sizeMatch.equivalents.push(toEquivalentUnit(variant));
        }
      } else {
        groups.push({ base: variant, equivalents: [] });
      }
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
  if (coerceNumber(current.serving_size) !== coerceNumber(desired.serving_size))
    return false;
  if ((current.serving_unit ?? '') !== (desired.serving_unit ?? ''))
    return false;
  if ((current.glycemic_index ?? '') !== (desired.glycemic_index ?? ''))
    return false;
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
    .filter(row => !desiredIds.has(row.id))
    .map(row => row.id);

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
    servingDescription: displayValues.servingDescription,
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

/**
 * Steps a serving quantity by half-serving increments. An off-grid value snaps
 * to the nearest boundary in the tap direction (so odd typed values land back
 * on the grid); an on-grid value steps by one increment. Never drops below one
 * increment.
 */
export function nextQuantity(quantity: number, delta: number, step: number): number {
  const increment = step * 0.5 || 1;
  const boundary =
    delta > 0
      ? Math.ceil(quantity / increment) * increment
      : Math.floor(quantity / increment) * increment;
  const next = boundary !== quantity ? boundary : quantity + delta * increment;
  return Math.max(increment, next);
}

