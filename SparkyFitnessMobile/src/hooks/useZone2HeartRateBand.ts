import { useMemo } from 'react';
import { zone2HeartRateBand, type HeartRateBand } from '@workspace/shared';
import { useHeartRateZones } from './useHeartRateZones';

/**
 * The person's Zone 2 heart-rate range, from their own zones (a maximum or
 * resting rate they set, the zone method they chose). Null until zones are
 * known, and for percent-of-maximum zones built on the fixed fallback maximum.
 */
export function useZone2HeartRateBand(enabled = true): HeartRateBand | null {
  const { zones } = useHeartRateZones(enabled);
  const resolved = zones?.resolved;
  return useMemo(() => {
    if (!resolved) return null;
    // A typical fallback figure is not worth holding a run to, unless the
    // person's own custom or heart-rate-reserve zones do not depend on it.
    if (
      resolved.max_hr_source === 'fallback' &&
      resolved.effective_method === 'percent_max'
    ) {
      return null;
    }
    return zone2HeartRateBand({
      maxHr: resolved.max_hr,
      zones: resolved.zones.map((zone) => ({
        zone: zone.zone,
        lowerBpm: zone.lower_bpm,
        upperBpm: zone.upper_bpm,
      })),
    });
  }, [resolved]);
}
