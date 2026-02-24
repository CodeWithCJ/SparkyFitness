/**
 * Chronotype Detection Algorithm
 *
 * Analyzes sleep patterns to determine individual circadian phase.
 * The chronotype represents the individual's natural sleep-wake timing,
 * which is influenced by genetics (PER/CLOCK genes) and environment.
 *
 * Key outputs:
 * - Chronotype classification (early/intermediate/late)
 * - Circadian nadir (lowest alertness, ~2h before natural wake)
 * - Circadian acrophase (peak alertness, ~12h after nadir)
 * - Melatonin window (optimal time for sleep initiation)
 *
 * References:
 * - Roenneberg, T., et al. (2003). Life between clocks.
 * - Adan, A., et al. (2012). Circadian typology.
 */

import {
  type ChronotypeData,
  type ChronotypeClass,
  type DailyVitalsMinimal,
  CIRCADIAN_DEFAULTS,
  CHRONOTYPE_BOUNDARIES,
} from './circadian-types';
import { medianTime, addHours } from './circadian-math';

// === HELPER FUNCTIONS ===

/**
 * Convert GMT timestamp to local Date.
 *
 * @param timestampGMT - Unix timestamp in milliseconds (GMT), may be string from PostgreSQL bigint
 * @returns Local Date object
 */
function gmtToLocal(timestampGMT: number | string): Date {
  // PostgreSQL bigint may come as string, convert to number
  const ts = typeof timestampGMT === 'string' ? parseInt(timestampGMT, 10) : timestampGMT;
  // Garmin timestamps are already in milliseconds
  return new Date(ts);
}

/**
 * Extract valid wake times from sleep history.
 *
 * @param history - Array of daily vitals
 * @param days - Number of recent days to consider
 * @returns Array of wake times (local Date objects)
 */
export function extractWakeTimes(
  history: DailyVitalsMinimal[],
  days: number = 14
): Date[] {
  // Sort by date descending and take last N days
  // Note: PostgreSQL bigint may come as string, so we check for truthy value
  const recentHistory = [...history]
    .filter((v) => v.sleepEndTimestampGMT != null && Number(v.sleepEndTimestampGMT) > 0)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, days);

  // Convert timestamps to local dates
  return recentHistory
    .map((v) => gmtToLocal(v.sleepEndTimestampGMT!))
    .filter((d) => !isNaN(d.getTime()));
}

/**
 * Extract valid sleep onset times from sleep history.
 *
 * @param history - Array of daily vitals
 * @param days - Number of recent days to consider
 * @returns Array of sleep onset times (local Date objects)
 */
export function extractSleepTimes(
  history: DailyVitalsMinimal[],
  days: number = 14
): Date[] {
  // Sort by date descending and take last N days
  // Note: PostgreSQL bigint may come as string, so we check for truthy value
  const recentHistory = [...history]
    .filter((v) => v.sleepStartTimestampGMT != null && Number(v.sleepStartTimestampGMT) > 0)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, days);

  // Convert timestamps to local dates
  return recentHistory
    .map((v) => gmtToLocal(v.sleepStartTimestampGMT!))
    .filter((d) => !isNaN(d.getTime()));
}

/**
 * Calculate median time from array of dates.
 *
 * Handles midnight crossover correctly (e.g., sleep times spanning 23:00-01:00).
 *
 * @param times - Array of Date objects
 * @returns Median time as Date (today's date with median time)
 */
export function calculateMedianTime(times: Date[]): Date {
  return medianTime(times);
}

/**
 * Calculate circadian nadir (lowest point of alertness).
 *
 * The nadir typically occurs ~2 hours before natural wake time.
 * This is when core body temperature is at its minimum and
 * sleep propensity is highest.
 *
 * @param medianWakeTime - Median wake time
 * @returns Circadian nadir time
 */
export function calculateCircadianNadir(medianWakeTime: Date): Date {
  return addHours(medianWakeTime, -CIRCADIAN_DEFAULTS.NADIR_OFFSET_HOURS);
}

/**
 * Calculate circadian acrophase (peak alertness).
 *
 * The acrophase occurs approximately 12 hours after the nadir.
 * This is optimal time for cognitive performance and physical activity.
 *
 * @param nadirTime - Circadian nadir time
 * @returns Circadian acrophase time
 */
export function calculateCircadianAcrophase(nadirTime: Date): Date {
  return addHours(nadirTime, 12);
}

/**
 * Calculate melatonin secretion window.
 *
 * Melatonin typically begins rising 2-3 hours before habitual sleep onset
 * (dim-light melatonin onset, DLMO). This window represents the optimal
 * time for sleep initiation when melatonin is rising.
 *
 * @param medianSleepTime - Median sleep onset time
 * @returns Melatonin window with start and end times
 */
export function calculateMelatoninWindow(medianSleepTime: Date): { start: Date; end: Date } {
  return {
    start: addHours(medianSleepTime, -CIRCADIAN_DEFAULTS.MELATONIN_WINDOW_HOURS),
    end: medianSleepTime,
  };
}

/**
 * Determine chronotype classification based on wake time.
 *
 * Classifications based on Roenneberg's morningness-eveningness research:
 * - Early: Wakes before 6:00 (morning larks, ~15% of population)
 * - Intermediate: Wakes 6:00-8:00 (most common, ~60% of population)
 * - Late: Wakes after 8:00 (night owls, ~25% of population)
 *
 * @param medianWakeTime - Median wake time
 * @returns Chronotype classification
 */
export function determineChronotype(medianWakeTime: Date): ChronotypeClass {
  const wakeHour = medianWakeTime.getHours() + medianWakeTime.getMinutes() / 60;

  if (wakeHour < CHRONOTYPE_BOUNDARIES.EARLY_BEFORE) {
    return 'early';
  }

  if (wakeHour > CHRONOTYPE_BOUNDARIES.LATE_AFTER) {
    return 'late';
  }

  return 'intermediate';
}

/**
 * Determine confidence level based on data availability.
 *
 * @param daysAvailable - Number of valid days used
 * @param minDays - Minimum days for reliable analysis
 * @returns Confidence level
 */
function determineConfidence(
  daysAvailable: number,
  minDays: number = CIRCADIAN_DEFAULTS.MIN_DAYS_FOR_CHRONOTYPE
): 'low' | 'medium' | 'high' {
  if (daysAvailable >= minDays * 2) {
    return 'high';
  }
  if (daysAvailable >= minDays) {
    return 'medium';
  }
  return 'low';
}

// === MAIN FUNCTION ===

/**
 * Analyze chronotype from sleep history.
 *
 * Requires at least 7 days of valid sleep data for reliable analysis.
 * More data (14+ days) increases confidence in the assessment.
 *
 * @param history - Array of daily vitals with sleep timestamps
 * @param minDays - Minimum days required (default: 7)
 * @returns ChronotypeData with all circadian markers, or null if insufficient data
 */
export function analyzeChronotype(
  history: DailyVitalsMinimal[],
  minDays: number = CIRCADIAN_DEFAULTS.MIN_DAYS_FOR_CHRONOTYPE
): ChronotypeData | null {
  // Extract wake and sleep times
  const wakeTimes = extractWakeTimes(history, 14);
  const sleepTimes = extractSleepTimes(history, 14);

  // Validate minimum data
  if (wakeTimes.length < minDays || sleepTimes.length < minDays) {
    return null;
  }

  // Calculate median times
  const medianWakeTime = calculateMedianTime(wakeTimes);
  const medianSleepTime = calculateMedianTime(sleepTimes);

  // Calculate circadian markers
  const circadianNadir = calculateCircadianNadir(medianWakeTime);
  const circadianAcrophase = calculateCircadianAcrophase(circadianNadir);
  const melatoninWindow = calculateMelatoninWindow(medianSleepTime);

  // Determine chronotype
  const chronotype = determineChronotype(medianWakeTime);

  // Determine confidence
  const basedOnDays = Math.min(wakeTimes.length, sleepTimes.length);
  const confidence = determineConfidence(basedOnDays, minDays);

  return {
    averageWakeTime: medianWakeTime,
    averageSleepTime: medianSleepTime,
    circadianNadir,
    circadianAcrophase,
    melatoninWindow,
    chronotype,
    basedOnDays,
    confidence,
  };
}

// === FORMATTING UTILITIES ===

/**
 * Format time for display (HH:MM).
 *
 * @param date - Date to format
 * @returns Time string in HH:MM format
 */
export function formatTime(date: Date): string {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Get chronotype label in Portuguese.
 *
 * @param chronotype - Chronotype classification
 * @returns Portuguese label
 */
export function getChronotypeLabel(chronotype: ChronotypeClass): string {
  switch (chronotype) {
    case 'early':
      return 'Matutino';
    case 'intermediate':
      return 'Intermediário';
    case 'late':
      return 'Vespertino';
  }
}

/**
 * Get chronotype emoji.
 *
 * @param chronotype - Chronotype classification
 * @returns Appropriate emoji
 */
export function getChronotypeEmoji(chronotype: ChronotypeClass): string {
  switch (chronotype) {
    case 'early':
      return '\u{1F305}'; // Sunrise
    case 'intermediate':
      return '\u{2600}'; // Sun
    case 'late':
      return '\u{1F319}'; // Crescent Moon
  }
}

/**
 * Get chronotype description in Portuguese.
 *
 * @param chronotype - Chronotype classification
 * @returns Description of the chronotype
 */
export function getChronotypeDescription(chronotype: ChronotypeClass): string {
  switch (chronotype) {
    case 'early':
      return 'Seu ritmo natural favorece acordar e dormir mais cedo. Seu pico de energia acontece pela manhã.';
    case 'intermediate':
      return 'Seu ritmo é típico da maioria das pessoas. Você se adapta bem a horários convencionais.';
    case 'late':
      return 'Seu ritmo natural favorece acordar e dormir mais tarde. Seu pico de energia acontece à tarde/noite.';
  }
}
