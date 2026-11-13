import {
  HEART_RATE_BAND_HIGHEST_BPM,
  HEART_RATE_BAND_LOWEST_BPM,
  normalizeHeartRateBand,
  type HeartRateBand,
} from './heartRateTargets.ts';
import {
  heartRateZoneRange,
  type ResolvedHeartRateZones,
} from './heartRateZones.ts';

/**
 * The person's Zone 2 range as a heart-rate target band, from their own
 * resolved zones (their maximum or resting rate, and the zone method they
 * chose). Null when it is too narrow or outside what a target can hold.
 */
export function zone2HeartRateBand(
  resolved: Pick<ResolvedHeartRateZones, 'zones' | 'maxHr'>
): HeartRateBand | null {
  const range = heartRateZoneRange(resolved, 2);
  if (!range) return null;
  return normalizeHeartRateBand({
    minBpm: range.lowerBpm,
    maxBpm: range.upperBpm,
  });
}

/** How far past Zone 2's top edge heart rate may drift on a long steady run. */
export const ZONE2_DRIFT_MAX_BPM = 5;
/** Drift is not allowed for before this long into a Zone 2 stretch... */
export const ZONE2_DRIFT_START_SECONDS = 20 * 60;
/** ...and reaches its full allowance by this long. */
export const ZONE2_DRIFT_FULL_SECONDS = 60 * 60;
/** Heart rate lags effort, so the first minutes of a stretch may sit this far under the range. */
export const ZONE2_SETTLE_SECONDS = 3 * 60;
export const ZONE2_SETTLE_BPM = 10;

/**
 * The range a Zone 2 stretch is judged against `secondsIn` seconds after it
 * began. Heart rate climbs slowly at the start of a run and drifts up on a long
 * steady one (heat, fluid loss) with no change in effort, so the lower edge is
 * relaxed while it settles and the upper edge grows by up to five bpm between
 * 20 and 60 minutes. The displayed target stays the plain Zone 2 range.
 */
export function zone2LiveBand(
  band: HeartRateBand,
  secondsIn: number
): HeartRateBand {
  const elapsed = Math.max(0, secondsIn);
  const drift =
    elapsed <= ZONE2_DRIFT_START_SECONDS
      ? 0
      : Math.min(
          1,
          (elapsed - ZONE2_DRIFT_START_SECONDS) /
            (ZONE2_DRIFT_FULL_SECONDS - ZONE2_DRIFT_START_SECONDS)
        ) * ZONE2_DRIFT_MAX_BPM;
  const settle = elapsed < ZONE2_SETTLE_SECONDS ? ZONE2_SETTLE_BPM : 0;
  return {
    minBpm: Math.max(HEART_RATE_BAND_LOWEST_BPM, band.minBpm - settle),
    maxBpm: Math.min(
      HEART_RATE_BAND_HIGHEST_BPM,
      band.maxBpm + Math.round(drift)
    ),
  };
}

export type HeartRateStanding = 'above' | 'below' | 'inside';

/** Where a reading sits against a range; no margin, the alert rule adds its own. */
export function heartRateStanding(
  bpm: number,
  band: HeartRateBand
): HeartRateStanding {
  if (bpm > band.maxBpm) return 'above';
  if (bpm < band.minBpm) return 'below';
  return 'inside';
}
