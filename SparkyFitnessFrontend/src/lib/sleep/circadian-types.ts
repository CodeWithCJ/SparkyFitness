/**
 * Circadian Types and Interfaces
 *
 * Types for the Two-Process Model of sleep regulation:
 * - Process S (Homeostatic): Sleep pressure that builds during wakefulness
 * - Process C (Circadian): ~24h oscillation controlled by the SCN
 *
 * Energy E(t) = C(t) - S(t) represents subjective alertness
 *
 * References:
 * - Borbély, A. A. (1982). A two process model of sleep regulation.
 * - Daan, S., Beersma, D. G., & Borbély, A. A. (1984). Timing of human sleep.
 */

// === ENERGY ZONES ===

/**
 * Energy zones throughout the day
 * - peak: High energy, optimal for complex tasks
 * - rising: Energy increasing, transitional period
 * - dip: Low energy, consider napping
 * - wind-down: Pre-sleep phase, melatonin rising
 * - sleep: Sleep period
 */
export type EnergyZone = 'peak' | 'rising' | 'dip' | 'wind-down' | 'sleep';

// === CIRCADIAN POINT ===

/**
 * Single point on the 24-hour energy curve
 */
export interface CircadianPoint {
  /** Timestamp for this point */
  time: Date;
  /** Process S value (0-1), homeostatic sleep pressure */
  processS: number;
  /** Process C value (0-1), circadian signal */
  processC: number;
  /** Resulting energy level (0-100) */
  energy: number;
  /** Current energy zone classification */
  zone: EnergyZone;
}

// === CIRCADIAN CONFIGURATION ===

/**
 * Mathematical parameters for the two-process model
 */
export interface CircadianConfig {
  /**
   * Time constant for Process S rise during wakefulness (hours)
   * Default: 18.2h (empirically derived)
   * Higher values = slower pressure buildup
   */
  tauRise: number;

  /**
   * Time constant for Process S decay during sleep (hours)
   * Default: 4.2h (empirically derived)
   * Lower values = faster pressure dissipation
   */
  tauDecay: number;

  /**
   * Harmonic coefficients for Process C sinusoidal wave (a1-a5)
   * Allows for non-sinusoidal waveform to match real circadian data
   * Default: [0.97, 0.22, 0.07, 0.03, 0.001]
   */
  harmonics: number[];

  /**
   * Phase adjustment for Process C (hours)
   * Used to align circadian nadir with individual chronotype
   */
  phaseLambda: number;
}

// === CHRONOTYPE DATA ===

/**
 * Chronotype classification based on sleep timing
 * - early: Wakes before 6:00 (morning larks)
 * - intermediate: Wakes 6:00-8:00 (most people)
 * - late: Wakes after 8:00 (night owls)
 */
export type ChronotypeClass = 'early' | 'intermediate' | 'late';

/**
 * Individual chronotype derived from sleep history
 */
export interface ChronotypeData {
  /** Median wake time over the analysis period */
  averageWakeTime: Date;

  /** Median sleep onset time over the analysis period */
  averageSleepTime: Date;

  /**
   * Circadian nadir (lowest point of alertness)
   * Typically ~2 hours before natural wake time
   * This is when core body temperature is lowest
   */
  circadianNadir: Date;

  /**
   * Circadian acrophase (peak alertness)
   * Typically ~12 hours after nadir
   * Optimal time for cognitive performance
   */
  circadianAcrophase: Date;

  /**
   * Melatonin window for optimal sleep initiation
   * Corresponds to dim-light melatonin onset (DLMO)
   */
  melatoninWindow: {
    start: Date;
    end: Date;
  };

  /** Chronotype classification */
  chronotype: ChronotypeClass;

  /** Number of days used for calculation */
  basedOnDays: number;

  /** Confidence in the chronotype assessment */
  confidence: 'low' | 'medium' | 'high';
}

// === ENERGY CURVE ===

/**
 * Complete 24-hour energy prediction
 */
export interface EnergyCurve {
  /**
   * Array of 96 points (24h × 4 per hour = 15-minute intervals)
   */
  points: CircadianPoint[];

  /** Current energy level at the moment of generation */
  currentEnergy: number;

  /** Current energy zone */
  currentZone: EnergyZone;

  /** Next energy peak (highest point after now) */
  nextPeak: {
    time: Date;
    energy: number;
  };

  /** Next energy dip (lowest point after now) */
  nextDip: {
    time: Date;
    energy: number;
  };

  /** Optimal sleep window based on melatonin onset */
  melatoninWindow: {
    start: Date;
    end: Date;
  };

  /** Wake time used for calculation */
  wakeTime: Date;

  /** Sleep debt penalty applied (percentage reduction) */
  sleepDebtPenalty: number;
}

// === NAP DATA ===

/**
 * Detected or planned nap period
 */
export interface NapData {
  /** Nap start time */
  startTime: Date;

  /** Nap end time */
  endTime: Date;

  /** Nap duration in minutes */
  duration: number;
}

// === PERSONALIZED SLEEP NEED ===

/**
 * Personalized sleep need calculation result
 */
export interface PersonalizedSleepNeed {
  /** Calculated sleep need in hours */
  calculatedNeed: number;

  /** Confidence in the calculation */
  confidence: 'low' | 'medium' | 'high';

  /** Number of days used for calculation */
  basedOnDays: number;

  /**
   * Method used for calculation
   * - historical_median: Median TST from free days
   * - satiation_point: TST where recovery stabilizes
   * - default: Fallback to population average
   */
  method: 'historical_median' | 'satiation_point' | 'default';
}

// === DAILY VITALS (for calculations) ===

/**
 * Minimal daily vitals needed for circadian calculations
 */
export interface DailyVitalsMinimal {
  date: string;
  sleepDurationHours?: number;
  sleepStartTimestampGMT?: number;
  sleepEndTimestampGMT?: number;
  deepSleepMinutes?: number;
  remSleepMinutes?: number;
  lightSleepMinutes?: number;
  awakeMinutes?: number;
  sleepScore?: number;
  recoveryScore?: number;
}

// === CONSTANTS ===

/**
 * Default configuration for the circadian model
 */
export const CIRCADIAN_DEFAULTS = {
  /**
   * Time constant for Process S rise (hours)
   * Based on Achermann et al. (1993)
   */
  TAU_RISE: 18.2,

  /**
   * Time constant for Process S decay (hours)
   * Based on Achermann et al. (1993)
   */
  TAU_DECAY: 4.2,

  /**
   * Harmonic coefficients for Process C
   * Allows non-sinusoidal waveform modeling
   * Based on Kronauer et al. (1999)
   */
  HARMONICS: [0.97, 0.22, 0.07, 0.03, 0.001] as const,

  /**
   * Hours before natural wake time for circadian nadir
   * Core body temperature minimum occurs ~2h before wake
   */
  NADIR_OFFSET_HOURS: 2,

  /**
   * Hours before average sleep time for melatonin window start
   * DLMO typically occurs 2-3h before habitual sleep
   */
  MELATONIN_WINDOW_HOURS: 2,

  /**
   * Default sleep need if insufficient data (hours)
   * Based on research recommendations (8h15m)
   */
  DEFAULT_SLEEP_NEED: 8.25,

  /**
   * Minimum days required for reliable chronotype calculation
   */
  MIN_DAYS_FOR_CHRONOTYPE: 7,

  /**
   * Minimum days for high-confidence sleep need calculation
   */
  MIN_DAYS_FOR_SLEEP_NEED: 30,

  /**
   * Points per hour in energy curve (4 = 15-minute intervals)
   */
  POINTS_PER_HOUR: 4,

  /**
   * Maximum sleep debt penalty (percentage)
   */
  MAX_SLEEP_DEBT_PENALTY: 30,

  /**
   * Sleep debt penalty multiplier (penalty = debt_hours × multiplier)
   */
  SLEEP_DEBT_PENALTY_MULTIPLIER: 3,
} as const;

/**
 * Time boundaries for chronotype classification
 */
export const CHRONOTYPE_BOUNDARIES = {
  /** Early birds wake before this time */
  EARLY_BEFORE: 6, // 6:00

  /** Late sleepers wake after this time */
  LATE_AFTER: 8, // 8:00
} as const;

/**
 * Energy zone thresholds
 */
export const ENERGY_ZONE_THRESHOLDS = {
  /** Below this = dip zone */
  DIP_THRESHOLD: 40,

  /** Above this = peak zone */
  PEAK_THRESHOLD: 70,
} as const;
