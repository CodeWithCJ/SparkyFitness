import { compareDigits, type CompareMetricKey } from './metrics.ts';
import type { CompareSinceResult } from './since.ts';

/** A line the person can pick: `value` in the metric's stored scale, `label` as they read it. */
export interface SinceLineOption {
  value: number;
  label: string;
}

/** Mood is picked on 1-10 (stored 10-100), energy and focus on 1-5. */
const FIXED_STEPS: Partial<Record<CompareMetricKey, readonly number[]>> = {
  mood: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
  energy: [1, 2, 3, 4, 5],
  focus: [1, 2, 3, 4, 5],
};
/** Bedtime (minutes after 18:00) steps by the quarter hour, half hour or hour. */
const BEDTIME_STEPS = [15, 30, 60] as const;
/** About this many steps span the typical ranges. */
const STEPS_ACROSS = 6;
/** Without a range yet, the steps reach this share of the line either side of it. */
const SPREAD_WITHOUT_RANGE = 0.2;

/** The smallest 1, 2 or 5 times a power of ten that is at least `rough`. */
function roundStep(rough: number): number {
  const power = 10 ** Math.floor(Math.log10(rough));
  const unit = rough / power;
  const factor = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10;
  return factor * power;
}

/** Drops floating-point dust such as 0.30000000000000004. */
const tidy = (value: number): number => Math.round(value * 1e6) / 1e6;

/**
 * Round steps across the before and since typical ranges (10th to 90th
 * percentile) and the line in use, never below zero; without a range, a spread
 * around the line.
 */
function roundSteps(
  key: CompareMetricKey,
  current: number,
  result?: Pick<CompareSinceResult, 'before' | 'since'>
): number[] {
  const minStep =
    key === 'bedtime' ? BEDTIME_STEPS[0] : 10 ** -compareDigits(key);
  const ends = (pick: 'p10' | 'p90'): number[] =>
    [result?.before?.[pick], result?.since?.[pick]].filter(
      (value): value is number => value !== undefined
    );
  let low = Math.min(current, ...ends('p10'));
  let high = Math.max(current, ...ends('p90'));
  if (high - low < minStep) {
    const spread = Math.max(
      Math.abs(current) * SPREAD_WITHOUT_RANGE,
      minStep * 3
    );
    low = current - spread;
    high = current + spread;
  }
  const rough = (high - low) / STEPS_ACROSS;
  const step =
    key === 'bedtime'
      ? (BEDTIME_STEPS.find((s) => s >= rough) ?? Math.max(...BEDTIME_STEPS))
      : Math.max(minStep, roundStep(rough));
  const first = tidy(Math.max(0, Math.floor(low / step) * step));
  const last = tidy(Math.ceil(high / step) * step);
  const steps: number[] = [];
  for (let value = first, i = 1; value <= last; i++) {
    steps.push(value);
    value = tidy(first + i * step);
  }
  return steps;
}

/**
 * The lines offered for a since answer's outcome, ascending, always including
 * the one in use. A step that would read the same as it is left out, so no two
 * options look alike. `label` words a value on the display scale.
 */
export function sinceLineOptions(
  key: CompareMetricKey,
  current: number,
  label: (value: number) => string,
  result?: Pick<CompareSinceResult, 'before' | 'since'>
): SinceLineOption[] {
  const currentLabel = label(current);
  const steps = (FIXED_STEPS[key] ?? roundSteps(key, current, result))
    .map((value) => ({ value, label: label(value) }))
    .filter(
      (option) => option.value === current || option.label !== currentLabel
    );
  if (!steps.some((option) => option.value === current)) {
    steps.push({ value: current, label: currentLabel });
  }
  return steps.sort((x, y) => x.value - y.value);
}
