const DECAY_LAMBDA = 0.5;
const DEFAULT_SLEEP_NEED_HOURS = 8.25;
const DEBT_WINDOW_DAYS = 14;
const DEBT_THRESHOLDS = {
  low: { min: 0, max: 2 },
  moderate: { min: 2, max: 5 },
  high: { min: 5, max: 8 },
  critical: { min: 8, max: Infinity },
};
const MCTQ_CONFIG = {
  mctqWindowDays: 90,
  minFreedaysForCalculation: 8,
  minWorkdaysForCalculation: 20,
  minSleepNeed: 6.0,
  maxSleepNeed: 10.0,
  strainFactor: 0.15,
  debtWindowDays: 14,
  debtDecayLambda: 0.5,
  maxDebtHours: 20,
  workdayWakeVarianceThreshold: 30,
  freedayWakeVarianceThreshold: 45,
};
const CHRONOTYPE_BOUNDARIES = {
  EARLY_BEFORE: 6,
  LATE_AFTER: 8,
};
// A day's workout load (heart-rate-zone-weighted minutes, as in the training
// load report) reaching this adds the full STRAIN_MAX_ADDITION_HOURS of sleep
// need; lighter days scale linearly. 400 is about 90 minutes in zone 4.
const STRAIN_LOAD_FOR_MAX_ADDITION = 400;
const STRAIN_MAX_ADDITION_HOURS = 1.0;
// daily_sleep_need.training_load_score is NUMERIC(5,2).
const MAX_TRAINING_LOAD_SCORE = 999.99;
export { STRAIN_LOAD_FOR_MAX_ADDITION };
export { STRAIN_MAX_ADDITION_HOURS };
export { MAX_TRAINING_LOAD_SCORE };
export { DECAY_LAMBDA };
export { DEFAULT_SLEEP_NEED_HOURS };
export { DEBT_WINDOW_DAYS };
export { DEBT_THRESHOLDS };
export { MCTQ_CONFIG };
export { CHRONOTYPE_BOUNDARIES };
export default {
  STRAIN_LOAD_FOR_MAX_ADDITION,
  STRAIN_MAX_ADDITION_HOURS,
  MAX_TRAINING_LOAD_SCORE,
  DECAY_LAMBDA,
  DEFAULT_SLEEP_NEED_HOURS,
  DEBT_WINDOW_DAYS,
  DEBT_THRESHOLDS,
  MCTQ_CONFIG,
  CHRONOTYPE_BOUNDARIES,
};
