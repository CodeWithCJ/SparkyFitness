import AsyncStorage from '@react-native-async-storage/async-storage';
import { addLog } from './LogService';

const LAST_TAB_KEY = '@FoodSearch:lastTab';

export type FoodSearchTab = 'search' | 'online' | 'meal';
const FOOD_SEARCH_TABS: readonly FoodSearchTab[] = ['search', 'online', 'meal'];

export async function getLastUsedTab(): Promise<FoodSearchTab | null> {
  try {
    const value = await AsyncStorage.getItem(LAST_TAB_KEY);
    if (value && (FOOD_SEARCH_TABS as readonly string[]).includes(value)) {
      return value as FoodSearchTab;
    }
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[Food Search] Failed to read last tab: ${message}`, 'WARNING');
    return null;
  }
}

export async function setLastUsedTab(tab: FoodSearchTab): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_TAB_KEY, tab);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[Food Search] Failed to persist last tab: ${message}`, 'WARNING');
  }
}
