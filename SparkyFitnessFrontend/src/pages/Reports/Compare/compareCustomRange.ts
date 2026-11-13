import { addDays, compareDays, daysBetween } from '@workspace/shared';

export interface CustomRange {
  startDate: string;
  endDate: string;
}

/**
 * A picked range made exactly the one `compareWindow` will query: the end
 * kept (never past today), the start never past it, and a span over the
 * mode's limit pulled in from the start.
 */
export function clampCustomRange(
  range: CustomRange,
  today: string,
  maxDays: number
): CustomRange {
  const endDate = compareDays(range.endDate, today) > 0 ? today : range.endDate;
  let startDate =
    compareDays(range.startDate, endDate) > 0 ? endDate : range.startDate;
  if (daysBetween(startDate, endDate) + 1 > maxDays) {
    startDate = addDays(endDate, -(maxDays - 1));
  }
  return { startDate, endDate };
}
