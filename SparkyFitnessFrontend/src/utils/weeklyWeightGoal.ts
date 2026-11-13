import { formatWeeklyGoalRate, getWeeklyGoalRateUnit } from '@workspace/shared';

/** Format the magnitude in the profile unit; callers supply the direction. */
export function formatWeeklyGoalRateWithUnit(
  kg: number,
  profileUnit: string,
  locale?: string
): string {
  const unit = getWeeklyGoalRateUnit(profileUnit);
  const rate = formatWeeklyGoalRate(kg, unit, locale);
  return unit === 'st_lbs'
    ? `${rate.amount} st ${rate.pounds} lbs`
    : `${rate.amount} ${unit}`;
}
