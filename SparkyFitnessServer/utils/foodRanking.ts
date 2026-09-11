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
  glycemic_index?: string | null;
  is_default?: boolean | null;
  [key: string]: unknown;
}

export interface ProviderFoodItem {
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

/**
 * Ranks provider results so plain whole foods beat branded products.
 *
 * Providers return branded items ("EGG (SNICKERS)", "BANANA (BETTER'N PEANUT
 * BUTTER)") ahead of the plain whole food a user almost always means, and small
 * models just take the first result. Stable within each tier, so the provider's
 * own relevance order is otherwise preserved.
 */
export function rankProviderMatches<T extends ProviderFoodItem>(
  foods: T[],
  query: string
): T[] {
  const q = query.trim().toLowerCase();
  const qStem = q.replace(/s$/, '');
  const score = (f: T): number => {
    const name = String(f?.name ?? '').toLowerCase();
    const branded = Boolean(f?.brand && String(f.brand).trim());
    const firstSegment = name.split(',')[0].trim();
    let s = branded ? 0 : 100; // whole foods first
    if (firstSegment === q || firstSegment === qStem) s += 20;
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
