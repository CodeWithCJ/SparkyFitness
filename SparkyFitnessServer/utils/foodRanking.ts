// Extracted out of foodProviderLookupService.ts so externalFoodSearchService.ts
// can use it too, without the circular import that would create (the former
// already imports the latter). Depends on neither.

export interface ProviderFoodVariant {
  id?: string;
  serving_size?: number | string | null;
  serving_unit?: string | null;
  calories?: number | string | null;
  energy?: number | string | null;
  protein?: number | string | null;
  carbs?: number | string | null;
  fat?: number | string | null;
  saturated_fat?: number | string | null;
  polyunsaturated_fat?: number | string | null;
  monounsaturated_fat?: number | string | null;
  trans_fat?: number | string | null;
  cholesterol?: number | string | null;
  sodium?: number | string | null;
  potassium?: number | string | null;
  dietary_fiber?: number | string | null;
  fiber?: number | string | null;
  sugars?: number | string | null;
  sugar?: number | string | null;
  vitamin_a?: number | string | null;
  vitamin_c?: number | string | null;
  calcium?: number | string | null;
  iron?: number | string | null;
  caffeine_mg?: number | string | null;
  water_ml?: number | string | null;
  alcohol_g?: number | string | null;
  abv_percent?: number | string | null;
  glycemic_index?: string | null;
  is_default?: boolean | null;
  [key: string]: unknown;
}

/**
 * Marks a provider search result whose servings come from a search summary
 * rather than the provider's full record, so the serving a later save uses can
 * differ from the one shown. A symbol key keeps it server-side: JSON responses
 * to web and mobile drop it.
 */
export const PARTIAL_SERVING_DATA: unique symbol = Symbol('partialServingData');

export interface ProviderFoodItem {
  [PARTIAL_SERVING_DATA]?: true;
  id?: string;
  name: string;
  brand?: string | null;
  images?: unknown[];
  provider_type?: string | null;
  provider_external_id?: string | null;
  variants?: ProviderFoodVariant[];
  default_variant?: ProviderFoodVariant | null;
  [key: string]: unknown;
}

/** Lowercase words without accents or punctuation, each with a trailing "s" dropped. */
function searchWords(value: string): string[] {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((word) => word.replace(/s$/, ''))
    .filter(Boolean);
}

/**
 * True when the query names this product's brand and every other query word is
 * in the name. The brand counts as named when the query has every word of a
 * brand of two or more words ("trader joe's hummus" for Trader Joe's "Trader
 * joe's, sriracha hummus"), or
 * a word of it the name lacks ("kirkland bagel" for "Everything Bagel" by
 * Kirkland Signature). A query that is only brand words ("banana" against
 * Banana Boat) is not a brand search, and neither is one sharing a single word
 * with a longer brand that the name also has ("chicken breast" against Chicken
 * of the Sea's "Chicken Breast Chunks").
 */
function namesTheBrand(queryWords: string[], name: string, brand: string) {
  if (!brand) return false;
  const nameWords = new Set(searchWords(name));
  const brandWords = [...new Set(searchWords(brand))];
  if (brandWords.length === 0) return false;
  const query = new Set(queryWords);
  // A one-word brand is often a food word ("Organic"), so it only counts
  // through the brand-only rule below.
  const wholeBrand =
    brandWords.length >= 2 && brandWords.every((word) => query.has(word));
  const brandOnly = queryWords.filter(
    (word) => brandWords.includes(word) && !nameWords.has(word)
  );
  const named = wholeBrand
    ? queryWords.filter((word) => brandWords.includes(word))
    : brandOnly;
  const rest = queryWords.filter((word) => !named.includes(word));
  return (
    named.length > 0 &&
    rest.length > 0 &&
    rest.every((word) => nameWords.has(word))
  );
}

/** Two search words are the same food word, or one starts the other ("oat", "oatmeal"). */
const sameWord = (a: string, b: string) =>
  a === b ||
  (Math.min(a.length, b.length) >= 3 && (a.startsWith(b) || b.startsWith(a)));

/**
 * True when the name shares at least one word with the query. A result with no
 * brand only counts as a whole food when it is about what was searched: Open
 * Food Facts often leaves the brand empty, so "Chaussons aux pommes" would
 * otherwise outrank every apple product for "apple".
 */
function nameMentionsQuery(queryWords: string[], name: string) {
  if (queryWords.length === 0) return true;
  const nameWords = searchWords(name);
  return queryWords.some((word) =>
    nameWords.some((nameWord) => sameWord(word, nameWord))
  );
}

/**
 * Ranks provider results so plain whole foods beat branded products.
 *
 * Providers return branded items ("EGG (SNICKERS)", "BANANA (BETTER'N PEANUT
 * BUTTER)") ahead of the plain whole food a user almost always means, and small
 * models just take the first result. Stable within each tier, so the provider's
 * own relevance order is otherwise preserved. A product whose brand the query
 * names ("kirkland bagel") ranks above both, since the person asked for it, and
 * a result with no brand that shares no word with the query gets no bonus.
 */
export function rankProviderMatches<T extends ProviderFoodItem>(
  foods: T[],
  query: string
): T[] {
  const q = query.trim().toLowerCase();
  const qStem = q.replace(/s$/, '');
  const queryWords = [...new Set(searchWords(query))];
  const score = (f: T): number => {
    const name = String(f?.name ?? '').toLowerCase();
    const brand = f?.brand ? String(f.brand).trim() : '';
    const firstSegment = name.split(',')[0].trim();
    // Whole foods first, but only ones about the search.
    let s = !brand && nameMentionsQuery(queryWords, name) ? 100 : 0;
    if (namesTheBrand(queryWords, name, brand)) s = 150;
    // "Apples" is an exact match for "apple", as "apple" is for "apples".
    if (
      firstSegment === q ||
      firstSegment === qStem ||
      firstSegment.replace(/s$/, '') === qStem
    )
      s += 20;
    else if (firstSegment.startsWith(qStem)) s += 10;
    else if (name.includes(q)) s += 5;
    return s;
  };
  return foods
    .map((f, i) => ({ f, i, s: score(f) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.f);
}

export default {
  rankProviderMatches,
};
