import AsyncStorage from '@react-native-async-storage/async-storage';
import { HEALTH_TREND_KEYS } from '../../src/constants/healthTrends';
import { WATCH_PAGE_KEYS } from '../../src/constants/watchPages';
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
      expect(state.diarySummaryVisible).toBe(false);
      expect(state.diarySummaryExpanded).toBe(false);
      expect(state.defaultRestSec).toBe(90);
      expect(state.languagePreference).toBe('system');
      expect(state.restTimerSoundEnabled).toBe(true);
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
      expect(useAppPreferencesStore.getState().liquidGlassTabBarEnabled).toBe(
        true
      );

      store.setActiveWorkoutMetricColumn('e1rm');
      expect(useAppPreferencesStore.getState().activeWorkoutMetricColumn).toBe(
        'e1rm'
      );

      store.setDiarySummaryVisible(true);
      expect(useAppPreferencesStore.getState().diarySummaryVisible).toBe(true);
      expect(useAppPreferencesStore.getState().diarySummaryExpanded).toBe(
        false
      );

      store.setDiarySummaryExpanded(true);
      expect(useAppPreferencesStore.getState().diarySummaryExpanded).toBe(true);

      store.setDefaultRestSec(120);
      expect(useAppPreferencesStore.getState().defaultRestSec).toBe(120);

      store.setLanguagePreference('pl');
      expect(useAppPreferencesStore.getState().languagePreference).toBe('pl');

      store.setRestTimerSoundEnabled(false);
      expect(useAppPreferencesStore.getState().restTimerSoundEnabled).toBe(
        false
      );
    });
  });

  describe('health trend preferences', () => {
    it('defaults to the full registry order with nothing hidden', () => {
      const state = useAppPreferencesStore.getState();

      expect(state.healthTrendOrder).toEqual([...HEALTH_TREND_KEYS]);
      expect(state.hiddenHealthTrends).toEqual([]);
    });

    it('writes order and hidden keys independently with new setters', () => {
      const store = useAppPreferencesStore.getState();
      store.setHealthTrendOrder(['weight', 'sleep', 'steps']);
      expect(useAppPreferencesStore.getState().healthTrendOrder).toEqual([
        'weight',
        'sleep',
        'steps',
      ]);

      store.setHealthTrendHidden('steps', true);
      expect(useAppPreferencesStore.getState().hiddenHealthTrends).toEqual([
        'steps',
      ]);

      store.setHealthTrendHidden('steps', false);
      expect(useAppPreferencesStore.getState().hiddenHealthTrends).toEqual([]);
    });

    it('backfills both fields from a persisted blob written before they existed', async () => {
      // Proves the shallow-merge rehydrate covers these keys, so registering them
      // needed no STORE_VERSION bump.
      const withoutHealthTrends = { ...PREFERENCE_DEFAULTS } as Record<
        string,
        unknown
      >;
      delete withoutHealthTrends.healthTrendOrder;
      delete withoutHealthTrends.hiddenHealthTrends;
      await AsyncStorage.setItem(
        '@SparkyFitness/app-preferences',
        JSON.stringify({
          state: { ...withoutHealthTrends, soundsEnabled: false },
          version: 1,
        })
      );

      await useAppPreferencesStore.persist.rehydrate();

      const state = useAppPreferencesStore.getState();
      expect(state.soundsEnabled).toBe(false); // persisted values honoured
      expect(state.healthTrendOrder).toEqual([...HEALTH_TREND_KEYS]);
      expect(state.hiddenHealthTrends).toEqual([]);
    });
  });

  describe('watch page preferences', () => {
    it('defaults to every page, in the order the watch shipped with', () => {
      const state = useAppPreferencesStore.getState();
      expect(state.watchPageOrder).toEqual([...WATCH_PAGE_KEYS]);
      expect(state.hiddenWatchPages).toEqual([]);
    });

    it('writes order and hidden pages independently', () => {
      const store = useAppPreferencesStore.getState();
      store.setWatchPageOrder(['workout', 'goals', 'water', 'entry', 'trend']);
      expect(useAppPreferencesStore.getState().watchPageOrder[0]).toBe(
        'workout'
      );

      store.setWatchPageHidden('trend', true);
      store.setWatchPageHidden('trend', true);
      expect(useAppPreferencesStore.getState().hiddenWatchPages).toEqual([
        'trend',
      ]);

      store.setWatchPageHidden('trend', false);
      expect(useAppPreferencesStore.getState().hiddenWatchPages).toEqual([]);
    });

    it('shows the three macros on the Goals page until the wearer picks', () => {
      const store = useAppPreferencesStore.getState();
      expect(store.shownWatchNutrients).toEqual(['protein', 'carbs', 'fat']);

      store.setWatchNutrientShown('sodium', true);
      store.setWatchNutrientShown('fat', false);
      expect(useAppPreferencesStore.getState().shownWatchNutrients).toEqual([
        'protein',
        'carbs',
        'sodium',
      ]);
    });
  });

  describe('dashboard card preferences', () => {
    it('defaults to the full registry order', () => {
      const state = useAppPreferencesStore.getState();
      expect(state.dashboardCardOrder).toEqual([
        'calorieRing',
        'askSparky',
        'macros',
        'exercise',
        'hydration',
        'caffeine',
        'fasting',
        'cycle',
        'medications',
        'symptoms',
        'mood',
        'progressPhotos',
        'healthTrends',
        'mindfulness',
      ]);
    });

    it('updates dashboard card order', () => {
      const newOrder = ['fasting', 'hydration', 'caffeine'] as never[];
      useAppPreferencesStore.getState().setDashboardCardOrder(newOrder);
      expect(useAppPreferencesStore.getState().dashboardCardOrder).toEqual(
        newOrder
      );
    });

    it('persists symptomsCardVisible across storage write', async () => {
      useAppPreferencesStore.getState().setSymptomsCardVisible(false);
      expect(useAppPreferencesStore.getState().symptomsCardVisible).toBe(false);
      const raw = await AsyncStorage.getItem('@SparkyFitness/app-preferences');
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw!);
      expect(parsed.state.symptomsCardVisible).toBe(false);
    });
  });

  describe('activeWorkoutMetricColumn backfill', () => {
    it('falls back to the default when an older persisted blob lacks the key', async () => {
      const withoutMetricColumn = { ...PREFERENCE_DEFAULTS } as Record<
        string,
        unknown
      >;
      delete withoutMetricColumn.activeWorkoutMetricColumn;
      await AsyncStorage.setItem(
        '@SparkyFitness/app-preferences',
        JSON.stringify({
          state: { ...withoutMetricColumn, soundsEnabled: false },
          version: 1,
        })
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
      await AsyncStorage.setItem(
        '@HealthConnect:liquidGlassTabBarEnabled',
        'true'
      );

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
      await AsyncStorage.setItem(
        '@SparkyFitness/app-preferences',
        combinedValue
      );

      // Legacy key has a different value — should be ignored.
      await AsyncStorage.setItem('@HealthConnect:soundsEnabled', 'true');

      await useAppPreferencesStore.persist.rehydrate();

      expect(useAppPreferencesStore.getState().soundsEnabled).toBe(false);
    });
  });
});
