/**
 * Health activity types (#1750): which Apple Health workout type and which
 * Health Connect exercise type a Sparky exercise is written as.
 *
 * The keys are platform-neutral ids stored in `exercises.health_activity_type`
 * (NULL means "Automatic", see `resolveHealthActivityType`). Each key carries
 * the nearest HKWorkoutActivityType raw value and Health Connect ExerciseType
 * constant, so one choice covers both stores. Labels live in each app's
 * translation catalog (`healthActivityTypes.<key>`), never here.
 *
 * Targets are never one of Apple's deprecated values (dance 14,
 * danceInspiredTraining 15, mixedMetabolicCardioTraining 30) nor one of
 * Health Connect's deprecated single-movement types (bench press, squat, ...;
 * those are segments, not sessions). Health Connect has no equivalent for some
 * Apple types (archery, bowling, ...); those use OTHER_WORKOUT (0) there.
 *
 * Apple numbers: HKWorkoutActivityType
 * (https://developer.apple.com/documentation/healthkit/hkworkoutactivitytype).
 * Health Connect numbers: androidx.health.connect.client.records
 * .ExerciseSessionRecord EXERCISE_TYPE_* constants.
 */

/** Which HealthKit distance quantity a workout's distance is written as. */
export type HealthDistanceKind =
  | 'walking_running'
  | 'cycling'
  | 'swimming'
  | 'wheelchair'
  | 'rowing'
  | 'paddle_sports'
  | 'cross_country_skiing'
  | 'skating_sports'
  | 'downhill_snow_sports';

export interface HealthActivityTypeTarget {
  /** HKWorkoutActivityType raw value. */
  healthKit: number;
  /** Health Connect ExerciseSessionRecord exercise type. */
  healthConnect: number;
  /**
   * Written with HKIndoorWorkout = true on Apple Health. Gym and studio
   * activities set it: without it the workout builder records "not indoor",
   * so a strength session would read as outdoor. Activities that happen
   * either way (walking, cycling, sports) leave it unset.
   */
  indoor?: boolean;
  /** HKSwimmingLocationType: 1 pool, 2 open water. */
  swimmingLocation?: 1 | 2;
  /** Distance quantity on Apple Health; absent means distance is not written. */
  distance?: HealthDistanceKind;
}

const HK_OTHER = 3000;
const HC_OTHER = 0;

export const HEALTH_ACTIVITY_TYPE_TARGETS = {
  american_football: { healthKit: 1, healthConnect: 28 },
  archery: { healthKit: 2, healthConnect: HC_OTHER },
  australian_football: { healthKit: 3, healthConnect: 29 },
  badminton: { healthKit: 4, healthConnect: 2 },
  baseball: { healthKit: 5, healthConnect: 4 },
  basketball: { healthKit: 6, healthConnect: 5 },
  bowling: { healthKit: 7, healthConnect: HC_OTHER, indoor: true },
  boxing: { healthKit: 8, healthConnect: 11, indoor: true },
  climbing: { healthKit: 9, healthConnect: 51 },
  cricket: { healthKit: 10, healthConnect: 14 },
  cross_training: { healthKit: 11, healthConnect: 10, indoor: true },
  curling: { healthKit: 12, healthConnect: HC_OTHER, indoor: true },
  cycling: { healthKit: 13, healthConnect: 8, distance: 'cycling' },
  cycling_indoor: {
    healthKit: 13,
    healthConnect: 9,
    indoor: true,
    distance: 'cycling',
  },
  elliptical: { healthKit: 16, healthConnect: 25, indoor: true },
  equestrian_sports: { healthKit: 17, healthConnect: HC_OTHER },
  fencing: { healthKit: 18, healthConnect: 27, indoor: true },
  fishing: { healthKit: 19, healthConnect: HC_OTHER },
  functional_strength_training: {
    healthKit: 20,
    healthConnect: 70,
    indoor: true,
  },
  golf: { healthKit: 21, healthConnect: 32 },
  gymnastics: { healthKit: 22, healthConnect: 34, indoor: true },
  handball: { healthKit: 23, healthConnect: 35 },
  hiking: { healthKit: 24, healthConnect: 37, distance: 'walking_running' },
  ice_hockey: { healthKit: 25, healthConnect: 38 },
  roller_hockey: { healthKit: 25, healthConnect: 52 },
  hunting: { healthKit: 26, healthConnect: HC_OTHER },
  lacrosse: { healthKit: 27, healthConnect: HC_OTHER },
  martial_arts: { healthKit: 28, healthConnect: 44, indoor: true },
  mind_and_body: { healthKit: 29, healthConnect: HC_OTHER, indoor: true },
  breathing: { healthKit: 29, healthConnect: 33, indoor: true },
  paddle_sports: {
    healthKit: 31,
    healthConnect: 46,
    distance: 'paddle_sports',
  },
  play: { healthKit: 32, healthConnect: HC_OTHER },
  preparation_and_recovery: { healthKit: 33, healthConnect: 71, indoor: true },
  racquetball: { healthKit: 34, healthConnect: 50, indoor: true },
  rowing: { healthKit: 35, healthConnect: 53, distance: 'rowing' },
  rowing_machine: {
    healthKit: 35,
    healthConnect: 54,
    indoor: true,
    distance: 'rowing',
  },
  rugby: { healthKit: 36, healthConnect: 55 },
  running: { healthKit: 37, healthConnect: 56, distance: 'walking_running' },
  running_treadmill: {
    healthKit: 37,
    healthConnect: 57,
    indoor: true,
    distance: 'walking_running',
  },
  sailing: { healthKit: 38, healthConnect: 58 },
  skating: { healthKit: 39, healthConnect: 60, distance: 'skating_sports' },
  ice_skating: {
    healthKit: 39,
    healthConnect: 39,
    distance: 'skating_sports',
  },
  snowshoeing: { healthKit: 40, healthConnect: 63 },
  soccer: { healthKit: 41, healthConnect: 64 },
  softball: { healthKit: 42, healthConnect: 65 },
  squash: { healthKit: 43, healthConnect: 66, indoor: true },
  stair_climbing_machine: {
    healthKit: 44,
    healthConnect: 69,
    indoor: true,
  },
  surfing: { healthKit: 45, healthConnect: 72 },
  swimming_pool: {
    healthKit: 46,
    healthConnect: 74,
    swimmingLocation: 1,
    distance: 'swimming',
  },
  swimming_open_water: {
    healthKit: 46,
    healthConnect: 73,
    swimmingLocation: 2,
    distance: 'swimming',
  },
  table_tennis: { healthKit: 47, healthConnect: 75, indoor: true },
  tennis: { healthKit: 48, healthConnect: 76 },
  track_and_field: { healthKit: 49, healthConnect: HC_OTHER },
  strength_training: { healthKit: 50, healthConnect: 70, indoor: true },
  weightlifting: { healthKit: 50, healthConnect: 81, indoor: true },
  volleyball: { healthKit: 51, healthConnect: 78 },
  walking: { healthKit: 52, healthConnect: 79, distance: 'walking_running' },
  walking_treadmill: {
    healthKit: 52,
    healthConnect: 79,
    indoor: true,
    distance: 'walking_running',
  },
  water_fitness: { healthKit: 53, healthConnect: HC_OTHER },
  water_polo: { healthKit: 54, healthConnect: 80 },
  water_sports: { healthKit: 55, healthConnect: HC_OTHER },
  wrestling: { healthKit: 56, healthConnect: 44, indoor: true },
  yoga: { healthKit: 57, healthConnect: 83, indoor: true },
  barre: { healthKit: 58, healthConnect: 26, indoor: true },
  core_training: { healthKit: 59, healthConnect: 70, indoor: true },
  calisthenics: { healthKit: 20, healthConnect: 13, indoor: true },
  cross_country_skiing: {
    healthKit: 60,
    healthConnect: 61,
    distance: 'cross_country_skiing',
  },
  downhill_skiing: {
    healthKit: 61,
    healthConnect: 61,
    distance: 'downhill_snow_sports',
  },
  stretching: { healthKit: 62, healthConnect: 71, indoor: true },
  hiit: { healthKit: 63, healthConnect: 36, indoor: true },
  // Health Connect has no jump rope session type any more; androidx files it
  // under HIIT (the jump rope segment is separate).
  jump_rope: { healthKit: 64, healthConnect: 36 },
  kickboxing: { healthKit: 65, healthConnect: 11, indoor: true },
  pilates: { healthKit: 66, healthConnect: 48, indoor: true },
  snowboarding: {
    healthKit: 67,
    healthConnect: 62,
    distance: 'downhill_snow_sports',
  },
  stairs: { healthKit: 68, healthConnect: 68 },
  step_training: { healthKit: 69, healthConnect: 26, indoor: true },
  wheelchair_walk_pace: {
    healthKit: 70,
    healthConnect: 82,
    distance: 'wheelchair',
  },
  wheelchair_run_pace: {
    healthKit: 71,
    healthConnect: 82,
    distance: 'wheelchair',
  },
  tai_chi: { healthKit: 72, healthConnect: 44 },
  mixed_cardio: { healthKit: 73, healthConnect: HC_OTHER },
  exercise_class: { healthKit: 73, healthConnect: 26, indoor: true },
  boot_camp: { healthKit: 11, healthConnect: 10, indoor: true },
  hand_cycling: { healthKit: 74, healthConnect: 8, distance: 'cycling' },
  disc_sports: { healthKit: 75, healthConnect: 31 },
  fitness_gaming: { healthKit: 76, healthConnect: HC_OTHER, indoor: true },
  cardio_dance: { healthKit: 77, healthConnect: 16, indoor: true },
  social_dance: { healthKit: 78, healthConnect: 16, indoor: true },
  pickleball: { healthKit: 79, healthConnect: HC_OTHER },
  cooldown: { healthKit: 80, healthConnect: 71, indoor: true },
  underwater_diving: { healthKit: 84, healthConnect: 59 },
  paragliding: { healthKit: HK_OTHER, healthConnect: 47 },
  other: { healthKit: HK_OTHER, healthConnect: HC_OTHER },
} as const satisfies Record<string, HealthActivityTypeTarget>;

export type HealthActivityType = keyof typeof HEALTH_ACTIVITY_TYPE_TARGETS;

/** Every key, in the order pickers list them (alphabetical by key; apps sort by label). */
export const HEALTH_ACTIVITY_TYPES = Object.keys(
  HEALTH_ACTIVITY_TYPE_TARGETS
) as HealthActivityType[];

/**
 * The types most people pick, listed first ("Common") in the web and mobile
 * pickers; every type is still in the full list below them.
 */
export const COMMON_HEALTH_ACTIVITY_TYPES = [
  'walking',
  'walking_treadmill',
  'running',
  'running_treadmill',
  'hiking',
  'cycling',
  'cycling_indoor',
  'swimming_pool',
  'strength_training',
  'hiit',
  'yoga',
  'pilates',
  'stretching',
  'elliptical',
  'rowing_machine',
] as const satisfies readonly HealthActivityType[];

export function isHealthActivityType(
  value: unknown
): value is HealthActivityType {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(HEALTH_ACTIVITY_TYPE_TARGETS, value)
  );
}

export function healthActivityTypeTarget(
  key: HealthActivityType
): HealthActivityTypeTarget {
  return HEALTH_ACTIVITY_TYPE_TARGETS[key];
}

/** Modalities whose sets are lifts, so an unrecognised name is strength training. */
const STRENGTH_MODALITIES: ReadonlySet<string> = new Set([
  'weight_reps',
  'reps_only',
  'bodyweight_reps',
  'weight_duration',
  'weight_distance',
]);

const INDOOR =
  /\b(indoor|treadmill|stationary|spin|machine|ergometer|erg|pad|peloton|trainer|turbo)/;

/**
 * Name rules, first match wins. Patterns match at a word start (`\b`), so
 * "run" never matches "crunch" and "row" never matches "narrow". Strength
 * exercises are decided by modality before these run, so "Barbell Row" and
 * "Walking Lunge" never reach them.
 */
const NAME_RULES: readonly [RegExp, (name: string) => HealthActivityType][] = [
  [
    /\bwheelchair/,
    (n) => (/\brun/.test(n) ? 'wheelchair_run_pace' : 'wheelchair_walk_pace'),
  ],
  [/\bhand ?cycl/, () => 'hand_cycling'],
  // Before the broad rules they would otherwise lose to: "Horse riding" is
  // not cycling, "Inline hockey" not skating, "Disc golf" not golf.
  [/\b(equestrian|horse)/, () => 'equestrian_sports'],
  [/\b(roller hockey|inline hockey)/, () => 'roller_hockey'],
  [/\b(frisbee|disc golf|ultimate)/, () => 'disc_sports'],
  [
    /\b(walk|stroll)/,
    (n) => (INDOOR.test(n) ? 'walking_treadmill' : 'walking'),
  ],
  [/\b(hik|trek)/, () => 'hiking'],
  [
    /\b(run|jog|sprint)/,
    (n) => (INDOOR.test(n) ? 'running_treadmill' : 'running'),
  ],
  [
    /\b(cycl|bik|bicycl|ride|riding|spin)/,
    (n) => (INDOOR.test(n) ? 'cycling_indoor' : 'cycling'),
  ],
  [
    /\b(row|rowing|ergometer)/,
    (n) => (INDOOR.test(n) ? 'rowing_machine' : 'rowing'),
  ],
  [
    /\bswim/,
    (n) =>
      /\b(open water|ocean|lake|sea|river)/.test(n)
        ? 'swimming_open_water'
        : 'swimming_pool',
  ],
  [/\belliptical/, () => 'elliptical'],
  [
    /\b(stair ?master|stepmill|stair ?climb(er|ing)? machine|stepper)/,
    () => 'stair_climbing_machine',
  ],
  [/\bstair/, () => 'stairs'],
  [/\bstep (aerobics|training|class)/, () => 'step_training'],
  [/\b(hiit|tabata|interval)/, () => 'hiit'],
  [/\bkick ?box/, () => 'kickboxing'],
  [/\bbox(ing)?\b/, () => 'boxing'],
  [
    /\b(martial|karate|judo|taekwondo|jiu|bjj|kung fu|muay|krav)/,
    () => 'martial_arts',
  ],
  [/\bwrestl/, () => 'wrestling'],
  [/\btai ?chi/, () => 'tai_chi'],
  [/\byoga/, () => 'yoga'],
  [/\bpilates/, () => 'pilates'],
  [/\bbarre/, () => 'barre'],
  [/\b(zumba|cardio dance|dance fitness)/, () => 'cardio_dance'],
  [/\bdanc/, () => 'social_dance'],
  [/\b(stretch|flexib|mobility)/, () => 'stretching'],
  [/\b(cool ?down)/, () => 'cooldown'],
  [/\b(foam roll|recovery|warm ?up)/, () => 'preparation_and_recovery'],
  [/\b(breath|meditat)/, () => 'breathing'],
  [/\b(jump ?rope|skipping)/, () => 'jump_rope'],
  [/\b(crossfit|cross training|wod)/, () => 'cross_training'],
  [/\bboot ?camp/, () => 'boot_camp'],
  [/\bcalisthenic/, () => 'calisthenics'],
  [/\b(core|abs)\b/, () => 'core_training'],
  [/\b(climb|boulder)/, () => 'climbing'],
  [/\b(cross ?country ski|nordic ski)/, () => 'cross_country_skiing'],
  [/\bsnowboard/, () => 'snowboarding'],
  [/\bsnowshoe/, () => 'snowshoeing'],
  [/\bski/, () => 'downhill_skiing'],
  [/\bice skat/, () => 'ice_skating'],
  [/\b(skat|rollerblad|inline)/, () => 'skating'],
  [/\b(surf)/, () => 'surfing'],
  [/\b(paddl|kayak|canoe|sup\b)/, () => 'paddle_sports'],
  [/\bsail/, () => 'sailing'],
  [/\b(aqua|water aerobic)/, () => 'water_fitness'],
  [/\bwater polo/, () => 'water_polo'],
  [/\bscuba|diving/, () => 'underwater_diving'],
  [/\bpickleball/, () => 'pickleball'],
  [/\btable tennis|ping ?pong/, () => 'table_tennis'],
  [/\btennis/, () => 'tennis'],
  [/\bbadminton/, () => 'badminton'],
  [/\bsquash/, () => 'squash'],
  [/\bracquetball/, () => 'racquetball'],
  [/\bgolf/, () => 'golf'],
  [/\bbasketball/, () => 'basketball'],
  [/\bvolleyball/, () => 'volleyball'],
  [/\bhandball/, () => 'handball'],
  [/\b(american football|gridiron)/, () => 'american_football'],
  [/\baustralian football|aussie rules/, () => 'australian_football'],
  [/\b(soccer|football|futsal)/, () => 'soccer'],
  [/\bsoftball/, () => 'softball'],
  [/\bbaseball/, () => 'baseball'],
  [/\bcricket/, () => 'cricket'],
  [/\brugby/, () => 'rugby'],
  [/\blacrosse/, () => 'lacrosse'],
  [/\bhockey/, () => 'ice_hockey'],
  [/\bfencing/, () => 'fencing'],
  [/\bgymnast/, () => 'gymnastics'],
  [/\barchery/, () => 'archery'],
  [/\bbowling/, () => 'bowling'],
  [/\bcurling/, () => 'curling'],
  [/\bparaglid/, () => 'paragliding'],
  [/\b(weightlift|olympic lift)/, () => 'weightlifting'],
  [/\b(strength|weight|lifting|resistance)/, () => 'strength_training'],
];

export interface HealthActivityTypeInput {
  /** The exercise's stored override (`exercises.health_activity_type`). */
  health_activity_type?: string | null;
  name?: string | null;
  category?: string | null;
  modality?: string | null;
}

/**
 * The health activity type a Sparky exercise is written as: the stored
 * override when it is a known key, else a guess from the name (word stems),
 * else strength training for set-based modalities or a Strength category,
 * else mixed cardio for a Cardio category, else other.
 */
export function resolveHealthActivityType(
  exercise: HealthActivityTypeInput
): HealthActivityType {
  if (isHealthActivityType(exercise.health_activity_type)) {
    return exercise.health_activity_type;
  }
  return guessHealthActivityType(exercise);
}

/** The automatic choice, ignoring any override (what "Automatic" shows). */
export function guessHealthActivityType(
  exercise: HealthActivityTypeInput
): HealthActivityType {
  const category = exercise.category?.trim().toLowerCase() ?? '';
  if (
    (exercise.modality && STRENGTH_MODALITIES.has(exercise.modality)) ||
    category === 'strength'
  ) {
    return 'strength_training';
  }
  const name = (exercise.name ?? '').trim().toLowerCase();
  for (const [pattern, pick] of NAME_RULES) {
    if (pattern.test(name)) return pick(name);
  }
  if (category === 'cardio') return 'mixed_cardio';
  if (category === 'stretching' || category === 'flexibility') {
    return 'stretching';
  }
  return 'other';
}
