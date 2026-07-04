import cycleRepository from '../models/cycleRepository.js';
import {
  deriveCycles,
  computeCycleStats,
  predictNextCycles,
  phaseForDay,
  latePeriodStatus,
  selectDailyInsight,
  predictionAccuracy,
  symptomPhaseMatrix,
  forecastSymptoms,
  productStats,
  detectAnomalies,
  estimateOvulation,
  detectBiphasicShift,
  CONCEPTION_PROBABILITY_BY_OFFSET,
  dpo,
  addDays,
  compareDays,
  daysBetween,
  correlateMetricWithPhase,
  detectConditionFlags,
  type DayEvidence,
  type DerivedCycle,
  type SharedCycleSettings,
  type MetricPoint,
} from '@workspace/shared';

interface EvidenceRow {
  entry_date: string;
  flow_level: string | null;
  product_usage: Record<string, number> | null;
}

interface LogRow {
  entry_date: string;
  bbt: number | string | null;
  [key: string]: unknown;
}

function toEvidence(rows: EvidenceRow[]): DayEvidence[] {
  return rows.map((r) => ({
    date: normalizeDay(r.entry_date),
    flow_level: (r.flow_level as DayEvidence['flow_level']) ?? null,
    product_usage: r.product_usage ?? null,
  }));
}

/** DATE columns come back as 'YYYY-MM-DD' strings from pg; guard just in case. */
function normalizeDay(value: string | Date): string {
  if (value instanceof Date) {
    const y = value.getUTCFullYear();
    const m = value.getUTCMonth() + 1;
    const d = value.getUTCDate();
    return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return value.slice(0, 10);
}

/**
 * Re-derives and persists the cycle history from all logged evidence. Called
 * after any flow/product-affecting change. Returns the derived cycles.
 */
async function recomputeCycles(
  userId: string,
  birthControlMethod: string | null
): Promise<DerivedCycle[]> {
  const rows = (await cycleRepository.listEvidence(userId)) as EvidenceRow[];
  const derived = deriveCycles(toEvidence(rows));
  await cycleRepository.replaceDerivedCycles(
    userId,
    derived.map((c) => ({ ...c, birth_control_method: birthControlMethod }))
  );
  return derived;
}

/**
 * Builds the composite Today overview: settings, current cycle, phase,
 * predictions, today's log, stats, insight and late-period status.
 */
async function getOverview(userId: string, today: string, date?: string) {
  const targetDate = date ?? today;
  const settings = (await cycleRepository.getSettings(
    userId
  )) as SharedCycleSettings | null;

  const evidenceRows = (await cycleRepository.listEvidence(
    userId
  )) as EvidenceRow[];
  const cycles = deriveCycles(toEvidence(evidenceRows));
  const stats = computeCycleStats(cycles);

  const settingsForPredict = settings ?? {
    avg_cycle_length_override: null,
    avg_period_length_override: null,
    luteal_phase_length: 14,
    birth_control_method: 'none',
    show_fertile_window: true,
    mode: 'standard' as const,
  };

  const lastCycle = cycles[cycles.length - 1];
  const prediction = lastCycle
    ? predictNextCycles(
        stats,
        lastCycle.start_date,
        settingsForPredict as SharedCycleSettings,
        3
      )
    : { cycles: [], basis: 'settings' as const, confidence: 'low' as const };

  if (lastCycle && prediction.cycles.length > 0) {
    const tests = await cycleRepository.listAllTestEntries(userId);
    const logs = (await cycleRepository.listLogs(
      userId,
      '1970-01-01',
      '2100-01-01'
    )) as LogRow[];
    const est = estimateOvulation(
      lastCycle,
      logs as any,
      tests as any,
      settingsForPredict as any
    );
    prediction.cycles[0].ovulation = est.date;
    prediction.cycles[0].fertileStart = addDays(est.date, -5);
    prediction.cycles[0].fertileEnd = addDays(est.date, 1);
  }

  const phase = lastCycle
    ? phaseForDay(targetDate, cycles, prediction)
    : { phase: 'unknown' as const, cycleDay: null };

  const log = await cycleRepository.getLog(userId, targetDate);
  const late =
    prediction.cycles.length > 0
      ? latePeriodStatus(today, prediction)
      : { isLate: false, daysLate: 0 };
  const insightKey = selectDailyInsight(
    targetDate,
    phase.phase,
    settingsForPredict as SharedCycleSettings
  );

  return {
    settings,
    date: targetDate,
    phase: phase.phase,
    cycleDay: phase.cycleDay,
    currentCycleStart: lastCycle?.start_date ?? null,
    prediction,
    stats,
    log,
    late,
    insightKey,
  };
}

async function getInsights(userId: string) {
  const settings = await cycleRepository.getSettings(userId);
  const evidenceRows = await cycleRepository.listEvidence(userId);
  const logs = (await cycleRepository.listLogs(
    userId,
    '1970-01-01',
    '2100-01-01'
  )) as LogRow[];
  const cycles = deriveCycles(toEvidence(evidenceRows));
  const stats = computeCycleStats(cycles);

  const settingsForPredict = settings ?? {
    avg_cycle_length_override: null,
    avg_period_length_override: null,
    luteal_phase_length: 14,
    birth_control_method: 'none',
    show_fertile_window: true,
    mode: 'standard' as const,
  };

  const lastCycle = cycles[cycles.length - 1];
  const prediction = lastCycle
    ? predictNextCycles(
        stats,
        lastCycle.start_date,
        settingsForPredict as any,
        3
      )
    : { cycles: [], basis: 'settings' as const, confidence: 'low' as const };

  if (lastCycle && prediction.cycles.length > 0) {
    const tests = await cycleRepository.listAllTestEntries(userId);
    const est = estimateOvulation(
      lastCycle,
      logs as any,
      tests as any,
      settingsForPredict as any
    );
    prediction.cycles[0].ovulation = est.date;
    prediction.cycles[0].fertileStart = addDays(est.date, -5);
    prediction.cycles[0].fertileEnd = addDays(est.date, 1);
  }

  const accuracy = predictionAccuracy(cycles);
  const symptoms = await cycleRepository.listAllCycleSymptoms(userId);
  const matrix = symptomPhaseMatrix(symptoms as any, cycles);
  const forecast = forecastSymptoms(matrix, prediction);
  const anomalies = detectAnomalies(
    cycles,
    logs as any,
    settingsForPredict as any
  );
  const prodStats = productStats(cycles, logs as any);

  const bbtSeries = logs
    .filter((l) => l.bbt !== null)
    .map((l) => ({
      date: normalizeDay(l.entry_date),
      bbt: Number(l.bbt),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    stats,
    accuracy,
    matrix,
    forecast,
    anomalies,
    productStats: prodStats,
    bbtSeries,
    cycles,
  };
}

async function getFertility(userId: string, targetDate: string) {
  const settings = await cycleRepository.getSettings(userId);
  const evidenceRows = await cycleRepository.listEvidence(userId);
  const cycles = deriveCycles(toEvidence(evidenceRows));
  const logs = (await cycleRepository.listLogs(
    userId,
    '1970-01-01',
    '2100-01-01'
  )) as LogRow[];
  const tests = await cycleRepository.listAllTestEntries(userId);

  const lastCycle = cycles[cycles.length - 1];
  if (!lastCycle) {
    return {
      ovulationEstimate: null,
      conceptionProbability: { probability: 0, band: 'low' as const },
      fertileWindowSeries: [],
      dpo: null,
      bbtShiftStatus: {
        coverline: null,
        confirmedOvulationDate: null,
        isConfirmed: false,
      },
    };
  }

  const settingsForEstimate = settings ?? {
    avg_cycle_length_override: null,
    avg_period_length_override: null,
    luteal_phase_length: 14,
    birth_control_method: 'none',
    show_fertile_window: true,
    mode: 'standard' as const,
  };

  const est = estimateOvulation(
    lastCycle,
    logs as any,
    tests as any,
    settingsForEstimate as any
  );

  const offset = daysBetween(est.date, targetDate);
  const prob = CONCEPTION_PROBABILITY_BY_OFFSET[offset] ?? {
    probability: 0,
    band: 'low' as const,
  };

  const fertileWindowSeries = [];
  for (let o = -5; o <= 0; o++) {
    const dateStr = addDays(est.date, o);
    const pVal = CONCEPTION_PROBABILITY_BY_OFFSET[o] ?? {
      probability: 0,
      band: 'low' as const,
    };
    fertileWindowSeries.push({
      date: dateStr,
      offset: o,
      probability: pVal.probability,
      band: pVal.band,
      isToday: dateStr === targetDate,
    });
  }

  const dpoVal = dpo(targetDate, est.date);

  const currentCycleStart = lastCycle.start_date;
  const nextCycleStart = cycles.find(
    (c) => compareDays(c.start_date, currentCycleStart) > 0
  )?.start_date;
  const cycleLogs = logs.filter((l) => {
    const afterStart = compareDays(l.entry_date, currentCycleStart) >= 0;
    const beforeEnd = nextCycleStart
      ? compareDays(l.entry_date, nextCycleStart) < 0
      : true;
    return afterStart && beforeEnd;
  });
  const bbtSeries = cycleLogs
    .filter((l) => l.bbt !== null)
    .map((l) => ({ date: normalizeDay(l.entry_date), bbt: Number(l.bbt) }));
  const bbtShiftStatus = detectBiphasicShift(bbtSeries);

  return {
    ovulationEstimate: est,
    conceptionProbability: prob,
    fertileWindowSeries,
    dpo: dpoVal,
    bbtShiftStatus,
  };
}

/**
 * Cycle-phase correlations (Phase 5): buckets weight, mood, sleep and energy by
 * the phase each day falls in, plus condition-pattern flags. Reuses existing
 * user data — no duplicate logging.
 */
async function getCorrelations(userId: string) {
  const settings = (await cycleRepository.getSettings(
    userId
  )) as SharedCycleSettings | null;
  const evidenceRows = (await cycleRepository.listEvidence(
    userId
  )) as EvidenceRow[];
  const cycles = deriveCycles(toEvidence(evidenceRows));
  const stats = computeCycleStats(cycles);

  const settingsForPredict = (settings ?? {
    avg_cycle_length_override: null,
    avg_period_length_override: null,
    luteal_phase_length: 14,
    birth_control_method: 'none',
    show_fertile_window: true,
    mode: 'standard' as const,
  }) as SharedCycleSettings;

  const lastCycle = cycles[cycles.length - 1];
  const prediction = lastCycle
    ? predictNextCycles(stats, lastCycle.start_date, settingsForPredict, 3)
    : { cycles: [], basis: 'settings' as const, confidence: 'low' as const };

  const sources = await cycleRepository.getCorrelationSources(userId);
  const correlations = (
    [
      ['weight', sources.weight],
      ['mood', sources.mood],
      ['sleep', sources.sleep],
      ['energy', sources.energy],
    ] as [string, MetricPoint[]][]
  ).map(([metric, points]) =>
    correlateMetricWithPhase(metric, points, cycles, prediction)
  );

  const conditionFlags = detectConditionFlags(cycles, stats);

  return { correlations, conditionFlags, stats };
}

async function getExport(userId: string) {
  const data = await cycleRepository.exportAll(userId);
  return {
    exported_at: new Date().toISOString(),
    schema: 'sparkyfitness-cycle-v1',
    ...data,
  };
}

export default {
  recomputeCycles,
  getOverview,
  getInsights,
  getFertility,
  getCorrelations,
  getExport,
};
