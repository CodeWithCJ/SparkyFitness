import type { EnergyUnit } from '@workspace/shared';
import type { DailySummary } from '../types/dailySummary';

/**
 * The calorie widget's figures, written to the iOS app group by
 * `useWidgetSync` and to the Android widget by `androidWidgetSyncService`.
 * The Swift `CalorieSnapshotPayload` and the Kotlin `parseSnapshot` read these
 * keys. All of them come from `calorieBalance`, the figures the Dashboard
 * shows. The numbers stay in kcal; `energyUnit` tells the widget which unit to
 * show them in, and a snapshot without it (written by an older app) is kcal.
 */
export interface CalorieWidgetSnapshot {
  date: string;
  food: number;
  burned: number;
  goal: number;
  remaining: number;
  /** Food eaten as a share of food eaten plus remaining, 0 to 1. */
  progress: number;
  energyUnit: EnergyUnit;
}

export function buildCalorieWidgetSnapshot(
  summary: DailySummary,
  energyUnit: EnergyUnit = 'kcal'
): CalorieWidgetSnapshot | undefined {
  const balance = summary.calorieBalance;
  if (!balance) return undefined;
  const { eaten, burned, goal, remaining, progress } = balance;
  return {
    date: summary.date,
    food: eaten,
    burned,
    goal,
    remaining,
    progress: goal > 0 ? Math.max(0, Math.min(1, progress / 100)) : 0,
    energyUnit,
  };
}
