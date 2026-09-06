import {
  HEALTH_TREND_KEYS,
  type HealthTrendKey,
} from '../constants/healthTrends';

/** The row separating shown graphs from hidden ones in the settings list. */
export const HEALTH_TREND_DIVIDER = 'divider';

export type HealthTrendRow = HealthTrendKey | typeof HEALTH_TREND_DIVIDER;

const isHealthTrendKey = (value: string): value is HealthTrendKey =>
  (HEALTH_TREND_KEYS as readonly string[]).includes(value);

/**
 * The user's saved graph order, reconciled against the current registry.
 *
 * Keys the saved order does not know about — graphs shipped after it was written — are
 * appended in registry order, so registering a new graph never needs a store migration.
 * Keys that no longer exist, and duplicates from a corrupted write, are dropped.
 */
export function resolveHealthTrendOrder(
  savedOrder: readonly string[]
): HealthTrendKey[] {
  const resolvedOrder: HealthTrendKey[] = [];
  const seenKeys = new Set<HealthTrendKey>();

  for (const key of savedOrder) {
    if (!isHealthTrendKey(key) || seenKeys.has(key)) continue;
    seenKeys.add(key);
    resolvedOrder.push(key);
  }

  for (const key of HEALTH_TREND_KEYS) {
    if (seenKeys.has(key)) continue;
    resolvedOrder.push(key);
  }

  return resolvedOrder;
}

/** The ordered graphs the pager should render, with the user's hidden ones removed. */
export function selectVisibleHealthTrends(
  order: readonly HealthTrendKey[],
  hiddenKeys: readonly string[]
): HealthTrendKey[] {
  return order.filter((key) => !hiddenKeys.includes(key));
}

/** The settings list: shown graphs, the divider, then hidden graphs. */
export function buildHealthTrendRows(
  order: readonly HealthTrendKey[],
  hiddenKeys: readonly string[]
): HealthTrendRow[] {
  const shownKeys = order.filter((key) => !hiddenKeys.includes(key));
  const hiddenInOrder = order.filter((key) => hiddenKeys.includes(key));

  return [...shownKeys, HEALTH_TREND_DIVIDER, ...hiddenInOrder];
}

/** Which side of the divider each graph ended up on. */
export function splitHealthTrendRows(rows: readonly HealthTrendRow[]): {
  order: HealthTrendKey[];
  hiddenKeys: HealthTrendKey[];
} {
  const dividerIndex = rows.indexOf(HEALTH_TREND_DIVIDER);
  const keysBefore = rows.slice(0, dividerIndex).filter(isHealthTrendKey);
  const keysAfter = rows.slice(dividerIndex + 1).filter(isHealthTrendKey);

  return { order: [...keysBefore, ...keysAfter], hiddenKeys: keysAfter };
}

/**
 * Moves one row within the settings list, remove-then-insert — the convention
 * `computeReorderTargetIndex` reports its drop target in.
 *
 * Crossing the divider is what hides or shows a graph, so a move returns both the new
 * order and the new hidden set rather than just a reordering. The divider itself cannot
 * be dragged; a move that names it is returned unchanged.
 */
export function applyHealthTrendRowMove(
  rows: readonly HealthTrendRow[],
  fromIndex: number,
  toIndex: number
): { order: HealthTrendKey[]; hiddenKeys: HealthTrendKey[] } {
  const movedRow = rows[fromIndex];
  if (movedRow === undefined || movedRow === HEALTH_TREND_DIVIDER) {
    return splitHealthTrendRows(rows);
  }

  const remainingRows = rows.filter((_, index) => index !== fromIndex);
  const insertIndex = Math.max(0, Math.min(toIndex, remainingRows.length));

  return splitHealthTrendRows([
    ...remainingRows.slice(0, insertIndex),
    movedRow,
    ...remainingRows.slice(insertIndex),
  ]);
}
