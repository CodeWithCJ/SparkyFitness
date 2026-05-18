import AsyncStorage from '@react-native-async-storage/async-storage';
import { addLog } from './LogService';

const KEY = '@FoodPhoto:hasSeenIntro';

export async function hasSeenFoodPhotoIntro(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(KEY);
    return value === 'true';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[FoodPhotoIntro] Failed to read intro flag: ${message}`, 'WARNING');
    return false;
  }
}

export async function markFoodPhotoIntroSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, 'true');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[FoodPhotoIntro] Failed to persist intro flag: ${message}`, 'WARNING');
  }
}
