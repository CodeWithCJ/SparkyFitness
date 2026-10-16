import { addDays, compareDays, dayOfWeek } from "./timezone.ts";
import type { IntervalPlan, IntervalStep } from "./runIntervals.ts";

/**
 * A plan for a race: from today to race day, on the weekdays the person runs,
 * with the long run building up, an easier week every fourth week, a taper
 * before the race and the race itself as the last workout. Pure: the words
 * come in through `titles`, and the dates through `today` and `raceDay`.
 */

export type RaceDistance = "5k" | "10k" | "half" | "marathon";
export type RaceLevel = "new" | "some" | "regular" | "experienced";

export const RACE_DISTANCES: readonly RaceDistance[] = [
  "5k",
  "10k",
  "half",
  "marathon",
];
export const RACE_LEVELS: readonly RaceLevel[] = [
  "new",
  "some",
  "regular",
  "experienced",
];

const KM: Record<RaceDistance, number> = {
  "5k": 5,
  "10k": 10,
  half: 21.0975,
  marathon: 42.195,
};

/** Fewest weeks that make a sensible build for a distance and starting point. */
const MIN_WEEKS: Record<RaceDistance, Record<RaceLevel, number>> = {
  "5k": { new: 8, some: 6, regular: 4, experienced: 4 },
  "10k": { new: 10, some: 8, regular: 6, experienced: 5 },
  half: { new: 14, some: 12, regular: 10, experienced: 8 },
  marathon: { new: 24, some: 18, regular: 14, experienced: 12 },
};

/** The most weeks a plan spans; a race further off starts later. */
export const MAX_RACE_PLAN_WEEKS = 30;

/** Minutes of the long run at the start, by how much the person runs now. */
const START_LONG_MINUTES: Record<RaceLevel, number> = {
  new: 15,
  some: 25,
  regular: 40,
  experienced: 60,
};

/** Minutes of the longest run, a few weeks before the race. */
const PEAK_LONG_MINUTES: Record<RaceDistance, number> = {
  "5k": 45,
  "10k": 75,
  half: 110,
  marathon: 160,
};

/** Weeks of easing off at the end, the race week included. */
const TAPER_WEEKS: Record<RaceDistance, number> = {
  "5k": 1,
  "10k": 1,
  half: 2,
  marathon: 3,
};

/** A guess at an easy-ish race pace, seconds per kilometre, by level. */
const RACE_PACE: Record<RaceLevel, number> = {
  new: 450,
  some: 405,
  regular: 360,
  experienced: 315,
};

export interface RacePlanTitles {
  easy: string;
  long: string;
  tempo: string;
  intervals: string;
  shakeout: string;
  /** "Race day: 10K" style, already put together. */
  race: string;
}

export interface RacePlanInput {
  distance: RaceDistance;
  level: RaceLevel;
  /** YYYY-MM-DD */
  raceDay: string;
  /** YYYY-MM-DD */
  today: string;
  /** Weekdays to run on, 0 = Sunday. The race day's weekday is always added. */
  runDays: readonly number[];
  titles: RacePlanTitles;
}

export interface RacePlanWorkout {
  title: string;
  plan: IntervalPlan;
}

export interface RacePlan {
  workouts: RacePlanWorkout[];
  /** The weekdays used, race weekday included. */
  runDays: number[];
  startDay: string;
  endDay: string;
  /** Calendar weeks from the first workout to race day. */
  weeks: number;
  /** Fewest weeks that suit this distance and level. */
  minWeeks: number;
  /** Fewer weeks than that: the plan is not a sensible build. */
  tooShort: boolean;
  /** Minutes of the longest run in the plan, race excluded. */
  peakLongMinutes: number;
  /** The race estimated at, in minutes. */
  raceMinutes: number;
}

type Session = "easy" | "long" | "tempo" | "intervals" | "shakeout" | "race";

const roundTo = (value: number, step: number) =>
  Math.max(step, Math.round(value / step) * step);
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const step = (kind: IntervalStep["kind"], minutes: number): IntervalStep => ({
  kind,
  seconds: Math.round(minutes * 60),
});

/**
 * `minutes` of easy running: continuous, or for a beginner early on, a run of
 * `runMinutes` and a minute's walk, repeated, between a short walk each end.
 */
function easyRun(minutes: number, runMinutes: number | null): IntervalPlan {
  if (runMinutes === null) {
    return {
      style: "runWalk",
      steps: [step("warmup", 5), step("work", minutes - 5)],
    };
  }
  const steps: IntervalStep[] = [step("warmup", 5)];
  let left = minutes - 10;
  while (left > 0) {
    const run = Math.min(runMinutes, left);
    steps.push(step("work", run));
    left -= run;
    if (left > 0) {
      steps.push(step("recovery", Math.min(1, left)));
      left -= 1;
    }
  }
  steps.push(step("cooldown", 5));
  return { style: "runWalk", steps };
}

function tempo(workMinutes: number): IntervalPlan {
  return {
    style: "fastEasy",
    steps: [
      step("warmup", 10),
      step("work", workMinutes),
      step("cooldown", 10),
    ],
  };
}

function intervals(repeats: number): IntervalPlan {
  const steps: IntervalStep[] = [step("warmup", 10)];
  for (let i = 0; i < repeats; i++) {
    steps.push(step("work", 3));
    steps.push(step("recovery", i === repeats - 1 ? 0.5 : 2));
  }
  steps.push(step("cooldown", 10));
  return { style: "fastEasy", steps };
}

function racePlan(raceMinutes: number, level: RaceLevel): IntervalPlan {
  // A step is at most four hours, so a very long race is cut into pieces.
  const pieces: IntervalStep[] = [];
  for (let left = raceMinutes; left > 0; left -= 180) {
    pieces.push(step("work", Math.min(180, left)));
  }
  return {
    style: "runWalk",
    steps: [
      step("warmup", level === "new" ? 5 : 10),
      ...pieces,
      step("cooldown", 5),
    ],
  };
}

/** The days a plan has a workout on, first to last. */
function planDays(
  startDay: string,
  raceDay: string,
  days: ReadonlySet<number>,
  offsets: number[],
): string[] {
  const out: string[] = [];
  let offset = 0;
  for (let d = startDay; compareDays(d, raceDay) <= 0; d = addDays(d, 1)) {
    if (days.has(dayOfWeek(d))) {
      out.push(d);
      offsets.push(offset);
    }
    offset++;
  }
  return out;
}

export function buildRacePlan(input: RacePlanInput): RacePlan {
  const { distance, level, raceDay, today, titles } = input;
  const days = new Set([...input.runDays, dayOfWeek(raceDay)]);
  // A race further off than the longest plan starts later.
  const earliest = addDays(raceDay, -(MAX_RACE_PLAN_WEEKS * 7 - 1));
  const startDay = compareDays(today, earliest) < 0 ? earliest : today;
  const offsets: number[] = [];
  const dates = planDays(startDay, raceDay, days, offsets);
  if (dates.length === 0) {
    // The race day is past: nothing to plan.
    return {
      workouts: [],
      runDays: [...days].sort((a, b) => a - b),
      startDay,
      endDay: raceDay,
      weeks: 0,
      minWeeks: MIN_WEEKS[distance][level],
      tooShort: true,
      peakLongMinutes: 0,
      raceMinutes: 0,
    };
  }
  const raceIndex = dates.length - 1;
  const blocks = Math.floor((offsets.at(-1) ?? 0) / 7) + 1;
  const minWeeks = MIN_WEEKS[distance][level];
  const taper = Math.min(TAPER_WEEKS[distance], Math.max(1, blocks - 1));
  const buildBlocks = Math.max(1, blocks - taper);
  const start = START_LONG_MINUTES[level];
  const peak = Math.max(PEAK_LONG_MINUTES[distance], start);
  const raceMinutes = Math.round((KM[distance] * RACE_PACE[level]) / 60);

  const longFor = (block: number): number => {
    if (block >= buildBlocks) {
      // Taper: 75%, then lower each week.
      const t = block - buildBlocks;
      return roundTo(peak * Math.max(0.3, 0.75 - 0.2 * t), 5);
    }
    const progress = buildBlocks === 1 ? 1 : block / (buildBlocks - 1);
    let minutes = start + (peak - start) * progress;
    // Every fourth week is lighter, except the last before the taper.
    if ((block + 1) % 4 === 0 && block < buildBlocks - 1) minutes *= 0.75;
    return roundTo(minutes, 5);
  };

  const workouts: RacePlanWorkout[] = [];
  let peakLong = 0;
  // Which week of the plan each workout falls in, counted once.
  const blockOf = offsets.map((o) => Math.floor(o / 7));
  for (let i = 0; i < dates.length; i++) {
    const block = blockOf[i] ?? 0;
    const first = blockOf.indexOf(block);
    const n = blockOf.lastIndexOf(block) - first + 1;
    const position = i - first;
    const progress =
      buildBlocks === 1 ? 1 : Math.min(1, block / (buildBlocks - 1));
    const inTaper = block >= buildBlocks;
    const recovery = (block + 1) % 4 === 0 && block < buildBlocks - 1;

    let session: Session;
    if (i === raceIndex) session = "race";
    else if (block === blocks - 1) session = "shakeout";
    else if (position === n - 1) session = "long";
    else if (
      n >= 4 &&
      position === n - 3 &&
      level !== "new" &&
      !inTaper &&
      !recovery
    ) {
      session = block % 2 === 0 ? "tempo" : "intervals";
    } else session = "easy";

    const long = longFor(block);
    const easyMinutes = clamp(
      roundTo(long * (level === "new" ? 0.6 : 0.5), 5),
      level === "new" ? 15 : 20,
      50,
    );
    // A beginner runs for a minute and walks for a minute at first, growing.
    const beginnerRun =
      level === "new" && !inTaper ? Math.round(1 + progress * 9) : null;
    const runWalk =
      beginnerRun !== null && beginnerRun < 10 ? beginnerRun : null;

    let title: string;
    let plan: IntervalPlan;
    switch (session) {
      case "race":
        title = titles.race;
        plan = racePlan(raceMinutes, level);
        break;
      case "shakeout":
        title = titles.shakeout;
        plan = easyRun(level === "new" ? 15 : 20, null);
        break;
      case "long":
        title = titles.long;
        plan = easyRun(Math.max(15, long), runWalk);
        peakLong = Math.max(peakLong, long);
        break;
      case "tempo":
        title = titles.tempo;
        plan = tempo(clamp(roundTo(long * 0.3, 5), 10, 25));
        break;
      case "intervals":
        title = titles.intervals;
        plan = intervals(4 + Math.min(4, Math.floor(progress * 4)));
        break;
      default:
        title = titles.easy;
        plan = easyRun(Math.max(15, easyMinutes), runWalk);
    }
    workouts.push({ title: title.slice(0, 40), plan });
  }

  return {
    workouts,
    runDays: [...days].sort((a, b) => a - b),
    startDay,
    endDay: raceDay,
    weeks: blocks,
    minWeeks,
    tooShort: blocks < minWeeks,
    peakLongMinutes: peakLong,
    raceMinutes,
  };
}
