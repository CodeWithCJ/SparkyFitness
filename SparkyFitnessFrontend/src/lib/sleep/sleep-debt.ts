/**
 * Sleep Debt Configuration and Utilities
 *
 * Based on the RISE/WHOOP sleep debt model with exponential decay.
 * Reference: Sleep debt accumulates over a 14-day rolling window
 * with more recent days weighted higher.
 *
 * Extended with personalized sleep need calculation based on:
 * - Historical median TST on free days (weekends)
 * - Satiation point (TST where recovery stabilizes)
 */

import { WHOOP_COLORS } from './whoop-colors';
import { type PersonalizedSleepNeed, type DailyVitalsMinimal, CIRCADIAN_DEFAULTS } from './circadian-types';
import { median } from './circadian-math';

// === CONSTANTS ===

/** Base sleep need in hours (used as fallback, based on research recommendations) */
export const SLEEP_NEED_HOURS = 8.25;

/** Minimum sleep need (biological floor) */
export const MIN_SLEEP_NEED = 6.0;

/** Maximum sleep need (biological ceiling) */
export const MAX_SLEEP_NEED = 10.0;

/** Rolling window for debt calculation */
export const DEBT_WINDOW_DAYS = 14;

/** Exponential decay factor (higher = faster decay of old days) */
export const DECAY_LAMBDA = 0.5;

/** Reference TST in minutes for ideal duration (7h30m) */
export const TST_REFERENCE_MINUTES = 450;

// === TYPES ===

export type DebtCategory = 'low' | 'moderate' | 'high' | 'critical';
export type TrendDirection = 'improving' | 'worsening' | 'stable';

export interface DailyDebtEntry {
  date: string;
  tst: number;           // Total Sleep Time in hours
  deviation: number;     // Deviation from need (positive = deficit)
  weight: number;        // Applied weight (0-1)
  weightedDebt: number;  // Weighted contribution to total debt
}

export interface SleepDebtTrend {
  direction: TrendDirection;
  change7d: number;      // Change over last 7 days (percentage)
}

export interface SleepDebtData {
  currentDebt: number;
  debtCategory: DebtCategory;
  sleepNeed: number;
  last14Days: DailyDebtEntry[];
  trend: SleepDebtTrend;
  paybackTime: number | null;  // Hours extra needed per night to clear debt
  personalizedSleepNeed?: PersonalizedSleepNeed; // Personalized sleep need data
}

// === CATEGORY THRESHOLDS ===

export const DEBT_THRESHOLDS = {
  low: { min: 0, max: 2 },
  moderate: { min: 2, max: 5 },
  high: { min: 5, max: 8 },
  critical: { min: 8, max: Infinity },
} as const;

// === UTILITY FUNCTIONS ===

/**
 * Get the debt category based on debt hours
 */
export function getDebtCategory(debtHours: number): DebtCategory {
  if (debtHours <= DEBT_THRESHOLDS.low.max) return 'low';
  if (debtHours <= DEBT_THRESHOLDS.moderate.max) return 'moderate';
  if (debtHours <= DEBT_THRESHOLDS.high.max) return 'high';
  return 'critical';
}

/**
 * Get WHOOP-style colors for debt category
 */
export function getDebtColor(category: DebtCategory): {
  bg: string;
  text: string;
  glow: string;
} {
  switch (category) {
    case 'low':
      return {
        bg: WHOOP_COLORS.recovery.green.bg,
        text: WHOOP_COLORS.recovery.green.text,
        glow: WHOOP_COLORS.recovery.green.glow,
      };
    case 'moderate':
      return {
        bg: WHOOP_COLORS.recovery.yellow.bg,
        text: WHOOP_COLORS.recovery.yellow.text,
        glow: WHOOP_COLORS.recovery.yellow.glow,
      };
    case 'high':
    case 'critical':
      return {
        bg: WHOOP_COLORS.recovery.red.bg,
        text: WHOOP_COLORS.recovery.red.text,
        glow: WHOOP_COLORS.recovery.red.glow,
      };
  }
}

/**
 * Get category label in Portuguese
 */
export function getDebtCategoryLabel(category: DebtCategory): string {
  switch (category) {
    case 'low':
      return 'Baixo';
    case 'moderate':
      return 'Moderado';
    case 'high':
      return 'Alto';
    case 'critical':
      return 'Crítico';
  }
}

/**
 * Calculate exponential weight for a given day index
 * Day 0 = yesterday (most recent), Day 13 = 14 days ago
 */
export function calculateDayWeight(dayIndex: number): number {
  return Math.exp(-DECAY_LAMBDA * dayIndex);
}

/**
 * Calculate payback time (nights to clear debt)
 * Assumes extra 1h per night
 */
export function calculatePaybackNights(debtHours: number): number {
  if (debtHours <= 0) return 0;
  // Assuming you can realistically add 1 extra hour per night
  return Math.ceil(debtHours);
}

/**
 * Normalize debt value to percentage (8h = 100%)
 */
export function normalizeDebtToPercent(debtHours: number): number {
  const maxDebt = 8; // 8 hours = 100%
  return Math.min((debtHours / maxDebt) * 100, 100);
}

// === PERSONALIZED SLEEP NEED ===

/**
 * Check if a date falls on a weekend (Friday, Saturday, Sunday night)
 * These are "free days" where sleep is less likely to be alarm-interrupted
 */
function isWeekendNight(dateStr: string): boolean {
  const date = new Date(dateStr);
  const dayOfWeek = date.getDay();
  // 0 = Sunday, 5 = Friday, 6 = Saturday
  // Friday night, Saturday night, and Sunday night are considered "free"
  return dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6;
}

/**
 * Calculate Total Sleep Time from daily vitals
 */
function calculateTST(vitals: DailyVitalsMinimal): number | null {
  // Try to calculate from sleep stages
  if (
    vitals.deepSleepMinutes !== undefined &&
    vitals.remSleepMinutes !== undefined &&
    vitals.lightSleepMinutes !== undefined
  ) {
    const totalMinutes =
      (vitals.deepSleepMinutes || 0) +
      (vitals.remSleepMinutes || 0) +
      (vitals.lightSleepMinutes || 0);

    if (totalMinutes > 0) {
      return totalMinutes / 60; // Convert to hours
    }
  }

  // Fall back to sleep duration if available
  if (vitals.sleepDurationHours !== undefined && vitals.sleepDurationHours > 0) {
    return vitals.sleepDurationHours;
  }

  return null;
}

/**
 * Calculate personalized sleep need based on historical data.
 *
 * Method 1: Historical Median (preferred)
 * - Uses median TST from weekend/free days over the last 30-60 days
 * - These days are less likely to be alarm-interrupted
 *
 * Method 2: Satiation Point (fallback)
 * - Finds the TST where recovery score stabilizes above 70%
 * - Represents the point of diminishing returns
 *
 * @param history - Array of daily vitals (at least 30 days recommended)
 * @param minDays - Minimum days for reliable calculation (default: 30)
 * @returns PersonalizedSleepNeed with calculated need and confidence
 */
export function calculatePersonalizedSleepNeed(
  history: DailyVitalsMinimal[],
  minDays: number = CIRCADIAN_DEFAULTS.MIN_DAYS_FOR_SLEEP_NEED
): PersonalizedSleepNeed {
  // Filter valid entries with sleep data
  const validEntries = history.filter((v) => calculateTST(v) !== null);

  // Not enough data - return default
  if (validEntries.length < 7) {
    return {
      calculatedNeed: SLEEP_NEED_HOURS,
      confidence: 'low',
      basedOnDays: validEntries.length,
      method: 'default',
    };
  }

  // === METHOD 1: Historical Median from Free Days ===
  const freeDayEntries = validEntries.filter((v) => isWeekendNight(v.date));
  const freeDayTST = freeDayEntries
    .map((v) => calculateTST(v))
    .filter((tst): tst is number => tst !== null);

  if (freeDayTST.length >= 4) {
    const medianTST = median(freeDayTST);

    // Clamp to biological limits
    const clampedNeed = Math.max(MIN_SLEEP_NEED, Math.min(MAX_SLEEP_NEED, medianTST));

    // Determine confidence based on sample size
    let confidence: 'low' | 'medium' | 'high';
    if (freeDayTST.length >= 12) {
      confidence = 'high';
    } else if (freeDayTST.length >= 6) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }

    return {
      calculatedNeed: Math.round(clampedNeed * 10) / 10, // Round to 1 decimal
      confidence,
      basedOnDays: freeDayTST.length,
      method: 'historical_median',
    };
  }

  // === METHOD 2: Satiation Point ===
  // Find TST where recovery score stabilizes above 70%
  const entriesWithRecovery = validEntries.filter(
    (v) => v.recoveryScore !== undefined && v.recoveryScore !== null
  );

  if (entriesWithRecovery.length >= minDays / 2) {
    // Group by TST ranges (0.5h buckets)
    const buckets: Map<number, { tst: number; recovery: number }[]> = new Map();

    for (const entry of entriesWithRecovery) {
      const tst = calculateTST(entry);
      const recovery = entry.recoveryScore;

      if (tst !== null && recovery !== undefined) {
        const bucket = Math.floor(tst * 2) / 2; // 0.5h buckets
        if (!buckets.has(bucket)) {
          buckets.set(bucket, []);
        }
        buckets.get(bucket)!.push({ tst, recovery });
      }
    }

    // Find the lowest TST bucket where average recovery >= 70%
    const sortedBuckets = Array.from(buckets.entries())
      .map(([bucket, entries]) => ({
        bucket,
        avgRecovery: entries.reduce((sum, e) => sum + e.recovery, 0) / entries.length,
        count: entries.length,
      }))
      .filter((b) => b.count >= 2) // At least 2 data points per bucket
      .sort((a, b) => a.bucket - b.bucket);

    // Find first bucket where recovery >= 70%
    const satiationBucket = sortedBuckets.find((b) => b.avgRecovery >= 70);

    if (satiationBucket) {
      const clampedNeed = Math.max(
        MIN_SLEEP_NEED,
        Math.min(MAX_SLEEP_NEED, satiationBucket.bucket + 0.25) // Center of bucket
      );

      return {
        calculatedNeed: Math.round(clampedNeed * 10) / 10,
        confidence: entriesWithRecovery.length >= minDays ? 'medium' : 'low',
        basedOnDays: entriesWithRecovery.length,
        method: 'satiation_point',
      };
    }
  }

  // === FALLBACK: Use all-days median with low confidence ===
  const allTST = validEntries
    .map((v) => calculateTST(v))
    .filter((tst): tst is number => tst !== null);

  if (allTST.length >= 7) {
    const medianTST = median(allTST);
    const clampedNeed = Math.max(MIN_SLEEP_NEED, Math.min(MAX_SLEEP_NEED, medianTST));

    return {
      calculatedNeed: Math.round(clampedNeed * 10) / 10,
      confidence: 'low',
      basedOnDays: allTST.length,
      method: 'historical_median',
    };
  }

  // No usable data
  return {
    calculatedNeed: SLEEP_NEED_HOURS,
    confidence: 'low',
    basedOnDays: 0,
    method: 'default',
  };
}

/**
 * Calculate sleep debt using personalized sleep need.
 *
 * @param history - Array of daily vitals
 * @param personalizedNeed - Pre-calculated personalized sleep need (optional)
 * @returns Sleep debt calculation using personalized or default need
 */
export function calculateSleepDebtWithPersonalizedNeed(
  history: DailyVitalsMinimal[],
  personalizedNeed?: PersonalizedSleepNeed
): { debt: number; sleepNeed: number } {
  // Calculate or use provided personalized need
  const need = personalizedNeed ?? calculatePersonalizedSleepNeed(history);
  const sleepNeed = need.calculatedNeed;

  // Calculate debt over 14-day window with exponential decay
  let weightedDebtSum = 0;

  // Sort by date descending (most recent first)
  const sortedHistory = [...history]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, DEBT_WINDOW_DAYS);

  for (let i = 0; i < sortedHistory.length; i++) {
    const entry = sortedHistory[i];
    const tst = calculateTST(entry);

    // Use personalized need or neutral imputation if no data
    const dailyTST = tst !== null ? tst : sleepNeed;
    const dailyDeviation = sleepNeed - dailyTST;

    // Exponential decay weight
    const weight = Math.exp(-DECAY_LAMBDA * i);

    // IMPORTANTE: Só acumular déficits (valores positivos)
    // Superávits (noites boas) NÃO cancelam débito - o corpo não "armazena" sono
    if (dailyDeviation > 0) {
      weightedDebtSum += dailyDeviation * weight;
    }
  }

  // Debt já é positivo pelo if acima
  const debt = Math.round(weightedDebtSum * 10) / 10;

  return { debt, sleepNeed };
}
