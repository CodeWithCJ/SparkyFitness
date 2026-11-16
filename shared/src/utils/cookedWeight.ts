/**
 * Logging a food by its cooked weight (#3534).
 *
 * A diary entry keeps `quantity` as the raw weight of the portion, so totals,
 * reports and sync are unchanged. `cooked_quantity` is the cooked weight that
 * was eaten, in the same unit. The yield of a batch is never stored: it is
 * `cooked_quantity / quantity`, and the form derives it from the raw and
 * cooked weight of the whole batch.
 *
 * Web and mobile both use these helpers so they round the same way.
 */

/** Serving units the cooked-weight switch is offered for. */
export const COOKED_WEIGHT_UNITS = ['g', 'kg', 'oz', 'lb'] as const;

export type CookedWeightUnit = (typeof COOKED_WEIGHT_UNITS)[number];

/** True when an entry in this unit can carry a cooked weight. */
export function isCookedWeightUnit(
  unit: string | null | undefined
): unit is CookedWeightUnit {
  if (typeof unit !== 'string') return false;
  return (COOKED_WEIGHT_UNITS as readonly string[]).includes(
    unit.trim().toLowerCase()
  );
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * True for a value a client may send as `cooked_quantity`: null (not weighed
 * cooked) or a positive finite number.
 */
export function isValidCookedQuantity(value: unknown): value is number | null {
  return value === null || isPositiveNumber(value);
}

/** Decimal places kept for a raw quantity calculated from a cooked weight. */
const RAW_QUANTITY_DECIMALS = 2;

/** Decimal places kept for a yield factor. */
const YIELD_FACTOR_DECIMALS = 2;

function roundTo(value: number, decimals: number): number {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

/**
 * Yield of a batch: cooked weight divided by raw weight. Null unless both
 * weights are positive numbers.
 */
export function cookedYieldFactor(
  rawBatchWeight: number | null | undefined,
  cookedBatchWeight: number | null | undefined
): number | null {
  if (!isPositiveNumber(rawBatchWeight) || !isPositiveNumber(cookedBatchWeight))
    return null;
  return cookedBatchWeight / rawBatchWeight;
}

/**
 * Raw weight of a portion from the cooked weight eaten and the batch yield,
 * rounded to two decimals. Null unless both are positive numbers.
 */
export function rawQuantityFromCooked(
  cookedQuantity: number | null | undefined,
  yieldFactor: number | null | undefined
): number | null {
  if (!isPositiveNumber(cookedQuantity) || !isPositiveNumber(yieldFactor))
    return null;
  const raw = roundTo(cookedQuantity / yieldFactor, RAW_QUANTITY_DECIMALS);
  return raw > 0 ? raw : null;
}

/**
 * Yield stored implicitly on an entry (`cooked_quantity / quantity`). Null
 * when the entry has no cooked weight.
 */
export function entryYieldFactor(entry: {
  quantity: number | null | undefined;
  cooked_quantity?: number | null;
}): number | null {
  return cookedYieldFactor(entry.quantity, entry.cooked_quantity);
}

/** A yield factor rounded for display ("2.5×"). */
export function roundYieldFactor(yieldFactor: number): number {
  return roundTo(yieldFactor, YIELD_FACTOR_DECIMALS);
}
