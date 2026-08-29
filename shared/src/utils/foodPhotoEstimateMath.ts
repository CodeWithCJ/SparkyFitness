/**
 * Nutrition maths for the AI food-photo estimate flow, shared by the server,
 * the web client, and the mobile app.
 *
 * ## Why the basis is branded
 *
 * There are two incompatible ways to express the same nutrition numbers here,
 * and mixing them produces answers that look completely plausible while being
 * wrong by whatever the portion size happens to be:
 *
 *  - **Portion basis** — what the vision model returns. "This 145 g piece of
 *    chicken is 289 kcal." The numbers describe one specific portion.
 *  - **Per-100 g basis** — what `foods` / `food_variants` store. "Chicken thigh
 *    is 199 kcal per 100 g." The numbers describe a fixed reference weight.
 *
 * A plain `{ calories_kcal: number, ... }` cannot tell the two apart, so the
 * compiler happily lets you write the model's per-portion output straight into
 * a food row as if it were per-100 g. Nothing throws, no test fails unless it
 * happens to cover that exact path, and the user's diary is silently wrong.
 *
 * So the basis is carried in the type via a phantom brand. `PortionMacros` and
 * `Per100gMacros` are structurally identical at runtime (zero cost — the brand
 * is a `declare`d symbol that never exists) but are *not* assignable to each
 * other. Converting requires calling `toPer100g` / `fromPer100g`, which are the
 * only functions that can produce the other brand, and both of them demand the
 * gram weight to convert with. Getting the direction wrong is a compile error
 * in every consuming package rather than a bug report three weeks later.
 */

import { parseSearchTerms } from "./search.ts";

// --------------------------------------------------------------------------
// Basis brands
// --------------------------------------------------------------------------

declare const NUTRITION_BASIS: unique symbol;

/** The nutrition the photo estimator works in. Basis-agnostic on its own. */
export interface EstimateMacros {
  calories_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;

  // Micronutrients. Always present on the type (zero when unknown) so the
  // scaling maths can treat every nutrient identically; the wire schema is
  // what makes them optional for old clients and forgetful models.
  saturated_fat_g: number;
  polyunsaturated_fat_g: number;
  monounsaturated_fat_g: number;
  trans_fat_g: number;
  cholesterol_mg: number;
  sodium_mg: number;
  potassium_mg: number;
  calcium_mg: number;
  iron_mg: number;
  vitamin_a_mcg: number;
  vitamin_c_mg: number;
}

/** Macros describing one specific portion — what the vision model returns. */
export type PortionMacros = EstimateMacros & {
  readonly [NUTRITION_BASIS]: "portion";
};

/** Macros per 100 g — what `food_variants` rows store. */
export type Per100gMacros = EstimateMacros & {
  readonly [NUTRITION_BASIS]: "per100g";
};

/**
 * Every nutrient the estimator carries, in one list. Scaling, summing and
 * rounding all iterate this, so a nutrient added to `EstimateMacros` is
 * automatically carried through the maths — a row rescaled from 145 g to 290 g
 * whose sodium did not move would log twice the food with the same salt.
 */
export const ESTIMATE_MACRO_KEYS = [
  "calories_kcal",
  "protein_g",
  "carbs_g",
  "fat_g",
  "fiber_g",
  "sugar_g",
  "saturated_fat_g",
  "polyunsaturated_fat_g",
  "monounsaturated_fat_g",
  "trans_fat_g",
  "cholesterol_mg",
  "sodium_mg",
  "potassium_mg",
  "calcium_mg",
  "iron_mg",
  "vitamin_a_mcg",
  "vitamin_c_mg",
] as const satisfies readonly (keyof EstimateMacros)[];

/** Reference weight every stored food variant this flow creates is based on. */
export const PER_100G_BASIS_GRAMS = 100;

// --------------------------------------------------------------------------
// Entry points into the branded world
// --------------------------------------------------------------------------

function pickMacros(source: Partial<EstimateMacros>): EstimateMacros {
  const picked = {} as EstimateMacros;
  for (const key of ESTIMATE_MACRO_KEYS) {
    picked[key] = finite(source[key]);
  }
  return picked;
}

function finite(value: number | undefined | null): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

/**
 * Tag a raw macro bag as portion-basis. Use this exactly once per value, at the
 * boundary where the vision model's response enters the code — never to silence
 * a type error further in.
 */
export function asPortionMacros(
  source: Partial<EstimateMacros>,
): PortionMacros {
  return pickMacros(source) as PortionMacros;
}

/**
 * Tag a raw macro bag as per-100 g. Use this only when reading a stored
 * `food_variants` row whose `serving_size` is 100 and `serving_unit` is `g`.
 */
export function asPer100gMacros(
  source: Partial<EstimateMacros>,
): Per100gMacros {
  return pickMacros(source) as Per100gMacros;
}

/** Strip the brand for serialization. */
export function unbrandMacros(
  macros: PortionMacros | Per100gMacros,
): EstimateMacros {
  return pickMacros(macros);
}

// --------------------------------------------------------------------------
// Basis conversion — the only bridges between the two brands
// --------------------------------------------------------------------------

function scaleBy(macros: EstimateMacros, factor: number): EstimateMacros {
  const scaled = {} as EstimateMacros;
  for (const key of ESTIMATE_MACRO_KEYS) {
    scaled[key] = macros[key] * factor;
  }
  return scaled;
}

/**
 * Portion basis -> per-100 g basis.
 *
 * `estimatedGrams` is the weight the portion macros describe. A non-positive or
 * non-finite weight makes the conversion meaningless (it would divide by zero
 * and produce Infinity, which then serializes as `null` and lands in the
 * database as a silent zero), so it returns null and the caller must decide.
 */
export function toPer100g(
  portion: PortionMacros,
  estimatedGrams: number,
): Per100gMacros | null {
  if (!Number.isFinite(estimatedGrams) || estimatedGrams <= 0) return null;
  return scaleBy(
    portion,
    PER_100G_BASIS_GRAMS / estimatedGrams,
  ) as Per100gMacros;
}

/** Per-100 g basis -> portion basis for a given weight. */
export function fromPer100g(
  per100g: Per100gMacros,
  grams: number,
): PortionMacros | null {
  if (!Number.isFinite(grams) || grams <= 0) return null;
  return scaleBy(per100g, grams / PER_100G_BASIS_GRAMS) as PortionMacros;
}

// --------------------------------------------------------------------------
// Within-basis maths
// --------------------------------------------------------------------------

/**
 * Rescale portion macros when the user corrects the gram weight. Stays on the
 * portion basis, so it composes with the editor without a round trip.
 */
export function scalePortionMacros(
  macros: PortionMacros,
  fromGrams: number,
  toGrams: number,
): PortionMacros | null {
  if (!Number.isFinite(fromGrams) || fromGrams <= 0) return null;
  if (!Number.isFinite(toGrams) || toGrams < 0) return null;
  return scaleBy(macros, toGrams / fromGrams) as PortionMacros;
}

/**
 * Scale a stored variant's nutrition to a target gram weight, going through the
 * per-100 g basis. `variantServingSize` / `variantServingUnit` come from the
 * `food_variants` row; a variant measured in a non-weight unit (cups, slices)
 * cannot be gram-scaled and returns null so the UI can hide the affordance
 * rather than invent a number.
 */
export function scaleVariantToGrams(
  // Partial because this is an entry point from a database row: a variant that
  // records no sodium simply omits it, and `pickMacros` coerces it to 0.
  variantMacros: Partial<EstimateMacros>,
  variantServingSize: number,
  variantServingUnit: string,
  targetGrams: number,
  getGramFactor: (from: string, to: string) => number | null,
): PortionMacros | null {
  if (!Number.isFinite(variantServingSize) || variantServingSize <= 0)
    return null;
  if (!Number.isFinite(targetGrams) || targetGrams <= 0) return null;

  // `getConversionFactor(from, to)` returns how many `from` units make one
  // `to` unit, so this is variantServingUnits-per-gram — NOT grams per unit.
  // Hence the division below: 4 oz / (1/28.3495) = 113.4 g.
  const factor = getGramFactor(variantServingUnit, "g");
  if (factor === null || !Number.isFinite(factor) || factor <= 0) return null;

  const servingGrams = variantServingSize / factor;
  if (!Number.isFinite(servingGrams) || servingGrams <= 0) return null;

  return scaleBy(
    pickMacros(variantMacros),
    targetGrams / servingGrams
  ) as PortionMacros;
}

/** Sum portion macros across the ingredient rows. Totals are always derived. */
export function sumPortionMacros(
  items: readonly { macros: PortionMacros }[],
): PortionMacros {
  const total = pickMacros({});
  for (const item of items) {
    for (const key of ESTIMATE_MACRO_KEYS) {
      total[key] += item.macros[key];
    }
  }
  return total as PortionMacros;
}

/** Sum the gram weights of the ingredient rows. */
export function sumGrams(
  items: readonly { estimated_grams: number }[],
): number {
  return items.reduce(
    (sum, item) =>
      sum +
      (Number.isFinite(item.estimated_grams) && item.estimated_grams > 0
        ? item.estimated_grams
        : 0),
    0,
  );
}

/** Round macros for display/storage without accumulating drift mid-pipeline. */
export function roundMacros<T extends PortionMacros | Per100gMacros>(
  macros: T,
  decimals = 2,
): T {
  const factor = 10 ** decimals;
  const rounded: EstimateMacros = { ...unbrandMacros(macros) };
  for (const key of ESTIMATE_MACRO_KEYS) {
    rounded[key] = Math.round(rounded[key] * factor) / factor;
  }
  return rounded as T;
}

/**
 * Round for storage or the wire, and drop the brand in one step.
 *
 * Every caller that serializes macros — the vision tool, the matcher, both
 * clients — wants exactly this pair, and doing it by hand invites rounding one
 * value and forgetting the other. Basis is preserved by the argument: pass
 * per-100 g in, get per-100 g out.
 */
export function roundedMacros(
  macros: PortionMacros | Per100gMacros,
  decimals = 2,
): EstimateMacros {
  return unbrandMacros(roundMacros(macros, decimals));
}

/**
 * Nutrition in the column names `foods` / `food_variants` use.
 *
 * The estimate speaks in gram-suffixed names (`fiber_g`, `sodium_mg`); the
 * database speaks in column names (`dietary_fiber`, `sodium`). Both clients
 * build the same create-food payload, so the translation lives here rather
 * than being written out twice and drifting the next time a nutrient is added.
 */
export interface FoodNutritionFields {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  dietary_fiber: number;
  sugars: number;
  saturated_fat: number;
  polyunsaturated_fat: number;
  monounsaturated_fat: number;
  trans_fat: number;
  cholesterol: number;
  sodium: number;
  potassium: number;
  calcium: number;
  iron: number;
  vitamin_a: number;
  vitamin_c: number;
}

/** Round for storage and rename onto the food columns in one step. */
export function toFoodNutritionFields(
  macros: PortionMacros | Per100gMacros,
  decimals = 2,
): FoodNutritionFields {
  const m = roundedMacros(macros, decimals);
  return {
    calories: m.calories_kcal,
    protein: m.protein_g,
    carbs: m.carbs_g,
    fat: m.fat_g,
    dietary_fiber: m.fiber_g,
    sugars: m.sugar_g,
    saturated_fat: m.saturated_fat_g,
    polyunsaturated_fat: m.polyunsaturated_fat_g,
    monounsaturated_fat: m.monounsaturated_fat_g,
    trans_fat: m.trans_fat_g,
    cholesterol: m.cholesterol_mg,
    sodium: m.sodium_mg,
    potassium: m.potassium_mg,
    calcium: m.calcium_mg,
    iron: m.iron_mg,
    vitamin_a: m.vitamin_a_mcg,
    vitamin_c: m.vitamin_c_mg,
  };
}

// --------------------------------------------------------------------------
// Food matching score
// --------------------------------------------------------------------------

export type FoodMatchSource = "exact_name" | "token_overlap" | "recent_usage";

export interface FoodMatchScoreInput {
  /** Name of the candidate food row. */
  candidateName: string;
  /** Candidate brand, if any — a branded row matching a generic query is weaker. */
  candidateBrand?: string | null;
  /** The term the ingredient was searched with (canonical_name, else name). */
  queryName: string;
  /** True when the candidate belongs to the user rather than the public pool. */
  isOwnFood: boolean;
  /** Days since the user last logged the candidate; null when never logged. */
  daysSinceLastUsed?: number | null;
}

export interface FoodMatchScore {
  score: number;
  source: FoodMatchSource;
}

/** Below this, no match is attached to an item at all. */
export const MATCH_MIN_SCORE = 0.55;
/** At or above this, the UI may preselect the match on open. */
export const MATCH_PRESELECT_SCORE = 0.9;

function normalizeForMatch(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/\s+/g, " ").trim();
}

/**
 * Rank a candidate food against an AI-detected ingredient name.
 *
 * Deliberately pure and DB-free: SQL does cheap candidate retrieval (ILIKE),
 * this does the ranking, so the ranking has unit tests with no database and can
 * be tuned without touching a query.
 */
export function scoreFoodMatch(input: FoodMatchScoreInput): FoodMatchScore {
  const candidate = normalizeForMatch(input.candidateName);
  const query = normalizeForMatch(input.queryName);

  if (!candidate || !query) return { score: 0, source: "token_overlap" };

  let source: FoodMatchSource = "token_overlap";
  let base: number;

  if (candidate === query) {
    base = 1;
    source = "exact_name";
  } else {
    const candidateTokens = new Set(parseSearchTerms(candidate));
    const queryTokens = new Set(parseSearchTerms(query));
    if (candidateTokens.size === 0 || queryTokens.size === 0) {
      return { score: 0, source };
    }

    let shared = 0;
    for (const token of queryTokens) {
      if (candidateTokens.has(token)) shared += 1;
    }
    if (shared === 0) return { score: 0, source };

    // F1 of recall-over-the-query and precision-over-the-candidate.
    //
    // Recall alone is not enough: "rice" is fully recalled by "Rice Krispies
    // Treats Cereal Bar", which is emphatically not rice. The harmonic mean
    // collapses when either side is weak, so a short query swallowed by a long
    // candidate scores low (1 and 0.2 -> 0.33) while a query that covers most
    // of a similarly-sized candidate scores high (1 and 0.67 -> 0.80).
    const queryRecall = shared / queryTokens.size;
    const candidatePrecision = shared / candidateTokens.size;
    base =
      (2 * queryRecall * candidatePrecision) /
      (queryRecall + candidatePrecision);

    // A candidate that starts with the whole query is usually the right food
    // wearing an adjective ("Chicken Thigh, Roasted"). Gated on the candidate
    // not being much longer than the query, because otherwise this is exactly
    // the "Rice Krispies" trap again — prefix match, wrong food.
    if (
      candidate.startsWith(query) &&
      candidateTokens.size <= queryTokens.size + 2
    ) {
      base = Math.min(1, base + 0.1);
    }
  }

  let score = base;

  // The user's own foods are what they actually eat; prefer them over the
  // public pool, but never enough to promote a bad name match over a good one.
  if (input.isOwnFood) score += 0.06;

  // A generic query ("rice") matching a branded row ("Uncle Ben's Rice") is a
  // weaker signal than matching an unbranded one.
  if (input.candidateBrand && input.candidateBrand.trim().length > 0) {
    score -= 0.04;
  }

  // Recency: something logged this week beats something logged last year.
  const days = input.daysSinceLastUsed;
  if (typeof days === "number" && Number.isFinite(days) && days >= 0) {
    if (days <= 7) {
      score += 0.08;
      if (source === "token_overlap") source = "recent_usage";
    } else if (days <= 30) {
      score += 0.04;
    }
  }

  return { score: Math.max(0, Math.min(1, score)), source };
}
