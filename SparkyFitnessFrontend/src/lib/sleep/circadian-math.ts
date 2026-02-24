/**
 * Circadian Math Utilities
 *
 * Mathematical functions for the Two-Process Model of sleep regulation.
 *
 * Process S (Homeostatic Sleep Pressure):
 *   - Rises during wakefulness: S(t) = 1 - (1 - S_start) * exp(-t / τ_rise)
 *   - Decays during sleep: S(t) = S_start * exp(-t / τ_decay)
 *
 * Process C (Circadian):
 *   - Multi-harmonic sinusoidal: C(t) = Σ(a_k * sin(2πk/24 * (t + φ)))
 *
 * Energy E(t):
 *   - E(t) = (C(t) - S(t) + 1) * 50, normalized to 0-100 scale
 *
 * References:
 * - Borbély, A. A. (1982). A two process model of sleep regulation.
 * - Achermann, P., & Borbély, A. A. (1994). Simulation of daytime vigilance.
 * - Kronauer, R. E., et al. (1999). Quantifying human circadian pacemaker response.
 */

import {
  type CircadianConfig,
  type CircadianPoint,
  type EnergyZone,
  CIRCADIAN_DEFAULTS,
  ENERGY_ZONE_THRESHOLDS,
} from './circadian-types';

// === PROCESS S (HOMEOSTATIC) ===

/**
 * Calculate Process S (sleep pressure) during wakefulness.
 *
 * Formula: S(t) = 1 - (1 - S_start) * exp(-t / τ_rise)
 *
 * Sleep pressure builds asymptotically toward 1 during wakefulness.
 * The time constant τ_rise (~18.2h) determines how quickly pressure builds.
 *
 * @param hoursAwake - Hours since wake time
 * @param config - Circadian configuration (optional)
 * @param sStart - Initial S value at wake (default: 0.1, representing well-rested state)
 * @returns Process S value between 0 and 1
 */
export function calculateProcessS(
  hoursAwake: number,
  config?: Partial<CircadianConfig>,
  sStart: number = 0.1
): number {
  const tauRise = config?.tauRise ?? CIRCADIAN_DEFAULTS.TAU_RISE;

  // S(t) = 1 - (1 - S_start) * exp(-t / τ)
  const s = 1 - (1 - sStart) * Math.exp(-hoursAwake / tauRise);

  // Clamp to [0, 1]
  return Math.max(0, Math.min(1, s));
}

/**
 * Calculate Process S decay during sleep (or naps).
 *
 * Formula: S(t) = S_start * exp(-t / τ_decay)
 *
 * Sleep pressure dissipates exponentially during sleep.
 * The time constant τ_decay (~4.2h) determines how quickly pressure decreases.
 *
 * @param hoursSleeping - Hours of sleep
 * @param sStart - Initial S value at sleep onset
 * @param config - Circadian configuration (optional)
 * @returns Process S value between 0 and 1
 */
export function calculateProcessSDecay(
  hoursSleeping: number,
  sStart: number,
  config?: Partial<CircadianConfig>
): number {
  const tauDecay = config?.tauDecay ?? CIRCADIAN_DEFAULTS.TAU_DECAY;

  // S(t) = S_start * exp(-t / τ)
  const s = sStart * Math.exp(-hoursSleeping / tauDecay);

  // Clamp to [0, 1]
  return Math.max(0, Math.min(1, s));
}

// === PROCESS C (CIRCADIAN) ===

/**
 * Calculate Process C (circadian signal) at a given time.
 *
 * Formula: C(t) = Σ(a_k * sin(2πk/24 * (t + φ)))
 *
 * Uses multiple harmonics to model the non-sinusoidal shape of the circadian rhythm.
 * The phase φ is adjusted so the nadir (minimum) aligns with the individual's
 * circadian nadir time.
 *
 * @param time - The time to calculate for
 * @param nadirTime - The individual's circadian nadir time
 * @param config - Circadian configuration (optional)
 * @returns Process C value between 0 and 1 (normalized)
 */
export function calculateProcessC(
  time: Date,
  nadirTime: Date,
  config?: Partial<CircadianConfig>
): number {
  const harmonics = config?.harmonics ?? [...CIRCADIAN_DEFAULTS.HARMONICS];

  // Calculate hours from midnight for current time
  const timeHours = time.getHours() + time.getMinutes() / 60 + time.getSeconds() / 3600;

  // Calculate phase offset so minimum occurs at nadir
  // For a sine wave, minimum is at 3π/2 (270°)
  // We need to shift so that minimum occurs at nadirTime
  const nadirHours = nadirTime.getHours() + nadirTime.getMinutes() / 60;

  // Phase offset: shift the wave so its minimum is at nadirHours
  // sin(x) has minimum at x = -π/2 (or 3π/2)
  // We want 2π/24 * (nadirHours + φ) = 3π/2
  // Therefore φ = (3π/2) * (24 / 2π) - nadirHours = 18 - nadirHours
  const phaseOffset = 18 - nadirHours;

  // Sum harmonics
  let cRaw = 0;
  let normalization = 0;

  for (let k = 1; k <= harmonics.length; k++) {
    const amplitude = harmonics[k - 1];
    const frequency = (2 * Math.PI * k) / 24;
    cRaw += amplitude * Math.sin(frequency * (timeHours + phaseOffset));
    normalization += amplitude;
  }

  // Normalize to [-1, 1] then to [0, 1]
  const cNormalized = cRaw / normalization;
  const c = (cNormalized + 1) / 2;

  // Clamp to [0, 1]
  return Math.max(0, Math.min(1, c));
}

// === ENERGY CALCULATION ===

/**
 * Calculate energy level from Process S and Process C.
 *
 * Enhanced formula that produces more realistic variation:
 * - Base energy from circadian rhythm (C)
 * - Penalty from homeostatic pressure (S)
 * - Scaled to produce values that hit peak (>70) and dip (<40) thresholds
 *
 * @param processS - Process S value (0-1)
 * @param processC - Process C value (0-1)
 * @returns Energy level 0-100
 */
export function calculateEnergy(processS: number, processC: number): number {
  // Enhanced formula:
  // - Circadian contribution (C) weighted more heavily
  // - Sleep pressure (S) acts as a penalty
  // - Scaled to produce 20-90 range typically

  // Base energy from circadian (40-100 range based on C)
  const circadianBase = 40 + (processC * 60);

  // Penalty from sleep pressure (0-35 points based on S)
  const sleepPenalty = processS * 35;

  // Final energy
  const energy = circadianBase - sleepPenalty;

  // Clamp to [0, 100]
  return Math.max(0, Math.min(100, energy));
}

/**
 * Apply sleep debt penalty to energy level.
 *
 * Sleep debt reduces maximum energy capacity proportionally.
 * Formula: adjustedEnergy = energy * (1 - penalty/100)
 * Penalty = min(sleepDebt * 3, 30) (max 30% reduction)
 *
 * @param energy - Base energy level (0-100)
 * @param sleepDebtHours - Current sleep debt in hours
 * @returns Adjusted energy level (0-100) and penalty percentage
 */
export function applyDebtPenalty(
  energy: number,
  sleepDebtHours: number
): { energy: number; penalty: number } {
  const penalty = Math.min(
    sleepDebtHours * CIRCADIAN_DEFAULTS.SLEEP_DEBT_PENALTY_MULTIPLIER,
    CIRCADIAN_DEFAULTS.MAX_SLEEP_DEBT_PENALTY
  );

  const adjustedEnergy = energy * (1 - penalty / 100);

  return {
    energy: Math.max(0, Math.min(100, adjustedEnergy)),
    penalty,
  };
}

// === ZONE DETERMINATION ===

/**
 * Determine the energy zone based on current state.
 *
 * @param energy - Current energy level (0-100)
 * @param processC - Current Process C value (0-1)
 * @param time - Current time
 * @param melatoninStart - Start of melatonin window
 * @param wakeTime - Wake time for today
 * @param sleepTime - Expected sleep time
 * @returns Energy zone classification
 */
export function determineEnergyZone(
  energy: number,
  processC: number,
  time: Date,
  melatoninStart: Date,
  wakeTime: Date,
  sleepTime: Date
): EnergyZone {
  // Check if in sleep period (before wake or after expected sleep)
  const currentHour = time.getHours() + time.getMinutes() / 60;
  const wakeHour = wakeTime.getHours() + wakeTime.getMinutes() / 60;
  const sleepHour = sleepTime.getHours() + sleepTime.getMinutes() / 60;
  const melatoninHour = melatoninStart.getHours() + melatoninStart.getMinutes() / 60;

  // Sleep zone: past bedtime or before wake
  if (sleepHour < wakeHour) {
    // Sleep time is after midnight (e.g., 23:00 sleep, 7:00 wake)
    if (currentHour >= sleepHour || currentHour < wakeHour) {
      return 'sleep';
    }
  } else {
    // Unusual case: sleep time before wake (shouldn't normally happen)
    if (currentHour >= sleepHour && currentHour < wakeHour) {
      return 'sleep';
    }
  }

  // Peak zone: energy above threshold (regardless of melatonin)
  if (energy >= ENERGY_ZONE_THRESHOLDS.PEAK_THRESHOLD) {
    return 'peak';
  }

  // Dip zone: energy below threshold
  if (energy <= ENERGY_ZONE_THRESHOLDS.DIP_THRESHOLD) {
    return 'dip';
  }

  // Wind-down zone: within melatonin window (only if not peak/dip)
  // Handle case where melatonin starts late evening (e.g., 21:00)
  if (melatoninHour > 12) {
    // Evening melatonin window (typical case: 20:00-23:00)
    if (currentHour >= melatoninHour) {
      return 'wind-down';
    }
  } else {
    // Early morning melatonin (unusual but handle it)
    if (currentHour >= melatoninHour && currentHour < wakeHour) {
      return 'wind-down';
    }
  }

  // Rising zone: intermediate energy levels during the day
  return 'rising';
}

// === PEAK/DIP FINDING ===

/**
 * Find the next energy peak from the current time.
 *
 * @param points - Array of circadian points
 * @param currentTime - Current time
 * @returns Next peak time and energy, or null if not found
 */
export function findNextPeak(
  points: CircadianPoint[],
  currentTime: Date
): { time: Date; energy: number } | null {
  // Filter points after current time
  const futurePoints = points.filter((p) => p.time > currentTime);

  if (futurePoints.length < 3) {
    return null;
  }

  // Find local maxima (points higher than neighbors)
  let maxEnergy = -Infinity;
  let maxPoint: CircadianPoint | null = null;

  for (let i = 1; i < futurePoints.length - 1; i++) {
    const prev = futurePoints[i - 1];
    const curr = futurePoints[i];
    const next = futurePoints[i + 1];

    // Local maximum condition
    if (curr.energy > prev.energy && curr.energy >= next.energy) {
      if (curr.energy > maxEnergy) {
        maxEnergy = curr.energy;
        maxPoint = curr;
      }
    }
  }

  // If no local max found, return the highest point
  if (!maxPoint) {
    maxPoint = futurePoints.reduce((max, p) => (p.energy > max.energy ? p : max), futurePoints[0]);
  }

  return maxPoint ? { time: maxPoint.time, energy: maxPoint.energy } : null;
}

/**
 * Find the next energy dip from the current time.
 *
 * @param points - Array of circadian points
 * @param currentTime - Current time
 * @returns Next dip time and energy, or null if not found
 */
export function findNextDip(
  points: CircadianPoint[],
  currentTime: Date
): { time: Date; energy: number } | null {
  // Filter points after current time
  const futurePoints = points.filter((p) => p.time > currentTime);

  if (futurePoints.length < 3) {
    return null;
  }

  // Find local minima (points lower than neighbors)
  let minEnergy = Infinity;
  let minPoint: CircadianPoint | null = null;

  for (let i = 1; i < futurePoints.length - 1; i++) {
    const prev = futurePoints[i - 1];
    const curr = futurePoints[i];
    const next = futurePoints[i + 1];

    // Local minimum condition
    if (curr.energy < prev.energy && curr.energy <= next.energy) {
      // Return the first local minimum (most relevant)
      if (curr.energy < minEnergy) {
        minEnergy = curr.energy;
        minPoint = curr;
        break; // Take first dip, not lowest overall
      }
    }
  }

  // If no local min found, return the lowest point
  if (!minPoint) {
    minPoint = futurePoints.reduce((min, p) => (p.energy < min.energy ? p : min), futurePoints[0]);
  }

  return minPoint ? { time: minPoint.time, energy: minPoint.energy } : null;
}

// === UTILITY FUNCTIONS ===

/**
 * Get default circadian configuration.
 *
 * @returns Default CircadianConfig
 */
export function getDefaultConfig(): CircadianConfig {
  return {
    tauRise: CIRCADIAN_DEFAULTS.TAU_RISE,
    tauDecay: CIRCADIAN_DEFAULTS.TAU_DECAY,
    harmonics: [...CIRCADIAN_DEFAULTS.HARMONICS],
    phaseLambda: 0,
  };
}

/**
 * Calculate hours between two dates.
 *
 * @param start - Start date
 * @param end - End date
 * @returns Hours elapsed (can be negative if end < start)
 */
export function hoursBetween(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / (1000 * 60 * 60);
}

/**
 * Add hours to a date.
 *
 * @param date - Base date
 * @param hours - Hours to add (can be negative)
 * @returns New date
 */
export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

/**
 * Set time on a date while preserving the date portion.
 *
 * @param date - Base date
 * @param hours - Hours (0-23)
 * @param minutes - Minutes (0-59)
 * @returns New date with updated time
 */
export function setTime(date: Date, hours: number, minutes: number = 0): Date {
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

/**
 * Get time of day as hours (decimal).
 *
 * @param date - Date to extract time from
 * @returns Hours since midnight (e.g., 14.5 = 14:30)
 */
export function getTimeOfDayHours(date: Date): number {
  return date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
}

/**
 * Calculate median of an array of numbers.
 *
 * @param values - Array of numbers
 * @returns Median value
 */
export function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }

  return sorted[mid];
}

/**
 * Calculate median time from array of dates.
 *
 * @param times - Array of dates
 * @returns Median time as Date (on today's date)
 */
export function medianTime(times: Date[]): Date {
  if (times.length === 0) {
    return new Date();
  }

  // Convert to minutes since midnight
  const minutes = times.map((t) => t.getHours() * 60 + t.getMinutes());

  // Handle midnight crossover (if times span before/after midnight)
  // Check if we have values near 0 and near 1440
  const hasNearMidnight = minutes.some((m) => m < 180); // Before 3am
  const hasLateNight = minutes.some((m) => m > 1260); // After 9pm

  if (hasNearMidnight && hasLateNight) {
    // Shift values before 6am by +1440 to handle midnight crossover
    const adjusted = minutes.map((m) => (m < 360 ? m + 1440 : m));
    let medianMinutes = median(adjusted);
    if (medianMinutes >= 1440) {
      medianMinutes -= 1440;
    }

    const result = new Date();
    result.setHours(Math.floor(medianMinutes / 60), Math.round(medianMinutes % 60), 0, 0);
    return result;
  }

  // Normal case
  const medianMinutes = median(minutes);
  const result = new Date();
  result.setHours(Math.floor(medianMinutes / 60), Math.round(medianMinutes % 60), 0, 0);
  return result;
}
