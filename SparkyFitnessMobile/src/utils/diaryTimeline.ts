import { compareByEntryTime, toHourMinute } from '@workspace/shared';
import type { FoodEntry } from '../types/foodEntries';
import type { MealType } from '../types/mealTypes';

/**
 * Helpers for the Diary's timeline layout, which lists the day's food in time
 * order instead of grouping it under meal sections.
 */

export interface TimelineItem {
  entry: FoodEntry;
  /** HH:MM the entry sits at, or null when it has no time at all. */
  time: string | null;
  /**
   * True when the entry has no logged time and sits at its meal type's
   * default time instead.
   */
  estimated: boolean;
  mealType: MealType | null;
}

export interface TimelineGroup {
  /** 0-23 for an hour slot, null for the entries with no time. */
  hour: number | null;
  items: TimelineItem[];
}

// Same rule as groupFoodEntriesByMealType: the id is canonical, and the name
// is only used for entries that carry no id.
function resolveMealType(
  entry: FoodEntry,
  mealTypes: MealType[]
): MealType | null {
  if (entry.meal_type_id) {
    return mealTypes.find((mt) => mt.id === entry.meal_type_id) ?? null;
  }
  const name = (entry.meal_type ?? '').toLowerCase();
  return mealTypes.find((mt) => mt.name.toLowerCase() === name) ?? null;
}

/**
 * Order the day's food entries by time of day and group them into hour slots.
 * Entries without a logged time fall back to their meal type's default time
 * (flagged as estimated); anything still without a time goes last, in a group
 * with hour null.
 */
export function buildTimelineGroups(
  entries: FoodEntry[],
  mealTypes: MealType[]
): TimelineGroup[] {
  const items: TimelineItem[] = entries.map((entry) => {
    const mealType = resolveMealType(entry, mealTypes);
    const logged = toHourMinute(entry.entry_time);
    const fallback = logged ? null : toHourMinute(mealType?.default_time);
    return {
      entry,
      time: logged ?? fallback,
      estimated: !logged && !!fallback,
      mealType,
    };
  });

  const sortOrder = (item: TimelineItem) =>
    item.mealType?.sort_order ?? Number.MAX_SAFE_INTEGER;

  items.sort(
    (a, b) =>
      compareByEntryTime(a.time, b.time) ||
      // A logged time beats an estimated one at the same minute.
      Number(a.estimated) - Number(b.estimated) ||
      sortOrder(a) - sortOrder(b)
  );

  const groups: TimelineGroup[] = [];
  for (const item of items) {
    const hour = item.time ? Number(item.time.slice(0, 2)) : null;
    const last = groups[groups.length - 1];
    if (last && last.hour === hour) {
      last.items.push(item);
    } else {
      groups.push({ hour, items: [item] });
    }
  }
  return groups;
}

/** HH:MM for the start of an hour slot. */
export const hourSlotTime = (hour: number) =>
  `${String(hour).padStart(2, '0')}:00`;
