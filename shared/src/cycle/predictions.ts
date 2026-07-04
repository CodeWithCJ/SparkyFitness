// Pure prediction engine for the Cycle hub. Everything operates on YYYY-MM-DD
// calendar-day strings — never Date + toISOString math — so results are stable
// across timezones and DST boundaries. All functions are side-effect free and
// unit-tested from the server package.

import { addDays, compareDays, daysBetween } from "../utils/timezone.ts";
import { isPeriodEvidenceFlow, isHormonalBc, CYCLE_DEFAULTS, DAILY_INSIGHTS, PRODUCT_CAPACITY_ML } from "./constants.ts";
import type {
  CyclePhase,
  CyclePrediction,
  CycleStats,
  DayEvidence,
  DerivedCycle,
  PredictedCycle,
  PredictionConfidence,
  RegularityLabel,
  SharedCycleSettings,
  SharedCycleDailyLog,
  FlowLevel,
} from "./types.ts";


/** True if a day is period evidence: any bleed flow OR any product used. */
export function isPeriodDay(ev: DayEvidence): boolean {
  if (isPeriodEvidenceFlow(ev.flow_level)) return true;
  const usage = ev.product_usage;
  if (usage) {
    for (const key of Object.keys(usage)) {
      if ((usage[key] ?? 0) > 0) return true;
    }
  }
  return false;
}

/**
 * Groups period-evidence days into cycles. A single skipped day inside a bleed
 * is tolerated (gap of 1 day does not end the period); a gap of 2+ days ends it.
 * A cycle runs from one period start to the day before the next period start.
 */
export function deriveCycles(evidence: DayEvidence[]): DerivedCycle[] {
  const periodDays = evidence
    .filter(isPeriodDay)
    .map((e) => e.date)
    .sort(compareDays);
  if (periodDays.length === 0) return [];

  // Collapse consecutive (allowing 1-day gaps) period days into period spans.
  const spans: Array<{ start: string; end: string }> = [];
  let start = periodDays[0]!;
  let prev = periodDays[0]!;
  for (let i = 1; i < periodDays.length; i++) {
    const day = periodDays[i]!;
    if (daysBetween(prev, day) <= 2) {
      prev = day;
    } else {
      spans.push({ start, end: prev });
      start = day;
      prev = day;
    }
  }
  spans.push({ start, end: prev });

  // A span that begins within half the minimum cycle length of the previous
  // span's start is treated as a continuation (noise), not a new cycle.
  const minGap = Math.floor(CYCLE_DEFAULTS.minCycle / 2);
  const merged: Array<{ start: string; end: string }> = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && daysBetween(last.start, span.start) < minGap) {
      last.end = span.end; // extend
    } else {
      merged.push({ ...span });
    }
  }

  const cycles: DerivedCycle[] = [];
  for (let i = 0; i < merged.length; i++) {
    const span = merged[i]!;
    const next = merged[i + 1];
    const periodLength = daysBetween(span.start, span.end) + 1;
    const cycleLength = next ? daysBetween(span.start, next.start) : null;
    cycles.push({
      start_date: span.start,
      end_date: next ? addDays(next.start, -1) : null,
      period_length: periodLength,
      cycle_length: cycleLength,
    });
  }
  return cycles;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

function stdDev(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function regularityFromSd(sd: number, sampleSize: number): RegularityLabel {
  if (sampleSize < 2) return "unknown";
  if (sd <= 3) return "regular";
  if (sd <= 5) return "somewhat";
  return "irregular";
}

/**
 * Computes cycle statistics from the most-recent completed cycles (those with a
 * known cycle_length). Excluded cycles are dropped by the caller.
 */
export function computeCycleStats(cycles: DerivedCycle[]): CycleStats {
  const completed = cycles.filter(
    (c) => typeof c.cycle_length === "number" && c.cycle_length! > 0,
  );
  const recent = completed.slice(-CYCLE_DEFAULTS.statsWindow);
  const cycleLengths = recent.map((c) => c.cycle_length!);
  const periodLengths = recent
    .map((c) => c.period_length)
    .filter((p): p is number => typeof p === "number" && p > 0);

  if (cycleLengths.length === 0) {
    return {
      avgCycleLength: CYCLE_DEFAULTS.cycleLength,
      medianCycleLength: CYCLE_DEFAULTS.cycleLength,
      cycleLengthSd: 0,
      avgPeriodLength: periodLengths.length
        ? Math.round(periodLengths.reduce((a, b) => a + b, 0) / periodLengths.length)
        : CYCLE_DEFAULTS.periodLength,
      regularity: "unknown",
      sampleSize: 0,
    };
  }

  const avg = cycleLengths.reduce((a, b) => a + b, 0) / cycleLengths.length;
  const sd = stdDev(cycleLengths, avg);
  return {
    avgCycleLength: Math.round(avg),
    medianCycleLength: Math.round(median(cycleLengths)),
    cycleLengthSd: Math.round(sd * 10) / 10,
    avgPeriodLength: periodLengths.length
      ? Math.round(periodLengths.reduce((a, b) => a + b, 0) / periodLengths.length)
      : CYCLE_DEFAULTS.periodLength,
    regularity: regularityFromSd(sd, cycleLengths.length),
    sampleSize: cycleLengths.length,
  };
}

function confidenceFrom(stats: CycleStats): PredictionConfidence {
  if (stats.sampleSize >= 3 && stats.regularity === "regular") return "high";
  if (stats.sampleSize >= 2 && stats.regularity !== "irregular") return "medium";
  return "low";
}

/**
 * Predicts the next `count` cycles from stats + the last known period start.
 * Honors settings overrides and suppresses fertility for hormonal birth control.
 */
export function predictNextCycles(
  stats: CycleStats,
  lastPeriodStart: string,
  settings: Pick<
    SharedCycleSettings,
    | "avg_cycle_length_override"
    | "avg_period_length_override"
    | "luteal_phase_length"
    | "birth_control_method"
    | "show_fertile_window"
    | "mode"
  >,
  count = 3,
): CyclePrediction {
  const cycleLength =
    settings.avg_cycle_length_override ?? stats.avgCycleLength ?? CYCLE_DEFAULTS.cycleLength;
  const periodLength =
    settings.avg_period_length_override ?? stats.avgPeriodLength ?? CYCLE_DEFAULTS.periodLength;
  const luteal = settings.luteal_phase_length ?? CYCLE_DEFAULTS.lutealLength;

  // Fertile-window UI is suppressed on hormonal BC, when the user hides it, and
  // in pregnant/postpartum/menopause modes where it is not meaningful.
  const suppressFertility =
    isHormonalBc(settings.birth_control_method) ||
    settings.show_fertile_window === false ||
    settings.mode === "pregnant" ||
    settings.mode === "postpartum" ||
    settings.mode === "menopause";

  const cycles: PredictedCycle[] = [];
  let start = lastPeriodStart;
  const confidence = confidenceFrom(stats);
  for (let i = 0; i < count; i++) {
    start = addDays(start, cycleLength);
    const periodEnd = addDays(start, Math.max(0, periodLength - 1));
    let ovulation: string | null = null;
    let fertileStart: string | null = null;
    let fertileEnd: string | null = null;
    if (!suppressFertility) {
      ovulation = addDays(start, -luteal);
      fertileStart = addDays(ovulation, -CYCLE_DEFAULTS.fertileBefore);
      fertileEnd = addDays(ovulation, CYCLE_DEFAULTS.fertileAfter);
    }
    cycles.push({
      periodStart: start,
      periodEnd,
      ovulation,
      fertileStart,
      fertileEnd,
      confidence,
    });
  }

  return {
    cycles,
    basis: isHormonalBc(settings.birth_control_method)
      ? "bc-bleed"
      : stats.sampleSize > 0
        ? "history"
        : "settings",
    confidence,
  };
}

export interface PhaseResult {
  phase: CyclePhase;
  cycleDay: number | null;
}

/**
 * Determines the cycle phase and cycle-day for a given day, using the current
 * cycle (last period start on or before the day) and the prediction for the
 * fertile/ovulation overlay.
 */
export function phaseForDay(
  day: string,
  cycles: DerivedCycle[],
  prediction: CyclePrediction,
): PhaseResult {
  // Find the most recent cycle start on or before `day`.
  const started = cycles
    .filter((c) => compareDays(c.start_date, day) <= 0)
    .sort((a, b) => compareDays(a.start_date, b.start_date));
  const current = started[started.length - 1];
  if (!current) return { phase: "unknown", cycleDay: null };

  const cycleDay = daysBetween(current.start_date, day) + 1;
  const periodLen = current.period_length ?? CYCLE_DEFAULTS.periodLength;

  if (cycleDay <= periodLen) return { phase: "menstrual", cycleDay };

  // Overlay fertile/ovulation from the prediction whose window contains `day`.
  for (const p of prediction.cycles) {
    if (p.ovulation && compareDays(day, p.ovulation) === 0)
      return { phase: "ovulation", cycleDay };
    if (
      p.fertileStart &&
      p.fertileEnd &&
      compareDays(day, p.fertileStart) >= 0 &&
      compareDays(day, p.fertileEnd) <= 0
    )
      return { phase: "fertile", cycleDay };
  }

  // Fall back to computed ovulation for the current cycle when not suppressed.
  const nextStart = cycles.find((c) => compareDays(c.start_date, day) > 0)?.start_date;
  if (nextStart) {
    const luteal = CYCLE_DEFAULTS.lutealLength;
    const ovulation = addDays(nextStart, -luteal);
    if (compareDays(day, ovulation) === 0) return { phase: "ovulation", cycleDay };
    if (
      compareDays(day, addDays(ovulation, -CYCLE_DEFAULTS.fertileBefore)) >= 0 &&
      compareDays(day, addDays(ovulation, CYCLE_DEFAULTS.fertileAfter)) <= 0
    )
      return { phase: "fertile", cycleDay };
    if (compareDays(day, ovulation) > 0) return { phase: "luteal", cycleDay };
  }

  return { phase: "follicular", cycleDay };
}

export interface LatePeriodStatus {
  isLate: boolean;
  daysLate: number;
}

/** How many days past the next predicted period start `today` is. */
export function latePeriodStatus(
  today: string,
  prediction: CyclePrediction,
): LatePeriodStatus {
  const next = prediction.cycles[0];
  if (!next) return { isLate: false, daysLate: 0 };
  const diff = daysBetween(next.periodStart, today);
  return { isLate: diff > 0, daysLate: diff > 0 ? diff : 0 };
}

/**
 * Deterministically selects one daily insight for a given day + phase. Seeded by
 * the date so it stays stable within a day and rotates across days.
 */
export function selectDailyInsight(
  day: string,
  phase: CyclePhase,
  settings: Pick<SharedCycleSettings, "mode">,
): string {
  const candidates = DAILY_INSIGHTS.filter(
    (r) =>
      (r.phase === phase || r.phase === "any") &&
      (!r.mode || r.mode === settings.mode),
  ).sort((a, b) => b.priority - a.priority);
  if (candidates.length === 0) return "generic_log";

  // Take the highest-priority tier, then rotate within it by a date seed.
  const topPriority = candidates[0]!.priority;
  const top = candidates.filter((c) => c.priority === topPriority);
  const seed = Math.abs(daysBetween("2000-01-01", day));
  return top[seed % top.length]!.key;
}

export interface DecoratedDay {
  date: string; // YYYY-MM-DD
  day: number; // 1-31
  type: "period" | "predicted-period" | "fertile" | "ovulation" | "none";
  loggedFlow?: FlowLevel | null;
  hasNotes: boolean;
  hasSymptoms: boolean;
  hasBbt: boolean;
  hasMucus: boolean;
  moods: string[];
}

export function buildCalendarMonth(
  month: string, // YYYY-MM
  _cycles: DerivedCycle[],
  logs: SharedCycleDailyLog[],
  prediction: CyclePrediction,
): DecoratedDay[] {
  const parts = month.split("-");
  const year = Number(parts[0]);
  const mIndex = Number(parts[1]) - 1; // 0-11
  const daysInMonth = new Date(Date.UTC(year, mIndex + 1, 0)).getUTCDate();

  const days: DecoratedDay[] = [];
  const logMap = new Map<string, SharedCycleDailyLog>(logs.map((l) => [l.entry_date, l]));

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(mIndex + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const log = logMap.get(dateStr);
    const isPeriod = log ? isPeriodDay({ date: dateStr, flow_level: log.flow_level, product_usage: log.product_usage }) : false;

    let type: DecoratedDay["type"] = "none";
    if (isPeriod) {
      type = "period";
    } else {
      // Check prediction cycles
      for (const p of prediction.cycles) {
        if (compareDays(dateStr, p.periodStart) >= 0 && compareDays(dateStr, p.periodEnd) <= 0) {
          type = "predicted-period";
          break;
        }
        if (p.ovulation && compareDays(dateStr, p.ovulation) === 0) {
          type = "ovulation";
          break;
        }
        if (p.fertileStart && p.fertileEnd && compareDays(dateStr, p.fertileStart) >= 0 && compareDays(dateStr, p.fertileEnd) <= 0) {
          type = "fertile";
          break;
        }
      }
    }

    days.push({
      date: dateStr,
      day: d,
      type,
      loggedFlow: log?.flow_level ?? null,
      hasNotes: !!log?.notes,
      hasSymptoms: log ? (log.moods.length > 0 || !!(log.custom_fields && Object.keys(log.custom_fields).length > 0)) : false,
      hasBbt: log?.bbt != null,
      hasMucus: log?.cervical_mucus != null,
      moods: log?.moods ?? [],
    });
  }
  return days;
}

export interface AccuracyDetail {
  cycleStartDate: string;
  predictedStart: string;
  actualStart: string;
  deltaDays: number;
}

export function predictionAccuracy(
  cycles: DerivedCycle[],
): { avgError: number; details: AccuracyDetail[] } {
  const completed = cycles.filter(
    (c) => typeof c.cycle_length === "number" && c.cycle_length! > 0,
  );
  if (completed.length < 2) return { avgError: 0, details: [] };

  const details: AccuracyDetail[] = [];
  let sumError = 0;

  for (let i = 1; i < completed.length; i++) {
    const prior = completed.slice(0, i);
    const stats = computeCycleStats(prior);
    const lastStart = completed[i - 1]!.start_date;
    const settings = {
      avg_cycle_length_override: null,
      avg_period_length_override: null,
      luteal_phase_length: 14,
      birth_control_method: "none",
      show_fertile_window: true,
      mode: "standard" as const,
    };
    const pred = predictNextCycles(stats, lastStart, settings, 1);
    const nextPred = pred.cycles[0];
    if (nextPred) {
      const actual = completed[i]!.start_date;
      const delta = daysBetween(nextPred.periodStart, actual);
      details.push({
        cycleStartDate: actual,
        predictedStart: nextPred.periodStart,
        actualStart: actual,
        deltaDays: delta,
      });
      sumError += Math.abs(delta);
    }
  }

  return {
    avgError: details.length > 0 ? Math.round((sumError / details.length) * 10) / 10 : 0,
    details,
  };
}

export function symptomPhaseMatrix(
  symptomEntries: Array<{ entry_date: string; symptom_name_snapshot: string; severity: number }>,
  cycles: DerivedCycle[],
): Record<string, Record<CyclePhase, { count: number; totalSeverity: number }>> {
  const matrix: Record<string, Record<CyclePhase, { count: number; totalSeverity: number }>> = {};

  const stats = computeCycleStats(cycles);
  const lastCycle = cycles[cycles.length - 1];
  const settings = {
    avg_cycle_length_override: null,
    avg_period_length_override: null,
    luteal_phase_length: 14,
    birth_control_method: "none",
    show_fertile_window: true,
    mode: "standard" as const,
  };
  const prediction = lastCycle
    ? predictNextCycles(stats, lastCycle.start_date, settings, 3)
    : { cycles: [], basis: "settings" as const, confidence: "low" as const };

  for (const entry of symptomEntries) {
    const dayStr = entry.entry_date;
    const name = entry.symptom_name_snapshot;
    const phaseRes = phaseForDay(dayStr, cycles, prediction);
    const phase = phaseRes.phase;

    if (!matrix[name]) {
      matrix[name] = {
        menstrual: { count: 0, totalSeverity: 0 },
        follicular: { count: 0, totalSeverity: 0 },
        fertile: { count: 0, totalSeverity: 0 },
        ovulation: { count: 0, totalSeverity: 0 },
        luteal: { count: 0, totalSeverity: 0 },
        unknown: { count: 0, totalSeverity: 0 },
      };
    }

    matrix[name][phase].count += 1;
    matrix[name][phase].totalSeverity += entry.severity;
  }

  return matrix;
}

export function forecastSymptoms(
  matrix: Record<string, Record<CyclePhase, { count: number; totalSeverity: number }>>,
  prediction: CyclePrediction,
): Record<string, string[]> {
  const forecasts: Record<string, string[]> = {};
  const activeSymptoms: Array<{ name: string; phase: CyclePhase }> = [];

  for (const symptomName of Object.keys(matrix)) {
    const phases = matrix[symptomName]!;
    for (const phaseKey of Object.keys(phases) as CyclePhase[]) {
      if (phases[phaseKey]!.count >= 2) {
        activeSymptoms.push({ name: symptomName, phase: phaseKey });
      }
    }
  }

  for (const pc of prediction.cycles) {
    const cycleLength = 28;
    for (let offset = 0; offset < cycleLength; offset++) {
      const dayStr = addDays(pc.periodStart, offset);
      let phase: CyclePhase = "follicular";
      if (compareDays(dayStr, pc.periodStart) >= 0 && compareDays(dayStr, pc.periodEnd) <= 0) {
        phase = "menstrual";
      } else if (pc.ovulation && compareDays(dayStr, pc.ovulation) === 0) {
        phase = "ovulation";
      } else if (pc.fertileStart && pc.fertileEnd && compareDays(dayStr, pc.fertileStart) >= 0 && compareDays(dayStr, pc.fertileEnd) <= 0) {
        phase = "fertile";
      } else if (pc.ovulation && compareDays(dayStr, pc.ovulation) > 0) {
        phase = "luteal";
      }

      const match = activeSymptoms.filter((s) => s.phase === phase).map((s) => s.name);
      if (match.length > 0) {
        forecasts[dayStr] = match;
      }
    }
  }

  return forecasts;
}

export interface ProductStatsResult {
  avgVolumeMl: number;
  avgProductsPerPeriod: number;
  nextPeriodNeeded: Record<string, number>;
  isHeavyBleeding: boolean;
  costWasteYearlySpend: number;
  costWastePadsCount: number;
  costWasteTamponsCount: number;
}

export function productStats(
  cycles: DerivedCycle[],
  logs: SharedCycleDailyLog[],
): ProductStatsResult {
  const completed = cycles.filter((c) => c.period_length != null);
  if (completed.length === 0) {
    return {
      avgVolumeMl: 0,
      avgProductsPerPeriod: 0,
      nextPeriodNeeded: { pad: 0, tampon: 0 },
      isHeavyBleeding: false,
      costWasteYearlySpend: 0,
      costWastePadsCount: 0,
      costWasteTamponsCount: 0,
    };
  }

  let totalVolumeMl = 0;
  let totalProductsCount = 0;
  const productCounts: Record<string, number> = {};

  for (const c of completed) {
    const periodStart = c.start_date;
    const periodLength = c.period_length ?? 5;
    for (let i = 0; i < periodLength; i++) {
      const dateStr = addDays(periodStart, i);
      const log = logs.find((l) => l.entry_date === dateStr);
      if (log && log.product_usage) {
        for (const [prod, count] of Object.entries(log.product_usage)) {
          const cVal = count ?? 0;
          totalProductsCount += cVal;
          productCounts[prod] = (productCounts[prod] ?? 0) + cVal;
          const capacity = PRODUCT_CAPACITY_ML[prod] ?? 5;
          totalVolumeMl += cVal * capacity;
        }
      }
    }
  }

  const numPeriods = completed.length;
  const avgVolumeMl = Math.round(totalVolumeMl / numPeriods);
  const avgProductsPerPeriod = Math.round(totalProductsCount / numPeriods);

  const nextPeriodNeeded: Record<string, number> = {};
  for (const [prod, total] of Object.entries(productCounts)) {
    nextPeriodNeeded[prod] = Math.max(1, Math.round(total / numPeriods));
  }

  let isHeavyBleeding = avgVolumeMl > 80;
  for (const c of completed) {
    if ((c.period_length ?? 0) > 7) {
      isHeavyBleeding = true;
    }
  }

  const padsCount = productCounts["pad"] ?? 0;
  const tamponsCount = productCounts["tampon"] ?? 0;
  const avgPads = padsCount / numPeriods;
  const avgTampons = tamponsCount / numPeriods;
  const costWasteYearlySpend = Math.round((avgPads * 0.25 + avgTampons * 0.25) * 13);

  return {
    avgVolumeMl,
    avgProductsPerPeriod,
    nextPeriodNeeded,
    isHeavyBleeding,
    costWasteYearlySpend,
    costWastePadsCount: Math.round(avgPads * 13),
    costWasteTamponsCount: Math.round(avgTampons * 13),
  };
}

export interface AnomalyAlert {
  key: string;
  severity: "info" | "attention";
  message: string;
}

export function detectAnomalies(
  cycles: DerivedCycle[],
  logs: SharedCycleDailyLog[],
  _settings?: Pick<SharedCycleSettings, "birth_control_method">,
): AnomalyAlert[] {
  const anomalies: AnomalyAlert[] = [];
  const completed = cycles.filter((c) => c.period_length != null && c.cycle_length != null);

  if (completed.length >= 3) {
    const cycleLengths = completed.map((c) => c.cycle_length!);
    const avg = cycleLengths.reduce((a, b) => a + b, 0) / cycleLengths.length;
    const sd = stdDev(cycleLengths, avg);
    if (sd > 5) {
      anomalies.push({
        key: "irregular_cycles",
        severity: "attention",
        message: "Your cycle length variation is high (SD > 5 days), which may indicate cycle irregularity.",
      });
    }
  }

  for (const c of completed) {
    if (c.cycle_length && c.cycle_length < 21) {
      anomalies.push({
        key: "short_cycle",
        severity: "info",
        message: `You had a short cycle of ${c.cycle_length} days. Cycles shorter than 21 days are worth tracking.`,
      });
      break;
    }
    if (c.cycle_length && c.cycle_length > 45) {
      anomalies.push({
        key: "long_cycle",
        severity: "info",
        message: `You had a long cycle of ${c.cycle_length} days. Cycles longer than 45 days are worth tracking.`,
      });
      break;
    }
  }

  const statsProd = productStats(cycles, logs);
  if (statsProd.isHeavyBleeding) {
    anomalies.push({
      key: "heavy_bleeding",
      severity: "attention",
      message: "Your logs indicate heavy menstrual bleeding (HMB), either due to high estimated flow volume or periods lasting longer than 7 days.",
    });
  }

  let hasUnusualDischarge = false;
  for (const log of logs) {
    if (log.unusual_discharge && log.unusual_discharge.length > 0) {
      hasUnusualDischarge = true;
      break;
    }
  }
  if (hasUnusualDischarge) {
    anomalies.push({
      key: "unusual_discharge",
      severity: "info",
      message: "You have logged unusual discharge. Consider noting color, odor, or texture changes.",
    });
  }

  return anomalies;
}

export interface CycleAlert {
  key: string;
  severity: "info" | "attention";
  message: string;
}

export function buildCycleAlerts(
  today: string,
  prediction: CyclePrediction,
  anomalies: AnomalyAlert[],
): CycleAlert[] {
  const alerts: CycleAlert[] = [];

  const next = prediction.cycles[0];
  if (next) {
    const diff = daysBetween(next.periodStart, today);
    if (diff > 0) {
      alerts.push({
        key: "late_period",
        severity: "attention",
        message: `Your period is expected and is ${diff} day${diff > 1 ? "s" : ""} late.`,
      });
    } else if (diff >= -3 && diff <= 0) {
      alerts.push({
        key: "upcoming_period",
        severity: "info",
        message: `Period is expected in ${Math.abs(diff)} day${Math.abs(diff) !== 1 ? "s" : ""}.`,
      });
    }

    if (next.ovulation && compareDays(today, next.ovulation) === 0) {
      alerts.push({
        key: "ovulation_today",
        severity: "info",
        message: "Ovulation is predicted to occur today.",
      });
    }
  }

  for (const an of anomalies) {
    alerts.push(an);
  }

  return alerts.slice(0, 2);
}
