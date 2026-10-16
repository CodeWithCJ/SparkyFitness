/**
 * Race-time estimates from a runner's best efforts, using Riegel's formula:
 * `T2 = T1 * (D2 / D1) ^ 1.06`. It is a rule of thumb, best when the effort
 * and the target are not far apart in distance, and it flatters runners who
 * have not trained for the longer distance. Callers should present the result
 * as an estimate.
 */

export type RaceDistanceStandard =
  | "1k"
  | "1mi"
  | "5k"
  | "10k"
  | "15k"
  | "half_marathon"
  | "marathon";

export const RACE_DISTANCE_METERS: Record<RaceDistanceStandard, number> = {
  "1k": 1000,
  "1mi": 1609.344,
  "5k": 5000,
  "10k": 10000,
  "15k": 15000,
  half_marathon: 21097.5,
  marathon: 42195,
};

/** The distances an estimate is offered for. */
export const RACE_PREDICTION_TARGETS = [
  "5k",
  "10k",
  "half_marathon",
  "marathon",
] as const satisfies readonly RaceDistanceStandard[];

export type RacePredictionTarget = (typeof RACE_PREDICTION_TARGETS)[number];

const RIEGEL_EXPONENT = 1.06;
/** An effort more than this many times shorter than the target is too far to extrapolate from. */
const MAX_EXTRAPOLATION_RATIO = 8;

/** The fields of a personal record this reads (a subset of the PR matrix item). */
export interface RaceEffort {
  distanceStandard: string;
  bestTimeSeconds: number;
}

export interface RacePrediction {
  target: RacePredictionTarget;
  /** Estimated finish time, in seconds. */
  seconds: number;
  /** The effort the estimate was worked out from. */
  basedOn: RaceDistanceStandard;
  /** True when that effort is the target distance itself, so this is a record, not an estimate. */
  isRecord: boolean;
}

export function riegelSeconds(
  knownSeconds: number,
  knownMeters: number,
  targetMeters: number,
): number {
  return knownSeconds * (targetMeters / knownMeters) ** RIEGEL_EXPONENT;
}

const isStandard = (value: string): value is RaceDistanceStandard =>
  value in RACE_DISTANCE_METERS;

/**
 * An estimate for each target distance that has a usable effort. For each
 * target it works from the effort nearest in distance (on a log scale, so a
 * 10k is as close to a 5k as a half marathon is to a 10k), and gives up if the
 * nearest effort is more than eight times shorter. `efforts` should be one
 * sport's records, running here.
 */
export function predictRaceTimes(
  efforts: readonly RaceEffort[],
): RacePrediction[] {
  const usable = efforts.flatMap((effort) =>
    isStandard(effort.distanceStandard) &&
    Number.isFinite(effort.bestTimeSeconds) &&
    effort.bestTimeSeconds > 0
      ? [
          {
            standard: effort.distanceStandard,
            meters: RACE_DISTANCE_METERS[effort.distanceStandard],
            seconds: effort.bestTimeSeconds,
          },
        ]
      : [],
  );

  const predictions: RacePrediction[] = [];
  for (const target of RACE_PREDICTION_TARGETS) {
    const targetMeters = RACE_DISTANCE_METERS[target];
    let best: (typeof usable)[number] | null = null;
    let bestGap = Infinity;
    for (const effort of usable) {
      if (targetMeters / effort.meters > MAX_EXTRAPOLATION_RATIO) continue;
      const gap = Math.abs(Math.log(targetMeters / effort.meters));
      if (gap < bestGap) {
        best = effort;
        bestGap = gap;
      }
    }
    if (!best) continue;
    const isRecord = best.standard === target;
    predictions.push({
      target,
      seconds: isRecord
        ? best.seconds
        : riegelSeconds(best.seconds, best.meters, targetMeters),
      basedOn: best.standard,
      isRecord,
    });
  }
  return predictions;
}

/** The fields of a PR-matrix item that decide which sport it belongs to. */
export interface PersonalRecordLike extends RaceEffort {
  category: string;
  sportGroup?: string;
}

/**
 * Just the running records from a PR matrix. A server that predates
 * `sportGroup` sends none, so the record's category stands in for it.
 */
export function runningEfforts(
  records: readonly PersonalRecordLike[],
): RaceEffort[] {
  return records.filter((record) =>
    record.sportGroup != null
      ? record.sportGroup === "run"
      : /\brun/i.test(record.category),
  );
}

/** `m:ss` under an hour, `h:mm:ss` beyond. */
export function formatRaceTime(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
