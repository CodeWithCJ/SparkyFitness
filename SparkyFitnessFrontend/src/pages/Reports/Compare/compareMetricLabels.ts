import type { CompareMetricDef, CompareMetricKey } from '@workspace/shared';
import type { Translator } from './compareCopy';

// The names of the Compare metrics and their groups, the website's copy of the
// phone's `SparkyFitnessMobile/src/constants/compareMetrics.ts`: the same
// English under the same `compareReport.*` keys.

export const COMPARE_GROUP_LABELS: Record<
  CompareMetricDef['group'],
  (t: Translator) => string
> = {
  feelings: (t) =>
    t('compareReport.groups.feelings', { defaultValue: 'How you felt' }),
  sleep: (t) => t('compareReport.groups.sleep', { defaultValue: 'Sleep' }),
  meditation: (t) =>
    t('compareReport.groups.meditation', { defaultValue: 'Meditation' }),
  food: (t) => t('compareReport.groups.food', { defaultValue: 'Food' }),
  training: (t) =>
    t('compareReport.groups.training', { defaultValue: 'Training' }),
  body: (t) => t('compareReport.groups.body', { defaultValue: 'Body' }),
};

export const COMPARE_METRIC_LABELS: Record<
  CompareMetricKey,
  (t: Translator) => string
> = {
  mood: (t) => t('compareReport.metrics.mood', { defaultValue: 'Mood' }),
  energy: (t) => t('compareReport.metrics.energy', { defaultValue: 'Energy' }),
  focus: (t) => t('compareReport.metrics.focus', { defaultValue: 'Focus' }),
  timeAsleep: (t) =>
    t('compareReport.metrics.timeAsleep', { defaultValue: 'Time asleep' }),
  sleepScore: (t) =>
    t('compareReport.metrics.sleepScore', { defaultValue: 'Sleep score' }),
  overnightHrv: (t) =>
    t('compareReport.metrics.overnightHrv', { defaultValue: 'Overnight HRV' }),
  restingHeartRate: (t) =>
    t('compareReport.metrics.restingHeartRate', {
      defaultValue: 'Resting heart rate',
    }),
  bedtime: (t) =>
    t('compareReport.metrics.bedtime', { defaultValue: 'Bedtime' }),
  bedtimeConsistency: (t) =>
    t('compareReport.metrics.bedtimeConsistency', {
      defaultValue: 'Bedtime consistency',
    }),
  meditationMinutes: (t) =>
    t('compareReport.metrics.meditationMinutes', {
      defaultValue: 'Meditation minutes',
    }),
  meditationSessions7d: (t) =>
    t('compareReport.metrics.meditationSessions7d', {
      defaultValue: 'Meditation sessions (7 days)',
    }),
  meditated: (t) =>
    t('compareReport.metrics.meditated', { defaultValue: 'Meditated' }),
  calories: (t) =>
    t('compareReport.metrics.calories', { defaultValue: 'Calories' }),
  protein: (t) =>
    t('compareReport.metrics.protein', { defaultValue: 'Protein' }),
  carbs: (t) => t('compareReport.metrics.carbs', { defaultValue: 'Carbs' }),
  fat: (t) => t('compareReport.metrics.fat', { defaultValue: 'Fat' }),
  caffeine: (t) =>
    t('compareReport.metrics.caffeine', { defaultValue: 'Caffeine' }),
  alcohol: (t) =>
    t('compareReport.metrics.alcohol', { defaultValue: 'Alcohol' }),
  workoutMinutes: (t) =>
    t('compareReport.metrics.workoutMinutes', {
      defaultValue: 'Workout minutes',
    }),
  cardioMinutes: (t) =>
    t('compareReport.metrics.cardioMinutes', {
      defaultValue: 'Cardio minutes',
    }),
  strengthVolume: (t) =>
    t('compareReport.metrics.strengthVolume', {
      defaultValue: 'Strength volume',
    }),
  trainingLoad: (t) =>
    t('compareReport.metrics.trainingLoad', { defaultValue: 'Training load' }),
  weightTrend: (t) =>
    t('compareReport.metrics.weightTrend', { defaultValue: 'Weight trend' }),
  steps: (t) => t('compareReport.metrics.steps', { defaultValue: 'Steps' }),
};
