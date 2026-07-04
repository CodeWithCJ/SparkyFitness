import { addDays, compareDays, daysBetween } from "../utils/timezone.ts";
import type { DerivedCycle, SharedCycleDailyLog, SharedCycleSettings } from "./types.ts";

export const CONCEPTION_PROBABILITY_BY_OFFSET: Record<
  number,
  { probability: number; band: "low" | "medium" | "high" | "peak" }
> = {
  [-5]: { probability: 0.10, band: "medium" },
  [-4]: { probability: 0.15, band: "high" },
  [-3]: { probability: 0.20, band: "high" },
  [-2]: { probability: 0.25, band: "peak" },
  [-1]: { probability: 0.28, band: "peak" },
  [0]: { probability: 0.33, band: "peak" },
  [1]: { probability: 0.10, band: "medium" },
};

export interface BbtShiftResult {
  coverline: number | null;
  confirmedOvulationDate: string | null;
  isConfirmed: boolean;
}

/**
 * Detects a biphasic BBT shift using the standard 3-over-6 rule.
 * Coverline = max of previous 6 valid temps + 0.11 °C.
 * Confirmed when 3 consecutive temps are above coverline.
 * Discards outliers (deviating ±1.0 °C from local 5-day median).
 */
export function detectBiphasicShift(bbtSeries: Array<{ date: string; bbt: number }>): BbtShiftResult {
  // Sort chronologically
  const sorted = [...bbtSeries].sort((a, b) => a.date.localeCompare(b.date));

  // 1. Discard outliers using rolling 5-point median
  const validTemps: Array<{ date: string; bbt: number }> = [];
  for (let i = 0; i < sorted.length; i++) {
    const start = Math.max(0, i - 2);
    const end = Math.min(sorted.length, i + 3);
    const window = sorted.slice(start, end).map((x) => x.bbt);
    window.sort((a, b) => a - b);
    const median = window[Math.floor(window.length / 2)]!;
    if (Math.abs(sorted[i]!.bbt - median) < 1.0) {
      validTemps.push(sorted[i]!);
    }
  }

  if (validTemps.length < 9) {
    return { coverline: null, confirmedOvulationDate: null, isConfirmed: false };
  }

  // 2. Scan for 3-over-6 shift
  for (let i = 6; i < validTemps.length - 2; i++) {
    const prev6 = validTemps.slice(i - 6, i).map((x) => x.bbt);
    const computedCoverline = Math.max(...prev6) + 0.11;
    if (
      validTemps[i]!.bbt > computedCoverline &&
      validTemps[i + 1]!.bbt > computedCoverline &&
      validTemps[i + 2]!.bbt > computedCoverline
    ) {
      return {
        coverline: Math.round(computedCoverline * 100) / 100,
        confirmedOvulationDate: validTemps[i - 1]!.date, // Day of last low temp
        isConfirmed: true,
      };
    }
  }

  return { coverline: null, confirmedOvulationDate: null, isConfirmed: false };
}

export interface OvulationEstimate {
  date: string;
  basis: "bbt" | "opk" | "calendar";
  confidence: "high" | "medium" | "low";
}

/**
 * Estimates ovulation date for a cycle.
 * Precedence: BBT-confirmed > peak OPK > calendar method.
 */
export function estimateOvulation(
  cycle: DerivedCycle,
  logs: SharedCycleDailyLog[],
  tests: Array<{ entry_date: string; test_type: string; result: string }>,
  settings: Pick<SharedCycleSettings, "luteal_phase_length" | "avg_cycle_length_override">,
): OvulationEstimate {
  const nextStart = cycle.end_date ? addDays(cycle.end_date, 1) : null;

  // Filter logs belonging to this cycle
  const cycleLogs = logs.filter((l) => {
    const afterStart = compareDays(l.entry_date, cycle.start_date) >= 0;
    const beforeEnd = nextStart ? compareDays(l.entry_date, nextStart) < 0 : true;
    return afterStart && beforeEnd;
  });

  // 1. BBT Confirmation
  const bbtSeries = cycleLogs
    .filter((l) => l.bbt != null)
    .map((l) => ({ date: l.entry_date, bbt: l.bbt! }));
  const bbtShift = detectBiphasicShift(bbtSeries);
  if (bbtShift.isConfirmed && bbtShift.confirmedOvulationDate) {
    return {
      date: bbtShift.confirmedOvulationDate,
      basis: "bbt",
      confidence: "high",
    };
  }

  // 2. OPK Peak Overrides
  const cycleTests = tests.filter((t) => {
    const afterStart = compareDays(t.entry_date, cycle.start_date) >= 0;
    const beforeEnd = nextStart ? compareDays(t.entry_date, nextStart) < 0 : true;
    return t.test_type === "opk" && afterStart && beforeEnd;
  });

  const peakTest = cycleTests.find((t) => t.result === "peak") || cycleTests.find((t) => t.result === "high");
  if (peakTest) {
    // Ovulation typically occurs 24 hours after LH peak surge.
    return {
      date: addDays(peakTest.entry_date, 1),
      basis: "opk",
      confidence: "high",
    };
  }

  // 3. Fallback: Calendar Method
  const luteal = settings.luteal_phase_length ?? 14;
  const cycleLength = settings.avg_cycle_length_override ?? 28;
  const date = nextStart 
    ? addDays(nextStart, -luteal)
    : addDays(cycle.start_date, cycleLength - luteal);

  return {
    date,
    basis: "calendar",
    confidence: "medium",
  };
}

/**
 * Returns days past ovulation (DPO) for a given date.
 */
export function dpo(day: string, ovulationDay: string): number | null {
  const diff = daysBetween(ovulationDay, day);
  return diff >= 0 ? diff : null;
}
