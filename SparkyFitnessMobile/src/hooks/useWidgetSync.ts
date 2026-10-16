import { useEffect, useRef } from 'react';

import { ExtensionStorage } from '@bacons/apple-targets';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import {
  buildAndroidWidgetSnapshots,
  pushAndroidCalorieSnapshot,
  pushAndroidMacroSnapshot,
} from '../services/androidWidgetSyncService';
import BackgroundWaterModule from '../../modules/background-water';
import { addLog } from '../services/LogService';
import type { DailySummary } from '../types/dailySummary';
import { getTodayDate } from '../utils/dateUtils';

const WIDGET_KIND = 'widget';
const CALORIE_SNAPSHOT_KEY = 'calorieSnapshot';
const MACRO_WIDGET_KIND = 'macroWidget';
const MACRO_SNAPSHOT_KEY = 'macroSnapshot';
const WATER_WIDGET_KIND = 'waterWidget';
const WATER_SNAPSHOT_KEY = 'waterSnapshot';
// Control Center / Lock Screen controls that show a number from the snapshots.
const CONTROL_KINDS = [
  'com.sparkyapps.sparkyfitness.control.caloriesLeft',
  'com.sparkyapps.sparkyfitness.control.logWater',
];

/** What the iOS water widget needs beyond the day's totals. */
export interface WaterWidgetInfo {
  /** What one tap of the widget's button adds, in millilitres. */
  drinkMl: number | null;
  /** The unit the app shows water in. */
  unit: string;
  /** Whether the no-open shortcut is on, so the widget may show its button. */
  canLog: boolean;
}

const iosAppGroup = (
  Constants.expoConfig?.extra as { iosAppGroup?: string } | undefined
)?.iosAppGroup;

export function useWidgetSync(
  summary: DailySummary | undefined,
  water?: WaterWidgetInfo
): void {
  const drinkMl = water?.drinkMl ?? null;
  const waterUnit = water?.unit;
  const canLog = water?.canLog ?? false;
  const date = summary?.date;
  const isToday = date === getTodayDate();
  const lastAndroidCalorieSnapshotKeyRef = useRef<string | null>(null);
  const lastAndroidMacroSnapshotKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isToday || !date || !summary) {
      return;
    }

    const balance = summary.calorieBalance;
    const lastUpdated = Math.floor(Date.now() / 1000);

    if (Platform.OS === 'ios') {
      try {
        if (!iosAppGroup) {
          addLog(
            '[useWidgetSync] iOS app group unavailable; widget snapshots were not written',
            'WARNING'
          );
          return;
        }

        const storage = new ExtensionStorage(iosAppGroup);

        if (balance) {
          const { eaten, burned, goal, remaining, progress } = balance;
          storage.set(CALORIE_SNAPSHOT_KEY, {
            date,
            food: eaten,
            burned,
            goal,
            remaining,
            progress: goal > 0 ? Math.max(0, Math.min(1, progress / 100)) : 0,
            lastUpdated,
          });
        }

        storage.set(MACRO_SNAPSHOT_KEY, {
          date,
          protein: summary.protein.consumed,
          carbs: summary.carbs.consumed,
          fat: summary.fat.consumed,
          calories: summary.caloriesConsumed,
          lastUpdated,
        });

        if (storage.get(MACRO_SNAPSHOT_KEY) === null) {
          addLog(
            '[useWidgetSync] ExtensionStorage unavailable; widget snapshots were not written',
            'WARNING'
          );
          return;
        }

        if (waterUnit) {
          storage.set(WATER_SNAPSHOT_KEY, {
            date,
            consumedMl: summary.waterConsumed,
            goalMl: summary.waterGoal,
            // The storage takes only strings and numbers: 0 means none / off.
            drinkMl: drinkMl ?? 0,
            unit: waterUnit,
            canLog: canLog ? 1 : 0,
            lastUpdated,
          });
        }

        if (balance) {
          ExtensionStorage.reloadWidget(WIDGET_KIND);
        }
        ExtensionStorage.reloadWidget(MACRO_WIDGET_KIND);
        if (waterUnit) ExtensionStorage.reloadWidget(WATER_WIDGET_KIND);
        // Controls are reloaded separately from widgets.
        BackgroundWaterModule?.reloadControls?.(CONTROL_KINDS);
      } catch (error) {
        addLog(
          `[useWidgetSync] Failed to push snapshot to widget: ${error}`,
          'ERROR'
        );
      }
      return;
    }

    if (Platform.OS === 'android') {
      const snapshots = buildAndroidWidgetSnapshots(summary);
      if (snapshots.calorie) {
        const calorieSnapshot = snapshots.calorie;
        const calorieSnapshotKey = JSON.stringify(calorieSnapshot);

        if (lastAndroidCalorieSnapshotKeyRef.current !== calorieSnapshotKey) {
          lastAndroidCalorieSnapshotKeyRef.current = calorieSnapshotKey;
          void (async () => {
            try {
              await pushAndroidCalorieSnapshot(calorieSnapshot, lastUpdated);
            } catch (error) {
              if (
                lastAndroidCalorieSnapshotKeyRef.current === calorieSnapshotKey
              ) {
                lastAndroidCalorieSnapshotKeyRef.current = null;
              }
              addLog(
                `[useWidgetSync] Android calorie widget push failed: ${error}`,
                'ERROR'
              );
            }
          })();
        }
      }

      // Goals ride along so the widget's per-macro bars can show progress
      // toward each goal. Without them the widget can only compare a macro
      // against the day's other macros, which barely moves as the day fills up
      // (#2228). Not sent on iOS: that widget draws a composition ring, where
      // the three shares summing to one is the intended reading.
      const macroSnapshot = snapshots.macro;
      const macroSnapshotKey = JSON.stringify(macroSnapshot);
      if (lastAndroidMacroSnapshotKeyRef.current === macroSnapshotKey) return;

      lastAndroidMacroSnapshotKeyRef.current = macroSnapshotKey;
      void (async () => {
        try {
          await pushAndroidMacroSnapshot(macroSnapshot, lastUpdated);
        } catch (error) {
          if (lastAndroidMacroSnapshotKeyRef.current === macroSnapshotKey) {
            lastAndroidMacroSnapshotKeyRef.current = null;
          }
          addLog(
            `[useWidgetSync] Android macro widget push failed: ${error}`,
            'ERROR'
          );
        }
      })();
    }
  }, [summary, date, isToday, drinkMl, waterUnit, canLog]);
}
