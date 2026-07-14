import type { Meal } from '../types/meals';
import type { FoodItem, TopFoodItem } from '../types/foods';

// A food shown on the search landing is either a recent food or a top
// (frequency-ranked) food; the two share every field the landing renders.
export type LandingFood = FoodItem | TopFoodItem;

// A single row in the food-search landing quick-pick lists, tagged so the
// renderer can dispatch to a meal row or a food row. `key` is unique across
// both types (id spaces are separate, but the prefix makes React keys safe
// even if a meal and food ever shared an id).
export type LandingEntry =
  | { kind: 'meal'; key: string; meal: Meal }
  | { kind: 'food'; key: string; food: LandingFood };

// The recent/top endpoints attach these extra columns to their rows. They
// arrive over JSON as strings (Postgres serializes dates to ISO strings and
// COUNT(*) to a numeric string), so callers should not assume native types.
// They are optional so the merge degrades gracefully on a server that has not
// yet started returning them (older backend without the shared additions).
type RecentMeal = Meal & { last_used_date?: string | null };
type RecentFood = LandingFood & { last_used_date?: string | null };
type FrequentMeal = Meal & { usage_count?: number | string | null };
type FrequentFood = LandingFood & { usage_count?: number | string | null };

// The one place the landing keyspace is defined. Callers that need to exclude
// items they render themselves (e.g. a Favorites section above these lists)
// build their keys with this rather than re-deriving the prefix format.
export const landingKey = (kind: 'meal' | 'food', id?: string) =>
  `${kind}-${id ?? ''}`;

const mealKey = (m: { id?: string }) => landingKey('meal', m.id);
const foodKey = (f: { id?: string }) => landingKey('food', f.id);

// Recent: merge meals and foods into one timeline ordered by last-used date,
// newest first. ISO date strings sort lexicographically, so string compare is
// chronological. Same-day ties keep meals before foods (stable sort over a
// meals-then-foods concat), matching the sort preference elsewhere.
// excludeKeys drops anything already shown above these lists (Favorites), and
// is applied BEFORE the slice so the section still fills to `limit`.
export function mergeRecent(
  meals: RecentMeal[] = [],
  foods: RecentFood[] = [],
  excludeKeys: Set<string> = new Set(),
  limit: number,
): LandingEntry[] {
  const tagged: { entry: LandingEntry; sort: string }[] = [
    ...meals.map((m) => ({
      entry: { kind: 'meal' as const, key: mealKey(m), meal: m },
      sort: m.last_used_date ?? '',
    })),
    ...foods.map((f) => ({
      entry: { kind: 'food' as const, key: foodKey(f), food: f },
      sort: f.last_used_date ?? '',
    })),
  ].filter((t) => !excludeKeys.has(t.entry.key));
  tagged.sort((a, b) => (a.sort < b.sort ? 1 : a.sort > b.sort ? -1 : 0));
  return tagged.slice(0, Math.max(0, limit)).map((t) => t.entry);
}

// Frequent: merge meals and foods ordered by usage count, most-used first,
// dropping anything already shown above it (excludeKeys: Recent, plus any
// Favorites) so the sections do not repeat rows. Applied before the slice, so
// the section still fills to `limit`. usage_count can arrive as a numeric
// string, so coerce.
export function mergeFrequent(
  meals: FrequentMeal[] = [],
  foods: FrequentFood[] = [],
  excludeKeys: Set<string> = new Set(),
  limit: number,
): LandingEntry[] {
  // Coerce, and never let a bad value become NaN: NaN in a subtraction
  // comparator breaks sort transitivity and scrambles order.
  const count = (v: number | string | null | undefined) => {
    const parsed = Number(v ?? 0);
    return Number.isNaN(parsed) ? 0 : parsed;
  };
  const tagged: { entry: LandingEntry; sort: number }[] = [
    ...meals.map((m) => ({
      entry: { kind: 'meal' as const, key: mealKey(m), meal: m },
      sort: count(m.usage_count),
    })),
    ...foods.map((f) => ({
      entry: { kind: 'food' as const, key: foodKey(f), food: f },
      sort: count(f.usage_count),
    })),
  ].filter((t) => !excludeKeys.has(t.entry.key));
  tagged.sort((a, b) => b.sort - a.sort);
  return tagged.slice(0, Math.max(0, limit)).map((t) => t.entry);
}
