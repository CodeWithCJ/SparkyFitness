import type { StrengthBestLift } from '../schemas/api/StrengthSummary.api.zod.ts';

/** The lifts structural balance compares. */
export const KEY_LIFTS = [
  'squat',
  'bench',
  'deadlift',
  'overhead_press',
  'row',
] as const;
export type KeyLift = (typeof KEY_LIFTS)[number];

// Exercise names are the person's library names, in any language the library
// holds; these English patterns match the bundled exercise names. Variants
// that change the movement a lot (front squat, Romanian deadlift, incline
// bench) are left out so they don't stand in for the main lift.
const KEY_LIFT_PATTERNS: Record<KeyLift, RegExp> = {
  squat:
    /^(barbell\s+)?(back\s+)?squat(\s*\(barbell\))?$|^barbell (full )?squat$/i,
  bench:
    /^(barbell\s+)?bench\s*press(\s*\(barbell\))?$|^barbell bench press( - medium grip)?$/i,
  deadlift: /^(barbell\s+|conventional\s+)?deadlift(\s*\(barbell\))?$/i,
  overhead_press:
    /^(barbell\s+|standing\s+)*(overhead|shoulder|military)\s+press(\s*\(barbell\))?$|^standing military press$/i,
  row: /^(barbell\s+)?(bent[\s-]*over\s+)?(barbell\s+)?row(\s*\(barbell\))?$|^pendlay row$/i,
};

/** Which key lift an exercise name is, or null. */
export function classifyKeyLift(name: string): KeyLift | null {
  const trimmed = name.trim();
  for (const lift of KEY_LIFTS) {
    if (KEY_LIFT_PATTERNS[lift].test(trimmed)) return lift;
  }
  return null;
}

/**
 * Common structural balance targets (ratio of estimated 1RMs). Ranges are a
 * rough guide for general strength training, not a standard.
 */
export const STRENGTH_RATIOS = [
  {
    key: 'bench_to_squat',
    top: 'bench',
    bottom: 'squat',
    low: 0.65,
    high: 0.85,
  },
  {
    key: 'deadlift_to_squat',
    top: 'deadlift',
    bottom: 'squat',
    low: 1.1,
    high: 1.3,
  },
  {
    key: 'press_to_bench',
    top: 'overhead_press',
    bottom: 'bench',
    low: 0.55,
    high: 0.75,
  },
  { key: 'row_to_bench', top: 'row', bottom: 'bench', low: 0.7, high: 1.0 },
] as const satisfies readonly {
  key: string;
  top: KeyLift;
  bottom: KeyLift;
  low: number;
  high: number;
}[];
export type StrengthRatioKey = (typeof STRENGTH_RATIOS)[number]['key'];

export interface KeyLiftBest {
  lift: KeyLift;
  exerciseName: string;
  estimatedOneRMKg: number;
  /** Estimated 1RM as a multiple of body weight, or null without one. */
  bodyweightMultiple: number | null;
}

export interface StrengthRatioResult {
  key: StrengthRatioKey;
  top: KeyLift;
  bottom: KeyLift;
  value: number;
  low: number;
  high: number;
  /** Where the ratio sits against its range; apps translate it. */
  status: 'low' | 'balanced' | 'high';
}

export interface StrengthBalance {
  keyLifts: KeyLiftBest[];
  ratios: StrengthRatioResult[];
}

/**
 * The strongest logged variant of each key lift, its body weight multiple,
 * and the balance ratios both sides of which are logged.
 */
export function summarizeStrengthBalance(
  lifts: readonly StrengthBestLift[],
  bodyweightKg: number | null | undefined
): StrengthBalance {
  const best = new Map<KeyLift, StrengthBestLift>();
  for (const lift of lifts) {
    const kind = classifyKeyLift(lift.exerciseName);
    if (!kind || !(lift.estimatedOneRMKg > 0)) continue;
    const current = best.get(kind);
    if (!current || lift.estimatedOneRMKg > current.estimatedOneRMKg) {
      best.set(kind, lift);
    }
  }
  const bw = bodyweightKg != null && bodyweightKg > 0 ? bodyweightKg : null;
  const keyLifts: KeyLiftBest[] = KEY_LIFTS.flatMap((kind) => {
    const lift = best.get(kind);
    return lift
      ? [
          {
            lift: kind,
            exerciseName: lift.exerciseName,
            estimatedOneRMKg: lift.estimatedOneRMKg,
            bodyweightMultiple: bw ? lift.estimatedOneRMKg / bw : null,
          },
        ]
      : [];
  });
  const ratios: StrengthRatioResult[] = STRENGTH_RATIOS.flatMap((ratio) => {
    const top = best.get(ratio.top);
    const bottom = best.get(ratio.bottom);
    if (!top || !bottom) return [];
    const value = top.estimatedOneRMKg / bottom.estimatedOneRMKg;
    return [
      {
        key: ratio.key,
        top: ratio.top,
        bottom: ratio.bottom,
        value,
        low: ratio.low,
        high: ratio.high,
        status:
          value < ratio.low ? 'low' : value > ratio.high ? 'high' : 'balanced',
      },
    ];
  });
  return { keyLifts, ratios };
}

/**
 * Heat level for the heat map's "untrained" view: a muscle with no working
 * sets gets the strongest colour, a trained one none, so the regions that
 * stand out are the ones being skipped.
 */
export function untrainedHeatLevel(sets: number): number {
  return sets > 0 ? 0 : 4;
}
