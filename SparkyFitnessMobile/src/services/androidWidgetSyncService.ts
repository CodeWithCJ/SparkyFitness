import { CalorieWidgetBridge } from './CalorieWidgetBridge';
import {
  buildDailySummary,
  loadDailySummaryRawData,
} from './dailySummaryService';
import type { DailySummary } from '../types/dailySummary';
import { getTodayDate } from '../utils/dateUtils';

/**
 * Android widget snapshot contracts mirrored by `parseSnapshot` in the
 * calorie and macro widget Kotlin templates. Optional fields are omitted by
 * JSON serialization, which the native readers interpret as not supplied.
 */
export interface AndroidCalorieSnapshot {
  date: string;
  remaining: number;
  goal: number;
  progress: number;
}

export interface AndroidMacroSnapshot {
  date: string;
  protein: number;
  carbs: number;
  fat: number;
  calories: number;
  remaining?: number;
  proteinGoal: number;
  carbsGoal: number;
  fatGoal: number;
}

export function buildAndroidWidgetSnapshots(summary: DailySummary): {
  calorie?: AndroidCalorieSnapshot;
  macro: AndroidMacroSnapshot;
} {
  const balance = summary.calorieBalance;
  const calorie = balance
    ? {
        date: summary.date,
        remaining: balance.remaining,
        goal: balance.goal,
        progress:
          balance.goal > 0
            ? Math.max(0, Math.min(1, balance.progress / 100))
            : 0,
      }
    : undefined;

  return {
    calorie,
    macro: {
      date: summary.date,
      protein: summary.protein.consumed,
      carbs: summary.carbs.consumed,
      fat: summary.fat.consumed,
      calories: summary.caloriesConsumed,
      remaining: balance?.remaining,
      proteinGoal: summary.protein.goal,
      carbsGoal: summary.carbs.goal,
      fatGoal: summary.fat.goal,
    },
  };
}

function serializeWidgetPayload<T extends object>(
  snapshot: T,
  lastUpdated: number,
): string {
  return JSON.stringify({ ...snapshot, lastUpdated });
}

export async function pushAndroidCalorieSnapshot(
  snapshot: AndroidCalorieSnapshot,
  lastUpdated = Math.floor(Date.now() / 1000),
): Promise<void> {
  await CalorieWidgetBridge.setCalorieSnapshot(
    serializeWidgetPayload(snapshot, lastUpdated),
  );
  await CalorieWidgetBridge.reloadWidget();
}

export async function pushAndroidMacroSnapshot(
  snapshot: AndroidMacroSnapshot,
  lastUpdated = Math.floor(Date.now() / 1000),
): Promise<void> {
  await CalorieWidgetBridge.setMacroSnapshot(
    serializeWidgetPayload(snapshot, lastUpdated),
  );
  await CalorieWidgetBridge.reloadMacroWidget();
}

export async function refreshAndroidWidgetsFromServer(): Promise<void> {
  const date = getTodayDate();
  const raw = await loadDailySummaryRawData(date);
  const summary = buildDailySummary(date, raw);
  const snapshots = buildAndroidWidgetSnapshots(summary);
  const lastUpdated = Math.floor(Date.now() / 1000);
  const updates: Promise<void>[] = [];

  if (snapshots.calorie) {
    updates.push(pushAndroidCalorieSnapshot(snapshots.calorie, lastUpdated));
  }
  updates.push(pushAndroidMacroSnapshot(snapshots.macro, lastUpdated));

  const results = await Promise.allSettled(updates);
  const firstFailure = results.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (firstFailure) {
    throw firstFailure.reason;
  }
}
