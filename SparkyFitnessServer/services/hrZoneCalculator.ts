/**
 * Heart-rate time-in-zone computation.
 *
 * Garmin ships pre-computed zones (`hr_in_timezones`), so extractGarminHrZones
 * is a pure passthrough and nothing in the codebase ever had to derive them.
 * HealthKit and Health Connect ship only a raw bpm series, so the zone split for
 * those providers is computed here from the samples plus the user's max HR.
 */

/** One bpm reading. `t` is an ISO 8601 instant. */
export interface HrSample {
  t: string;
  bpm: number;
}

/** A single zone bucket, shaped for exercise_entry_hr_zones. */
export interface HrZone {
  zone_index: number;
  zone_lower_bpm: number;
  /** null for the open-ended top zone. */
  zone_upper_bpm: number | null;
  seconds_in_zone: number;
}

/**
 * Zone floors as a fraction of max HR. Five zones, the split every consumer
 * platform uses, and what ActivityHeartRateZoneChart already renders for Garmin.
 * Readings below ZONE_FLOORS[0] belong to no zone and are dropped rather than
 * being folded into zone 1 — resting/recovery time is not zone-1 training time.
 */
const ZONE_FLOORS = [0.5, 0.6, 0.7, 0.8, 0.9] as const;

/**
 * Cap on the time credited to a single sample gap.
 *
 * Watches stop sampling when a workout is paused, when a strap loses contact, or
 * when optical HR drops out. Without a cap, one 20-minute gap credits 20 minutes
 * to whichever zone happened to precede it and the chart becomes meaningless.
 * 60s is comfortably above every normal sampling interval (1-15s) while bounding
 * the damage from a dropout.
 */
const MAX_GAP_SECONDS = 60;

/** Zone boundaries in bpm for a given max HR. */
function zoneBoundaries(maxHr: number): number[] {
  return ZONE_FLOORS.map((fraction) => Math.round(maxHr * fraction));
}

/**
 * Zone index (1-5) for a bpm reading, or 0 when it falls below zone 1.
 */
function zoneIndexFor(bpm: number, boundaries: readonly number[]): number {
  let index = 0;
  for (let i = 0; i < boundaries.length; i += 1) {
    if (bpm >= boundaries[i]) index = i + 1;
  }
  return index;
}

/**
 * Splits a heart-rate series into time-in-zone buckets.
 *
 * Time is attributed forward: the interval between two consecutive samples is
 * credited to the zone of the *earlier* sample, clamped to MAX_GAP_SECONDS. The
 * final sample contributes nothing, since there is no following instant to
 * measure against — over a workout with hundreds of samples this is a rounding
 * error, and it avoids inventing a duration for the tail.
 *
 * Returns only zones with non-zero time, ascending by zone_index. An empty or
 * single-sample series returns [].
 */
export function computeHrZones(
  samples: readonly HrSample[],
  maxHr: number
): HrZone[] {
  if (!Array.isArray(samples) || samples.length < 2) return [];
  if (!Number.isFinite(maxHr) || maxHr <= 0) return [];

  const boundaries = zoneBoundaries(maxHr);

  const ordered = samples
    .filter((s) => Number.isFinite(s?.bpm) && typeof s?.t === 'string')
    .map((s) => ({ ms: Date.parse(s.t), bpm: s.bpm }))
    .filter((s) => Number.isFinite(s.ms))
    .sort((a, b) => a.ms - b.ms);

  if (ordered.length < 2) return [];

  const secondsByZone = new Map<number, number>();

  for (let i = 0; i < ordered.length - 1; i += 1) {
    const current = ordered[i];
    const next = ordered[i + 1];

    const zone = zoneIndexFor(current.bpm, boundaries);
    if (zone === 0) continue;

    const gapSeconds = (next.ms - current.ms) / 1000;
    if (gapSeconds <= 0) continue;

    const credited = Math.min(gapSeconds, MAX_GAP_SECONDS);
    secondsByZone.set(zone, (secondsByZone.get(zone) ?? 0) + credited);
  }

  const zones: HrZone[] = [];
  for (let index = 1; index <= ZONE_FLOORS.length; index += 1) {
    const seconds = secondsByZone.get(index);
    if (!seconds) continue;
    zones.push({
      zone_index: index,
      zone_lower_bpm: boundaries[index - 1],
      zone_upper_bpm: index < ZONE_FLOORS.length ? boundaries[index] - 1 : null,
      seconds_in_zone: Math.round(seconds),
    });
  }

  return zones;
}

/**
 * Nes et al. (2013) max-HR estimate. Chosen over the textbook `220 - age`,
 * which overestimates for younger adults and underestimates for older ones.
 */
export function estimateMaxHrFromAge(age: number): number {
  return Math.round(211 - 0.64 * age);
}

/** Whole years between a date of birth and now. */
export function ageFromDateOfBirth(
  dateOfBirth: string | Date | null | undefined,
  now: Date = new Date()
): number | null {
  if (!dateOfBirth) return null;
  const dob = dateOfBirth instanceof Date ? dateOfBirth : new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;

  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - dob.getUTCMonth();
  if (
    monthDelta < 0 ||
    (monthDelta === 0 && now.getUTCDate() < dob.getUTCDate())
  ) {
    age -= 1;
  }
  return age >= 0 && age < 130 ? age : null;
}

/** Last-resort max HR when no age is known, so zones still render. */
export const FALLBACK_MAX_HR = 190;

/**
 * Max HR from a date of birth, falling back to the highest bpm observed in the
 * workout itself (never below FALLBACK_MAX_HR). The observed-max fallback keeps
 * every sample inside the zone range rather than pinning an unknown-age user's
 * whole workout to zone 5.
 */
export function resolveMaxHr(
  dateOfBirth: string | Date | null | undefined,
  samples: readonly HrSample[] = []
): { maxHr: number; estimated: boolean } {
  const age = ageFromDateOfBirth(dateOfBirth);
  if (age !== null) {
    return { maxHr: estimateMaxHrFromAge(age), estimated: true };
  }

  const observed = samples.reduce(
    (max, s) => (Number.isFinite(s?.bpm) && s.bpm > max ? s.bpm : max),
    0
  );
  return { maxHr: Math.max(observed, FALLBACK_MAX_HR), estimated: true };
}
