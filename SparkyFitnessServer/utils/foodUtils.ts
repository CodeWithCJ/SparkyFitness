import { log } from '../config/logging.js';
import {
  normalizeNutrientName,
  convertNutrientAmount,
} from '@workspace/shared';

export interface FoodVariantWithProviderNutrients {
  provider_nutrients?: Record<string, number | unknown>;
  provider_nutrient_units?: Record<string, string>;
  custom_nutrients?: Record<string, number>;
  [key: string]: unknown;
}

export interface FoodWithProviderNutrients {
  default_variant?: FoodVariantWithProviderNutrients;
  variants?: FoodVariantWithProviderNutrients[];
  [key: string]: unknown;
}

interface CustomNutrientDef {
  name: string;
  unit?: string | null;
  aliases?: string[] | null;
}

export interface AliasTarget {
  name: string;
  unit?: string | null;
}

/**
 * Build a lookup from normalized nutrient name/alias -> the custom nutrient's
 * canonical `name` and chosen `unit`. Each nutrient's own name is included as an
 * implicit alias. Matching is case/punctuation-insensitive via
 * normalizeNutrientName. On a duplicate normalized key across nutrients, the
 * first definition wins and a warning is logged.
 */
function buildAliasIndex(defs: CustomNutrientDef[]): Map<string, AliasTarget> {
  const index = new Map<string, AliasTarget>();
  if (!Array.isArray(defs)) return index;
  for (const def of defs) {
    if (!def || typeof def.name !== 'string') continue;
    const keys = [def.name, ...(Array.isArray(def.aliases) ? def.aliases : [])];
    for (const key of keys) {
      if (typeof key !== 'string') continue;
      const normalized = normalizeNutrientName(key);
      if (!normalized) continue;
      const existing = index.get(normalized);
      if (existing !== undefined) {
        if (existing.name !== def.name) {
          log(
            'warn',
            `Custom nutrient alias "${key}" (normalized "${normalized}") maps to both "${existing.name}" and "${def.name}"; keeping "${existing.name}".`
          );
        }
        continue;
      }
      index.set(normalized, { name: def.name, unit: def.unit });
    }
  }
  return index;
}

/**
 * Populate each mapped provider food's custom_nutrients by exact-matching the
 * (normalized) provider nutrient labels it carries on `provider_nutrients`
 * against the user's alias index. Mutates the foods in place. `provider_nutrients`
 * is left on the food so the client can show users the exact field names a
 * provider reports; it is import-only and never persisted (no DB column).
 */
function applyCustomNutrientMatches(
  foods: FoodWithProviderNutrients[],
  aliasIndex: Map<string, AliasTarget>
): FoodWithProviderNutrients[] {
  if (!Array.isArray(foods) || aliasIndex.size === 0) return foods;
  for (const food of foods) {
    if (!food) continue;
    // default_variant is often the same object reference as an entry in
    // variants[]; dedupe by reference so we only process each variant once.
    const variants = new Set<FoodVariantWithProviderNutrients>(
      [food.default_variant, ...(food.variants || [])].filter(
        (v): v is FoodVariantWithProviderNutrients => !!v
      )
    );
    for (const variant of variants) {
      const raw = variant.provider_nutrients;
      if (!raw || typeof raw !== 'object') continue;
      const units = variant.provider_nutrient_units;
      for (const [rawKey, rawValue] of Object.entries(raw)) {
        const target = aliasIndex.get(normalizeNutrientName(rawKey));
        if (!target) continue;
        const value =
          typeof rawValue === 'number' ? rawValue : Number(rawValue);
        if (!Number.isFinite(value) || value <= 0) continue;
        // Convert the provider's amount into the custom nutrient's unit when
        // both are known and compatible; otherwise store the raw value.
        const providerUnit =
          units && typeof units === 'object' ? units[rawKey] : undefined;
        const converted = convertNutrientAmount(
          value,
          providerUnit,
          target.unit ?? undefined
        );
        const finalValue =
          converted === null ? value : Math.round(converted * 1e6) / 1e6;
        variant.custom_nutrients = {
          ...(variant.custom_nutrients || {}),
          [target.name]: finalValue,
        };
      }
    }
  }
  return foods;
}

function sanitizeCustomNutrients(
  customNutrients: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!customNutrients || typeof customNutrients !== 'object') return {};
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(customNutrients)) {
    // Only keep non-empty, non-null, and non-whitespace-only string values
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      sanitized[key] = value;
    }
  }
  return sanitized;
}
const SERVING_UNIT_ALIASES = {
  g: 'g',
  grm: 'g',
  gm: 'g',
  gram: 'g',
  grams: 'g',
  ml: 'ml',
  milliliter: 'ml',
  millilitre: 'ml',
  milliliters: 'ml',
  millilitres: 'ml',
  oz: 'oz',
  ounce: 'oz',
  ounces: 'oz',
  tbsp: 'tbsp',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  tsp: 'tsp',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  cup: 'cup',
  cups: 'cup',
  slice: 'slice',
  slices: 'slice',
  portion: 'serving',
  portions: 'serving',
  servings: 'serving',
  serving: 'serving',
  container: 'container',
  containers: 'container',
  package: 'packet',
  packages: 'packet',
  piece: 'piece',
  pieces: 'piece',
  kg: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  mg: 'mg',
  milligram: 'mg',
  milligrams: 'mg',
  lb: 'lb',
  pound: 'lb',
  pounds: 'lb',
  l: 'l',
  liter: 'l',
  litre: 'l',
  liters: 'l',
  litres: 'l',
  can: 'can',
  cans: 'can',
  bottle: 'bottle',
  bottles: 'bottle',
  packet: 'packet',
  packets: 'packet',
  bag: 'bag',
  bags: 'bag',
  bowl: 'bowl',
  bowls: 'bowl',
  plate: 'plate',
  plates: 'plate',
  handful: 'handful',
  handfuls: 'handful',
  scoop: 'scoop',
  scoops: 'scoop',
  bar: 'bar',
  bars: 'bar',
  stick: 'stick',
  sticks: 'stick',
  whole: 'whole',
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeServingUnit(unit: any) {
  if (!unit) return 'g';
  // Strip anything in parentheses at the end: "serving (237g)" -> "serving"
  const clean = unit
    .replace(/\s*\([^)]*\)\s*$/i, '')
    .toLowerCase()
    .trim();
  // Try exact match first
  // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
  if (SERVING_UNIT_ALIASES[clean]) return SERVING_UNIT_ALIASES[clean];
  // Try first word match (e.g., "cup pieces" -> "cup")
  const firstWord = clean.split(/\s+/)[0];
  // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
  if (SERVING_UNIT_ALIASES[firstWord]) return SERVING_UNIT_ALIASES[firstWord];
  return clean;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeBarcode(barcode: any) {
  if (typeof barcode === 'string' && barcode.length === 12) {
    return '0' + barcode;
  }
  return barcode;
}
export { sanitizeCustomNutrients };
export { normalizeServingUnit };
export { normalizeBarcode };
export { buildAliasIndex };
export { applyCustomNutrientMatches };
export default {
  sanitizeCustomNutrients,
  normalizeServingUnit,
  normalizeBarcode,
  buildAliasIndex,
  applyCustomNutrientMatches,
};
