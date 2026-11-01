import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_CHECKIN_REMINDER_TIME,
  normalizeCheckinReminderTimes,
} from '../utils/checkinReminderTimes';
import {
  clampGuidedCountdownSec,
  clampGuidedSpeechRate,
  type CompareQuestion,
  DEFAULT_GUIDED_COUNTDOWN_SEC,
  DEFAULT_GUIDED_SPEECH_RATE,
  DEFAULT_WARMUP_DUMBBELL_ROUNDING,
  DEFAULT_WARMUP_METHOD,
  DEFAULT_WARMUP_PLATE_ROUNDING,
  normalizeWarmupMethod,
  type PaceReferenceRace,
  type WarmupMethodStep,
  withRecentQuestion,
} from '@workspace/shared';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  ADD_MENU_ITEM_KEYS,
  ADD_MENU_ITEM_ROW_STYLES,
  DEFAULT_ADD_MENU_CARDS,
  type AddMenuItemKey,
  type AddMenuRowStyle,
} from '../constants/addMenuItems';
import {
  resolveAddMenuCards,
  type AddMenuRowStyleOverrides,
} from '../utils/addMenu';
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
import {
  DEFAULT_REPORT_NUTRIENTS,
  DEFAULT_REPORT_RANGE,
  REPORT_KEYS,
  type ReportKey,
  type ReportSectionKey,
} from '../constants/reports';
import type { LanguagePreference } from '../localization';
import type { TrendRange } from '../utils/trendRange';
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

/** Minutes before a snoozed ("Remind in") medication reminder fires again. */
export const MEDICATION_REMINDER_SNOOZE_OPTIONS = [10, 15, 30, 60] as const;
export type MedicationReminderSnoozeMinutes =
  (typeof MEDICATION_REMINDER_SNOOZE_OPTIONS)[number];

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
  trainingLoadCardVisible: true,
  dashboardCardOrder: [...DASHBOARD_CARD_KEYS] as DashboardCardKey[],
  medicationRemindersEnabled: true,
  medicationReminderRepeats: true,
  medicationReminderHideNames: false,
  medicationReminderConsolidate: true,
  medicationReminderSnoozeMinutes: 30 as MedicationReminderSnoozeMinutes,
  waterReminderEnabled: false,
  waterReminderIntervalHours: 2 as WaterReminderIntervalHours,
  waterReminderWindowStart: '08:00' as string,
  waterReminderWindowEnd: '22:00' as string,
  checkinRemindersEnabled: false,
  checkinReminderTimes: [DEFAULT_CHECKIN_REMINDER_TIME] as string[],
  liquidGlassTabBarEnabled: false,
  activeWorkoutMetricColumn: 'rpe' as ActiveWorkoutMetricColumn,
  diarySummaryVisible: false,
  diarySummaryExpanded: false,
  defaultRestSec: DEFAULT_REST_SEC as number,
  paceReferenceRace: null as PaceReferenceRace | null,
  paceReferenceOnWatch: false,
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
  addMenuCards: [...DEFAULT_ADD_MENU_CARDS] as AddMenuItemKey[],
  addMenuOrder: [...ADD_MENU_ITEM_KEYS] as AddMenuItemKey[],
  hiddenAddMenuItems: [] as AddMenuItemKey[],
  addMenuRowStyles: {} as AddMenuRowStyleOverrides,
  watchPageOrder: [...WATCH_PAGE_KEYS] as WatchPageKey[],
  hiddenWatchPages: [] as WatchPageKey[],
  watchDoubleTapEnabled: true,
  watchRpeEnabled: false,
  watchSetScreenMetrics: true,
  watchUpNextPage: false,
  watchLargerText: false,
  watchClassicWorkout: false,
  activeWorkoutNowCard: false,
  watchNutrientOrder: [] as string[],
  shownWatchNutrients: [...DEFAULT_WATCH_NUTRIENTS] as string[],
  watchSetInputStyle: 'crown' as WatchSetInputStyle,
  reportOrder: [...REPORT_KEYS] as ReportKey[],
  hiddenReports: [] as ReportKey[],
  reportDefaultRange: DEFAULT_REPORT_RANGE as TrendRange,
  hiddenReportSections: [] as ReportSectionKey[],
  compareRecentQuestions: [] as CompareQuestion[],
  reportNutrientOrder: [] as string[],
  shownReportNutrients: [...DEFAULT_REPORT_NUTRIENTS] as string[],
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
  trainingLoadCardVisible: boolean;
  dashboardCardOrder: DashboardCardKey[];
  medicationRemindersEnabled: boolean;
  medicationReminderRepeats: boolean;
  medicationReminderHideNames: boolean;
  medicationReminderConsolidate: boolean;
  medicationReminderSnoozeMinutes: MedicationReminderSnoozeMinutes;
  waterReminderEnabled: boolean;
  waterReminderIntervalHours: WaterReminderIntervalHours;
  waterReminderWindowStart: string;
  waterReminderWindowEnd: string;
  checkinRemindersEnabled: boolean;
  checkinReminderTimes: string[];
  liquidGlassTabBarEnabled: boolean;
  activeWorkoutMetricColumn: ActiveWorkoutMetricColumn;
  diarySummaryVisible: boolean;
  diarySummaryExpanded: boolean;
  defaultRestSec: number;
  /**
   * A recent race result the training paces are worked out from (device-local),
   * or null to use the pace of recent sessions.
   */
  paceReferenceRace: PaceReferenceRace | null;
  /** Also put the race-based pace ranges on the program workout offered on the Apple Watch. */
  paceReferenceOnWatch: boolean;
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
  /** The four items in the + sheet's big card slots, in order. */
  addMenuCards: AddMenuItemKey[];
  /** Order of the rows under the cards in the + sheet. */
  addMenuOrder: AddMenuItemKey[];
  /** + sheet rows turned off in Settings → Quick Actions. */
  hiddenAddMenuItems: AddMenuItemKey[];
  /** Items shown as another style than their default (list, pair or button). */
  addMenuRowStyles: AddMenuRowStyleOverrides;
  /** Swipe order of the Apple Watch app's pages; sent to the watch. */
  watchPageOrder: WatchPageKey[];
  /** Watch pages turned off in Settings → Apple Watch. */
  hiddenWatchPages: WatchPageKey[];
  /** Order of the reports on the Reports hub. */
  reportOrder: ReportKey[];
  /** Reports turned off in Reports → Customize. */
  hiddenReports: ReportKey[];
  /** The 7/30/90d window a report opens on. */
  reportDefaultRange: TrendRange;
  /** Sections turned off inside a report, namespaced by report (`sleep.stages`). */
  hiddenReportSections: ReportSectionKey[];
  /** Recent Compare questions, newest first (at most five). */
  compareRecentQuestions: CompareQuestion[];
  addCompareRecentQuestion: (q: CompareQuestion) => void;
  /** Order of the nutrients the Nutrition report can average; unknown ones follow in catalog order. */
  reportNutrientOrder: string[];
  /** Nutrients (standard keys or custom names) the Nutrition report's "Your nutrients" card shows. */
  shownReportNutrients: string[];
  /** Whether the watch's double-tap gesture logs the current set. */
  watchDoubleTapEnabled: boolean;
  /** Whether the watch asks for an effort (RPE) after each logged set. */
  watchRpeEnabled: boolean;
  /**
   * Whether the watch's set screen shows elapsed time, heart rate and
   * calories. Off moves them to a metrics page one swipe away.
   */
  watchSetScreenMetrics: boolean;
  /** Whether the watch workout has the Up Next page after the set screen. */
  watchUpNextPage: boolean;
  /** Whether the watch's Goals and Water pages use the larger-text layout. */
  watchLargerText: boolean;
  /** Keep the original workout page while larger text is on. */
  watchClassicWorkout: boolean;
  /** Whether the active workout pins the Now card under the exercise rail. */
  activeWorkoutNowCard: boolean;
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
  setTrainingLoadCardVisible: (value: boolean) => void;
  setDashboardCardOrder: (order: DashboardCardKey[]) => void;
  setMedicationRemindersEnabled: (value: boolean) => void;
  setMedicationReminderRepeats: (value: boolean) => void;
  setMedicationReminderHideNames: (value: boolean) => void;
  setMedicationReminderConsolidate: (value: boolean) => void;
  setMedicationReminderSnoozeMinutes: (
    value: MedicationReminderSnoozeMinutes
  ) => void;
  setWaterReminderEnabled: (value: boolean) => void;
  setWaterReminderIntervalHours: (value: WaterReminderIntervalHours) => void;
  setWaterReminderWindow: (start: string, end: string) => void;
  setCheckinRemindersEnabled: (enabled: boolean) => void;
  setCheckinReminderTimes: (times: string[]) => void;
  setLiquidGlassTabBarEnabled: (value: boolean) => void;
  setActiveWorkoutMetricColumn: (value: ActiveWorkoutMetricColumn) => void;
  setDiarySummaryVisible: (value: boolean) => void;
  setDiarySummaryExpanded: (value: boolean) => void;
  setDefaultRestSec: (value: number) => void;
  setPaceReferenceRace: (value: PaceReferenceRace | null) => void;
  setPaceReferenceOnWatch: (value: boolean) => void;
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
  setAddMenuCards: (cards: AddMenuItemKey[]) => void;
  setAddMenuOrder: (order: AddMenuItemKey[]) => void;
  setAddMenuItemHidden: (key: AddMenuItemKey, isHidden: boolean) => void;
  /** Shows an item as `style`; its own default style clears the choice. */
  setAddMenuRowStyle: (key: AddMenuItemKey, style: AddMenuRowStyle) => void;
  resetAddMenu: () => void;
  setWatchPageOrder: (order: WatchPageKey[]) => void;
  setWatchPageHidden: (key: WatchPageKey, isHidden: boolean) => void;
  setReportOrder: (order: ReportKey[]) => void;
  setReportHidden: (key: ReportKey, isHidden: boolean) => void;
  setReportDefaultRange: (value: TrendRange) => void;
  setReportSectionHidden: (key: ReportSectionKey, isHidden: boolean) => void;
  setReportNutrientOrder: (order: string[]) => void;
  setReportNutrientShown: (key: string, isShown: boolean) => void;
  resetReportCustomization: () => void;
  setWatchDoubleTapEnabled: (value: boolean) => void;
  setWatchRpeEnabled: (value: boolean) => void;
  setWatchSetScreenMetrics: (value: boolean) => void;
  setWatchUpNextPage: (value: boolean) => void;
  setWatchLargerText: (value: boolean) => void;
  setWatchClassicWorkout: (value: boolean) => void;
  setActiveWorkoutNowCard: (value: boolean) => void;
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
      setTrainingLoadCardVisible: (value) =>
        set({ trainingLoadCardVisible: value }),
      setDashboardCardOrder: (order) => set({ dashboardCardOrder: order }),
      setMedicationRemindersEnabled: (value) =>
        set({ medicationRemindersEnabled: value }),
      setMedicationReminderRepeats: (value) =>
        set({ medicationReminderRepeats: value }),
      setMedicationReminderHideNames: (value) =>
        set({ medicationReminderHideNames: value }),
      setMedicationReminderConsolidate: (value) =>
        set({ medicationReminderConsolidate: value }),
      setMedicationReminderSnoozeMinutes: (value) =>
        set({ medicationReminderSnoozeMinutes: value }),
      setWaterReminderEnabled: (value) => set({ waterReminderEnabled: value }),
      setWaterReminderIntervalHours: (value) =>
        set({ waterReminderIntervalHours: value }),
      setWaterReminderWindow: (start, end) =>
        set({ waterReminderWindowStart: start, waterReminderWindowEnd: end }),
      setCheckinRemindersEnabled: (enabled) =>
        set({ checkinRemindersEnabled: enabled }),
      setCheckinReminderTimes: (times) =>
        set({ checkinReminderTimes: normalizeCheckinReminderTimes(times) }),
      setLiquidGlassTabBarEnabled: (value) =>
        set({ liquidGlassTabBarEnabled: value }),
      setActiveWorkoutMetricColumn: (value) =>
        set({ activeWorkoutMetricColumn: value }),
      setDiarySummaryVisible: (value) => set({ diarySummaryVisible: value }),
      setDiarySummaryExpanded: (value) => set({ diarySummaryExpanded: value }),
      setDefaultRestSec: (value) => set({ defaultRestSec: value }),
      setPaceReferenceRace: (value) => set({ paceReferenceRace: value }),
      setPaceReferenceOnWatch: (value) => set({ paceReferenceOnWatch: value }),
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
      setAddMenuCards: (cards) =>
        set((state) => {
          const resolved = resolveAddMenuCards(cards);
          return {
            addMenuCards: resolved,
            // An item given a card is shown, whatever its row switch said.
            hiddenAddMenuItems: state.hiddenAddMenuItems.filter(
              (key) => !resolved.includes(key)
            ),
          };
        }),
      setAddMenuOrder: (order) => set({ addMenuOrder: order }),
      setAddMenuItemHidden: (key, isHidden) =>
        set((state) => ({
          hiddenAddMenuItems: withMembership(
            state.hiddenAddMenuItems,
            key,
            isHidden
          ),
        })),
      setAddMenuRowStyle: (key, style) =>
        set((state) => {
          const { [key]: _previous, ...rest } = state.addMenuRowStyles;
          return {
            addMenuRowStyles:
              style === ADD_MENU_ITEM_ROW_STYLES[key]
                ? rest
                : { ...rest, [key]: style },
          };
        }),
      resetAddMenu: () =>
        set({
          addMenuCards: [...DEFAULT_ADD_MENU_CARDS],
          addMenuOrder: [...ADD_MENU_ITEM_KEYS],
          hiddenAddMenuItems: [],
          addMenuRowStyles: {},
        }),
      setWatchPageOrder: (order) => set({ watchPageOrder: order }),
      setReportOrder: (order) => set({ reportOrder: order }),
      setReportHidden: (key, isHidden) =>
        set((state) => ({
          hiddenReports: withMembership(state.hiddenReports, key, isHidden),
        })),
      setReportDefaultRange: (value) => set({ reportDefaultRange: value }),
      addCompareRecentQuestion: (q) =>
        set((state) => ({
          compareRecentQuestions: withRecentQuestion(
            state.compareRecentQuestions,
            q
          ),
        })),
      setReportSectionHidden: (key, isHidden) =>
        set((state) => ({
          hiddenReportSections: withMembership(
            state.hiddenReportSections,
            key,
            isHidden
          ),
        })),
      setReportNutrientOrder: (order) => set({ reportNutrientOrder: order }),
      setReportNutrientShown: (key, isShown) =>
        set((state) => ({
          shownReportNutrients: withMembership(
            state.shownReportNutrients,
            key,
            isShown
          ),
        })),
      resetReportCustomization: () =>
        set({
          reportNutrientOrder: [],
          shownReportNutrients: [...DEFAULT_REPORT_NUTRIENTS],
          reportOrder: [...REPORT_KEYS],
          hiddenReports: [],
          reportDefaultRange: DEFAULT_REPORT_RANGE,
          hiddenReportSections: [],
        }),
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
      setWatchSetScreenMetrics: (value) =>
        set({ watchSetScreenMetrics: value }),
      setWatchUpNextPage: (value) => set({ watchUpNextPage: value }),
      setWatchLargerText: (value) => set({ watchLargerText: value }),
      setWatchClassicWorkout: (value) => set({ watchClassicWorkout: value }),
      setActiveWorkoutNowCard: (value) => set({ activeWorkoutNowCard: value }),
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
        trainingLoadCardVisible: state.trainingLoadCardVisible,
        dashboardCardOrder: state.dashboardCardOrder,
        medicationRemindersEnabled: state.medicationRemindersEnabled,
        medicationReminderRepeats: state.medicationReminderRepeats,
        medicationReminderHideNames: state.medicationReminderHideNames,
        medicationReminderConsolidate: state.medicationReminderConsolidate,
        medicationReminderSnoozeMinutes: state.medicationReminderSnoozeMinutes,
        waterReminderEnabled: state.waterReminderEnabled,
        waterReminderIntervalHours: state.waterReminderIntervalHours,
        waterReminderWindowStart: state.waterReminderWindowStart,
        waterReminderWindowEnd: state.waterReminderWindowEnd,
        checkinRemindersEnabled: state.checkinRemindersEnabled,
        checkinReminderTimes: state.checkinReminderTimes,
        liquidGlassTabBarEnabled: state.liquidGlassTabBarEnabled,
        // Older persisted blobs without these keys backfill via the default
        // shallow merge — no version bump needed.
        activeWorkoutMetricColumn: state.activeWorkoutMetricColumn,
        diarySummaryVisible: state.diarySummaryVisible,
        diarySummaryExpanded: state.diarySummaryExpanded,
        defaultRestSec: state.defaultRestSec,
        paceReferenceRace: state.paceReferenceRace,
        paceReferenceOnWatch: state.paceReferenceOnWatch,
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
        addMenuCards: state.addMenuCards,
        addMenuOrder: state.addMenuOrder,
        hiddenAddMenuItems: state.hiddenAddMenuItems,
        addMenuRowStyles: state.addMenuRowStyles,
        watchPageOrder: state.watchPageOrder,
        hiddenWatchPages: state.hiddenWatchPages,
        watchDoubleTapEnabled: state.watchDoubleTapEnabled,
        watchRpeEnabled: state.watchRpeEnabled,
        watchSetScreenMetrics: state.watchSetScreenMetrics,
        watchUpNextPage: state.watchUpNextPage,
        watchLargerText: state.watchLargerText,
        watchClassicWorkout: state.watchClassicWorkout,
        activeWorkoutNowCard: state.activeWorkoutNowCard,
        watchNutrientOrder: state.watchNutrientOrder,
        shownWatchNutrients: state.shownWatchNutrients,
        watchSetInputStyle: state.watchSetInputStyle,
        reportOrder: state.reportOrder,
        hiddenReports: state.hiddenReports,
        reportDefaultRange: state.reportDefaultRange,
        hiddenReportSections: state.hiddenReportSections,
        compareRecentQuestions: state.compareRecentQuestions,
        reportNutrientOrder: state.reportNutrientOrder,
        shownReportNutrients: state.shownReportNutrients,
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
