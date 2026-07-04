// Cycle-phase correlation engine (Phase 5). Buckets any dated metric (weight,
// sleep, mood, resting HR, calories) by the cycle phase it falls in, then
// surfaces honest per-phase patterns. Pure + framework-free; the server feeds
// it already-fetched rows so it never touches the DB. Association, not causation.

import { phaseForDay } from "./predictions.ts";
import type { CyclePhase, CyclePrediction, DerivedCycle } from "./types.ts";

export interface MetricPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

export type PhaseBucket = Exclude<CyclePhase, "unknown">;

export const PHASE_ORDER: readonly PhaseBucket[] = [
  "menstrual",
  "follicular",
  "fertile",
  "ovulation",
  "luteal",
];

export interface PhaseMean {
  phase: PhaseBucket;
  mean: number;
  count: number;
}

export interface CorrelationResult {
  metric: string;
  overallMean: number;
  sampleSize: number;
  byPhase: PhaseMean[];
  /** Phase with the largest positive deviation from the overall mean. */
  peakPhase: PhaseBucket | null;
  /** Signed deviation (peak mean − overall mean), same unit as the metric. */
  peakDelta: number;
  /** True once there is enough data to trust the pattern. */
  hasEnoughData: boolean;
}

const MIN_POINTS = 8; // across all phases before we surface a pattern
const MIN_PER_PHASE = 2;

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Buckets metric points by cycle phase and computes per-phase means plus the
 * phase that deviates most from the personal baseline.
 */
export function correlateMetricWithPhase(
  metric: string,
  points: MetricPoint[],
  cycles: DerivedCycle[],
  prediction: CyclePrediction,
): CorrelationResult {
  const buckets: Record<PhaseBucket, number[]> = {
    menstrual: [],
    follicular: [],
    fertile: [],
    ovulation: [],
    luteal: [],
  };

  for (const p of points) {
    if (!Number.isFinite(p.value)) continue;
    const { phase } = phaseForDay(p.date, cycles, prediction);
    if (phase === "unknown") continue;
    buckets[phase].push(p.value);
  }

  const all = PHASE_ORDER.flatMap((ph) => buckets[ph]);
  const overallMean = mean(all);

  const byPhase: PhaseMean[] = PHASE_ORDER.map((phase) => ({
    phase,
    mean: buckets[phase].length ? Math.round(mean(buckets[phase]) * 100) / 100 : 0,
    count: buckets[phase].length,
  }));

  let peakPhase: PhaseBucket | null = null;
  let peakDelta = 0;
  for (const pm of byPhase) {
    if (pm.count < MIN_PER_PHASE) continue;
    const delta = pm.mean - overallMean;
    if (Math.abs(delta) > Math.abs(peakDelta)) {
      peakDelta = delta;
      peakPhase = pm.phase;
    }
  }

  return {
    metric,
    overallMean: Math.round(overallMean * 100) / 100,
    sampleSize: all.length,
    byPhase,
    peakPhase,
    peakDelta: Math.round(peakDelta * 100) / 100,
    hasEnoughData: all.length >= MIN_POINTS,
  };
}

export interface CoachingTip {
  phase: PhaseBucket;
  key: string;
  /** Personalized when the user's own data backs it, else population default. */
  personalized: boolean;
}

/**
 * Phase-based fitness/nutrition coaching (5.11). Prefers a personal correlation
 * signal when available, otherwise a population-default tip for the phase.
 */
export function coachingForPhase(
  phase: CyclePhase,
  correlations: CorrelationResult[],
): CoachingTip | null {
  if (phase === "unknown") return null;
  const p = phase as PhaseBucket;

  // Personalized: if a strong correlation exists for this phase, prefer it.
  for (const c of correlations) {
    if (!c.hasEnoughData || c.peakPhase !== p) continue;
    if (Math.abs(c.peakDelta) < 0.01) continue;
    return { phase: p, key: `coach_${c.metric}_${p}`, personalized: true };
  }

  const DEFAULTS: Record<PhaseBucket, string> = {
    menstrual: "coach_default_menstrual",
    follicular: "coach_default_follicular",
    fertile: "coach_default_fertile",
    ovulation: "coach_default_ovulation",
    luteal: "coach_default_luteal",
  };
  return { phase: p, key: DEFAULTS[p], personalized: false };
}
