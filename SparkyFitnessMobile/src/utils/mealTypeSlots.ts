/**
 * Meal-type ordering model (maintainer final design).
 *
 * System meal types are FIXED ordering anchors; custom meal types live in the
 * integer slots between anchors (max 9 per gap). The numbers are never shown
 * in the UI.
 *
 *   Breakfast = 10
 *     11 12 13 14 15 16 17 18 19   (gap b_l)
 *   Lunch     = 20
 *     21 22 23 24 25 26 27 28 29   (gap l_d)
 *   Dinner    = 30
 *     31 32 33 34 35 36 37 38 39   (gap d_s)
 *   Snacks    = 40
 *
 * Outer ranges (1..9 / 41..49) are NOT invented: the backend/web contract does
 * not support placement outside the four anchors, so reorder destinations are
 * constrained to the documented gaps. Legacy custom sort_order values (e.g.
 * 100/110 from earlier builds) are mapped into a gap for rendering and are
 * normalized only when the user actually reorders.
 */

import type { MealType } from '../types/mealTypes';

export const SYSTEM_ANCHOR_KEYS = ['breakfast', 'lunch', 'dinner', 'snacks'] as const;
export type SystemAnchorKey = (typeof SYSTEM_ANCHOR_KEYS)[number];

export const SYSTEM_SORT_ORDERS: Record<SystemAnchorKey, number> = {
  breakfast: 10,
  lunch: 20,
  dinner: 30,
  snacks: 40,
};

export type MealGapKey = 'b_l' | 'l_d' | 'd_s';

/** Gap key for the gap AFTER a given system anchor (breakfast → b_l, etc.). */
export const GAP_AFTER_ANCHOR: Record<SystemAnchorKey, MealGapKey> = {
  breakfast: 'b_l',
  lunch: 'l_d',
  dinner: 'd_s',
  snacks: 'd_s', // never used (no gap after the last anchor)
};

/** The anchor that ENDS each gap (b_l is ended by Lunch, etc.). */
export const GAP_END_ANCHOR: Record<MealGapKey, SystemAnchorKey> = {
  b_l: 'lunch',
  l_d: 'dinner',
  d_s: 'snacks',
};

/** Human label used in the "gap is full" toast (no database numbers). */
export const GAP_USER_LABEL: Record<MealGapKey, string> = {
  b_l: 'between Breakfast and Lunch',
  l_d: 'between Lunch and Dinner',
  d_s: 'between Dinner and Snacks',
};

export const MAX_CUSTOM_PER_GAP = 9;

/** Integer slot range per gap: [first, last]. */
export const GAP_SLOT_RANGE: Record<MealGapKey, [number, number]> = {
  b_l: [11, 19],
  l_d: [21, 29],
  d_s: [31, 39],
};

/** Gap key for a custom type's sort_order, mapping legacy values into a gap. */
export function gapKeyForSortOrder(sortOrder: number | null | undefined): MealGapKey {
  const v = sortOrder ?? 0;
  if (v > 10 && v < 20) return 'b_l';
  if (v > 20 && v < 30) return 'l_d';
  if (v > 30 && v < 40) return 'd_s';
  // Legacy values outside the anchor model: below Breakfast → first gap,
  // at/above Snacks → last gap. Never invent outer ranges.
  return v <= 10 ? 'b_l' : 'd_s';
}

/** Default gap for NEW custom types: the end of the list (before Snacks). */
export const DEFAULT_CREATE_GAP: MealGapKey = 'd_s';

export interface GapAssignment {
  gap: MealGapKey;
  /** 0-based position inside the gap (sorted by sort_order). */
  index: number;
}

/**
 * Orders every custom meal type into its gap. Within a gap, types sort by
 * sort_order (stable). Returns a map gapKey → ordered custom types.
 */
export function assignCustomTypesToGaps(customTypes: MealType[]): Record<MealGapKey, MealType[]> {
  const gaps: Record<MealGapKey, MealType[]> = { b_l: [], l_d: [], d_s: [] };
  for (const mt of customTypes) {
    gaps[gapKeyForSortOrder(mt.sort_order)].push(mt);
  }
  for (const key of Object.keys(gaps) as MealGapKey[]) {
    gaps[key].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }
  return gaps;
}

/** Sequential slot values for a gap: 11,12,13... / 21,22,23... / 31,32,33...
 * Count is clamped to MAX_CUSTOM_PER_GAP so the sequence can never overflow
 * into the next system anchor value (a gap holds at most nine customs). */
export function slotsForGap(gap: MealGapKey, count: number): number[] {
  const [first] = GAP_SLOT_RANGE[gap];
  const safeCount = Math.min(Math.max(count, 0), MAX_CUSTOM_PER_GAP);
  return Array.from({ length: safeCount }, (_, i) => first + i);
}

/**
 * Computes the new per-gap assignments after moving ONE custom type from one
 * visual position to another within the unified list.
 *
 * `currentGaps` is the pre-move assignment; `fromGap`/`fromIndex` locate the
 * moved type; `toGap`/`toIndex` is the destination (toIndex is the position
 * in the destination gap's list AFTER removal, i.e. the insertion index).
 *
 * Returns null when the destination gap already holds MAX_CUSTOM_PER_GAP
 * custom types (the moved type would be the 10th) — the caller must reject.
 */
export function moveCustomTypeBetweenGaps(
  currentGaps: Record<MealGapKey, MealType[]>,
  fromGap: MealGapKey,
  fromIndex: number,
  toGap: MealGapKey,
  toIndex: number,
): Record<MealGapKey, MealType[]> | null {
  // Copy the input arrays first — this helper is PURE and must never mutate
  // the caller's gap assignment.
  const src = [...currentGaps[fromGap]];
  if (fromIndex < 0 || fromIndex >= src.length) return null;
  const [moved] = src.splice(fromIndex, 1);

  if (toGap === fromGap) {
    // Same gap: src is already the post-removal copy; insertion index is
    // relative to the list AFTER the removal.
    const clamped = Math.min(Math.max(toIndex, 0), src.length);
    src.splice(clamped, 0, moved);
    return { ...currentGaps, [fromGap]: src };
  }
  const dst = [...currentGaps[toGap]];
  if (dst.length >= MAX_CUSTOM_PER_GAP) {
    return null;
  }
  const clamped = Math.min(Math.max(toIndex, 0), dst.length);
  dst.splice(clamped, 0, moved);
  return { ...currentGaps, [fromGap]: src, [toGap]: dst };
}

/**
 * Builds the minimal list of sort_order writes needed to persist a gap
 * assignment: sequential slots within each gap; system anchors are never
 * written; only custom records whose value actually changed are included.
 */
export function buildSortOrderWrites(
  gaps: Record<MealGapKey, MealType[]>,
): { id: string; sort_order: number }[] {
  const writes: { id: string; sort_order: number }[] = [];
  for (const key of Object.keys(gaps) as MealGapKey[]) {
    const list = gaps[key];
    const slots = slotsForGap(key, list.length);
    list.forEach((mt, i) => {
      if ((mt.sort_order ?? 0) !== slots[i]) {
        writes.push({ id: mt.id, sort_order: slots[i] });
      }
    });
  }
  return writes;
}

/**
 * Flattens the unified visual list: anchor rows (system) interleaved with the
 * custom rows of each gap, in canonical order:
 * Breakfast, [b_l customs], Lunch, [l_d customs], Dinner, [d_s customs], Snacks.
 * Returns `{ isSystem: boolean; mt: MealType }[]`.
 */
export function buildUnifiedList(
  systemTypes: MealType[],
  gaps: Record<MealGapKey, MealType[]>,
): { isSystem: boolean; mt: MealType }[] {
  const byKey: Record<string, MealType> = {};
  for (const st of systemTypes) {
    byKey[st.name.toLowerCase()] = st;
  }
  const rows: { isSystem: boolean; mt: MealType }[] = [];
  for (const key of SYSTEM_ANCHOR_KEYS) {
    const anchor = byKey[key] ?? byKey[key === 'snacks' ? 'snack' : key];
    if (anchor) {
      rows.push({ isSystem: true, mt: anchor });
    }
    if (key !== 'snacks') {
      for (const custom of gaps[GAP_AFTER_ANCHOR[key]]) {
        rows.push({ isSystem: false, mt: custom });
      }
    }
  }
  return rows;
}

/**
 * Derives the per-gap assignment from a unified visual list (anchors + custom
 * rows in visual order): every custom row between Breakfast and Lunch belongs
 * to b_l, between Lunch and Dinner to l_d, between Dinner and Snacks to d_s.
 * Custom rows before the first anchor or after the last anchor are not
 * produced by buildUnifiedList (anchors always bound the list); if one were
 * present it maps to the nearest gap for safety.
 */
export function deriveGapsFromUnified(
  unified: { isSystem: boolean; mt: MealType }[],
): Record<MealGapKey, MealType[]> {
  const gaps: Record<MealGapKey, MealType[]> = { b_l: [], l_d: [], d_s: [] };
  let currentGap: MealGapKey = 'b_l';
  for (const row of unified) {
    if (row.isSystem) {
      const key = row.mt.name.toLowerCase();
      if (key === 'lunch') currentGap = 'l_d';
      else if (key === 'dinner' || key === 'snacks' || key === 'snack') currentGap = 'd_s';
      continue;
    }
    gaps[currentGap].push(row.mt);
  }
  return gaps;
}

/**
 * Maps a custom-only reorder target index (result of computeReorderTargetIndex
 * over the CUSTOM rows) back into the gap model.
 *
 * `customGapIndices` is the per-gap ordered list of custom ids (the moved type
 * already removed). `targetIndex` is the 0-based insertion position among ALL
 * remaining custom rows in unified order.
 *
 * Returns `{ gap, index }` where `index` is the insertion index within that
 * gap, or null when the target is invalid.
 */
