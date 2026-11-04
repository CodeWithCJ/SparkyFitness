import { compareByEntryTime, toHourMinute } from '@workspace/shared';
import type { FoodEntry } from '@/types/food';
import type { FoodEntryMeal } from '@/types/meal';

/**
 * Helpers for the Diary's timeline layout, which lists the day's food in time
 * order instead of grouping it under meal cards.
 */

export type DiaryViewMode = 'meals' | 'timeline';

const VIEW_MODE_STORAGE_KEY = 'sparky.diary.viewMode';

/**
 * The layout the user last picked on this device. A per-device convenience,
 * so storage that is blocked or empty just falls back to the meal view.
 */
export function readDiaryViewMode(): DiaryViewMode {
  try {
    return window.localStorage.getItem(VIEW_MODE_STORAGE_KEY) === 'timeline'
      ? 'timeline'
      : 'meals';
  } catch {
    return 'meals';
  }
}

export function writeDiaryViewMode(mode: DiaryViewMode): void {
  try {
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
  } catch {
    // Blocked storage only costs the remembered choice.
  }
}

export interface TimelineMealType {
  name: string;
  sort_order: number;
  default_time?: string | null;
}

export interface TimelineItem {
  entry: FoodEntry | FoodEntryMeal;
  kind: 'foodEntry' | 'foodEntryMeal';
  /** HH:MM the item sits at, or null when it has no time at all. */
  time: string | null;
  /**
   * True when the entry has no logged time and is placed at its meal type's
   * default time instead.
   */
  estimated: boolean;
  mealTypeName: string;
}

export interface TimelineGroup {
  /** 0-23 for an hour slot, null for the group of entries with no time. */
  hour: number | null;
  items: TimelineItem[];
}

/**
 * Order the day's standalone food entries and logged meals by time of day and
 * group them into hour slots. Entries without a logged time fall back to
 * their meal type's default time (flagged as estimated); anything still
 * without a time goes into a final group with hour null.
 */
export function buildTimelineGroups(
  foodEntries: FoodEntry[],
  foodEntryMeals: FoodEntryMeal[],
  mealTypes: TimelineMealType[]
): TimelineGroup[] {
  const mealTypeByName = new Map(
    mealTypes.map((mealType) => [mealType.name.toLowerCase(), mealType])
  );

  const toItem = (
    entry: FoodEntry | FoodEntryMeal,
    kind: TimelineItem['kind']
  ): TimelineItem => {
    const mealType = mealTypeByName.get(entry.meal_type?.toLowerCase() ?? '');
    const logged = toHourMinute(entry.entry_time);
    const fallback = logged ? null : toHourMinute(mealType?.default_time);
    return {
      entry,
      kind,
      time: logged ?? fallback,
      estimated: !logged && !!fallback,
      mealTypeName: mealType?.name ?? entry.meal_type,
    };
  };

  const sortOrder = (item: TimelineItem) =>
    mealTypeByName.get(item.mealTypeName.toLowerCase())?.sort_order ??
    Number.MAX_SAFE_INTEGER;

  const items = [
    ...foodEntries.map((entry) => toItem(entry, 'foodEntry')),
    ...foodEntryMeals.map((entry) => toItem(entry, 'foodEntryMeal')),
  ].sort(
    (a, b) =>
      compareByEntryTime(a.time, b.time) ||
      // Logged times beat estimated ones at the same minute: they are real.
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
