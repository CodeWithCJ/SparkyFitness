import AsyncStorage from '@react-native-async-storage/async-storage';
import { addLog } from './LogService';

// One-time coaching popovers for the food search screen. Each is a one-time
// nudge whose "seen" flag lives under its own namespaced key, so dismissing one
// never affects another. A shared factory gives every popover the same
// hasSeen/markSeen/reset surface — add another by appending one line below and
// rendering it on the screen; DevTools renders a reset button per registered
// popover automatically.
export type FoodSearchPopover = {
  id: string;
  /** Short label for the DevTools reset button. */
  resetLabel: string;
  hasSeen: () => Promise<boolean>;
  markSeen: () => Promise<void>;
  reset: () => Promise<void>;
};

function createFoodSearchPopover(
  id: string,
  storageKey: string,
  resetLabel: string,
): FoodSearchPopover {
  return {
    id,
    resetLabel,
    async hasSeen() {
      try {
        const value = await AsyncStorage.getItem(storageKey);
        return value === 'true';
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        addLog(`[Food Search] Failed to read ${id} popover flag: ${message}`, 'WARNING');
        // Treat read failures as "seen" so a flaky storage read never spams the
        // popover on every visit.
        return true;
      }
    },
    async markSeen() {
      try {
        await AsyncStorage.setItem(storageKey, 'true');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        addLog(`[Food Search] Failed to persist ${id} popover flag: ${message}`, 'WARNING');
      }
    },
    async reset() {
      try {
        await AsyncStorage.removeItem(storageKey);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        addLog(`[Food Search] Failed to reset ${id} popover flag: ${message}`, 'WARNING');
      }
    },
  };
}

// Intro popover: explains that local + online sources are searched together,
// anchored under the search bar on first visit.
export const searchSourcesPopover = createFoodSearchPopover(
  'sources',
  '@FoodSearch:seenSourcesPopover',
  'Sources Intro',
);

// Source-switcher popover: points at the online-results source selector once a
// search has produced online results, explaining how to change source / search
// all sources at once.
export const providerSelectorPopover = createFoodSearchPopover(
  'provider',
  '@FoodSearch:seenProviderPopover',
  'Source Switcher',
);

// Every food-search coaching popover, used by DevTools to render one reset
// button per popover.
export const FOOD_SEARCH_POPOVERS: readonly FoodSearchPopover[] = [
  searchSourcesPopover,
  providerSelectorPopover,
];
