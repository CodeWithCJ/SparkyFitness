import { useEffect, useRef, type RefObject } from 'react';

import { ExtensionStorage } from '@bacons/apple-targets';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import {
  buildAndroidWaterSnapshot,
  buildAndroidWidgetSnapshots,
  getAndroidWidgetGeneration,
  pushAndroidCalorieSnapshot,
  pushAndroidMacroSnapshot,
  pushAndroidWaterSnapshot,
  type WaterWidgetInfo,
} from '../services/androidWidgetSyncService';
import BackgroundWaterModule from '../../modules/background-water';
import { buildCalorieWidgetSnapshot } from '../services/calorieWidgetSnapshot';
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

const iosAppGroup = (
  Constants.expoConfig?.extra as { iosAppGroup?: string } | undefined
)?.iosAppGroup;

export function useWidgetSync(
  summary: DailySummary | undefined,
  water?: WaterWidgetInfo
): void {
  const drinkMl = water?.drinkMl;
  const waterUnit = water?.unit;
  const canLog = water?.canLog ?? false;
  const date = summary?.date;
  const isToday = date === getTodayDate();
  const lastAndroidCalorieSnapshotKeyRef = useRef<string | null>(null);
  const lastAndroidMacroSnapshotKeyRef = useRef<string | null>(null);
  const lastAndroidWaterSnapshotKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isToday || !date || !summary) {
      return;
    }

    const lastUpdated = Math.floor(Date.now() / 1000);

    if (Platform.OS === 'ios') {
      const calorieSnapshot = buildCalorieWidgetSnapshot(summary);
      try {
        if (!iosAppGroup) {
          addLog(
            '[useWidgetSync] iOS app group unavailable; widget snapshots were not written',
            'WARNING'
          );
          return;
        }

        const storage = new ExtensionStorage(iosAppGroup);

        if (calorieSnapshot) {
          storage.set(CALORIE_SNAPSHOT_KEY, {
            ...calorieSnapshot,
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

        if (calorieSnapshot) {
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
      // An account change clears the widgets, so the same figures signed in
      // again (a session renewed by the same person) still have to be pushed.
      const generation = getAndroidWidgetGeneration();
      if (snapshots.calorie) {
        const calorieSnapshot = snapshots.calorie;
        pushOnce(
          lastAndroidCalorieSnapshotKeyRef,
          `${generation}:${JSON.stringify(calorieSnapshot)}`,
          () => pushAndroidCalorieSnapshot(calorieSnapshot, lastUpdated),
          'calorie'
        );
      }

      // Goals ride along so the widget's per-macro bars can show progress
      // toward each goal. Without them the widget can only compare a macro
      // against the day's other macros, which barely moves as the day fills up
      // (#2228). Not sent on iOS: that widget draws a composition ring, where
      // the three shares summing to one is the intended reading.
      const macroSnapshot = snapshots.macro;
      pushOnce(
        lastAndroidMacroSnapshotKeyRef,
        `${generation}:${JSON.stringify(macroSnapshot)}`,
        () => pushAndroidMacroSnapshot(macroSnapshot, lastUpdated),
        'macro'
      );

      // Only from a caller that passes the water details (the Dashboard), as
      // on iOS. A drink still loading is left out, so the widget keeps its
      // buttons instead of hiding them until the containers arrive.
      if (waterUnit) {
        const waterSnapshot = buildAndroidWaterSnapshot(summary, {
          drinkMl,
          unit: waterUnit,
          canLog,
        });
        pushOnce(
          lastAndroidWaterSnapshotKeyRef,
          `${generation}:${JSON.stringify(waterSnapshot)}`,
          () => pushAndroidWaterSnapshot(waterSnapshot, lastUpdated),
          'water'
        );
      }
    }
  }, [summary, date, isToday, drinkMl, waterUnit, canLog]);
}

/**
 * Pushes an Android widget snapshot unless the same one was already sent. A
 * failed push forgets its key, so the next render with the same figures
 * tries again.
 */
function pushOnce(
  lastKeyRef: RefObject<string | null>,
  key: string,
  push: () => Promise<void>,
  widget: string
): void {
  if (lastKeyRef.current === key) return;
  lastKeyRef.current = key;
  void (async () => {
    try {
      await push();
    } catch (error) {
      if (lastKeyRef.current === key) {
        lastKeyRef.current = null;
      }
      addLog(
        `[useWidgetSync] Android ${widget} widget push failed: ${error}`,
        'ERROR'
      );
    }
  })();
}
