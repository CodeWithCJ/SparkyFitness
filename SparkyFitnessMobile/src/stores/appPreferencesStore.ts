import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

const STORE_KEY = '@SparkyFitness/app-preferences';
const STORE_VERSION = 1;

/**
 * Legacy per-key AsyncStorage entries that existed before this store was
 * introduced. The custom storage adapter reads these when no combined key is
 * found, so existing users' toggle choices survive the upgrade.
 */
const LEGACY_KEYS = {
  hapticsEnabled: '@HealthConnect:hapticsEnabled',
  soundsEnabled: '@HealthConnect:soundsEnabled',
  notificationsEnabled: '@HealthConnect:notificationsEnabled',
  hydrationCardVisible: '@HealthConnect:hydrationCardVisible',
  fastingCardVisible: '@HealthConnect:fastingCardVisible',
  askSparkyVisible: '@HealthConnect:askSparkyVisible',
  liquidGlassTabBarEnabled: '@HealthConnect:liquidGlassTabBarEnabled',
} as const;

type LegacyKey = keyof typeof LEGACY_KEYS;

/** Which stat the active-workout log shows in its per-set metric column. */
export type ActiveWorkoutMetricColumn = 'rpe' | 'volume' | 'e1rm' | 'tenrm';

export const PREFERENCE_DEFAULTS = {
  hapticsEnabled: true,
  soundsEnabled: true,
  notificationsEnabled: true,
  hydrationCardVisible: true,
  fastingCardVisible: true,
  askSparkyVisible: true,
  liquidGlassTabBarEnabled: false,
  activeWorkoutMetricColumn: 'rpe' as ActiveWorkoutMetricColumn,
} as const;

export type AppPreferencesData = {
  hapticsEnabled: boolean;
  soundsEnabled: boolean;
  notificationsEnabled: boolean;
  hydrationCardVisible: boolean;
  fastingCardVisible: boolean;
  askSparkyVisible: boolean;
  liquidGlassTabBarEnabled: boolean;
  activeWorkoutMetricColumn: ActiveWorkoutMetricColumn;
};

export interface AppPreferencesState extends AppPreferencesData {
  setHapticsEnabled: (value: boolean) => void;
  setSoundsEnabled: (value: boolean) => void;
  setNotificationsEnabled: (value: boolean) => void;
  setHydrationCardVisible: (value: boolean) => void;
  setFastingCardVisible: (value: boolean) => void;
  setAskSparkyVisible: (value: boolean) => void;
  setLiquidGlassTabBarEnabled: (value: boolean) => void;
  setActiveWorkoutMetricColumn: (value: ActiveWorkoutMetricColumn) => void;
}

/**
 * Custom storage adapter wrapping AsyncStorage. When the combined store key
 * does not exist yet (first run after upgrading from the per-key pattern), it
 * reads from the seven legacy keys and synthesizes a v0 state blob, which the
 * `migrate` function then promotes to v1. On all subsequent launches the
 * combined key exists, so the legacy keys are never read again.
 */
const legacyAwareStorage = {
  getItem: async (name: string): Promise<string | null> => {
    const stored = await AsyncStorage.getItem(name);
    if (stored !== null) return stored;

    // No combined key yet — check whether any legacy per-key values exist.
    const entries = await Promise.all(
      (Object.entries(LEGACY_KEYS) as [LegacyKey, string][]).map(async ([field, key]) => {
        const val = await AsyncStorage.getItem(key);
        return [field, val] as const;
      }),
    );

    const hasAnyLegacy = entries.some(([, val]) => val !== null);
    if (!hasAnyLegacy) return null;

    // Build a v0 state blob. Fields absent from legacy storage fall back to the
    // store defaults so only explicitly-saved choices are honoured.
    const state: Partial<AppPreferencesData> = {};
    for (const [field, val] of entries) {
      state[field] = val !== null ? val === 'true' : PREFERENCE_DEFAULTS[field];
    }
    return JSON.stringify({ state, version: 0 });
  },
  setItem: (name: string, value: string): Promise<void> =>
    AsyncStorage.setItem(name, value),
  removeItem: (name: string): Promise<void> => AsyncStorage.removeItem(name),
};

export const useAppPreferencesStore = create<AppPreferencesState>()(
  persist(
    (set) => ({
      ...PREFERENCE_DEFAULTS,

      setHapticsEnabled: (value) => set({ hapticsEnabled: value }),
      setSoundsEnabled: (value) => set({ soundsEnabled: value }),
      setNotificationsEnabled: (value) => set({ notificationsEnabled: value }),
      setHydrationCardVisible: (value) => set({ hydrationCardVisible: value }),
      setFastingCardVisible: (value) => set({ fastingCardVisible: value }),
      setAskSparkyVisible: (value) => set({ askSparkyVisible: value }),
      setLiquidGlassTabBarEnabled: (value) => set({ liquidGlassTabBarEnabled: value }),
      setActiveWorkoutMetricColumn: (value) => set({ activeWorkoutMetricColumn: value }),
    }),
    {
      name: STORE_KEY,
      version: STORE_VERSION,
      storage: createJSONStorage(() => legacyAwareStorage),
      partialize: (state) => ({
        hapticsEnabled: state.hapticsEnabled,
        soundsEnabled: state.soundsEnabled,
        notificationsEnabled: state.notificationsEnabled,
        hydrationCardVisible: state.hydrationCardVisible,
        fastingCardVisible: state.fastingCardVisible,
        askSparkyVisible: state.askSparkyVisible,
        liquidGlassTabBarEnabled: state.liquidGlassTabBarEnabled,
        // Older persisted blobs without this key backfill via the default
        // shallow merge — no version bump needed.
        activeWorkoutMetricColumn: state.activeWorkoutMetricColumn,
      }),
      migrate: (persistedState, version) => {
        if (
          version >= STORE_VERSION ||
          !persistedState ||
          typeof persistedState !== 'object'
        ) {
          return persistedState as AppPreferencesState;
        }
        // v0 → v1: state was populated from legacy per-key storage by the custom
        // storage adapter. Field names are unchanged; apply defaults for any gaps.
        return {
          ...PREFERENCE_DEFAULTS,
          ...(persistedState as Partial<AppPreferencesData>),
        } as AppPreferencesState;
      },
    },
  ),
);

/**
 * Test-only helper — resets store state to defaults and clears the persisted
 * AsyncStorage entry. Mirrors the pattern used by activeWorkoutStore.
 */
export function __resetAppPreferencesStoreForTests(): void {
  useAppPreferencesStore.setState({ ...PREFERENCE_DEFAULTS });
  void AsyncStorage.removeItem(STORE_KEY);
}
