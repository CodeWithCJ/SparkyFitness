import { isCustomProgramId } from '../schemas/api/RunProgram.api.zod.ts';
import type {
  IntervalPlan,
  IntervalStep,
  IntervalStyle,
  StepEffort,
} from './runIntervals.ts';

/**
 * Multi-week run programs: an ordered list of workouts, each one an interval
 * plan. Pure data and maths; the person's place in a program is kept by
 * `services/runProgramService.ts`.
 */

export interface ProgramWorkout {
  /** 0-based week. */
  week: number;
  /** 0-based workout within the week. */
  day: number;
  plan: IntervalPlan;
  /** A name for the workout; only the person's own programs set one. */
  title?: string;
}

export interface RunProgram {
  /** Stable id, also the translation key suffix. */
  id: string;
  /** What the person records for its workouts: a walking program is recorded as a walk. */
  activity: 'run' | 'walk';
  workouts: ProgramWorkout[];
  weeks: number;
  workoutsPerWeek: number;
  /**
   * Set for a program the person made: its name, which the built-in ones get
   * from the translations. Its workouts are a free list, so `week` and `day`
   * only number them and are never shown.
   */
  custom?: { name: string };
  /**
   * Set on the four-runs-a-week version of a program that also comes with
   * three runs a week: the id of the three-run program it is a version of.
   */
  variantOf?: string;
}

/** A run (work) or walk (recovery) piece, with what the stretch is for when its kind does not say. */
type Piece = readonly ['run' | 'walk', number, StepEffort?];

/** How a workout is wrapped: warm-up, cool-down and what the steps are called. */
interface Shape {
  style: IntervalStyle;
  warmup: number;
  cooldown: number;
}

interface Spec {
  pieces: readonly Piece[];
  shape: Shape;
}

const RUN_WALK: Shape = { style: 'runWalk', warmup: 300, cooldown: 300 };
const SPEED: Shape = { style: 'fastEasy', warmup: 600, cooldown: 600 };
const EASY: Shape = { style: 'fastEasy', warmup: 300, cooldown: 300 };
// Brisk walking and easy walking. Named Brisk and Easy so a walk never says "run".
const WALKING: Shape = { style: 'briskWalk', warmup: 300, cooldown: 300 };

/** A warm-up, the given run/walk pieces (work/recovery steps), a cool-down. */
function workout(spec: Spec): IntervalPlan {
  const steps: IntervalStep[] = [
    { kind: 'warmup', seconds: spec.shape.warmup },
  ];
  for (const [kind, seconds, effort] of spec.pieces) {
    // The runs of a run/walk plan are easy running, so they get an easy pace.
    const stepEffort =
      effort ??
      (kind === 'run' && spec.shape.style === 'runWalk' ? 'easy' : undefined);
    steps.push({
      kind: kind === 'run' ? 'work' : 'recovery',
      seconds,
      ...(stepEffort ? { effort: stepEffort } : {}),
    });
  }
  steps.push({ kind: 'cooldown', seconds: spec.shape.cooldown });
  return { style: spec.shape.style, steps };
}

const repeat = (count: number, pieces: readonly Piece[]): Piece[] =>
  Array.from({ length: count }, () => pieces).flat();

const run = (seconds: number): Piece => ['run', seconds];
const walk = (seconds: number): Piece => ['walk', seconds];

/** Run/walk workout with the usual 5 minute walks either side. */
const rw = (pieces: readonly Piece[]): Spec => ({ pieces, shape: RUN_WALK });
/** A continuous run of `minutes`. */
const steady = (minutes: number): Spec => rw([run(minutes * 60)]);
/** Speed work: fast and easy pieces with a longer warm-up and cool-down. */
const speed = (pieces: readonly Piece[]): Spec => ({ pieces, shape: SPEED });
/** An easy run (an "easy" step, not a "run" one) of `minutes`. */
const easy = (minutes: number): Spec => ({
  pieces: [walk(minutes * 60)],
  shape: EASY,
});

/** A continuous tempo effort of `minutes`: comfortably hard, with a long warm-up and cool-down. */
const tempo = (minutes: number): Spec =>
  speed([['run', minutes * 60, 'tempo']]);
/** An easy run of `minutes` that ends with `count` strides: 20 seconds quick and relaxed, then a walk or jog back. */
const stridesRun = (minutes: number, count = 6): Spec => ({
  pieces: [
    walk(minutes * 60),
    ...repeat(count, [['run', 20, 'stride'], walk(70)]),
  ],
  shape: EASY,
});
/**
 * A steady Zone 2 run of `minutes`: easy running held to the Zone 2 heart-rate
 * range, or to the talk test when no heart rate is known. Not a pace.
 */
const zone2 = (minutes: number): Spec => rw([['run', minutes * 60, 'zone2']]);
/** A Zone 2 run of `minutes` that ends with `count` relaxed strides, a small dose of quick running. */
const zone2Strides = (minutes: number, count = 4): Spec =>
  rw([
    ['run', minutes * 60, 'zone2'],
    ...repeat(count, [['run', 20, 'stride'], walk(70)]),
  ]);
/** Hill repeats: `count` hard efforts of `upSeconds` uphill, each followed by an easy walk or jog back down. */
const hills = (count: number, upSeconds: number, downSeconds: number): Spec =>
  speed(repeat(count, [['run', upSeconds, 'hill'], walk(downSeconds)]));
/** A long run: easy, then `paceMinutes` at marathon pace, then easy again. */
const marathonPaceLong = (
  easyFirst: number,
  paceMinutes: number,
  easyLast: number
): Spec => ({
  pieces: [
    walk(easyFirst * 60),
    ['run', paceMinutes * 60, 'marathon'],
    walk(easyLast * 60),
  ],
  shape: EASY,
});

/** A walking workout: brisk pieces (work steps) between easy walking. */
const brisk = (seconds: number): Piece => ['run', seconds];
const stroll = (seconds: number): Piece => ['walk', seconds];
const walking = (pieces: readonly Piece[]): Spec => ({
  pieces,
  shape: WALKING,
});

/** Weeks of continuous runs, one row of minutes per week. */
const steadyWeeks = (rows: readonly (readonly number[])[]): Spec[][] =>
  rows.map((minutes) => minutes.map(steady));

// Eight weeks from short brisk stretches between easy walking to half an hour
// of brisk walking, three walks a week. For someone who wants to start moving
// with no running in it.
const WALK_FIT_WEEKS: readonly (readonly Spec[])[] = [
  Array(3).fill(walking(repeat(4, [brisk(180), stroll(120)]))),
  Array(3).fill(walking(repeat(4, [brisk(240), stroll(120)]))),
  Array(3).fill(walking(repeat(3, [brisk(360), stroll(120)]))),
  Array(3).fill(walking(repeat(3, [brisk(480), stroll(120)]))),
  Array(3).fill(walking(repeat(2, [brisk(720), stroll(120)]))),
  Array(3).fill(walking(repeat(2, [brisk(900), stroll(120)]))),
  [walking([brisk(1200)]), walking([brisk(1200)]), walking([brisk(1500)])],
  [walking([brisk(1500)]), walking([brisk(1800)]), walking([brisk(1800)])],
];

// A nine-week beginner progression from alternating minutes of running and
// walking to 30 minutes of running, three workouts a week. Each week lists its
// three workouts; a week that repeats one workout lists it three times.
const BEGINNER_5K_WEEKS: readonly (readonly Spec[])[] = [
  Array(3).fill(rw(repeat(8, [run(60), walk(90)]))),
  Array(3).fill(rw(repeat(6, [run(90), walk(120)]))),
  Array(3).fill(rw(repeat(2, [run(90), walk(90), run(180), walk(180)]))),
  Array(3).fill(
    rw([run(180), walk(90), run(300), walk(150), run(180), walk(90), run(300)])
  ),
  [
    rw([run(300), walk(180), run(300), walk(180), run(300)]),
    rw([run(480), walk(300), run(480)]),
    steady(20),
  ],
  [
    rw([run(300), walk(180), run(480), walk(180), run(300)]),
    rw([run(600), walk(180), run(600)]),
    steady(22),
  ],
  Array(3).fill(steady(25)),
  Array(3).fill(steady(28)),
  Array(3).fill(steady(30)),
];

// For someone who can run 30 minutes: eight weeks to 10K, three runs a week
// (two steady, one long), with an easier week every fourth and a taper.
const FIVE_TO_TEN_K_WEEKS = steadyWeeks([
  [30, 30, 40],
  [30, 35, 45],
  [35, 35, 50],
  [30, 30, 40],
  [35, 40, 55],
  [40, 40, 60],
  [40, 45, 65],
  [30, 30, 40],
]);

// Six weeks to get faster over 5K: a speed session, an easy run and a longer
// run or tempo each week.
const FASTER_5K_WEEKS: readonly (readonly Spec[])[] = [
  [speed(repeat(6, [run(120), walk(120)])), easy(30), easy(40)],
  [speed(repeat(5, [run(180), walk(120)])), easy(30), easy(45)],
  [speed(repeat(4, [run(240), walk(150)])), easy(35), easy(50)],
  [speed(repeat(8, [run(90), walk(90)])), easy(30), tempo(15)],
  [speed(repeat(3, [run(360), walk(180)])), easy(30), tempo(20)],
  [speed(repeat(4, [run(180), walk(120)])), easy(25), tempo(25)],
];

// Twelve weeks to a half marathon for someone who runs 30 minutes: an easy
// run, a middle run and a long run each week, with an easier week every
// fourth and a taper.
const HALF_MARATHON_WEEKS = steadyWeeks([
  [30, 30, 50],
  [30, 35, 55],
  [35, 40, 65],
  [30, 30, 50],
  [35, 40, 75],
  [40, 45, 85],
  [40, 45, 95],
  [35, 35, 70],
  [45, 50, 105],
  [45, 50, 115],
  [40, 40, 90],
  [25, 20, 30],
]);

// The four-run version of the half marathon: two easy runs, a middle run and a
// long run each week, so the long run is a smaller share of the week.
const HALF_MARATHON_4_WEEKS = steadyWeeks([
  [30, 30, 30, 50],
  [30, 35, 30, 55],
  [35, 40, 35, 65],
  [30, 30, 30, 50],
  [35, 40, 35, 75],
  [40, 45, 40, 85],
  [40, 45, 40, 95],
  [35, 35, 35, 70],
  [45, 50, 45, 105],
  [45, 50, 45, 115],
  [40, 40, 40, 90],
  [25, 20, 30],
]);

// Sixteen weeks to a marathon for someone who already runs a few times a
// week: easy, middle, easy and long runs, long runs building to under three
// hours, an easier week every fourth, and a three-week taper.
const MARATHON_WEEKS = steadyWeeks([
  [30, 40, 30, 70],
  [30, 40, 30, 80],
  [35, 45, 35, 90],
  [30, 40, 30, 70],
  [35, 50, 35, 100],
  [40, 50, 40, 110],
  [40, 55, 40, 120],
  [30, 45, 30, 90],
  [40, 55, 40, 130],
  [45, 60, 45, 140],
  [45, 60, 45, 150],
  [35, 50, 35, 110],
  [45, 60, 45, 150],
  [45, 60, 45, 165],
  [40, 50, 40, 120],
  [30, 25, 20],
]);

// Ten weeks of base building at Zone 2, three runs a week: a short run, a
// middle run and a long run, all easy. Total time in zone grows about a tenth a
// week with an easier fourth and eighth week. Weeks 6, 7 and 9 end the short run
// with four strides; the middle run of weeks 4, 8 and 10 is a zone check.
const ZONE2_BASE_WEEKS: readonly (readonly Spec[])[] = [
  [zone2(30), zone2(30), zone2(40)],
  [zone2(30), zone2(35), zone2(45)],
  [zone2(35), zone2(35), zone2(50)],
  [zone2(30), zone2(30), zone2(40)],
  [zone2(35), zone2(40), zone2(55)],
  [zone2Strides(40), zone2(40), zone2(60)],
  [zone2Strides(40), zone2(45), zone2(65)],
  [zone2(30), zone2(35), zone2(45)],
  [zone2Strides(40), zone2(45), zone2(70)],
  [zone2(30), zone2(30), zone2(40)],
];

// The four-run version: a second short, easy run between the middle and long
// runs, so the long run is a smaller share of the week.
const ZONE2_BASE_4_WEEKS: readonly (readonly Spec[])[] = [
  [zone2(30), zone2(30), zone2(30), zone2(40)],
  [zone2(30), zone2(35), zone2(30), zone2(45)],
  [zone2(35), zone2(35), zone2(30), zone2(50)],
  [zone2(30), zone2(30), zone2(25), zone2(40)],
  [zone2(35), zone2(40), zone2(30), zone2(55)],
  [zone2Strides(40), zone2(40), zone2(30), zone2(60)],
  [zone2Strides(40), zone2(45), zone2(35), zone2(65)],
  [zone2(30), zone2(35), zone2(25), zone2(45)],
  [zone2Strides(40), zone2(45), zone2(35), zone2(70)],
  [zone2(30), zone2(30), zone2(25), zone2(40)],
];

/** Weeks (0-based) whose middle run is a zone check: a normal Zone 2 run done as a retest. */
export const ZONE2_CHECK_WEEKS: readonly number[] = [3, 7, 9];

/** The same workout three times: a week that repeats one session. */
const thrice = (spec: Spec): Spec[] => Array(3).fill(spec);

// Twelve weeks from nothing to 10K: the beginner 5K ramp from run/walk to
// continuous running, then longer runs to an hour, with a lighter tenth week.
// Three runs a week.
const BEGINNER_10K_WEEKS: readonly (readonly Spec[])[] = [
  thrice(rw(repeat(8, [run(60), walk(90)]))),
  thrice(rw(repeat(6, [run(90), walk(120)]))),
  thrice(rw(repeat(2, [run(90), walk(90), run(180), walk(180)]))),
  thrice(
    rw([run(180), walk(90), run(300), walk(150), run(180), walk(90), run(300)])
  ),
  [
    rw([run(300), walk(180), run(300), walk(180), run(300)]),
    rw([run(480), walk(300), run(480)]),
    steady(20),
  ],
  [
    rw([run(300), walk(180), run(480), walk(180), run(300)]),
    rw([run(600), walk(180), run(600)]),
    steady(22),
  ],
  ...steadyWeeks([
    [25, 25, 30],
    [28, 30, 35],
    [30, 30, 40],
    [25, 25, 30],
    [30, 35, 50],
    [25, 30, 60],
  ]),
];

// Ten weeks from a comfortable 10K to a half marathon: a short run, a middle
// run and a long run each week, with an easier fourth and eighth week and a
// short taper.
const TEN_K_TO_HALF_WEEKS = steadyWeeks([
  [35, 40, 65],
  [35, 40, 75],
  [40, 45, 85],
  [30, 35, 65],
  [40, 50, 95],
  [45, 50, 105],
  [45, 55, 115],
  [40, 45, 90],
  [35, 40, 60],
  [25, 20, 30],
]);

// Ten weeks from a comfortable 10K to a half marathon: two short runs, a
// middle run and a long run each week, with an easier fourth and eighth week
// and a short taper.
const TEN_K_TO_HALF_4_WEEKS = steadyWeeks([
  [35, 40, 35, 65],
  [35, 40, 35, 75],
  [40, 45, 40, 85],
  [30, 35, 30, 65],
  [40, 50, 40, 95],
  [45, 50, 45, 105],
  [45, 55, 45, 115],
  [40, 45, 40, 90],
  [35, 40, 35, 60],
  [25, 20, 30],
]);

// Eight weeks to get faster over 10K: a speed session, an easy run and a longer
// run each week. Two of the speed sessions are hill repeats, three of the easy
// runs end with strides, and the longer run turns into a tempo run in the
// middle weeks.
const FASTER_10K_WEEKS: readonly (readonly Spec[])[] = [
  [speed(repeat(5, [run(180), walk(120)])), easy(30), easy(45)],
  [hills(8, 45, 105), easy(30), easy(50)],
  [speed(repeat(6, [run(180), walk(90)])), stridesRun(35), easy(55)],
  [speed(repeat(8, [run(90), walk(90)])), easy(30), easy(40)],
  [speed(repeat(3, [run(480), walk(180)])), stridesRun(35), tempo(20)],
  [hills(10, 60, 120), easy(35), tempo(25)],
  [speed(repeat(5, [run(300), walk(120)])), stridesRun(30), tempo(30)],
  [speed(repeat(3, [run(240), walk(120)])), easy(25), easy(30)],
];

// Ten weeks to get faster over a half marathon: a speed session, an easy run
// and a long run, with two hill sessions, strides after three easy runs, tempo
// runs, an easier fourth week and a taper.
const FASTER_HALF_WEEKS: readonly (readonly Spec[])[] = [
  [speed(repeat(5, [run(240), walk(120)])), easy(40), easy(70)],
  [hills(10, 60, 120), easy(40), easy(80)],
  [speed(repeat(3, [run(600), walk(180)])), stridesRun(45), easy(90)],
  [speed(repeat(6, [run(180), walk(90)])), easy(35), easy(60)],
  [hills(10, 75, 135), stridesRun(45), easy(100)],
  [tempo(25), easy(45), easy(105)],
  [speed(repeat(3, [run(720), walk(180)])), stridesRun(45), easy(110)],
  [tempo(30), easy(40), easy(80)],
  [speed(repeat(4, [run(300), walk(120)])), easy(35), easy(60)],
  [speed(repeat(3, [run(180), walk(120)])), easy(20), easy(30)],
];

// Ten weeks to get faster over a half marathon: a speed session, two easy
// runs and a long run, with tempo runs, an easier fourth week and a taper.
const FASTER_HALF_4_WEEKS: readonly (readonly Spec[])[] = [
  [speed(repeat(5, [run(240), walk(120)])), easy(40), easy(30), easy(70)],
  [hills(10, 60, 120), easy(40), easy(30), easy(80)],
  [speed(repeat(3, [run(600), walk(180)])), easy(45), stridesRun(35), easy(90)],
  [speed(repeat(6, [run(180), walk(90)])), easy(35), easy(30), easy(60)],
  [hills(10, 75, 135), easy(45), stridesRun(35), easy(100)],
  [tempo(25), easy(45), easy(35), easy(105)],
  [
    speed(repeat(3, [run(720), walk(180)])),
    easy(45),
    stridesRun(35),
    easy(110),
  ],
  [tempo(30), easy(40), easy(30), easy(80)],
  [speed(repeat(4, [run(300), walk(120)])), easy(35), easy(30), easy(60)],
  [speed(repeat(3, [run(180), walk(120)])), easy(20), easy(30)],
];

// Eighteen weeks to a first marathon for someone who runs 10K: three runs a
// week, long runs building to 2½ hours, an easier fourth, eighth and twelfth
// week and a three-week taper.
const BEGINNER_MARATHON_WEEKS = steadyWeeks([
  [35, 40, 70],
  [35, 40, 80],
  [40, 45, 90],
  [30, 35, 70],
  [40, 45, 100],
  [40, 50, 110],
  [45, 50, 120],
  [35, 40, 90],
  [45, 50, 130],
  [45, 55, 140],
  [45, 55, 150],
  [35, 40, 100],
  [45, 55, 150],
  [45, 55, 140],
  [40, 50, 110],
  [35, 40, 90],
  [30, 35, 60],
  [25, 20, 15],
]);

// Eighteen weeks to a first marathon for someone who runs 10K: two short
// runs, a middle run and a long run each week, long runs building to 2½ hours,
// an easier fourth, eighth and twelfth week and a three-week taper.
const BEGINNER_MARATHON_4_WEEKS = steadyWeeks([
  [35, 40, 35, 70],
  [35, 40, 35, 80],
  [40, 45, 40, 90],
  [30, 35, 30, 70],
  [40, 45, 40, 100],
  [40, 50, 45, 110],
  [45, 50, 45, 120],
  [35, 40, 35, 90],
  [45, 50, 45, 130],
  [45, 55, 50, 140],
  [45, 55, 50, 150],
  [35, 40, 35, 100],
  [45, 55, 50, 150],
  [45, 55, 50, 140],
  [40, 50, 45, 110],
  [35, 40, 35, 90],
  [30, 35, 30, 60],
  [25, 20, 15],
]);

/** A marathon week for an experienced runner: easy, quality, easy, middle and long. */
const advancedWeek = (
  quality: Spec,
  middleMinutes: number,
  long: Spec,
  easyRun: Spec = easy(40)
): Spec[] => [easyRun, quality, easy(40), easy(middleMinutes), long];

// Sixteen weeks to a marathon for someone who runs five days a week: a speed,
// hill or tempo session, a middle run and a long run building to three hours.
// From week 3 the first easy run ends with strides, and from week 9 the long
// run holds a block at marathon pace.
const ADVANCED_MARATHON_WEEKS: readonly (readonly Spec[])[] = [
  advancedWeek(speed(repeat(6, [run(180), walk(90)])), 60, easy(90)),
  advancedWeek(hills(10, 60, 120), 60, easy(100)),
  advancedWeek(
    speed(repeat(4, [run(360), walk(120)])),
    65,
    easy(110),
    stridesRun(40)
  ),
  advancedWeek(speed(repeat(8, [run(90), walk(90)])), 50, easy(80)),
  advancedWeek(hills(10, 75, 135), 70, easy(120), stridesRun(40)),
  advancedWeek(tempo(25), 70, easy(130), stridesRun(40)),
  advancedWeek(
    speed(repeat(5, [run(300), walk(120)])),
    75,
    easy(140),
    stridesRun(40)
  ),
  advancedWeek(tempo(20), 55, easy(100)),
  advancedWeek(
    speed(repeat(4, [run(480), walk(150)])),
    75,
    marathonPaceLong(80, 40, 30),
    stridesRun(40)
  ),
  advancedWeek(tempo(30), 80, marathonPaceLong(90, 40, 30), stridesRun(40)),
  advancedWeek(
    speed(repeat(3, [run(720), walk(180)])),
    80,
    marathonPaceLong(90, 50, 30),
    stridesRun(40)
  ),
  advancedWeek(speed(repeat(6, [run(180), walk(90)])), 60, easy(110)),
  advancedWeek(tempo(35), 80, marathonPaceLong(100, 50, 30), stridesRun(40)),
  advancedWeek(
    speed(repeat(4, [run(480), walk(150)])),
    75,
    marathonPaceLong(80, 40, 30),
    stridesRun(40)
  ),
  advancedWeek(speed(repeat(5, [run(240), walk(120)])), 60, easy(100)),
  [easy(30), speed(repeat(3, [run(180), walk(120)])), easy(20)],
];

// Twelve weeks to 5K at an easier pace than Beginner 5K: very short runs
// between long walks, lengthening a little each week to 30 minutes of running.
const GENTLE_5K_WEEKS: readonly (readonly Spec[])[] = [
  thrice(rw(repeat(10, [run(30), walk(120)]))),
  thrice(rw(repeat(8, [run(45), walk(120)]))),
  thrice(rw(repeat(8, [run(60), walk(120)]))),
  thrice(rw(repeat(6, [run(90), walk(120)]))),
  thrice(rw(repeat(5, [run(120), walk(120)]))),
  thrice(rw(repeat(4, [run(180), walk(120)]))),
  thrice(rw(repeat(3, [run(240), walk(120)]))),
  thrice(rw(repeat(3, [run(300), walk(120)]))),
  thrice(rw(repeat(2, [run(600), walk(120)]))),
  thrice(rw([run(900), walk(120), run(600)])),
  thrice(steady(25)),
  thrice(steady(30)),
];

// Four weeks to ease back into running after a break, from minute-long runs
// to about 20 minutes of running, three times a week. Every week adds a little
// to the last: the run blocks grow from 1 to 12 minutes and no session adds
// more than a few minutes of running to the one before.
const RETURN_TO_RUNNING_WEEKS: readonly (readonly Spec[])[] = [
  thrice(rw(repeat(6, [run(60), walk(120)]))),
  thrice(rw(repeat(5, [run(120), walk(90)]))),
  thrice(rw(repeat(3, [run(300), walk(120)]))),
  [
    rw(repeat(3, [run(360), walk(120)])),
    rw(repeat(2, [run(600), walk(120)])),
    rw([run(720), walk(120), run(600)]),
  ],
];

/** A walking week: two sessions of the same brisk stretches, then one long walk. */
const walkWeek = (pieces: readonly Piece[], longSeconds: number): Spec[] => [
  walking(pieces),
  walking(pieces),
  walking([brisk(longSeconds)]),
];

// Ten weeks of brisk walking, three a week, to a 10K walk in about an hour and
// three quarters. No running in it.
const WALK_10K_WEEKS: readonly (readonly Spec[])[] = [
  walkWeek(repeat(3, [brisk(600), stroll(120)]), 2400),
  walkWeek(repeat(3, [brisk(720), stroll(120)]), 2700),
  walkWeek(repeat(3, [brisk(900), stroll(120)]), 3000),
  walkWeek(repeat(2, [brisk(900), stroll(120)]), 2400),
  walkWeek(repeat(2, [brisk(1500), stroll(120)]), 3300),
  walkWeek(repeat(2, [brisk(1650), stroll(120)]), 4200),
  walkWeek(repeat(2, [brisk(1800), stroll(120)]), 4800),
  walkWeek(repeat(2, [brisk(1200), stroll(120)]), 3600),
  walkWeek(repeat(2, [brisk(1800), stroll(120)]), 5400),
  walkWeek(repeat(2, [brisk(1200), stroll(120)]), 6300),
];

function buildProgram(
  id: string,
  weeks: readonly (readonly Spec[])[],
  activity: RunProgram['activity'] = 'run',
  variantOf?: string
): RunProgram {
  const workouts = weeks.flatMap((days, week) =>
    days.map((spec, day) => ({ week, day, plan: workout(spec) }))
  );
  return {
    id,
    activity,
    workouts,
    weeks: weeks.length,
    workoutsPerWeek: weeks[0]?.length ?? 0,
    ...(variantOf ? { variantOf } : {}),
  };
}

/** Easiest first: the order the picker lists them. */
export const RUN_PROGRAMS: readonly RunProgram[] = [
  buildProgram('walkFit', WALK_FIT_WEEKS, 'walk'),
  buildProgram('walk10k', WALK_10K_WEEKS, 'walk'),
  buildProgram('returnToRunning', RETURN_TO_RUNNING_WEEKS),
  buildProgram('gentle5k', GENTLE_5K_WEEKS),
  buildProgram('beginner5k', BEGINNER_5K_WEEKS),
  buildProgram('fiveToTenK', FIVE_TO_TEN_K_WEEKS),
  buildProgram('zone2Base', ZONE2_BASE_WEEKS),
  buildProgram('zone2Base4', ZONE2_BASE_4_WEEKS, 'run', 'zone2Base'),
  buildProgram('faster5k', FASTER_5K_WEEKS),
  buildProgram('beginner10k', BEGINNER_10K_WEEKS),
  buildProgram('faster10k', FASTER_10K_WEEKS),
  buildProgram('tenKToHalf', TEN_K_TO_HALF_WEEKS),
  buildProgram('tenKToHalf4', TEN_K_TO_HALF_4_WEEKS, 'run', 'tenKToHalf'),
  buildProgram('halfMarathon', HALF_MARATHON_WEEKS),
  buildProgram('halfMarathon4', HALF_MARATHON_4_WEEKS, 'run', 'halfMarathon'),
  buildProgram('fasterHalf', FASTER_HALF_WEEKS),
  buildProgram('fasterHalf4', FASTER_HALF_4_WEEKS, 'run', 'fasterHalf'),
  buildProgram('beginnerMarathon', BEGINNER_MARATHON_WEEKS),
  buildProgram(
    'beginnerMarathon4',
    BEGINNER_MARATHON_4_WEEKS,
    'run',
    'beginnerMarathon'
  ),
  buildProgram('marathon', MARATHON_WEEKS),
  buildProgram('advancedMarathon', ADVANCED_MARATHON_WEEKS),
];

/** Whether a program is the Zone 2 base-building program, in either version. */
export const isZone2Program = (id: string): boolean =>
  id === 'zone2Base' || id === 'zone2Base4';

/** Whether a workout of a built-in program is a Zone 2 zone check (the middle run in a check week). */
export function isZoneCheckWorkout(
  programId: string,
  workout: Pick<ProgramWorkout, 'week' | 'day'>
): boolean {
  return (
    isZone2Program(programId) &&
    workout.day === 1 &&
    ZONE2_CHECK_WEEKS.includes(workout.week)
  );
}

/** Whether a plan has a step held to Zone 2. */
export const planHasZone2 = (plan: IntervalPlan): boolean =>
  plan.steps.some((step) => step.effort === 'zone2');

/** What a program's workouts are recorded as; a program that is gone reads as a run. */
export function programActivity(id: string): RunProgram['activity'] {
  return findProgram(id)?.activity ?? 'run';
}

export function findProgram(id: string): RunProgram | null {
  return RUN_PROGRAMS.find((program) => program.id === id) ?? null;
}

/** The programs the picker lists: every built-in one that is not another's variant. */
export const PICKER_PROGRAMS: readonly RunProgram[] = RUN_PROGRAMS.filter(
  (program) => !program.variantOf
);

/**
 * A program and its other versions, fewest runs a week first. A program with
 * no variants gives just itself.
 */
export function programVersions(id: string): RunProgram[] {
  return RUN_PROGRAMS.filter(
    (program) => program.id === id || program.variantOf === id
  ).sort((a, b) => a.workoutsPerWeek - b.workoutsPerWeek);
}

/**
 * The built-in workouts a stored copy is measured against when it is adjusted,
 * or undefined once the copy has a different length (a realignment dropped or
 * added workouts, so the positions no longer line up).
 */
export function builtInBaseline(
  programId: string,
  workouts: readonly ProgramWorkout[]
): ProgramWorkout[] | undefined {
  const program = findProgram(programId);
  return program && program.workouts.length === workouts.length
    ? program.workouts
    : undefined;
}

/** Where a person stands in a program. */
export interface ProgramProgress {
  programId: string;
  /**
   * Whether the person is using the program. Off keeps their place but stops
   * the Record screen choosing its workouts and the reminders. Absent in
   * older stored data, which means on.
   */
  enabled?: boolean;
  /** Index of the next workout to do; equals the length when finished. */
  next: number;
}

export interface ProgramStatus {
  program: RunProgram;
  /** The next workout, or null when every workout is done. */
  workout: ProgramWorkout | null;
  /** Workouts finished so far. */
  done: number;
  total: number;
  finished: boolean;
}

/** Resolves stored progress against the program, clamping a stale index. */
export function programStatus(progress: ProgramProgress): ProgramStatus | null {
  const program = findProgram(progress.programId);
  if (!program) return null;
  const total = program.workouts.length;
  const next = Math.min(Math.max(0, Math.floor(progress.next)), total);
  return {
    program,
    workout: program.workouts[next] ?? null,
    done: next,
    total,
    finished: next >= total,
  };
}

/** Moves on from workout `index`, but only if it is the one due. */
export function advanceProgress(
  progress: ProgramProgress,
  completedIndex: number
): ProgramProgress {
  return completedIndex === progress.next
    ? { ...progress, next: progress.next + 1 }
    : progress;
}

/** Total time of a plan in whole minutes, for a one-line description. */
export function planMinutes(plan: IntervalPlan): number {
  return Math.round(plan.steps.reduce((sum, s) => sum + s.seconds, 0) / 60);
}

/**
 * Whole minutes of the effort. A fast/easy plan counts its easy stretches too,
 * so an easy run is not zero. Warm-up, cool-down, and the easy walking of a
 * brisk-walk plan are left out.
 */
export function runMinutes(plan: IntervalPlan): number {
  const easyCounts = plan.style === 'fastEasy';
  return Math.round(
    plan.steps
      .filter((s) => s.kind === 'work' || (easyCounts && s.kind === 'recovery'))
      .reduce((sum, s) => sum + s.seconds, 0) / 60
  );
}

export interface ProgramOutline {
  /** Minutes of each week-1 workout, warm-up and cool-down left out. A walk counts brisk time only. */
  firstWeek: number[];
  /** The same minutes in the biggest workout: where the program builds to. */
  peakRunMinutes: number;
}

/** Minutes the card quotes, so week 1 and the peak use one unit. */
function quotedMinutes(program: RunProgram, plan: IntervalPlan): number {
  const countRecovery = program.activity !== 'walk';
  return Math.round(
    plan.steps
      .filter(
        (s) => s.kind === 'work' || (countRecovery && s.kind === 'recovery')
      )
      .reduce((sum, s) => sum + s.seconds, 0) / 60
  );
}

/** A glance at a program: what week 1 looks like and what it builds to. */
export function programOutline(program: RunProgram): ProgramOutline {
  const first = program.workouts.filter((w) => w.week === 0);
  return {
    firstWeek: first.map((w) => quotedMinutes(program, w.plan)),
    peakRunMinutes: program.workouts.reduce(
      (max, w) => Math.max(max, quotedMinutes(program, w.plan)),
      0
    ),
  };
}

/** A stored program as the server holds it: the person's own workouts. */
export interface StoredRunProgram {
  program_id: string;
  next_index: number;
  workouts: ProgramWorkout[];
  /** The person's own program's name and activity; null for a built-in one. */
  name?: string | null;
  activity?: RunProgram['activity'] | null;
}

/**
 * Like `programStatus`, but over the person's own (possibly adjusted)
 * workouts rather than the built-in definition.
 */
export function storedProgramStatus(stored: StoredRunProgram): ProgramStatus {
  const workouts = stored.workouts;
  const weeks = workouts.reduce((max, w) => Math.max(max, w.week + 1), 0);
  const program: RunProgram = {
    id: stored.program_id,
    activity: stored.activity ?? programActivity(stored.program_id),
    workouts,
    weeks,
    workoutsPerWeek: workouts.filter((w) => w.week === 0).length,
    ...(isCustomProgramId(stored.program_id) && {
      custom: { name: stored.name ?? '' },
    }),
  };
  const total = workouts.length;
  const next = Math.min(Math.max(0, Math.floor(stored.next_index)), total);
  return {
    program,
    workout: workouts[next] ?? null,
    done: next,
    total,
    finished: next >= total,
  };
}

/**
 * Numbers a person's own workouts into the stored shape: a free list has no
 * weeks, so seven workouts make a "week" and the position within it is the
 * "day". Only the order matters; nothing shows these numbers for such a
 * program.
 */
export function numberCustomWorkouts(
  workouts: readonly { plan: IntervalPlan; title?: string }[]
): ProgramWorkout[] {
  return workouts.map((workout, index) => ({
    week: Math.floor(index / 7),
    day: index % 7,
    plan: workout.plan,
    ...(workout.title ? { title: workout.title } : {}),
  }));
}
