/**
 * Heart-rate zones: the one place that decides a person's maximum heart rate,
 * where their five zones start, and how a series of readings splits across
 * them. The server (stored time in zone, training load), the web app and the
 * mobile app all call this, so the zones on a chart, the ranges a plan
 * suggests and the load a workout earns always agree.
 *
 * Max heart rate comes from, in order: the value the person set, a formula
 * from their age (Nes et al. 2013, 211 - 0.64 x age; the formula the server
 * has always used for stored zones, so history does not shift), the highest
 * reading in the workout when there is no age, and a fixed fallback.
 */

export const HR_ZONE_COUNT = 5;

/** One color per zone, easy to hard: zone 1 (slate) to zone 5 (red). */
export const HEART_RATE_ZONE_COLORS = [
  '#94a3b8',
  '#3b82f6',
  '#22c55e',
  '#f59e0b',
  '#ef4444',
] as const;

/** How the five zone floors are worked out. */
export const HR_ZONE_METHODS = [
  'percent_max',
  'heart_rate_reserve',
  'custom',
] as const;
export type HrZoneMethod = (typeof HR_ZONE_METHODS)[number];

export const DEFAULT_HR_ZONE_METHOD: HrZoneMethod = 'percent_max';

/**
 * How many bands the person sees: all five zones, or four tiers (Light is
 * zones 1 and 2, then Moderate, Vigorous and Peak are zones 3, 4 and 5).
 * Only the display changes. Zones are always worked out, stored and weighted
 * as five.
 */
export const HR_ZONE_DISPLAY_COUNTS = [4, 5] as const;
export type HrZoneDisplayCount = (typeof HR_ZONE_DISPLAY_COUNTS)[number];
export const DEFAULT_HR_ZONE_DISPLAY_COUNT: HrZoneDisplayCount = 5;

/** Zone floors as a fraction of max HR (percent of max) or of reserve (Karvonen). */
export const HR_ZONE_FRACTIONS = [0.5, 0.6, 0.7, 0.8, 0.9] as const;

/** Last-resort max HR when nothing else is known, so zones still render. */
export const FALLBACK_MAX_HR = 190;

export const MIN_MAX_HR = 100;
export const MAX_MAX_HR = 250;
export const MIN_RESTING_HR = 25;
export const MAX_RESTING_HR = 150;
/** Custom zone floors, in bpm. */
export const MIN_CUSTOM_FLOOR_BPM = 30;
export const MAX_CUSTOM_FLOOR_BPM = 250;

/** What a person has chosen. Every field is optional in effect: null/default means "work it out". */
export interface HeartRateZoneSettings {
  maxHeartRate: number | null;
  restingHeartRate: number | null;
  method: HrZoneMethod;
  /** Five ascending bpm floors for the `custom` method; null otherwise. */
  customFloors: number[] | null;
  /** Show five zones or four tiers. */
  displayZones: HrZoneDisplayCount;
}

export const DEFAULT_HEART_RATE_ZONE_SETTINGS: HeartRateZoneSettings = {
  maxHeartRate: null,
  restingHeartRate: null,
  method: DEFAULT_HR_ZONE_METHOD,
  customFloors: null,
  displayZones: DEFAULT_HR_ZONE_DISPLAY_COUNT,
};

/** Where the maximum heart rate in use came from. */
export type MaxHrSource = 'user' | 'age' | 'observed' | 'fallback';

export interface HeartRateZone {
  /** 1 (easiest) to 5 (hardest). */
  zone: number;
  lowerBpm: number;
  /** null for the open-ended top zone. */
  upperBpm: number | null;
}

export interface ResolvedHeartRateZones {
  maxHr: number;
  maxHrSource: MaxHrSource;
  restingHr: number | null;
  /** The method the person asked for. */
  method: HrZoneMethod;
  /** The method actually used; differs when the chosen one lacked what it needs. */
  effectiveMethod: HrZoneMethod;
  /** Five ascending bpm floors, zone 1 first. */
  floors: number[];
  zones: HeartRateZone[];
}

/**
 * Nes et al. (2013) max-HR estimate. Chosen over the textbook `220 - age`
 * (which over-estimates for the young and under-estimates for the old) and
 * over Tanaka (208 - 0.7 x age): Nes is what stored zones have used since they
 * were introduced, so keeping it means past workouts and new ones line up.
 */
export function estimateMaxHrFromAge(age: number): number {
  return Math.round(211 - 0.64 * age);
}

/**
 * Whole years between a date of birth and `today` (a YYYY-MM-DD day in the
 * person's timezone). Null for a missing or unusable date of birth.
 */
export function ageFromDateOfBirth(
  dateOfBirth: string | Date | null | undefined,
  today: string
): number | null {
  if (!dateOfBirth) return null;
  const dob = dateOfBirth instanceof Date ? dateOfBirth : new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;
  const todayMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
  if (!todayMatch) return null;
  const year = Number(todayMatch[1]);
  const month = Number(todayMatch[2]);
  const day = Number(todayMatch[3]);

  let age = year - dob.getUTCFullYear();
  const monthDelta = month - 1 - dob.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && day < dob.getUTCDate())) {
    age -= 1;
  }
  return age >= 0 && age < 130 ? age : null;
}

/** Null when the five floors are fine, otherwise why not. */
export function customFloorsProblem(
  floors: readonly number[] | null | undefined
): string | null {
  if (!floors || floors.length !== HR_ZONE_COUNT) {
    return `Custom zones need ${HR_ZONE_COUNT} floors.`;
  }
  let previous: number | null = null;
  for (const floor of floors) {
    if (
      !Number.isInteger(floor) ||
      floor < MIN_CUSTOM_FLOOR_BPM ||
      floor > MAX_CUSTOM_FLOOR_BPM
    ) {
      return `Zone floors must be whole numbers from ${MIN_CUSTOM_FLOOR_BPM} to ${MAX_CUSTOM_FLOOR_BPM} bpm.`;
    }
    if (previous !== null && floor <= previous) {
      return 'Each zone must start above the one before it.';
    }
    previous = floor;
  }
  return null;
}

interface MaxHrInput {
  maxHeartRate?: number | null;
  dateOfBirth?: string | Date | null;
  /** The person's local day, YYYY-MM-DD, for working out their age. */
  today: string;
  /** Highest reading in the workout being bucketed; only used when no age is known. */
  observedMaxBpm?: number | null;
}

function isValidMaxHr(value: number | null | undefined): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= MIN_MAX_HR &&
    value <= MAX_MAX_HR
  );
}

function isValidRestingHr(value: number | null | undefined): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= MIN_RESTING_HR &&
    value <= MAX_RESTING_HR
  );
}

/**
 * Max HR in use and where it came from: the person's own value, else the age
 * formula, else the highest reading seen (never below the fallback), else the
 * fallback itself.
 */
export function resolveMaxHr(input: MaxHrInput): {
  maxHr: number;
  source: MaxHrSource;
} {
  if (isValidMaxHr(input.maxHeartRate)) {
    return { maxHr: Math.round(input.maxHeartRate), source: 'user' };
  }
  const age = ageFromDateOfBirth(input.dateOfBirth, input.today);
  if (age !== null) {
    return { maxHr: estimateMaxHrFromAge(age), source: 'age' };
  }
  const observed =
    typeof input.observedMaxBpm === 'number' &&
    Number.isFinite(input.observedMaxBpm)
      ? input.observedMaxBpm
      : 0;
  if (observed > FALLBACK_MAX_HR) {
    return { maxHr: observed, source: 'observed' };
  }
  return { maxHr: FALLBACK_MAX_HR, source: 'fallback' };
}

/** Zone floors for percent-of-max-HR zones. */
export function percentMaxFloors(maxHr: number): number[] {
  return HR_ZONE_FRACTIONS.map((fraction) => Math.round(maxHr * fraction));
}

/** Zone floors for heart-rate-reserve (Karvonen) zones: rest + fraction x (max - rest). */
export function heartRateReserveFloors(
  maxHr: number,
  restingHr: number
): number[] {
  return HR_ZONE_FRACTIONS.map((fraction) =>
    Math.round(restingHr + (maxHr - restingHr) * fraction)
  );
}

function zonesFromFloors(floors: readonly number[]): HeartRateZone[] {
  return floors.map((lowerBpm, i) => {
    const nextFloor = floors[i + 1];
    return {
      zone: i + 1,
      lowerBpm,
      upperBpm: nextFloor === undefined ? null : nextFloor - 1,
    };
  });
}

export interface ResolveHeartRateZonesInput {
  settings?: Partial<HeartRateZoneSettings> | null;
  dateOfBirth?: string | Date | null;
  /** The person's local day, YYYY-MM-DD. */
  today: string;
  observedMaxBpm?: number | null;
}

/**
 * The person's zones. Settings that cannot be honoured (heart rate reserve
 * with no resting rate, custom floors that are not five ascending numbers)
 * fall back to percent of max, and `effectiveMethod` says so.
 */
export function resolveHeartRateZones(
  input: ResolveHeartRateZonesInput
): ResolvedHeartRateZones {
  const settings = { ...DEFAULT_HEART_RATE_ZONE_SETTINGS, ...input.settings };
  const { maxHr, source } = resolveMaxHr({
    maxHeartRate: settings.maxHeartRate,
    dateOfBirth: input.dateOfBirth,
    today: input.today,
    observedMaxBpm: input.observedMaxBpm,
  });
  const restingHr = isValidRestingHr(settings.restingHeartRate)
    ? Math.round(settings.restingHeartRate)
    : null;

  let effectiveMethod: HrZoneMethod = 'percent_max';
  let floors = percentMaxFloors(maxHr);
  if (settings.method === 'heart_rate_reserve') {
    if (restingHr !== null && restingHr < maxHr) {
      effectiveMethod = 'heart_rate_reserve';
      floors = heartRateReserveFloors(maxHr, restingHr);
    }
  } else if (settings.method === 'custom') {
    if (customFloorsProblem(settings.customFloors) === null) {
      effectiveMethod = 'custom';
      floors = [...(settings.customFloors as number[])];
    }
  }

  return {
    maxHr,
    maxHrSource: source,
    restingHr,
    method: settings.method,
    effectiveMethod,
    floors,
    zones: zonesFromFloors(floors),
  };
}

/**
 * The bpm range of zone `zone` (1-5) for a person's resolved zones. The top
 * zone's upper end is their max heart rate. Null for a zone outside 1-5.
 */
export function heartRateZoneRange(
  resolved: Pick<ResolvedHeartRateZones, 'zones' | 'maxHr'>,
  zone: number
): { lowerBpm: number; upperBpm: number } | null {
  const found = resolved.zones[zone - 1];
  if (!Number.isInteger(zone) || !found) return null;
  return {
    lowerBpm: found.lowerBpm,
    upperBpm: found.upperBpm ?? Math.max(resolved.maxHr, found.lowerBpm),
  };
}

/**
 * The zones a person gets before anything is set or loaded: percent of the
 * fallback max heart rate. The server returns the same when there is no date
 * of birth, so a screen that has not loaded yet shows what it would show for
 * someone with nothing set.
 */
export function defaultHeartRateZones(): ResolvedHeartRateZones {
  const floors = percentMaxFloors(FALLBACK_MAX_HR);
  return {
    maxHr: FALLBACK_MAX_HR,
    maxHrSource: 'fallback',
    restingHr: null,
    method: DEFAULT_HR_ZONE_METHOD,
    effectiveMethod: 'percent_max',
    floors,
    zones: zonesFromFloors(floors),
  };
}

/** One color per tier when four tiers are shown: Light, Moderate, Vigorous, Peak. */
export const HEART_RATE_TIER_COLORS = [
  '#06b6d4',
  '#22c55e',
  '#eab308',
  '#ef4444',
] as const;

export type HeartRateTier = 'light' | 'moderate' | 'vigorous' | 'peak';
const HEART_RATE_TIERS: readonly HeartRateTier[] = [
  'light',
  'moderate',
  'vigorous',
  'peak',
];
/** The zones in each tier, in order. */
const TIER_ZONES: readonly (readonly number[])[] = [[1, 2], [3], [4], [5]];

/** A zone with the color every chart and legend draws it in. */
export interface HeartRateZoneBand extends HeartRateZone {
  color: string;
}

/**
 * The five zones with their colors, for legends, range lists and line
 * gradients. Reports show this instead of working out their own bands.
 */
export function heartRateZoneBands(
  zones: readonly HeartRateZone[]
): HeartRateZoneBand[] {
  return zones.map((zone) => ({
    ...zone,
    color:
      HEART_RATE_ZONE_COLORS[
        Math.min(Math.max(zone.zone, 1), HR_ZONE_COUNT) - 1
      ] ?? HEART_RATE_ZONE_COLORS[0],
  }));
}

/**
 * What a legend, range list or chart shows: five bands (one per zone) or four
 * (one per tier). `zones` are the zone numbers the band covers, so time or
 * readings in them can be summed. `tier` is null when showing five zones.
 */
export interface HeartRateDisplayBand {
  /** Zone number (five zones) or tier number 1-4 (four tiers). */
  index: number;
  tier: HeartRateTier | null;
  zones: number[];
  lowerBpm: number;
  /** null for the open-ended top band. */
  upperBpm: number | null;
  color: string;
}

export function heartRateDisplayBands(
  zones: readonly HeartRateZone[],
  displayZones: HrZoneDisplayCount
): HeartRateDisplayBand[] {
  const bands = heartRateZoneBands(zones);
  if (displayZones === 5) {
    return bands.map((band) => ({
      index: band.zone,
      tier: null,
      zones: [band.zone],
      lowerBpm: band.lowerBpm,
      upperBpm: band.upperBpm,
      color: band.color,
    }));
  }
  const result: HeartRateDisplayBand[] = [];
  TIER_ZONES.forEach((zoneNumbers, i) => {
    const first = bands.find((b) => b.zone === zoneNumbers[0]);
    const last = bands.find(
      (b) => b.zone === zoneNumbers[zoneNumbers.length - 1]
    );
    const tier = HEART_RATE_TIERS[i];
    const color = HEART_RATE_TIER_COLORS[i];
    if (!first || !last || !tier || !color) return;
    result.push({
      index: i + 1,
      tier,
      zones: [...zoneNumbers],
      lowerBpm: first.lowerBpm,
      upperBpm: last.upperBpm,
      color,
    });
  });
  return result;
}

/** Zone 1-5 for a reading, or 0 when it is below zone 1. */
export function heartRateZoneFor(
  bpm: number,
  floors: readonly number[]
): number {
  let index = 0;
  floors.forEach((floor, i) => {
    if (bpm >= floor) index = i + 1;
  });
  return index;
}

/** One bpm reading. `t` is an ISO 8601 instant. */
export interface HrSample {
  t: string;
  bpm: number;
}

/** A single time-in-zone bucket, shaped for exercise_entry_hr_zones. */
export interface HrZoneBucket {
  zone_index: number;
  zone_lower_bpm: number;
  /** null for the open-ended top zone. */
  zone_upper_bpm: number | null;
  seconds_in_zone: number;
}

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

/**
 * Splits a heart-rate series into time-in-zone buckets using `floors`.
 *
 * Time is attributed forward: the interval between two consecutive samples is
 * credited to the zone of the *earlier* sample, clamped to MAX_GAP_SECONDS. The
 * final sample contributes nothing, since there is no following instant to
 * measure against. Readings below the zone 1 floor belong to no zone and are
 * dropped: resting/recovery time is not zone-1 training time.
 *
 * Returns only zones with non-zero time, ascending by zone_index. An empty or
 * single-sample series returns [].
 */
export function computeTimeInZones(
  samples: readonly HrSample[],
  floors: readonly number[]
): HrZoneBucket[] {
  if (!Array.isArray(samples) || samples.length < 2) return [];
  if (
    floors.length !== HR_ZONE_COUNT ||
    floors.some((floor) => !Number.isFinite(floor) || floor <= 0)
  ) {
    return [];
  }

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
    if (!current || !next) continue;

    const zone = heartRateZoneFor(current.bpm, floors);
    if (zone === 0) continue;

    const gapSeconds = (next.ms - current.ms) / 1000;
    if (gapSeconds <= 0) continue;

    const credited = Math.min(gapSeconds, MAX_GAP_SECONDS);
    secondsByZone.set(zone, (secondsByZone.get(zone) ?? 0) + credited);
  }

  const buckets: HrZoneBucket[] = [];
  floors.forEach((lowerBpm, i) => {
    const seconds = secondsByZone.get(i + 1);
    if (!seconds) return;
    const nextFloor = floors[i + 1];
    buckets.push({
      zone_index: i + 1,
      zone_lower_bpm: lowerBpm,
      zone_upper_bpm: nextFloor === undefined ? null : nextFloor - 1,
      seconds_in_zone: Math.round(seconds),
    });
  });
  return buckets;
}

/** Highest bpm in a series, or 0 for none. */
export function observedMaxBpm(samples: readonly HrSample[]): number {
  return samples.reduce(
    (max, s) => (Number.isFinite(s?.bpm) && s.bpm > max ? s.bpm : max),
    0
  );
}

/**
 * One zone from Apple's preferred heart-rate configuration
 * (`HKHealthStore.preferredWorkoutZoneConfiguration`). `minimumBpm` is null
 * when HealthKit leaves that end open: the first zone usually has no lower
 * bound, and the last zone has no upper bound.
 */
export interface AppleHeartRateZoneBound {
  /** HealthKit's zone index. Used only to order the zones. */
  index?: number;
  minimumBpm: number | null;
  maximumBpm?: number | null;
}

/**
 * Five custom-zone floors from Apple's preferred heart-rate zones.
 *
 * Null unless Apple returned exactly five zones that become five ascending
 * bpm floors. Apple's first zone usually has no lower bound (everything below
 * the first boundary counts as zone 1); Sparky needs a real floor, so that
 * zone starts at {@link MIN_CUSTOM_FLOOR_BPM}. Later zones use their minimum,
 * rounded to a whole bpm. This does not invent a max heart rate: Apple does
 * not share one.
 */
export function floorsFromAppleHeartRateZones(
  zones: readonly AppleHeartRateZoneBound[] | null | undefined
): number[] | null {
  if (!zones || zones.length !== HR_ZONE_COUNT) return null;
  const indexed = zones.every((zone) => Number.isInteger(zone.index));
  const ordered = indexed
    ? [...zones].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    : [...zones];

  const floors: number[] = [];
  for (let i = 0; i < ordered.length; i += 1) {
    const zone = ordered[i];
    if (!zone) return null;
    const minimum = zone.minimumBpm;
    let floor: number;
    if (typeof minimum !== 'number' || !Number.isFinite(minimum)) {
      if (i !== 0) return null;
      floor = MIN_CUSTOM_FLOOR_BPM;
    } else {
      floor = Math.round(minimum);
      if (i === 0 && floor < MIN_CUSTOM_FLOOR_BPM) floor = MIN_CUSTOM_FLOOR_BPM;
    }
    floors.push(floor);
  }
  return customFloorsProblem(floors) === null ? floors : null;
}

/** A week in one zone: past this the payload is not a real workout (and would overflow the integer column). */
const MAX_APPLE_ZONE_SECONDS = 7 * 24 * 60 * 60;

/**
 * One zone from a finished HealthKit workout's heart-rate zone group
 * (`HKWorkout.zoneGroupsByType`). `seconds` is the time Apple already summed.
 * A missing bound was left open: the first zone usually has no lower bound,
 * and the last zone has no upper bound.
 */
export interface AppleWorkoutZoneDuration {
  /** HealthKit's zone index. Used only to order the zones. */
  index?: number;
  minimumBpm: number | null;
  maximumBpm?: number | null;
  seconds: number;
}

/**
 * Apple's time-in-zone for one workout, as rows for `exercise_entry_hr_zones`.
 *
 * Null unless there are exactly five zones that become five ascending floors.
 * Unlike {@link computeTimeInZones}, time below the first boundary is kept:
 * Apple counts it as zone 1. That zone is stored from
 * {@link MIN_CUSTOM_FLOOR_BPM} when Apple left it open. The top zone has no
 * upper bound. Seconds are rounded, and a zone with no time is omitted.
 * This does not invent a max heart rate.
 *
 * An empty array means Apple returned five zones and none of them had time.
 */
export function bucketsFromAppleWorkoutZones(
  zones: readonly AppleWorkoutZoneDuration[] | null | undefined
): HrZoneBucket[] | null {
  if (!zones || zones.length !== HR_ZONE_COUNT) return null;
  const indexed = zones.every((zone) => Number.isInteger(zone.index));
  const ordered = indexed
    ? [...zones].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    : [...zones];

  const floors: Array<{ lower: number; seconds: number }> = [];
  for (let i = 0; i < ordered.length; i += 1) {
    const zone = ordered[i];
    if (!zone) return null;
    if (
      !Number.isFinite(zone.seconds) ||
      zone.seconds < 0 ||
      zone.seconds > MAX_APPLE_ZONE_SECONDS
    ) {
      return null;
    }
    const minimum = zone.minimumBpm;
    let floor: number;
    if (typeof minimum !== 'number' || !Number.isFinite(minimum)) {
      if (i !== 0) return null;
      floor = MIN_CUSTOM_FLOOR_BPM;
    } else {
      floor = Math.round(minimum);
      if (i === 0 && floor < MIN_CUSTOM_FLOOR_BPM) floor = MIN_CUSTOM_FLOOR_BPM;
    }
    const previous = floors[i - 1];
    if (previous && floor <= previous.lower) return null;
    floors.push({ lower: floor, seconds: zone.seconds });
  }

  const buckets: HrZoneBucket[] = [];
  floors.forEach((zone, i) => {
    const seconds = Math.round(zone.seconds);
    if (seconds <= 0) return;
    const next = floors[i + 1];
    buckets.push({
      zone_index: i + 1,
      zone_lower_bpm: zone.lower,
      zone_upper_bpm: next === undefined ? null : next.lower - 1,
      seconds_in_zone: seconds,
    });
  });
  return buckets;
}

/**
 * The five zones from a watch or HealthKit payload, or null when they are
 * not a usable heart-rate zone group. {@link bucketsFromAppleWorkoutZones}
 * decides whether the bounds can be stored.
 */
export function appleWorkoutZonesFromWire(
  value: unknown
): AppleWorkoutZoneDuration[] | null {
  if (!Array.isArray(value) || value.length !== HR_ZONE_COUNT) return null;
  const zones: AppleWorkoutZoneDuration[] = [];
  for (const row of value) {
    if (!row || typeof row !== 'object') return null;
    const zone = row as {
      index?: unknown;
      minimumBpm?: unknown;
      maximumBpm?: unknown;
      seconds?: unknown;
    };
    if (typeof zone.seconds !== 'number' || !Number.isFinite(zone.seconds)) {
      return null;
    }
    zones.push({
      index: typeof zone.index === 'number' ? zone.index : undefined,
      minimumBpm:
        typeof zone.minimumBpm === 'number' && Number.isFinite(zone.minimumBpm)
          ? zone.minimumBpm
          : null,
      maximumBpm:
        typeof zone.maximumBpm === 'number' && Number.isFinite(zone.maximumBpm)
          ? zone.maximumBpm
          : null,
      seconds: zone.seconds,
    });
  }
  return bucketsFromAppleWorkoutZones(zones) === null ? null : zones;
}
