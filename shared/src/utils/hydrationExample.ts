/**
 * Worked example for the hydration-factor field on a water container.
 *
 * The factor scales only the water credit, which is easy to state and hard to
 * picture: "0.9" says nothing about what a press will actually do. Showing the
 * numbers for the container being edited removes the guesswork -- and when
 * there are no numbers yet (no food picked, no volume typed), the caller falls
 * back to the generic examples instead.
 */

export interface HydrationExample {
  /** Water the ring gains per press, after the factor. */
  credited: number;
  /** Water the drink holds before the factor. */
  total: number;
  unit: string;
}

interface LinkedInput {
  /** The variant's water, held per servingSize, as every nutrient is. */
  waterMl?: number | string | null;
  servingSize?: number | string | null;
  quantity?: number | string | null;
}

interface PlainInput {
  volume?: number | string | null;
  servings?: number | string | null;
  unit?: string | null;
}

const round = (value: number) => Math.round(value * 10) / 10;

/** Per-press water for a container linked to a food, or null if unknowable. */
export function linkedHydrationExample(
  factor: number,
  input: LinkedInput
): HydrationExample | null {
  const water = Number(input.waterMl);
  const quantity = Number(input.quantity);
  if (!Number.isFinite(water) || water <= 0) return null;
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  const servingSize = Number(input.servingSize);
  // Guard the divisor the way NULLIF(serving_size, 0) does in SQL.
  const total =
    Number.isFinite(servingSize) && servingSize > 0
      ? (water * quantity) / servingSize
      : water;
  if (!Number.isFinite(factor) || factor < 0) return null;
  return { credited: round(total * factor), total: round(total), unit: 'ml' };
}

/** Per-press water for a plain container, in the unit the user typed. */
export function plainHydrationExample(
  factor: number,
  input: PlainInput
): HydrationExample | null {
  const volume = Number(input.volume);
  if (!Number.isFinite(volume) || volume <= 0) return null;
  const servings = Number(input.servings);
  const perPress =
    Number.isFinite(servings) && servings > 0 ? volume / servings : volume;
  if (!Number.isFinite(factor) || factor < 0) return null;
  return {
    credited: round(perPress * factor),
    total: round(perPress),
    unit: input.unit || 'ml',
  };
}
