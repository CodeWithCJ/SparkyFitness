import type { TFunction } from 'i18next';

export const DASHBOARD_CARD_KEYS = [
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
] as const;

export type DashboardCardKey = (typeof DASHBOARD_CARD_KEYS)[number];

export const DASHBOARD_CARD_TITLES: Record<
  DashboardCardKey,
  (t: TFunction) => string
> = {
  calorieRing: (t) =>
    t('dashboardSettings.calorieRing', { defaultValue: 'Calorie Summary' }),
  askSparky: (t) =>
    t('dashboardSettings.askSparky', { defaultValue: 'Ask Sparky' }),
  macros: (t) => t('dashboardSettings.macros', { defaultValue: 'Nutrients' }),
  exercise: (t) =>
    t('dashboardSettings.exercise', { defaultValue: 'Exercise Progress' }),
  hydration: (t) =>
    t('dashboardSettings.hydration', { defaultValue: 'Hydration' }),
  caffeine: (t) =>
    t('dashboardSettings.caffeine', { defaultValue: 'Caffeine' }),
  fasting: (t) => t('dashboardSettings.fasting', { defaultValue: 'Fasting' }),
  cycle: (t) =>
    t('dashboardSettings.cyclePregnancy', {
      defaultValue: 'Cycle & Pregnancy',
    }),
  medications: (t) =>
    t('dashboardSettings.medications', { defaultValue: 'Medications' }),
  symptoms: (t) =>
    t('dashboardSettings.symptoms', { defaultValue: 'Symptoms' }),
  mood: (t) => t('dashboardSettings.mood', { defaultValue: 'Mood' }),
  progressPhotos: (t) =>
    t('dashboardSettings.progressPhotos', {
      defaultValue: 'Progress Photos',
    }),
  healthTrends: (t) =>
    t('dashboardSettings.healthTrends', { defaultValue: 'Health Trends' }),
  mindfulness: (t) =>
    t('dashboardSettings.mindfulness', { defaultValue: 'Mindfulness' }),
};

export const DASHBOARD_CARD_SUBTITLES: Record<
  DashboardCardKey,
  (t: TFunction) => string
> = {
  calorieRing: (t) =>
    t('dashboardSettings.calorieRingSubtitle', {
      defaultValue: 'Show daily calorie balance and progress ring',
    }),
  askSparky: (t) =>
    t('dashboardSettings.askSparkySubtitle', {
      defaultValue: 'Show the Ask Sparky chat launcher on the Dashboard',
    }),
  macros: (t) =>
    t('dashboardSettings.macrosSubtitle', {
      defaultValue: 'Show macronutrient goals and custom nutrient totals',
    }),
  exercise: (t) =>
    t('dashboardSettings.exerciseSubtitle', {
      defaultValue: 'Show exercise minutes and calorie burn targets',
    }),
  hydration: (t) =>
    t('dashboardSettings.hydrationSubtitle', {
      defaultValue: 'Show the hydration card on the Dashboard',
    }),
  caffeine: (t) =>
    t('dashboardSettings.caffeineSubtitle', {
      defaultValue: 'Show the active caffeine card on the Dashboard',
    }),
  fasting: (t) =>
    t('dashboardSettings.fastingSubtitle', {
      defaultValue: 'Show the fasting card on the Dashboard',
    }),
  cycle: (t) =>
    t('dashboardSettings.cyclePregnancySubtitle', {
      defaultValue: 'Show the wellness card on the Dashboard',
    }),
  medications: (t) =>
    t('dashboardSettings.medicationsSubtitle', {
      defaultValue: 'Show the medications card on the Dashboard',
    }),
  symptoms: (t) =>
    t('dashboardSettings.symptomsSubtitle', {
      defaultValue: 'Show symptom status, active episodes, and quick logging',
    }),
  mood: (t) =>
    t('dashboardSettings.moodSubtitle', {
      defaultValue: "Show today's mood, a 7-day trend, and quick logging",
    }),
  progressPhotos: (t) =>
    t('dashboardSettings.progressPhotosSubtitle', {
      defaultValue: 'Show the progress photos card on the Dashboard',
    }),
  healthTrends: (t) =>
    t('dashboardSettings.healthTrendsSubtitle', {
      defaultValue: 'Choose which graphs show on the Dashboard and their order',
    }),
  mindfulness: (t) =>
    t('dashboardSettings.mindfulnessSubtitle', {
      defaultValue:
        'Show mindfulness sessions, breathing, and meditation on the Dashboard',
    }),
};
