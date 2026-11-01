import { todayInZone } from '@workspace/shared';
import { CalorieWidgetBridge } from './CalorieWidgetBridge';
import { ensureTimezoneBootstrapped } from './api/preferencesApi';
import {
  buildDailySummary,
  loadDailySummaryRawData,
} from './dailySummaryService';
import type { DailySummary } from '../types/dailySummary';
import {
  buildCalorieWidgetSnapshot,
  type CalorieWidgetSnapshot,
} from './calorieWidgetSnapshot';

/**
 * Android widget snapshot contracts mirrored by `parseSnapshot` in the
 * calorie and macro widget Kotlin templates. Optional fields are omitted by
 * JSON serialization, which the native readers interpret as not supplied.
 * The calorie snapshot is the one iOS gets too (`CalorieWidgetSnapshot`).
 */
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

/** What the water widgets need beyond the day's totals. */
export interface WaterWidgetInfo {
  /**
   * What one tap of the widget's button adds, in millilitres; null for a
   * container linked to a food, undefined until a container has loaded (the
   * Android widget then keeps the drink it has).
   */
  drinkMl?: number | null;
  /** The unit the app shows water in. */
  unit: string;
  /**
   * Set by the Dashboard, so a widget holding only a background refresh's
   * totals shows no button, as on iOS.
   */
  canLog: boolean;
}

/**
 * The Android water widget's snapshot (WaterWidgetStore.kt). A background
 * refresh knows only the totals, so it leaves the rest out and the native
 * side keeps what the app last sent. A null drink means the container is
 * linked to a food, which hides the buttons as on iOS. The manual part
 * (null when the server does not say) is sent every time, as it decides
 * whether − can remove anything.
 */
export interface AndroidWaterSnapshot {
  date: string;
  consumedMl: number;
  goalMl: number;
  manualMl: number | null;
  drinkMl?: number | null;
  unit?: string;
  canLog?: boolean;
}

export function buildAndroidWaterSnapshot(
  summary: DailySummary,
  water?: WaterWidgetInfo
): AndroidWaterSnapshot {
  return {
    date: summary.date,
    consumedMl: summary.waterConsumed,
    goalMl: summary.waterGoal,
    manualMl: summary.waterManual ?? null,
    ...(water && {
      ...(water.drinkMl !== undefined && { drinkMl: water.drinkMl }),
      unit: water.unit,
      canLog: water.canLog,
    }),
  };
}

export function buildAndroidWidgetSnapshots(summary: DailySummary): {
  calorie?: CalorieWidgetSnapshot;
  macro: AndroidMacroSnapshot;
} {
  const balance = summary.calorieBalance;

  return {
    calorie: buildCalorieWidgetSnapshot(summary),
    macro: {
      date: summary.date,
      protein: summary.protein.consumed,
      carbs: summary.carbs.consumed,
      fat: summary.fat.consumed,
      // From the same balance as `remaining`: the eaten figure the Dashboard
      // and the calorie widget show. The flat `caloriesConsumed` can differ
      // from it slightly (it is not rounded, and the server counts a few
      // entries differently).
      calories: balance ? balance.eaten : summary.caloriesConsumed,
      remaining: balance?.remaining,
      proteinGoal: summary.protein.goal,
      carbsGoal: summary.carbs.goal,
      fatGoal: summary.fat.goal,
    },
  };
}

function serializeWidgetPayload<T extends object>(
  snapshot: T,
  lastUpdated: number
): string {
  return JSON.stringify({ ...snapshot, lastUpdated });
}

export async function pushAndroidCalorieSnapshot(
  snapshot: CalorieWidgetSnapshot,
  lastUpdated = Math.floor(Date.now() / 1000)
): Promise<void> {
  await CalorieWidgetBridge.setCalorieSnapshot(
    serializeWidgetPayload(snapshot, lastUpdated)
  );
  await CalorieWidgetBridge.reloadWidget();
}

export async function pushAndroidMacroSnapshot(
  snapshot: AndroidMacroSnapshot,
  lastUpdated = Math.floor(Date.now() / 1000)
): Promise<void> {
  await CalorieWidgetBridge.setMacroSnapshot(
    serializeWidgetPayload(snapshot, lastUpdated)
  );
  await CalorieWidgetBridge.reloadMacroWidget();
}

export async function pushAndroidWaterSnapshot(
  snapshot: AndroidWaterSnapshot,
  lastUpdated = Math.floor(Date.now() / 1000)
): Promise<void> {
  await CalorieWidgetBridge.setWaterSnapshot(
    serializeWidgetPayload(snapshot, lastUpdated)
  );
  await CalorieWidgetBridge.reloadWaterWidget();
}

// Moves on at every account change. A snapshot built for an earlier value
// belongs to the previous account and is not pushed.
let widgetGeneration = 0;

export function getAndroidWidgetGeneration(): number {
  return widgetGeneration;
}

/**
 * Erases the widget snapshots when the account changes: they carry no
 * account, and the Quick Settings tile shows the calorie figure on the lock
 * screen. The water widget's taps not yet sent go with them.
 */
export async function clearAndroidWidgetSnapshots(): Promise<void> {
  widgetGeneration += 1;
  await CalorieWidgetBridge.clearSnapshots();
}

export async function refreshAndroidWidgetsFromServer(): Promise<void> {
  const generation = widgetGeneration;
  const timezone = await ensureTimezoneBootstrapped({ throwOnFailure: true });
  if (!timezone) {
    throw new Error('Account timezone is unavailable for widget refresh');
  }
  const date = todayInZone(timezone);
  const raw = await loadDailySummaryRawData(date);
  const summary = buildDailySummary(date, raw);
  const snapshots = buildAndroidWidgetSnapshots(summary);
  const lastUpdated = Math.floor(Date.now() / 1000);
  const updates: Promise<void>[] = [];
  // The account changed while the summary loaded. Checked in the same turn
  // as the pushes below, which reach the native module before awaiting.
  if (generation !== widgetGeneration) return;

  if (snapshots.calorie) {
    updates.push(pushAndroidCalorieSnapshot(snapshots.calorie, lastUpdated));
  }
  updates.push(pushAndroidMacroSnapshot(snapshots.macro, lastUpdated));
  updates.push(
    pushAndroidWaterSnapshot(buildAndroidWaterSnapshot(summary), lastUpdated)
  );

  const results = await Promise.allSettled(updates);
  const firstFailure = results.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected'
  );
  if (firstFailure) {
    throw firstFailure.reason;
  }
}
