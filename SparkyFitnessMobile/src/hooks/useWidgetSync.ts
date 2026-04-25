import { useEffect, useRef } from 'react';

import { ExtensionStorage } from '@bacons/apple-targets';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { CalorieWidgetBridge } from '../native/CalorieWidgetBridge';
import { addLog } from '../services/LogService';
import type { DailySummary } from '../types/dailySummary';
import { getTodayDate } from '../utils/dateUtils';

const WIDGET_KIND = 'widget';
const CALORIE_SNAPSHOT_KEY = 'calorieSnapshot';
const MACRO_WIDGET_KIND = 'macroWidget';
const MACRO_SNAPSHOT_KEY = 'macroSnapshot';

const iosAppGroup = (
  Constants.expoConfig?.extra as { iosAppGroup?: string } | undefined
)?.iosAppGroup;

export function useWidgetSync(summary: DailySummary | undefined): void {
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
            'WARNING',
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
            'WARNING',
          );
          return;
        }

        if (balance) {
          ExtensionStorage.reloadWidget(WIDGET_KIND);
        }
        ExtensionStorage.reloadWidget(MACRO_WIDGET_KIND);
      } catch (error) {
        addLog(
          `[useWidgetSync] Failed to push snapshot to widget: ${error}`,
          'ERROR',
        );
      }
      return;
    }

    if (Platform.OS === 'android') {
      if (balance) {
        const { goal, remaining, progress } = balance;
        const clampedProgress =
          goal > 0 ? Math.max(0, Math.min(1, progress / 100)) : 0;
        const calorieSnapshot = {
          date,
          remaining,
          goal,
          progress: clampedProgress,
        };
        const calorieSnapshotKey = JSON.stringify(calorieSnapshot);

        if (lastAndroidCalorieSnapshotKeyRef.current !== calorieSnapshotKey) {
          lastAndroidCalorieSnapshotKeyRef.current = calorieSnapshotKey;
          const caloriePayload = {
            ...calorieSnapshot,
            lastUpdated,
          };

          void (async () => {
            try {
              await CalorieWidgetBridge.setCalorieSnapshot(
                JSON.stringify(caloriePayload),
              );
              await CalorieWidgetBridge.reloadWidget();
            } catch (error) {
              if (
                lastAndroidCalorieSnapshotKeyRef.current === calorieSnapshotKey
              ) {
                lastAndroidCalorieSnapshotKeyRef.current = null;
              }
              addLog(
                `[useWidgetSync] Android calorie widget push failed: ${error}`,
                'ERROR',
              );
            }
          })();
        }
      }

      const macroSnapshot = {
        date,
        protein: summary.protein.consumed,
        carbs: summary.carbs.consumed,
        fat: summary.fat.consumed,
        calories: summary.caloriesConsumed,
        remaining: balance?.remaining,
      };
      const macroSnapshotKey = JSON.stringify(macroSnapshot);
      if (lastAndroidMacroSnapshotKeyRef.current === macroSnapshotKey) return;

      lastAndroidMacroSnapshotKeyRef.current = macroSnapshotKey;
      const macroPayload = {
        ...macroSnapshot,
        lastUpdated,
      };

      void (async () => {
        try {
          await CalorieWidgetBridge.setMacroSnapshot(
            JSON.stringify(macroPayload),
          );
          await CalorieWidgetBridge.reloadMacroWidget();
        } catch (error) {
          if (lastAndroidMacroSnapshotKeyRef.current === macroSnapshotKey) {
            lastAndroidMacroSnapshotKeyRef.current = null;
          }
          addLog(
            `[useWidgetSync] Android macro widget push failed: ${error}`,
            'ERROR',
          );
        }
      })();
    }
  }, [summary, date, isToday]);
}
