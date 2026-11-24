import * as genericHealthRepository from '../models/genericHealthRepository.js';
import { log } from '../config/logging.js';

/**
 * Plausible VO2 max (ml/kg/min) for a device or provider reading. One range for
 * every source, so a bad value is dropped the same way wherever it came from.
 */
export const VO2_MAX_BOUNDS = { min: 10, max: 100, decimals: 1 } as const;

/** Rounds a reading to the stored precision, or null outside the bounds. */
export function normalizeVo2Max(raw: unknown): number | null {
  const value =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && raw.trim() !== ''
        ? Number(raw)
        : Number.NaN;
  if (!Number.isFinite(value)) return null;
  if (value < VO2_MAX_BOUNDS.min || value > VO2_MAX_BOUNDS.max) return null;
  const scale = 10 ** VO2_MAX_BOUNDS.decimals;
  return Math.round(value * scale) / scale;
}

/**
 * Copies a provider's VO2 max onto that day's `daily_health_metrics` row, which
 * is where the Daily Wearable Health Summary and the latest-value carry-forward
 * read it. Providers that file VO2 max as a custom measurement call this as
 * well, so every source ends up in both places. The upsert COALESCEs per column
 * on (user_id, entry_date, source_provider), so it merges with other writes for
 * the same day. Never throws: the custom measurement is already saved.
 */
export async function saveDailyVo2Max(
  userId: string,
  createdByUserId: string,
  entryDate: string,
  rawValue: unknown,
  sourceProvider: string
): Promise<void> {
  const vo2Max = normalizeVo2Max(rawValue);
  if (vo2Max === null) {
    log(
      'info',
      `Not copying ${sourceProvider} VO2 max ${String(rawValue)} for ${entryDate} to the daily summary: outside ${VO2_MAX_BOUNDS.min} to ${VO2_MAX_BOUNDS.max}.`
    );
    return;
  }
  try {
    await genericHealthRepository.upsertDailyHealthMetrics(
      userId,
      createdByUserId,
      {
        user_id: userId,
        entry_date: entryDate,
        source_provider: sourceProvider,
        vo2_max: vo2Max,
      }
    );
  } catch (error) {
    log(
      'error',
      `Failed to copy ${sourceProvider} VO2 max for ${entryDate} to the daily summary: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
