import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_GUIDED_COUNTDOWN_SEC,
  DEFAULT_GUIDED_SPEECH_RATE,
  clampGuidedCountdownSec,
  clampGuidedSpeechRate,
} from '@workspace/shared';
import {
  DEFAULT_WARMUP_DUMBBELL_ROUNDING,
  DEFAULT_WARMUP_METHOD,
  DEFAULT_WARMUP_PLATE_ROUNDING,
  normalizeWarmupMethod,
  type WarmupMethodStep,
} from '@workspace/shared';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  DASHBOARD_CARD_KEYS,
  type DashboardCardKey,
} from '../constants/dashboardCards';
import {
  HEALTH_TREND_KEYS,
  type HealthTrendKey,
} from '../constants/healthTrends';
import {
  DEFAULT_WATCH_NUTRIENTS,
  WATCH_PAGE_KEYS,
  type WatchPageKey,
  type WatchSetInputStyle,
} from '../constants/watchPages';
import type { LanguagePreference } from '../localization';
import type { OwnershipFilter } from '../utils/shareStatus';

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
  caffeineCardVisible: '@HealthConnect:caffeineCardVisible',
  fastingCardVisible: '@HealthConnect:fastingCardVisible',
  askSparkyVisible: '@HealthConnect:askSparkyVisible',
  liquidGlassTabBarEnabled: '@HealthConnect:liquidGlassTabBarEnabled',
} as const;

type LegacyKey = keyof typeof LEGACY_KEYS;

/** Which stat the active-workout log shows in its per-set metric column. */
export type ActiveWorkoutMetricColumn =
  'rpe' | 'rir' | 'volume' | 'e1rm' | 'tenrm';

/** Hours without a water log before a hydration reminder fires. */
export const WATER_REMINDER_INTERVAL_OPTIONS = [1, 2, 3, 4] as const;
export type WaterReminderIntervalHours =
  (typeof WATER_REMINDER_INTERVAL_OPTIONS)[number];

/** Factory default rest period between sets, in seconds. */
export const DEFAULT_REST_SEC = 90;

export const PREFERENCE_DEFAULTS = {
  hapticsEnabled: true,
  soundsEnabled: true,
  notificationsEnabled: true,
  restTimerNotificationsEnabled: true,
  fastingGoalNotificationsEnabled: true,
  calorieRingCardVisible: true,
  macrosCardVisible: true,
  exerciseCardVisible: true,
  hydrationCardVisible: true,
  caffeineCardVisible: true,
  fastingCardVisible: true,
  cycleCardVisible: true,
  askSparkyVisible: true,
  medicationsCardVisible: true,
  symptomsCardVisible: true,
  moodCardVisible: true,
  progressPhotosCardVisible: true,
  onDeviceLabelScanEnabled: true,
  healthTrendsCardVisible: true,
  mindfulnessCardVisible: true,
  dashboardCardOrder: [...DASHBOARD_CARD_KEYS] as DashboardCardKey[],
  medicationRemindersEnabled: true,
  medicationReminderRepeats: true,
  medicationReminderHideNames: false,
  medicationReminderConsolidate: true,
  waterReminderEnabled: false,
  waterReminderIntervalHours: 2 as WaterReminderIntervalHours,
  waterReminderWindowStart: '08:00' as string,
  waterReminderWindowEnd: '22:00' as string,
  liquidGlassTabBarEnabled: false,
  activeWorkoutMetricColumn: 'rpe' as ActiveWorkoutMetricColumn,
  diarySummaryVisible: false,
  diarySummaryExpanded: false,
  defaultRestSec: DEFAULT_REST_SEC as number,
  restTimerSoundEnabled: true,
  restChimeThroughSilent: false,
  duckMusicDuringCues: false,
  workoutKeepAwakeEnabled: false,
  warmupCalculatorEnabled: true,
  warmupMethod: DEFAULT_WARMUP_METHOD.map((step) => ({ ...step })),
  warmupPlateRounding: { ...DEFAULT_WARMUP_PLATE_ROUNDING },
  warmupDumbbellRounding: { ...DEFAULT_WARMUP_DUMBBELL_ROUNDING },
  guidedWorkoutEnabled: false,
  guidedVoiceId: null as string | null,
  guidedSpeechRate: DEFAULT_GUIDED_SPEECH_RATE as number,
  guidedCountdownSec: DEFAULT_GUIDED_COUNTDOWN_SEC as number,
  languagePreference: 'system' as LanguagePreference,
  healthTrendOrder: [...HEALTH_TREND_KEYS] as HealthTrendKey[],
  hiddenHealthTrends: [] as HealthTrendKey[],
  watchPageOrder: [...WATCH_PAGE_KEYS] as WatchPageKey[],
  hiddenWatchPages: [] as WatchPageKey[],
  watchDoubleTapEnabled: true,
  watchRpeEnabled: false,
  watchNutrientOrder: [] as string[],
  shownWatchNutrients: [...DEFAULT_WATCH_NUTRIENTS] as string[],
  watchSetInputStyle: 'keypad' as WatchSetInputStyle,
  foodSearchOwnershipFilter: 'all' as OwnershipFilter,
  foodsLibraryOwnershipFilter: 'all' as OwnershipFilter,
  mealsLibraryOwnershipFilter: 'all' as OwnershipFilter,
  exercisesLibraryOwnershipFilter: 'all' as OwnershipFilter,
  workoutPresetsLibraryOwnershipFilter: 'all' as OwnershipFilter,
  exerciseSearchOwnershipFilter: 'all' as OwnershipFilter,
  presetSearchOwnershipFilter: 'all' as OwnershipFilter,
} as const;

export type AppPreferencesData = {
  hapticsEnabled: boolean;
  soundsEnabled: boolean;
  notificationsEnabled: boolean;
  restTimerNotificationsEnabled: boolean;
  fastingGoalNotificationsEnabled: boolean;
  calorieRingCardVisible: boolean;
  macrosCardVisible: boolean;
  exerciseCardVisible: boolean;
  hydrationCardVisible: boolean;
  caffeineCardVisible: boolean;
  fastingCardVisible: boolean;
  cycleCardVisible: boolean;
  askSparkyVisible: boolean;
  medicationsCardVisible: boolean;
  symptomsCardVisible: boolean;
  moodCardVisible: boolean;
  progressPhotosCardVisible: boolean;
  onDeviceLabelScanEnabled: boolean;
  healthTrendsCardVisible: boolean;
  mindfulnessCardVisible: boolean;
  dashboardCardOrder: DashboardCardKey[];
  medicationRemindersEnabled: boolean;
  medicationReminderRepeats: boolean;
  medicationReminderHideNames: boolean;
  medicationReminderConsolidate: boolean;
  waterReminderEnabled: boolean;
  waterReminderIntervalHours: WaterReminderIntervalHours;
  waterReminderWindowStart: string;
  waterReminderWindowEnd: string;
  liquidGlassTabBarEnabled: boolean;
  activeWorkoutMetricColumn: ActiveWorkoutMetricColumn;
  diarySummaryVisible: boolean;
  diarySummaryExpanded: boolean;
  defaultRestSec: number;
  restTimerSoundEnabled: boolean;
  /**
   * Play the rest chime even with the ringer/silent switch off (#2506). On iOS
   * it also sounds with the app in the background, which keeps the audio
   * session alive for the length of each rest. Off by default.
   */
  restChimeThroughSilent: boolean;
  /**
   * Lower other apps' music while an interval cue or guided line plays
   * (#1560). Off by default: cues normally mix over music untouched.
   */
  duckMusicDuringCues: boolean;
  workoutKeepAwakeEnabled: boolean;
  /** Offer "Add warm-ups" on an exercise's menu. */
  warmupCalculatorEnabled: boolean;
  /** The warm-up ramp: percent of the working weight x reps, ascending. */
  warmupMethod: WarmupMethodStep[];
  /** Step warm-up weights round to on a bar, per display unit. */
  warmupPlateRounding: { kg: number; lbs: number };
  /** Step warm-up weights round to for dumbbell exercises, per display unit. */
  warmupDumbbellRounding: { kg: number; lbs: number };
  /** Guided workout mode (#1507): spoken cues + guided card. Off by default. */
  guidedWorkoutEnabled: boolean;
  /** expo-speech voice identifier; null uses the device default for the app language. */
  guidedVoiceId: string | null;
  guidedSpeechRate: number;
  guidedCountdownSec: number;
  languagePreference: LanguagePreference;
  healthTrendOrder: HealthTrendKey[];
  hiddenHealthTrends: HealthTrendKey[];
  /** Swipe order of the Apple Watch app's pages; sent to the watch. */
  watchPageOrder: WatchPageKey[];
  /** Watch pages turned off in Settings → Apple Watch. */
  hiddenWatchPages: WatchPageKey[];
  /** Whether the watch's double-tap gesture logs the current set. */
  watchDoubleTapEnabled: boolean;
  /** Whether the watch asks for an effort (RPE) after each logged set. */
  watchRpeEnabled: boolean;
  /**
   * Order of the nutrients the watch's Goals page can list (standard keys and
   * custom nutrient names). Empty until the wearer drags one.
   */
  watchNutrientOrder: string[];
  /** The nutrients the Goals page lists under the calorie ring. */
  shownWatchNutrients: string[];
  /** How the watch takes a set's weight and reps: keypad or Digital Crown. */
  watchSetInputStyle: WatchSetInputStyle;
  foodSearchOwnershipFilter: OwnershipFilter;
  foodsLibraryOwnershipFilter: OwnershipFilter;
  mealsLibraryOwnershipFilter: OwnershipFilter;
  exercisesLibraryOwnershipFilter: OwnershipFilter;
  workoutPresetsLibraryOwnershipFilter: OwnershipFilter;
  exerciseSearchOwnershipFilter: OwnershipFilter;
  presetSearchOwnershipFilter: OwnershipFilter;
};

export interface AppPreferencesState extends AppPreferencesData {
  setHapticsEnabled: (value: boolean) => void;
  setSoundsEnabled: (value: boolean) => void;
  setNotificationsEnabled: (value: boolean) => void;
  setRestTimerNotificationsEnabled: (value: boolean) => void;
  setFastingGoalNotificationsEnabled: (value: boolean) => void;
  setCalorieRingCardVisible: (value: boolean) => void;
  setMacrosCardVisible: (value: boolean) => void;
  setExerciseCardVisible: (value: boolean) => void;
  setHydrationCardVisible: (value: boolean) => void;
  setCaffeineCardVisible: (value: boolean) => void;
  setFastingCardVisible: (value: boolean) => void;
  setCycleCardVisible: (value: boolean) => void;
  setAskSparkyVisible: (value: boolean) => void;
  setMedicationsCardVisible: (value: boolean) => void;
  setSymptomsCardVisible: (value: boolean) => void;
  setMoodCardVisible: (value: boolean) => void;
  setProgressPhotosCardVisible: (value: boolean) => void;
  setOnDeviceLabelScanEnabled: (value: boolean) => void;
  setHealthTrendsCardVisible: (value: boolean) => void;
  setMindfulnessCardVisible: (value: boolean) => void;
  setDashboardCardOrder: (order: DashboardCardKey[]) => void;
  setMedicationRemindersEnabled: (value: boolean) => void;
  setMedicationReminderRepeats: (value: boolean) => void;
  setMedicationReminderHideNames: (value: boolean) => void;
  setMedicationReminderConsolidate: (value: boolean) => void;
  setWaterReminderEnabled: (value: boolean) => void;
  setWaterReminderIntervalHours: (value: WaterReminderIntervalHours) => void;
  setWaterReminderWindow: (start: string, end: string) => void;
  setLiquidGlassTabBarEnabled: (value: boolean) => void;
  setActiveWorkoutMetricColumn: (value: ActiveWorkoutMetricColumn) => void;
  setDiarySummaryVisible: (value: boolean) => void;
  setDiarySummaryExpanded: (value: boolean) => void;
  setDefaultRestSec: (value: number) => void;
  setRestTimerSoundEnabled: (value: boolean) => void;
  setRestChimeThroughSilent: (value: boolean) => void;
  setDuckMusicDuringCues: (value: boolean) => void;
  setWorkoutKeepAwakeEnabled: (value: boolean) => void;
  setWarmupCalculatorEnabled: (value: boolean) => void;
  setWarmupMethod: (steps: readonly WarmupMethodStep[]) => void;
  setWarmupPlateRounding: (unit: 'kg' | 'lbs', value: number) => void;
  setWarmupDumbbellRounding: (unit: 'kg' | 'lbs', value: number) => void;
  setGuidedWorkoutEnabled: (value: boolean) => void;
  setGuidedVoiceId: (value: string | null) => void;
  setGuidedSpeechRate: (value: number) => void;
  setGuidedCountdownSec: (value: number) => void;
  setLanguagePreference: (value: LanguagePreference) => void;
  setHealthTrendOrder: (order: HealthTrendKey[]) => void;
  setHealthTrendHidden: (key: HealthTrendKey, isHidden: boolean) => void;
  setWatchPageOrder: (order: WatchPageKey[]) => void;
  setWatchPageHidden: (key: WatchPageKey, isHidden: boolean) => void;
  setWatchDoubleTapEnabled: (value: boolean) => void;
  setWatchRpeEnabled: (value: boolean) => void;
  setWatchNutrientOrder: (order: string[]) => void;
  setWatchNutrientShown: (key: string, isShown: boolean) => void;
  setWatchSetInputStyle: (value: WatchSetInputStyle) => void;
  setFoodSearchOwnershipFilter: (value: OwnershipFilter) => void;
  setFoodsLibraryOwnershipFilter: (value: OwnershipFilter) => void;
  setMealsLibraryOwnershipFilter: (value: OwnershipFilter) => void;
  setExercisesLibraryOwnershipFilter: (value: OwnershipFilter) => void;
  setWorkoutPresetsLibraryOwnershipFilter: (value: OwnershipFilter) => void;
  setExerciseSearchOwnershipFilter: (value: OwnershipFilter) => void;
  setPresetSearchOwnershipFilter: (value: OwnershipFilter) => void;
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
      (Object.entries(LEGACY_KEYS) as [LegacyKey, string][]).map(
        async ([field, key]) => {
          const val = await AsyncStorage.getItem(key);
          return [field, val] as const;
        }
      )
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

/** `list` with `key` added (`include`) or removed, without duplicates. */
function withMembership<K>(list: readonly K[], key: K, include: boolean): K[] {
  const members = new Set(list);
  if (include) {
    members.add(key);
  } else {
    members.delete(key);
  }
  return Array.from(members);
}

export const useAppPreferencesStore = create<AppPreferencesState>()(
  persist(
    (set) => ({
      ...PREFERENCE_DEFAULTS,

      setHapticsEnabled: (value) => set({ hapticsEnabled: value }),
      setSoundsEnabled: (value) => set({ soundsEnabled: value }),
      setNotificationsEnabled: (value) => set({ notificationsEnabled: value }),
      setRestTimerNotificationsEnabled: (value) =>
        set({ restTimerNotificationsEnabled: value }),
      setFastingGoalNotificationsEnabled: (value) =>
        set({ fastingGoalNotificationsEnabled: value }),
      setCalorieRingCardVisible: (value) =>
        set({ calorieRingCardVisible: value }),
      setMacrosCardVisible: (value) => set({ macrosCardVisible: value }),
      setExerciseCardVisible: (value) => set({ exerciseCardVisible: value }),
      setHydrationCardVisible: (value) => set({ hydrationCardVisible: value }),
      setCaffeineCardVisible: (value) => set({ caffeineCardVisible: value }),
      setFastingCardVisible: (value) => set({ fastingCardVisible: value }),
      setCycleCardVisible: (value) => set({ cycleCardVisible: value }),
      setAskSparkyVisible: (value) => set({ askSparkyVisible: value }),
      setMedicationsCardVisible: (value) =>
        set({ medicationsCardVisible: value }),
      setSymptomsCardVisible: (value) => set({ symptomsCardVisible: value }),
      setMoodCardVisible: (value) => set({ moodCardVisible: value }),
      setProgressPhotosCardVisible: (value) =>
        set({ progressPhotosCardVisible: value }),
      setOnDeviceLabelScanEnabled: (value) =>
        set({ onDeviceLabelScanEnabled: value }),
      setHealthTrendsCardVisible: (value) =>
        set({ healthTrendsCardVisible: value }),
      setMindfulnessCardVisible: (value) =>
        set({ mindfulnessCardVisible: value }),
      setDashboardCardOrder: (order) => set({ dashboardCardOrder: order }),
      setMedicationRemindersEnabled: (value) =>
        set({ medicationRemindersEnabled: value }),
      setMedicationReminderRepeats: (value) =>
        set({ medicationReminderRepeats: value }),
      setMedicationReminderHideNames: (value) =>
        set({ medicationReminderHideNames: value }),
      setMedicationReminderConsolidate: (value) =>
        set({ medicationReminderConsolidate: value }),
      setWaterReminderEnabled: (value) => set({ waterReminderEnabled: value }),
      setWaterReminderIntervalHours: (value) =>
        set({ waterReminderIntervalHours: value }),
      setWaterReminderWindow: (start, end) =>
        set({ waterReminderWindowStart: start, waterReminderWindowEnd: end }),
      setLiquidGlassTabBarEnabled: (value) =>
        set({ liquidGlassTabBarEnabled: value }),
      setActiveWorkoutMetricColumn: (value) =>
        set({ activeWorkoutMetricColumn: value }),
      setDiarySummaryVisible: (value) => set({ diarySummaryVisible: value }),
      setDiarySummaryExpanded: (value) => set({ diarySummaryExpanded: value }),
      setDefaultRestSec: (value) => set({ defaultRestSec: value }),
      setRestTimerSoundEnabled: (value) =>
        set({ restTimerSoundEnabled: value }),
      setRestChimeThroughSilent: (value) =>
        set({ restChimeThroughSilent: value }),
      setDuckMusicDuringCues: (value) => set({ duckMusicDuringCues: value }),
      setWorkoutKeepAwakeEnabled: (value) =>
        set({ workoutKeepAwakeEnabled: value }),
      setWarmupCalculatorEnabled: (value) =>
        set({ warmupCalculatorEnabled: value }),
      setWarmupMethod: (steps) =>
        set({ warmupMethod: normalizeWarmupMethod(steps) }),
      setWarmupPlateRounding: (unit, value) =>
        set((state) => ({
          warmupPlateRounding: { ...state.warmupPlateRounding, [unit]: value },
        })),
      setWarmupDumbbellRounding: (unit, value) =>
        set((state) => ({
          warmupDumbbellRounding: {
            ...state.warmupDumbbellRounding,
            [unit]: value,
          },
        })),
      setGuidedWorkoutEnabled: (value) => set({ guidedWorkoutEnabled: value }),
      setGuidedVoiceId: (value) => set({ guidedVoiceId: value }),
      setGuidedSpeechRate: (value) =>
        set({ guidedSpeechRate: clampGuidedSpeechRate(value) }),
      setGuidedCountdownSec: (value) =>
        set({ guidedCountdownSec: clampGuidedCountdownSec(value) }),
      setLanguagePreference: (value) => set({ languagePreference: value }),
      setHealthTrendOrder: (order) => set({ healthTrendOrder: order }),
      setHealthTrendHidden: (key, isHidden) =>
        set((state) => ({
          hiddenHealthTrends: withMembership(
            state.hiddenHealthTrends,
            key,
            isHidden
          ),
        })),
      setWatchPageOrder: (order) => set({ watchPageOrder: order }),
      setWatchNutrientOrder: (order) => set({ watchNutrientOrder: order }),
      setWatchSetInputStyle: (value) => set({ watchSetInputStyle: value }),
      setWatchNutrientShown: (key, isShown) =>
        set((state) => ({
          shownWatchNutrients: withMembership(
            state.shownWatchNutrients,
            key,
            isShown
          ),
        })),
      setWatchDoubleTapEnabled: (value) =>
        set({ watchDoubleTapEnabled: value }),
      setWatchRpeEnabled: (value) => set({ watchRpeEnabled: value }),
      setWatchPageHidden: (key, isHidden) =>
        set((state) => ({
          hiddenWatchPages: withMembership(
            state.hiddenWatchPages,
            key,
            isHidden
          ),
        })),
      setFoodSearchOwnershipFilter: (value) =>
        set({ foodSearchOwnershipFilter: value }),
      setFoodsLibraryOwnershipFilter: (value) =>
        set({ foodsLibraryOwnershipFilter: value }),
      setMealsLibraryOwnershipFilter: (value) =>
        set({ mealsLibraryOwnershipFilter: value }),
      setExercisesLibraryOwnershipFilter: (value) =>
        set({ exercisesLibraryOwnershipFilter: value }),
      setWorkoutPresetsLibraryOwnershipFilter: (value) =>
        set({ workoutPresetsLibraryOwnershipFilter: value }),
      setExerciseSearchOwnershipFilter: (value) =>
        set({ exerciseSearchOwnershipFilter: value }),
      setPresetSearchOwnershipFilter: (value) =>
        set({ presetSearchOwnershipFilter: value }),
    }),
    {
      name: STORE_KEY,
      version: STORE_VERSION,
      storage: createJSONStorage(() => legacyAwareStorage),
      partialize: (state) => ({
        hapticsEnabled: state.hapticsEnabled,
        soundsEnabled: state.soundsEnabled,
        notificationsEnabled: state.notificationsEnabled,
        restTimerNotificationsEnabled: state.restTimerNotificationsEnabled,
        fastingGoalNotificationsEnabled: state.fastingGoalNotificationsEnabled,
        calorieRingCardVisible: state.calorieRingCardVisible,
        macrosCardVisible: state.macrosCardVisible,
        exerciseCardVisible: state.exerciseCardVisible,
        hydrationCardVisible: state.hydrationCardVisible,
        caffeineCardVisible: state.caffeineCardVisible,
        fastingCardVisible: state.fastingCardVisible,
        cycleCardVisible: state.cycleCardVisible,
        askSparkyVisible: state.askSparkyVisible,
        medicationsCardVisible: state.medicationsCardVisible,
        symptomsCardVisible: state.symptomsCardVisible,
        moodCardVisible: state.moodCardVisible,
        progressPhotosCardVisible: state.progressPhotosCardVisible,
        onDeviceLabelScanEnabled: state.onDeviceLabelScanEnabled,
        healthTrendsCardVisible: state.healthTrendsCardVisible,
        mindfulnessCardVisible: state.mindfulnessCardVisible,
        dashboardCardOrder: state.dashboardCardOrder,
        medicationRemindersEnabled: state.medicationRemindersEnabled,
        medicationReminderRepeats: state.medicationReminderRepeats,
        medicationReminderHideNames: state.medicationReminderHideNames,
        medicationReminderConsolidate: state.medicationReminderConsolidate,
        waterReminderEnabled: state.waterReminderEnabled,
        waterReminderIntervalHours: state.waterReminderIntervalHours,
        waterReminderWindowStart: state.waterReminderWindowStart,
        waterReminderWindowEnd: state.waterReminderWindowEnd,
        liquidGlassTabBarEnabled: state.liquidGlassTabBarEnabled,
        // Older persisted blobs without these keys backfill via the default
        // shallow merge — no version bump needed.
        activeWorkoutMetricColumn: state.activeWorkoutMetricColumn,
        diarySummaryVisible: state.diarySummaryVisible,
        diarySummaryExpanded: state.diarySummaryExpanded,
        defaultRestSec: state.defaultRestSec,
        restTimerSoundEnabled: state.restTimerSoundEnabled,
        restChimeThroughSilent: state.restChimeThroughSilent,
        duckMusicDuringCues: state.duckMusicDuringCues,
        workoutKeepAwakeEnabled: state.workoutKeepAwakeEnabled,
        warmupCalculatorEnabled: state.warmupCalculatorEnabled,
        warmupMethod: state.warmupMethod,
        warmupPlateRounding: state.warmupPlateRounding,
        warmupDumbbellRounding: state.warmupDumbbellRounding,
        guidedWorkoutEnabled: state.guidedWorkoutEnabled,
        guidedVoiceId: state.guidedVoiceId,
        guidedSpeechRate: state.guidedSpeechRate,
        guidedCountdownSec: state.guidedCountdownSec,
        languagePreference: state.languagePreference,
        healthTrendOrder: state.healthTrendOrder,
        hiddenHealthTrends: state.hiddenHealthTrends,
        watchPageOrder: state.watchPageOrder,
        hiddenWatchPages: state.hiddenWatchPages,
        watchDoubleTapEnabled: state.watchDoubleTapEnabled,
        watchRpeEnabled: state.watchRpeEnabled,
        watchNutrientOrder: state.watchNutrientOrder,
        shownWatchNutrients: state.shownWatchNutrients,
        watchSetInputStyle: state.watchSetInputStyle,
        foodSearchOwnershipFilter: state.foodSearchOwnershipFilter,
        foodsLibraryOwnershipFilter: state.foodsLibraryOwnershipFilter,
        mealsLibraryOwnershipFilter: state.mealsLibraryOwnershipFilter,
        exercisesLibraryOwnershipFilter: state.exercisesLibraryOwnershipFilter,
        workoutPresetsLibraryOwnershipFilter:
          state.workoutPresetsLibraryOwnershipFilter,
        exerciseSearchOwnershipFilter: state.exerciseSearchOwnershipFilter,
        presetSearchOwnershipFilter: state.presetSearchOwnershipFilter,
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
    }
  )
);

/**
 * The user's default rest period in seconds, for non-React callers (stores,
 * reducers, payload builders). Components should subscribe with
 * `useAppPreferencesStore((s) => s.defaultRestSec)` instead so they re-render
 * when the setting changes.
 */
export function getDefaultRestSec(): number {
  return useAppPreferencesStore.getState().defaultRestSec;
}

/**
 * Test-only helper — resets store state to defaults and clears the persisted
 * AsyncStorage entry. Mirrors the pattern used by activeWorkoutStore.
 */
export function __resetAppPreferencesStoreForTests(): void {
  useAppPreferencesStore.setState({ ...PREFERENCE_DEFAULTS });
  void AsyncStorage.removeItem(STORE_KEY);
}
