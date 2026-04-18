import { useEffect } from 'react';

import { ExtensionStorage } from '@bacons/apple-targets';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { addLog } from '../services/LogService';
import type { DailySummary } from '../types/dailySummary';
import { getTodayDate } from '../utils/dateUtils';

const WIDGET_KIND = 'widget';
const CALORIE_SNAPSHOT_KEY = 'calorieSnapshot';

const iosAppGroup = (Constants.expoConfig?.extra as { iosAppGroup?: string } | undefined)
  ?.iosAppGroup;

export function useWidgetSync(summary: DailySummary | undefined): void {
  const date = summary?.date;
  const balance = summary?.calorieBalance;
  const isToday = date === getTodayDate();

  useEffect(() => {
    if (!isToday || !date || !balance) {
      return;
    }

    try {
      if (Platform.OS !== 'ios') return;
      if (!iosAppGroup) {
        addLog('[useWidgetSync] iOS app group unavailable; widget snapshot was not written', 'WARNING');
        return;
      }

      const { eaten, burned, goal, remaining, progress } = balance;
      const lastUpdated = Math.floor(Date.now() / 1000);
      const storage = new ExtensionStorage(iosAppGroup);
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

      if (storage.get(CALORIE_SNAPSHOT_KEY) === null) {
        addLog('[useWidgetSync] ExtensionStorage unavailable; widget snapshot was not written', 'WARNING');
        return;
      }

      ExtensionStorage.reloadWidget(WIDGET_KIND);
    } catch (error) {
      addLog(`[useWidgetSync] Failed to push snapshot to widget: ${error}`, 'ERROR');
    }
  }, [balance, date, isToday]);
}
