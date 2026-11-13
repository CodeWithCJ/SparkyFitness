import type { FoodEntry } from '../types/foodEntries';

export interface NutrientSourceEntry {
  entry: FoodEntry;
  /** This entry's contribution, in the nutrient's own unit. */
  amount: number;
}

export interface NutrientSource {
  /** Stable grouping key: the library food id, else the snapshot name + brand. */
  key: string;
  name: string;
  brand?: string;
  /** Total contributed to the nutrient, in the nutrient's own unit. */
  amount: number;
  /** Fraction (0-1) of the filtered selection's total for this nutrient. */
  share: number;
  entryCount: number;
  /** The entries behind the total, newest day first. */
  entries: NutrientSourceEntry[];
}

export interface TopSources {
  sources: NutrientSource[];
  /** Total of the nutrient across the whole filtered selection, not just the top N. */
  total: number;
}

export interface TopSourcesOptions {
  /** Restrict to one `YYYY-MM-DD` day; omit for the whole range. */
  day?: string | null;
  /** Restrict to one meal type, matched on `meal_type` name; omit for all meals. */
  mealType?: string | null;
  limit?: number;
}

const DEFAULT_LIMIT = 3;

/**
 * One entry's contribution to a nutrient, scaled from its per-serving snapshot
 * to the quantity eaten (the same rule the daily totals use). Custom nutrients
 * live in `custom_nutrients` by name.
 */
export function entryNutrientAmount(
  entry: FoodEntry,
  nutrientKey: string
): number {
  if (!entry.serving_size) return 0;
  const direct = entry[nutrientKey as keyof FoodEntry];
  const raw =
    typeof direct === 'number' || typeof direct === 'string'
      ? direct
      : entry.custom_nutrients?.[nutrientKey];
  const value = Number(raw);
  if (!Number.isFinite(value)) return 0;
  return (value * entry.quantity) / entry.serving_size;
}

/** Distinct meal type names in the entries, in the order first seen. */
export function mealTypesInEntries(entries: FoodEntry[]): string[] {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (entry.meal_type) seen.add(entry.meal_type);
  }
  return [...seen];
}

/**
 * The foods contributing most to a nutrient, largest first. Entries of the same
 * food are combined, so a food eaten on several days counts once.
 */
export function buildTopSources(
  entries: FoodEntry[],
  nutrientKey: string,
  { day, mealType, limit = DEFAULT_LIMIT }: TopSourcesOptions = {}
): TopSources {
  const groups = new Map<string, Omit<NutrientSource, 'share'>>();
  let total = 0;

  for (const entry of entries) {
    if (day && entry.entry_date !== day) continue;
    if (mealType && entry.meal_type !== mealType) continue;

    const amount = entryNutrientAmount(entry, nutrientKey);
    if (amount <= 0) continue;
    total += amount;

    const name = entry.food_name ?? '';
    const key = entry.food_id ?? `${name}|${entry.brand_name ?? ''}`;
    const group = groups.get(key);
    if (group) {
      group.amount += amount;
      group.entryCount += 1;
      group.entries.push({ entry, amount });
    } else {
      groups.set(key, {
        key,
        name,
        brand: entry.brand_name || undefined,
        amount,
        entryCount: 1,
        entries: [{ entry, amount }],
      });
    }
  }

  const sources = [...groups.values()]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit)
    .map((group) => ({
      ...group,
      entries: [...group.entries].sort(
        (a, b) =>
          b.entry.entry_date.localeCompare(a.entry.entry_date) ||
          b.amount - a.amount
      ),
      share: total > 0 ? group.amount / total : 0,
    }));

  return { sources, total };
}
