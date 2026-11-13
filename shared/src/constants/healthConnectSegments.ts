/**
 * Health Connect exercise segments (#1750): one segment per logged set inside
 * a written ExerciseSessionRecord, so a strength session shows its exercises
 * and reps in Health Connect. Apple Health has no per-set records.
 *
 * Numbers are androidx.health.connect.client.records.ExerciseSegment
 * EXERCISE_SEGMENT_TYPE_* constants. `isSegmentAllowedInSession` mirrors
 * `ExerciseSegment.isSegmentTypeCompatibleWithSessionType`: Health Connect
 * rejects the whole session when one segment does not fit its exercise type,
 * so every segment is checked and anything that does not fit becomes
 * OTHER_WORKOUT, which fits every session.
 * Source: androidx-main health/connect/connect-client/.../ExerciseSegment.kt
 */

export const HC_SEGMENT = {
  UNKNOWN: 0,
  ARM_CURL: 1,
  BACK_EXTENSION: 2,
  BALL_SLAM: 3,
  BARBELL_SHOULDER_PRESS: 4,
  BENCH_PRESS: 5,
  BENCH_SIT_UP: 6,
  BIKING: 7,
  BIKING_STATIONARY: 8,
  BURPEE: 9,
  CRUNCH: 10,
  DEADLIFT: 11,
  DOUBLE_ARM_TRICEPS_EXTENSION: 12,
  DUMBBELL_CURL_LEFT_ARM: 13,
  DUMBBELL_CURL_RIGHT_ARM: 14,
  DUMBBELL_FRONT_RAISE: 15,
  DUMBBELL_LATERAL_RAISE: 16,
  DUMBBELL_ROW: 17,
  DUMBBELL_TRICEPS_EXTENSION_LEFT_ARM: 18,
  DUMBBELL_TRICEPS_EXTENSION_RIGHT_ARM: 19,
  DUMBBELL_TRICEPS_EXTENSION_TWO_ARM: 20,
  ELLIPTICAL: 21,
  FORWARD_TWIST: 22,
  FRONT_RAISE: 23,
  HIGH_INTENSITY_INTERVAL_TRAINING: 24,
  HIP_THRUST: 25,
  HULA_HOOP: 26,
  JUMPING_JACK: 27,
  JUMP_ROPE: 28,
  KETTLEBELL_SWING: 29,
  LATERAL_RAISE: 30,
  LAT_PULL_DOWN: 31,
  LEG_CURL: 32,
  LEG_EXTENSION: 33,
  LEG_PRESS: 34,
  LEG_RAISE: 35,
  LUNGE: 36,
  MOUNTAIN_CLIMBER: 37,
  OTHER_WORKOUT: 38,
  PAUSE: 39,
  PILATES: 40,
  PLANK: 41,
  PULL_UP: 42,
  PUNCH: 43,
  REST: 44,
  ROWING_MACHINE: 45,
  RUNNING: 46,
  RUNNING_TREADMILL: 47,
  SHOULDER_PRESS: 48,
  SINGLE_ARM_TRICEPS_EXTENSION: 49,
  SIT_UP: 50,
  SQUAT: 51,
  STAIR_CLIMBING: 52,
  STAIR_CLIMBING_MACHINE: 53,
  STRETCHING: 54,
  SWIMMING_BACKSTROKE: 55,
  SWIMMING_BREASTSTROKE: 56,
  SWIMMING_BUTTERFLY: 57,
  SWIMMING_FREESTYLE: 58,
  SWIMMING_MIXED: 59,
  SWIMMING_OPEN_WATER: 60,
  SWIMMING_OTHER: 61,
  SWIMMING_POOL: 62,
  UPPER_TWIST: 63,
  WALKING: 64,
  WEIGHTLIFTING: 65,
  WHEELCHAIR: 66,
  YOGA: 67,
} as const;

// Health Connect exercise (session) types the rules below refer to.
const HC_SESSION = {
  OTHER_WORKOUT: 0,
  BIKING: 8,
  BIKING_STATIONARY: 9,
  BOOT_CAMP: 10,
  CALISTHENICS: 13,
  ELLIPTICAL: 25,
  EXERCISE_CLASS: 26,
  GYMNASTICS: 34,
  HIGH_INTENSITY_INTERVAL_TRAINING: 36,
  HIKING: 37,
  PILATES: 48,
  ROWING_MACHINE: 54,
  RUNNING: 56,
  RUNNING_TREADMILL: 57,
  STAIR_CLIMBING: 68,
  STAIR_CLIMBING_MACHINE: 69,
  STRENGTH_TRAINING: 70,
  SWIMMING_OPEN_WATER: 73,
  SWIMMING_POOL: 74,
  WALKING: 79,
  WEIGHTLIFTING: 81,
  WHEELCHAIR: 82,
  YOGA: 83,
} as const;

const S = HC_SEGMENT;

const UNIVERSAL_SESSION_TYPES: ReadonlySet<number> = new Set([
  HC_SESSION.BOOT_CAMP,
  HC_SESSION.HIGH_INTENSITY_INTERVAL_TRAINING,
  HC_SESSION.OTHER_WORKOUT,
]);

const UNIVERSAL_SEGMENTS: ReadonlySet<number> = new Set([
  S.OTHER_WORKOUT,
  S.PAUSE,
  S.REST,
  S.STRETCHING,
  S.UNKNOWN,
]);

const EXERCISE_SEGMENTS: ReadonlySet<number> = new Set([
  S.ARM_CURL,
  S.BACK_EXTENSION,
  S.BALL_SLAM,
  S.BARBELL_SHOULDER_PRESS,
  S.BENCH_PRESS,
  S.BENCH_SIT_UP,
  S.BURPEE,
  S.CRUNCH,
  S.DEADLIFT,
  S.DOUBLE_ARM_TRICEPS_EXTENSION,
  S.DUMBBELL_CURL_LEFT_ARM,
  S.DUMBBELL_CURL_RIGHT_ARM,
  S.DUMBBELL_FRONT_RAISE,
  S.DUMBBELL_LATERAL_RAISE,
  S.DUMBBELL_ROW,
  S.DUMBBELL_TRICEPS_EXTENSION_LEFT_ARM,
  S.DUMBBELL_TRICEPS_EXTENSION_RIGHT_ARM,
  S.DUMBBELL_TRICEPS_EXTENSION_TWO_ARM,
  S.FORWARD_TWIST,
  S.FRONT_RAISE,
  S.HIP_THRUST,
  S.HULA_HOOP,
  S.JUMP_ROPE,
  S.JUMPING_JACK,
  S.KETTLEBELL_SWING,
  S.LATERAL_RAISE,
  S.LAT_PULL_DOWN,
  S.LEG_CURL,
  S.LEG_EXTENSION,
  S.LEG_PRESS,
  S.LEG_RAISE,
  S.LUNGE,
  S.MOUNTAIN_CLIMBER,
  S.PLANK,
  S.PULL_UP,
  S.PUNCH,
  S.SHOULDER_PRESS,
  S.SINGLE_ARM_TRICEPS_EXTENSION,
  S.SIT_UP,
  S.SQUAT,
  S.UPPER_TWIST,
  S.WEIGHTLIFTING,
]);

const SWIMMING_SEGMENTS = [
  S.SWIMMING_BACKSTROKE,
  S.SWIMMING_BREASTSTROKE,
  S.SWIMMING_FREESTYLE,
  S.SWIMMING_BUTTERFLY,
  S.SWIMMING_MIXED,
  S.SWIMMING_OTHER,
];

const SESSION_TO_SEGMENTS: ReadonlyMap<number, ReadonlySet<number>> = new Map<
  number,
  ReadonlySet<number>
>([
  [HC_SESSION.BIKING, new Set([S.BIKING])],
  [HC_SESSION.BIKING_STATIONARY, new Set([S.BIKING_STATIONARY])],
  [HC_SESSION.CALISTHENICS, EXERCISE_SEGMENTS],
  [HC_SESSION.ELLIPTICAL, new Set([S.ELLIPTICAL])],
  [
    HC_SESSION.EXERCISE_CLASS,
    new Set([
      S.YOGA,
      S.BIKING_STATIONARY,
      S.PILATES,
      S.HIGH_INTENSITY_INTERVAL_TRAINING,
    ]),
  ],
  [HC_SESSION.GYMNASTICS, EXERCISE_SEGMENTS],
  [HC_SESSION.HIKING, new Set([S.WALKING, S.WHEELCHAIR])],
  [HC_SESSION.PILATES, new Set([S.PILATES])],
  [HC_SESSION.ROWING_MACHINE, new Set([S.ROWING_MACHINE])],
  [HC_SESSION.RUNNING, new Set([S.RUNNING, S.WALKING])],
  [HC_SESSION.RUNNING_TREADMILL, new Set([S.RUNNING_TREADMILL])],
  [HC_SESSION.STRENGTH_TRAINING, EXERCISE_SEGMENTS],
  [HC_SESSION.STAIR_CLIMBING, new Set([S.STAIR_CLIMBING])],
  [HC_SESSION.STAIR_CLIMBING_MACHINE, new Set([S.STAIR_CLIMBING_MACHINE])],
  [
    HC_SESSION.SWIMMING_OPEN_WATER,
    new Set([S.SWIMMING_OPEN_WATER, ...SWIMMING_SEGMENTS]),
  ],
  [HC_SESSION.SWIMMING_POOL, new Set([S.SWIMMING_POOL, ...SWIMMING_SEGMENTS])],
  [HC_SESSION.WALKING, new Set([S.WALKING])],
  [HC_SESSION.WHEELCHAIR, new Set([S.WHEELCHAIR])],
  [HC_SESSION.WEIGHTLIFTING, EXERCISE_SEGMENTS],
  [HC_SESSION.YOGA, new Set([S.YOGA])],
]);

/** Whether Health Connect accepts `segmentType` inside a session of `sessionType`. */
export function isSegmentAllowedInSession(
  segmentType: number,
  sessionType: number
): boolean {
  if (UNIVERSAL_SESSION_TYPES.has(sessionType)) return true;
  if (UNIVERSAL_SEGMENTS.has(segmentType)) return true;
  return SESSION_TO_SEGMENTS.get(sessionType)?.has(segmentType) ?? false;
}

/**
 * Name rules, first match wins (word-start matches, so "curl" never matches
 * "leg curl" before the leg rule and "row" never matches "narrow").
 */
const SEGMENT_RULES: readonly [RegExp, (name: string) => number][] = [
  [/\bbench press/, () => S.BENCH_PRESS],
  [
    /\b(overhead|military|shoulder|arnold) press|\bohp\b/,
    (n) => (/\bbarbell/.test(n) ? S.BARBELL_SHOULDER_PRESS : S.SHOULDER_PRESS),
  ],
  [/\b(deadlift|rdl|romanian)/, () => S.DEADLIFT],
  [/\b(lunge|split squat|step[- ]?up)/, () => S.LUNGE],
  [/\bsquat/, () => S.SQUAT],
  [/\b(hip thrust|glute bridge)/, () => S.HIP_THRUST],
  [/\bleg press/, () => S.LEG_PRESS],
  [/\b(leg curl|hamstring curl)/, () => S.LEG_CURL],
  [/\bleg extension/, () => S.LEG_EXTENSION],
  [/\b(leg raise|knee raise)/, () => S.LEG_RAISE],
  [/\b(lat pull ?down|pulldown)/, () => S.LAT_PULL_DOWN],
  [/\b(pull[- ]?up|chin[- ]?up)/, () => S.PULL_UP],
  [/\b(dumbbell|db) row/, () => S.DUMBBELL_ROW],
  [
    /\blateral raise/,
    (n) =>
      /\b(dumbbell|db)\b/.test(n) ? S.DUMBBELL_LATERAL_RAISE : S.LATERAL_RAISE,
  ],
  [
    /\bfront raise/,
    (n) =>
      /\b(dumbbell|db)\b/.test(n) ? S.DUMBBELL_FRONT_RAISE : S.FRONT_RAISE,
  ],
  [/\b(tricep|skull ?crusher|pushdown)/, () => S.DOUBLE_ARM_TRICEPS_EXTENSION],
  [/\bcurl/, () => S.ARM_CURL],
  [/\bplank/, () => S.PLANK],
  [/\bcrunch/, () => S.CRUNCH],
  [/\bsit[- ]?up/, () => S.SIT_UP],
  [/\b(back extension|hyperextension)/, () => S.BACK_EXTENSION],
  [/\bburpee/, () => S.BURPEE],
  [/\bjumping jack/, () => S.JUMPING_JACK],
  [/\b(jump rope|skipping)/, () => S.JUMP_ROPE],
  [/\bkettlebell swing/, () => S.KETTLEBELL_SWING],
  [/\bmountain climber/, () => S.MOUNTAIN_CLIMBER],
  [/\b(ball slam|slam ball)/, () => S.BALL_SLAM],
  [/\b(russian twist|upper twist)/, () => S.UPPER_TWIST],
  [/\bforward twist/, () => S.FORWARD_TWIST],
  [/\bhula/, () => S.HULA_HOOP],
  [/\b(punch|jab|boxing)/, () => S.PUNCH],
  [/\bstretch/, () => S.STRETCHING],
  [/\byoga/, () => S.YOGA],
  [/\bpilates/, () => S.PILATES],
  [/\b(hiit|tabata|interval)/, () => S.HIGH_INTENSITY_INTERVAL_TRAINING],
  [/\bwheelchair/, () => S.WHEELCHAIR],
  [/\b(walk|hik)/, () => S.WALKING],
  [
    /\b(run|jog|sprint)/,
    (n) => (/\b(treadmill|indoor)/.test(n) ? S.RUNNING_TREADMILL : S.RUNNING),
  ],
  [
    /\b(cycl|bik|spin)/,
    (n) =>
      /\b(stationary|indoor|spin)/.test(n) ? S.BIKING_STATIONARY : S.BIKING,
  ],
  [/\b(row|ergometer)/, () => S.ROWING_MACHINE],
  [/\belliptical/, () => S.ELLIPTICAL],
  [/\b(stair ?master|stepmill|stepper)/, () => S.STAIR_CLIMBING_MACHINE],
  [/\bstair/, () => S.STAIR_CLIMBING],
  [/\bfreestyle|front crawl/, () => S.SWIMMING_FREESTYLE],
  [/\bbackstroke/, () => S.SWIMMING_BACKSTROKE],
  [/\bbreaststroke/, () => S.SWIMMING_BREASTSTROKE],
  [/\bbutterfly/, () => S.SWIMMING_BUTTERFLY],
  [/\bswim/, () => S.SWIMMING_OTHER],
];

/** Modalities whose sets are lifts with a load; an unmatched one is weightlifting. */
const WEIGHTED_MODALITIES: ReadonlySet<string> = new Set([
  'weight_reps',
  'weight_duration',
  'weight_distance',
]);

/**
 * The segment a set of this exercise is written as inside a session of
 * `sessionType`: the name's movement when Health Connect allows it there,
 * else weightlifting for an unmatched loaded lift (where allowed), else
 * OTHER_WORKOUT.
 */
export function healthConnectSegmentFor(
  exercise: { name?: string | null; modality?: string | null },
  sessionType: number
): number {
  const name = (exercise.name ?? '').trim().toLowerCase();
  let segment: number | null = null;
  for (const [pattern, pick] of SEGMENT_RULES) {
    if (pattern.test(name)) {
      segment = pick(name);
      break;
    }
  }
  if (
    segment == null &&
    exercise.modality &&
    WEIGHTED_MODALITIES.has(exercise.modality)
  ) {
    segment = S.WEIGHTLIFTING;
  }
  if (segment != null && isSegmentAllowedInSession(segment, sessionType)) {
    return segment;
  }
  return S.OTHER_WORKOUT;
}
