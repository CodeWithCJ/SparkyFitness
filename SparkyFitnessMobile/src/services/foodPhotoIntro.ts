import AsyncStorage from '@react-native-async-storage/async-storage';
import { addLog } from './LogService';

const FOOD_PHOTO_INTRO_KEY = '@FoodPhoto:hasSeenIntro';

export async function hasSeenFoodPhotoIntro(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(FOOD_PHOTO_INTRO_KEY);
    return value === 'true';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[Food Photo Intro] Failed to read intro flag: ${message}`, 'WARNING');
    return false;
  }
}

export async function markFoodPhotoIntroSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(FOOD_PHOTO_INTRO_KEY, 'true');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[Food Photo Intro] Failed to persist intro flag: ${message}`, 'WARNING');
  }
}
