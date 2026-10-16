/**
 * The water from food to show on the watch's Water page. Null unless food water
 * counts toward intake and the amount is positive. The watch draws the line for
 * any number it receives, and the phone only draws it above zero, so a zero
 * (the setting is on, but nothing logged yet) must not be sent.
 */
export function watchWaterFromFoodMl(
  foodWaterCounts: boolean | null | undefined,
  fromFoodMl: number | null | undefined
): number | null {
  if (!foodWaterCounts) return null;
  if (fromFoodMl == null || !Number.isFinite(fromFoodMl) || fromFoodMl <= 0)
    return null;
  return fromFoodMl;
}
