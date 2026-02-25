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

module.exports = {
  DECAY_LAMBDA,
  DEFAULT_SLEEP_NEED_HOURS,
  DEBT_WINDOW_DAYS,
  DEBT_THRESHOLDS,
  MCTQ_CONFIG,
  CHRONOTYPE_BOUNDARIES,
};
