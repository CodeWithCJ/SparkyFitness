import type { AdaptiveTdeeResult } from '@/types/settings';

/** Select the goal baseline while keeping full-day TDEE available for reporting. */
export function getAdaptiveTdeeForGoal(
  data:
    | Pick<AdaptiveTdeeResult, 'tdee' | 'activityAdjustedTdee'>
    | null
    | undefined,
  activitySeparated: boolean
): number | null {
  if (!data) return null;
  return activitySeparated
    ? (data.activityAdjustedTdee ?? data.tdee)
    : data.tdee;
}
