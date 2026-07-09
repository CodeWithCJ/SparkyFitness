import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useAppPreferencesStore,
  PREFERENCE_DEFAULTS,
  __resetAppPreferencesStoreForTests,
} from '../../src/stores/appPreferencesStore';

describe('appPreferencesStore', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    __resetAppPreferencesStoreForTests();
  });

  describe('defaults', () => {
    it('starts with all expected defaults', () => {
      const state = useAppPreferencesStore.getState();
      expect(state.hapticsEnabled).toBe(true);
      expect(state.soundsEnabled).toBe(true);
      expect(state.notificationsEnabled).toBe(true);
      expect(state.hydrationCardVisible).toBe(true);
      expect(state.fastingCardVisible).toBe(true);
      expect(state.askSparkyVisible).toBe(true);
      expect(state.liquidGlassTabBarEnabled).toBe(false);
      expect(state.activeWorkoutMetricColumn).toBe('rpe');
    });
  });

  describe('setters', () => {
    it('updates each preference independently', () => {
      const store = useAppPreferencesStore.getState();

      store.setSoundsEnabled(false);
      expect(useAppPreferencesStore.getState().soundsEnabled).toBe(false);
      expect(useAppPreferencesStore.getState().hapticsEnabled).toBe(true);

      store.setHapticsEnabled(false);
      expect(useAppPreferencesStore.getState().hapticsEnabled).toBe(false);

      store.setLiquidGlassTabBarEnabled(true);
      expect(useAppPreferencesStore.getState().liquidGlassTabBarEnabled).toBe(true);

      store.setActiveWorkoutMetricColumn('e1rm');
      expect(useAppPreferencesStore.getState().activeWorkoutMetricColumn).toBe('e1rm');
    });
  });

  describe('activeWorkoutMetricColumn backfill', () => {
    it('falls back to the default when an older persisted blob lacks the key', async () => {
      const withoutMetricColumn = { ...PREFERENCE_DEFAULTS } as Record<string, unknown>;
      delete withoutMetricColumn.activeWorkoutMetricColumn;
      await AsyncStorage.setItem(
        '@SparkyFitness/app-preferences',
        JSON.stringify({ state: { ...withoutMetricColumn, soundsEnabled: false }, version: 1 }),
      );

      await useAppPreferencesStore.persist.rehydrate();

      const state = useAppPreferencesStore.getState();
      expect(state.soundsEnabled).toBe(false); // persisted values honoured
      expect(state.activeWorkoutMetricColumn).toBe('rpe'); // shallow-merge backfill
    });
  });

  describe('legacy per-key migration', () => {
    it('picks up legacy @HealthConnect:* values when no combined key exists', async () => {
      // Pre-seed some legacy per-key AsyncStorage entries as if the user had
      // previously saved them with the old booleanPreference factory.
      await AsyncStorage.setItem('@HealthConnect:soundsEnabled', 'false');
      await AsyncStorage.setItem('@HealthConnect:hapticsEnabled', 'false');
      await AsyncStorage.setItem('@HealthConnect:liquidGlassTabBarEnabled', 'true');

      // Force re-hydration from storage (simulates cold-start with legacy data).
      await useAppPreferencesStore.persist.rehydrate();

      const state = useAppPreferencesStore.getState();
      expect(state.soundsEnabled).toBe(false);
      expect(state.hapticsEnabled).toBe(false);
      expect(state.liquidGlassTabBarEnabled).toBe(true);
      // Unset legacy keys fall back to store defaults.
      expect(state.notificationsEnabled).toBe(true);
      expect(state.hydrationCardVisible).toBe(true);
      expect(state.fastingCardVisible).toBe(true);
      expect(state.askSparkyVisible).toBe(true);
    });

    it('uses store defaults when no legacy keys and no combined key exist', async () => {
      // Nothing in storage — clean install.
      await useAppPreferencesStore.persist.rehydrate();

      const state = useAppPreferencesStore.getState();
      expect(state).toMatchObject(PREFERENCE_DEFAULTS);
    });

    it('ignores legacy keys once the combined key has been written', async () => {
      // Combined store key already present (user upgraded, already migrated).
      const combinedValue = JSON.stringify({
        state: { ...PREFERENCE_DEFAULTS, soundsEnabled: false },
        version: 1,
      });
      await AsyncStorage.setItem('@SparkyFitness/app-preferences', combinedValue);

      // Legacy key has a different value — should be ignored.
      await AsyncStorage.setItem('@HealthConnect:soundsEnabled', 'true');

      await useAppPreferencesStore.persist.rehydrate();

      expect(useAppPreferencesStore.getState().soundsEnabled).toBe(false);
    });
  });
});
