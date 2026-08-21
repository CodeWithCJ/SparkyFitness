/**
 * Canonical activity-sport classification.
 *
 * The taxonomy is named after the ANT+/Garmin FIT SDK `sport` enum, which is
 * the de-facto interchange standard every fitness provider maps onto: Garmin
 * emits it natively, and Strava `sport_type`, Apple `HKWorkoutActivityType`,
 * Health Connect `ExerciseSessionRecord`, Polar, Oura, and Withings all have
 * clean equivalents.
 *
 * Sport is NOT stored on `exercise_entries` — `category` collapses every
 * endurance activity to `'cardio'`, so it cannot discriminate a run from a
 * ride. This module recovers the sport from, in order of trust:
 *
 *   1. the provider's own sport enum, preserved verbatim in
 *      `exercise_entry_activity_details.detail_data`   -> 'declared'
 *   2. the provider's notes template, which embeds the same enum  -> 'inferred'
 *   3. keywords in `exercise_name`                                -> 'inferred'
 *   4. `category`, when it happens to be specific                 -> 'inferred'
 *
 * Steps 2-4 are heuristic: `exercise_name` is free user text ("Antwerp
 * Walking", "🚴 lunch loop"), so `other` is an expected, first-class outcome.
 * A name that points at two sports at once resolves to `other` rather than to
 * a confident guess — a confidently wrong sport is the failure this module
 * exists to prevent.
 */

/** Canonical sports, named after the ANT+/FIT SDK `sport` enum. */
export const ACTIVITY_SPORTS = [
  "running",
  "cycling",
  "walking",
  "hiking",
  "swimming",
  "rowing",
  "fitness_equipment",
  "strength",
  "other",
] as const;
export type ActivitySport = (typeof ACTIVITY_SPORTS)[number];

/**
 * Coarser buckets used to group the Personal Records matrix. FIT keeps hiking
 * and walking separate, but a PR matrix with both is noise, so they fold
 * together for display while the canonical taxonomy stays standards-faithful.
 */
export const PR_SPORT_GROUPS = [
  "run",
  "ride",
  "walk",
  "swim",
  "other",
] as const;
export type PrSportGroup = (typeof PR_SPORT_GROUPS)[number];

/**
 * Whether the sport came from the provider's own enum or was inferred from
 * free text. Callers surface this so a guess is distinguishable from a fact.
 */
export const SPORT_CONFIDENCES = ["declared", "inferred"] as const;
export type SportConfidence = (typeof SPORT_CONFIDENCES)[number];

export interface ActivitySportInput {
  exerciseName?: string | null;
  category?: string | null;
  notes?: string | null;
  /** `exercise_entry_activity_details.provider_name` */
  providerName?: string | null;
  /** `exercise_entry_activity_details.detail_data` */
  detailData?: unknown;
  /** `exercises.source_id` — the only place Withings' sport enum survives. */
  exerciseSourceId?: string | null;
}

export interface ActivitySportResult {
  sport: ActivitySport;
  confidence: SportConfidence;
}

const SPORT_TO_PR_GROUP: Record<ActivitySport, PrSportGroup> = {
  running: "run",
  cycling: "ride",
  walking: "walk",
  hiking: "walk",
  swimming: "swim",
  rowing: "other",
  fitness_equipment: "other",
  strength: "other",
  other: "other",
};

const SPORT_LABELS: Record<ActivitySport, string> = {
  running: "Running",
  cycling: "Cycling",
  walking: "Walking",
  hiking: "Hiking",
  swimming: "Swimming",
  rowing: "Rowing",
  fitness_equipment: "Gym Cardio",
  strength: "Strength",
  other: "Other",
};

const PR_GROUP_LABELS: Record<PrSportGroup, string> = {
  run: "Run",
  ride: "Ride",
  walk: "Walk",
  swim: "Swim",
  other: "Other",
};

export function toPrSportGroup(sport: ActivitySport): PrSportGroup {
  return SPORT_TO_PR_GROUP[sport] ?? "other";
}

export function activitySportLabel(sport: ActivitySport): string {
  return SPORT_LABELS[sport] ?? SPORT_LABELS.other;
}

export function prSportGroupLabel(group: PrSportGroup): string {
  return PR_GROUP_LABELS[group] ?? PR_GROUP_LABELS.other;
}

/**
 * Tokens that identify a sport. Matched against whole tokens, never as
 * substrings — substring matching turns "Runway", "Swimsuit", "Walkman", and
 * "Cyclone" into false positives.
 *
 * Order matters: the first table whose token set matches wins only when no
 * other table also matches (see `matchSportTokens`).
 */
const SPORT_TOKENS: ReadonlyArray<readonly [ActivitySport, readonly string[]]> =
  [
    [
      "running",
      [
        "run",
        "runs",
        "running",
        "ran",
        "jog",
        "jogs",
        "jogging",
        "treadmill",
        "parkrun",
        "marathon",
        "5k",
        "10k",
        "sprint",
        "sprints",
      ],
    ],
    [
      "cycling",
      [
        "ride",
        "rides",
        "riding",
        "bike",
        "bikes",
        "biking",
        "cycle",
        "cycles",
        "cycling",
        "spin",
        "spinning",
        "peloton",
        "mtb",
        "bmx",
        "ebike",
        "handcycle",
        "velomobile",
        "cyclocross",
      ],
    ],
    ["walking", ["walk", "walks", "walking", "stroll", "rucking", "ruck"]],
    [
      "hiking",
      ["hike", "hikes", "hiking", "trek", "trekking", "mountaineering"],
    ],
    [
      "swimming",
      ["swim", "swims", "swimming", "freestyle", "openwater", "pool"],
    ],
    [
      "rowing",
      ["row", "rows", "rowing", "erg", "kayak", "kayaking", "paddling"],
    ],
    [
      "fitness_equipment",
      ["elliptical", "stairstepper", "stepper", "stairmaster"],
    ],
    [
      "strength",
      [
        "strength",
        "weight",
        "weights",
        "weightlifting",
        "weighttraining",
        "powerlifting",
        "crossfit",
        "calisthenics",
        "lift",
        "lifting",
      ],
    ],
  ];

/**
 * Splits provider enums and free text into comparable lowercase tokens.
 * Handles every casing convention in play at once: `trail_running` (Garmin /
 * FIT), `VirtualRide` (Strava), `Indoor Cycling` (Withings), `LAP_SWIMMING`
 * (Polar), `running` (Oura), `Antwerp Walking` (user text).
 */
function tokenize(raw: string): string[] {
  return raw
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0);
}

/**
 * Maps tokens to a sport, returning `other` when the tokens point at more than
 * one sport ("Bike then Run Brick") or at none.
 */
function matchSportTokens(tokens: readonly string[]): ActivitySport {
  const hasSwimContext = tokens.includes("swim") || tokens.includes("pool");
  const matched = new Set<ActivitySport>();

  for (const [sport, keywords] of SPORT_TOKENS) {
    for (const token of tokens) {
      // "lap" alone is not a swim ("Lap around the park"); it only counts
      // alongside an explicit swim token.
      if (token === "lap" && !hasSwimContext) continue;
      if (keywords.includes(token)) {
        matched.add(sport);
        break;
      }
    }
  }

  // "Indoor Cycling" / "Trail Running" name both a modifier and a sport, and
  // e-bike rides tokenize to e + bike — none of those are real ambiguity.
  if (matched.size === 1) {
    for (const only of matched) return only;
  }

  // A treadmill run tokenizes to {running} twice over; a genuine multi-sport
  // name hits two different tables, and we refuse to guess.
  return "other";
}

/** Maps a single provider sport enum value to a canonical sport. */
export function mapRawSportValue(
  raw: string | null | undefined,
): ActivitySport {
  if (!raw) return "other";
  return matchSportTokens(tokenize(raw));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Health Connect and HealthKit blobs are `JSON.stringify`'d into the jsonb
 * column, so they read back as a JSON string rather than an object.
 */
function normalizeDetailData(
  detailData: unknown,
): Record<string, unknown> | null {
  if (typeof detailData === "string") {
    try {
      return asRecord(JSON.parse(detailData));
    } catch {
      return null;
    }
  }
  return asRecord(detailData);
}

/**
 * Pulls the provider's raw sport enum out of its activity-details blob.
 * Returns null when this provider does not put the sport in the blob (only
 * Withings, whose enum lives on `exercises.source_id` instead).
 */
function extractProviderSport(
  providerName: string,
  detailData: unknown,
): string | null {
  const data = normalizeDetailData(detailData);
  if (!data) return null;

  switch (providerName.toLowerCase()) {
    case "garmin":
    case "garmin_fit": {
      // garmin_fit nests the same shape one level down under `activity`.
      const activity = asRecord(data["activity"]) ?? data;
      const activityType = asRecord(activity["activityType"]);
      return (
        asString(activityType?.["typeKey"]) ?? asString(activity["sport"])
      );
    }
    case "strava":
      return asString(data["sport_type"]) ?? asString(data["type"]);
    case "fitbit":
      return (
        asString(data["activityParentName"]) ?? asString(data["activityName"])
      );
    case "polar":
      return (
        asString(data["detailed-sport-info"]) ??
        asString(data["detailed_sport_info"]) ??
        asString(data["sport"])
      );
    case "oura":
      return asString(data["activity"]);
    case "google health": {
      const exercise = asRecord(data["exercise"]);
      return (
        asString(exercise?.["exerciseType"]) ?? asString(data["exerciseType"])
      );
    }
    case "hevy":
      // Hevy is a strength-training app; it has no cardio sport enum.
      return "strength";
    case "healthkit":
    case "health connect":
      return (
        asString(data["workoutActivityType"]) ??
        asString(data["activityType"]) ??
        asString(data["exerciseType"])
      );
    default:
      return null;
  }
}

/**
 * Withings stores only `workout.data` in its blob, so the numeric sport enum
 * on `workout.category` never makes it there. It survives on the exercise
 * catalog row as `withings-workout-<n>`.
 */
const WITHINGS_CATEGORY_SPORTS: Record<number, ActivitySport> = {
  1: "walking",
  2: "running",
  3: "hiking",
  5: "cycling", // BMX
  6: "cycling",
  7: "swimming",
  16: "strength",
  17: "strength",
  18: "fitness_equipment",
  187: "rowing",
  306: "walking",
  307: "running",
  308: "cycling",
};

function sportFromWithingsSourceId(
  sourceId: string | null | undefined,
): ActivitySport | null {
  if (!sourceId) return null;
  const match = /^withings-workout-(\d+)$/.exec(sourceId);
  if (!match) return null;
  return WITHINGS_CATEGORY_SPORTS[Number(match[1])] ?? "other";
}

/**
 * Notes templates that embed the provider's sport enum. Used when the
 * activity-details row is missing (older syncs, restored backups). Fitbit and
 * Google Health write no activity type into notes at all, so they have no
 * entry here and fall through to name matching.
 */
const NOTES_SPORT_PATTERNS: readonly RegExp[] = [
  /^garmin activity:.*\(([^)]+)\)\s*$/i,
  /^garmin fit import:.*\(([^)]+)\)\s*$/i,
  /synced from strava\.\s*type:\s*([^.]+)\./i,
  /logged from polar flow:\s*([^.]+)\./i,
  /logged from oura workout:\s*([^.]+)\./i,
  /logged from withings workout:\s*([^.]+)\./i,
  /activity type:\s*([^,\n]+)/i,
];

function sportFromNotes(notes: string): ActivitySport {
  for (const pattern of NOTES_SPORT_PATTERNS) {
    const match = pattern.exec(notes);
    if (match?.[1]) {
      const sport = mapRawSportValue(match[1]);
      if (sport !== "other") return sport;
    }
  }
  return "other";
}

/**
 * `category` is only informative when a provider happened to write a specific
 * value. `'cardio'` — what the Garmin mapper collapses every endurance sport
 * into — carries no information and must never be read as running.
 */
function sportFromCategory(category: string): ActivitySport {
  const normalized = category.trim().toLowerCase();
  if (
    normalized === "cardio" ||
    normalized === "general" ||
    normalized === "other"
  ) {
    return "other";
  }
  return mapRawSportValue(normalized);
}

/**
 * Resolves an exercise entry's sport. See the module header for the
 * signal-precedence rationale.
 */
export function classifyActivitySport(
  input: ActivitySportInput,
): ActivitySportResult {
  // 1. The provider's own enum — authoritative.
  if (input.providerName) {
    const raw = extractProviderSport(input.providerName, input.detailData);
    if (raw) {
      const sport = mapRawSportValue(raw);
      if (sport !== "other") return { sport, confidence: "declared" };
    }
  }

  const withingsSport = sportFromWithingsSourceId(input.exerciseSourceId);
  if (withingsSport && withingsSport !== "other") {
    return { sport: withingsSport, confidence: "declared" };
  }

  // 2. The provider's notes template, which embeds the same enum.
  if (input.notes) {
    const sport = sportFromNotes(input.notes);
    if (sport !== "other") return { sport, confidence: "inferred" };
  }

  // 3. Free-text name. Covers manual and CSV entries, and providers whose
  //    exercise_name IS their sport enum (Polar, Oura, Withings, Garmin FIT).
  if (input.exerciseName) {
    const sport = matchSportTokens(tokenize(input.exerciseName));
    if (sport !== "other") return { sport, confidence: "inferred" };
  }

  // 4. Category, on the rare occasion it is specific.
  if (input.category) {
    const sport = sportFromCategory(input.category);
    if (sport !== "other") return { sport, confidence: "inferred" };
  }

  return { sport: "other", confidence: "inferred" };
}
