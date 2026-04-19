import { useEffect } from 'react';

import { ExtensionStorage } from '@bacons/apple-targets';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { addLog } from '../services/LogService';
import type { DailySummary } from '../types/dailySummary';
import { getTodayDate } from '../utils/dateUtils';

const WIDGET_KIND = 'widget';
const CALORIE_SNAPSHOT_KEY = 'calorieSnapshot';
const MACRO_WIDGET_KIND = 'macroWidget';
const MACRO_SNAPSHOT_KEY = 'macroSnapshot';

const iosAppGroup = (Constants.expoConfig?.extra as { iosAppGroup?: string } | undefined)
  ?.iosAppGroup;

export function useWidgetSync(summary: DailySummary | undefined): void {
  const date = summary?.date;
  const isToday = date === getTodayDate();

  useEffect(() => {
    if (!isToday || !date || !summary) {
      return;
    }

    try {
      if (Platform.OS !== 'ios') return;
      if (!iosAppGroup) {
        addLog('[useWidgetSync] iOS app group unavailable; widget snapshots were not written', 'WARNING');
        return;
      }

      const lastUpdated = Math.floor(Date.now() / 1000);
      const storage = new ExtensionStorage(iosAppGroup);
      let probeKey: string | null = null;
      let wroteCalorie = false;

      const balance = summary.calorieBalance;
      if (balance) {
        const { eaten, burned, goal, remaining, progress } = balance;
        storage.set(CALORIE_SNAPSHOT_KEY, {
          date,
          consumed: eaten,
          food: eaten,
          burned,
          goal,
          remaining,
          progress: goal > 0 ? Math.max(0, Math.min(1, progress / 100)) : 0,
          lastUpdated,
        });
        probeKey ??= CALORIE_SNAPSHOT_KEY;
        wroteCalorie = true;
      }

      storage.set(MACRO_SNAPSHOT_KEY, {
        date,
        protein: summary.protein.consumed,
        carbs: summary.carbs.consumed,
        fat: summary.fat.consumed,
        calories: summary.caloriesConsumed,
        lastUpdated,
      });
      probeKey ??= MACRO_SNAPSHOT_KEY;

      if (probeKey && storage.get(probeKey) === null) {
        addLog('[useWidgetSync] ExtensionStorage unavailable; widget snapshots were not written', 'WARNING');
        return;
      }

      if (wroteCalorie) {
        ExtensionStorage.reloadWidget(WIDGET_KIND);
      }
      ExtensionStorage.reloadWidget(MACRO_WIDGET_KIND);
    } catch (error) {
      addLog(`[useWidgetSync] Failed to push snapshot to widget: ${error}`, 'ERROR');
    }
  }, [summary, date, isToday]);
}
