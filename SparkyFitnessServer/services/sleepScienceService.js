const sleepScienceRepository = require("../models/sleepScienceRepository");
const { log } = require("../config/logging");

// ==========================================
// CONSTANTS (from sleep-debt algorithm)
// ==========================================
const DECAY_LAMBDA = 0.5;
const DEFAULT_SLEEP_NEED_HOURS = 8.25;
const DEBT_WINDOW_DAYS = 14;

const DEBT_THRESHOLDS = {
  low: { min: 0, max: 2 },
  moderate: { min: 2, max: 5 },
  high: { min: 5, max: 8 },
  critical: { min: 8, max: Infinity },
};

const MCTQ_CONFIG = {
  mctqWindowDays: 90,
  minFreedaysForCalculation: 8,
  minWorkdaysForCalculation: 20,
  minSleepNeed: 6.0,
  maxSleepNeed: 10.0,
  strainFactor: 0.15,
  debtWindowDays: 14,
  debtDecayLambda: 0.5,
  maxDebtHours: 20,
  workdayWakeVarianceThreshold: 30,
  freedayWakeVarianceThreshold: 45,
};

const CHRONOTYPE_BOUNDARIES = {
  EARLY_BEFORE: 6,
  LATE_AFTER: 8,
};

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

function getDebtCategory(debtHours) {
  if (debtHours <= DEBT_THRESHOLDS.low.max) return "low";
  if (debtHours <= DEBT_THRESHOLDS.moderate.max) return "moderate";
  if (debtHours <= DEBT_THRESHOLDS.high.max) return "high";
  return "critical";
}

function calculateDayWeight(dayIndex) {
  return Math.exp(-DECAY_LAMBDA * dayIndex);
}

function calculatePaybackNights(debtHours) {
  if (debtHours <= 0) return 0;
  return Math.ceil(debtHours);
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function standardDeviation(values) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const squaredDiffs = values.map((v) => Math.pow(v - avg, 2));
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / (values.length - 1));
}

function getWakeHour(entry) {
  if (!entry.sleepEndTimestampGMT) return null;
  const ts = Number(entry.sleepEndTimestampGMT);
  if (isNaN(ts)) return null;
  const d = new Date(ts);
  return d.getHours() + d.getMinutes() / 60;
}

function getSleepHour(entry) {
  if (!entry.sleepStartTimestampGMT) return null;
  const ts = Number(entry.sleepStartTimestampGMT);
  if (isNaN(ts)) return null;
  const d = new Date(ts);
  return d.getHours() + d.getMinutes() / 60;
}

function getTST(entry) {
  const deep = Number(entry.deepSleepMinutes) || 0;
  const rem = Number(entry.remSleepMinutes) || 0;
  const light = Number(entry.lightSleepMinutes) || 0;
  if (deep + rem + light > 0) return (deep + rem + light) / 60;
  if (entry.sleepDurationHours) return Number(entry.sleepDurationHours);
  return null;
}

// ==========================================
// SLEEP DEBT CALCULATION
// ==========================================

async function calculateSleepDebt(userId) {
  log("info", `Calculating sleep debt for user ${userId}`);

  const profile = await sleepScienceRepository.getSleepProfile(userId);
  const sleepNeed = profile?.baseline_sleep_need
    ? Number(profile.baseline_sleep_need)
    : DEFAULT_SLEEP_NEED_HOURS;

  const history = await sleepScienceRepository.getSleepHistory(userId, DEBT_WINDOW_DAYS);

  if (history.length === 0) {
    return {
      currentDebt: 0,
      debtCategory: "low",
      sleepNeed,
      last14Days: [],
      trend: { direction: "stable", change7d: 0 },
      paybackTime: 0,
    };
  }

  let totalWeightedDebt = 0;
  let totalWeight = 0;
  const dailyBreakdown = [];

  for (let i = 0; i < history.length; i++) {
    const entry = history[i];
    const tst = getTST(entry);
    if (tst === null) continue;

    const weight = calculateDayWeight(i);
    const deviation = sleepNeed - tst;
    const weightedDebt = Math.max(0, deviation) * weight;

    totalWeightedDebt += weightedDebt;
    totalWeight += weight;

    dailyBreakdown.push({
      date: entry.date,
      tst: Math.round(tst * 100) / 100,
      deviation: Math.round(deviation * 100) / 100,
      weight: Math.round(weight * 1000) / 1000,
      weightedDebt: Math.round(weightedDebt * 100) / 100,
    });
  }

  const currentDebt =
    totalWeight > 0
      ? Math.round((totalWeightedDebt / totalWeight) * 100) / 100
      : 0;

  // Calculate 7-day trend
  const recent7 = dailyBreakdown.slice(0, 7);
  const older7 = dailyBreakdown.slice(7, 14);
  const recentAvgDebt =
    recent7.length > 0
      ? recent7.reduce((s, d) => s + Math.max(0, d.deviation), 0) / recent7.length
      : 0;
  const olderAvgDebt =
    older7.length > 0
      ? older7.reduce((s, d) => s + Math.max(0, d.deviation), 0) / older7.length
      : 0;
  const change7d = Math.round((recentAvgDebt - olderAvgDebt) * 100) / 100;
  const direction = change7d < -0.25 ? "improving" : change7d > 0.25 ? "worsening" : "stable";

  return {
    currentDebt,
    debtCategory: getDebtCategory(currentDebt),
    sleepNeed,
    last14Days: dailyBreakdown,
    trend: { direction, change7d },
    paybackTime: calculatePaybackNights(currentDebt),
  };
}

// ==========================================
// MCTQ BASELINE CALCULATION
// ==========================================

function classifyDaysAutomatically(history) {
  const dayBuckets = new Map();

  for (const entry of history) {
    const wakeHour = getWakeHour(entry);
    if (wakeHour === null) continue;

    const dateStr = typeof entry.date === "string" ? entry.date : entry.date.toISOString().slice(0, 10);
    const dow = new Date(dateStr).getDay();

    if (!dayBuckets.has(dow)) dayBuckets.set(dow, []);
    dayBuckets.get(dow).push(wakeHour);
  }

  const classification = new Map();
  for (const [dow, wakeHours] of dayBuckets) {
    if (wakeHours.length < 3) {
      // Default: Mon-Fri = workday, Sat-Sun = freeday
      classification.set(dow, dow === 0 || dow === 6 ? "freeday" : "workday");
      continue;
    }
    const variance = standardDeviation(wakeHours) * 60; // to minutes
    classification.set(
      dow,
      variance > MCTQ_CONFIG.freedayWakeVarianceThreshold ? "freeday" : "workday"
    );
  }

  // Fill missing days with defaults
  for (let i = 0; i < 7; i++) {
    if (!classification.has(i)) {
      classification.set(i, i === 0 || i === 6 ? "freeday" : "workday");
    }
  }

  return classification;
}

async function calculateBaseline(userId, windowDays = 90) {
  log("info", `Calculating MCTQ baseline for user ${userId}, window=${windowDays} days`);

  const history = await sleepScienceRepository.getSleepHistory(userId, windowDays);

  if (history.length < 14) {
    return {
      success: false,
      error: "Insufficient data",
      message: `Only ${history.length} days available, need at least 14`,
    };
  }

  // Classify days
  const dayClassification = classifyDaysAutomatically(history);

  // Split history by day type
  const workdayEntries = [];
  const freedayEntries = [];

  for (const entry of history) {
    const tst = getTST(entry);
    if (tst === null || tst < 3 || tst > 14) continue;

    const dateStr = typeof entry.date === "string" ? entry.date : entry.date.toISOString().slice(0, 10);
    const dow = new Date(dateStr).getDay();
    const dayType = dayClassification.get(dow) || "workday";

    if (dayType === "workday") {
      workdayEntries.push({ ...entry, tst });
    } else {
      freedayEntries.push({ ...entry, tst });
    }
  }

  if (workdayEntries.length < MCTQ_CONFIG.minWorkdaysForCalculation / 2 ||
      freedayEntries.length < MCTQ_CONFIG.minFreedaysForCalculation / 2) {
    // Fallback: use overall median
    const allTSTs = history.map((e) => getTST(e)).filter((t) => t !== null && t >= 3 && t <= 14);
    const fallbackNeed = Math.max(
      MCTQ_CONFIG.minSleepNeed,
      Math.min(MCTQ_CONFIG.maxSleepNeed, median(allTSTs))
    );

    await sleepScienceRepository.updateBaselineSleepNeed(userId, {
      baselineNeed: fallbackNeed,
      confidence: "low",
      basedOnDays: allTSTs.length,
      sdWorkday: null,
      sdFreeday: null,
      socialJetlag: null,
    });

    return {
      success: true,
      sleepNeedIdeal: fallbackNeed,
      confidence: "low",
      method: "median_fallback",
      basedOnDays: allTSTs.length,
    };
  }

  // Calculate MCTQ
  const sdWorkday = mean(workdayEntries.map((e) => e.tst));
  const sdFreeday = mean(freedayEntries.map((e) => e.tst));
  const sdWeek = (5 * sdWorkday + 2 * sdFreeday) / 7;

  let sleepNeedIdeal;
  if (sdFreeday > sdWorkday) {
    sleepNeedIdeal = sdFreeday - (sdFreeday - sdWeek) / 2;
  } else {
    sleepNeedIdeal = sdWeek;
  }
  sleepNeedIdeal = Math.max(
    MCTQ_CONFIG.minSleepNeed,
    Math.min(MCTQ_CONFIG.maxSleepNeed, sleepNeedIdeal)
  );

  // Mid-sleep calculation
  const workdayMidSleeps = [];
  const freedayMidSleeps = [];
  for (const entry of workdayEntries) {
    const start = getSleepHour(entry);
    const end = getWakeHour(entry);
    if (start !== null && end !== null) {
      let mid = (start + (end > start ? end : end + 24)) / 2;
      if (mid >= 24) mid -= 24;
      workdayMidSleeps.push(mid);
    }
  }
  for (const entry of freedayEntries) {
    const start = getSleepHour(entry);
    const end = getWakeHour(entry);
    if (start !== null && end !== null) {
      let mid = (start + (end > start ? end : end + 24)) / 2;
      if (mid >= 24) mid -= 24;
      freedayMidSleeps.push(mid);
    }
  }

  const mswHour = workdayMidSleeps.length > 0 ? mean(workdayMidSleeps) : null;
  const msfHour = freedayMidSleeps.length > 0 ? mean(freedayMidSleeps) : null;
  const socialJetlag =
    mswHour !== null && msfHour !== null ? Math.abs(msfHour - mswHour) : null;

  // Confidence
  let confidence = "low";
  if (workdayEntries.length >= 40 && freedayEntries.length >= 16) {
    confidence = "high";
  } else if (workdayEntries.length >= 20 && freedayEntries.length >= 8) {
    confidence = "medium";
  }

  // Determine data range
  const dates = history
    .map((e) => (typeof e.date === "string" ? e.date : e.date.toISOString().slice(0, 10)))
    .sort();
  const dataStartDate = dates[0] || null;
  const dataEndDate = dates[dates.length - 1] || null;

  // Save to profile
  await sleepScienceRepository.updateBaselineSleepNeed(userId, {
    baselineNeed: Math.round(sleepNeedIdeal * 100) / 100,
    confidence,
    basedOnDays: history.length,
    sdWorkday: Math.round(sdWorkday * 100) / 100,
    sdFreeday: Math.round(sdFreeday * 100) / 100,
    socialJetlag: socialJetlag !== null ? Math.round(socialJetlag * 100) / 100 : null,
  });

  // Save calculation record
  const formatTimeFromHour = (h) => {
    if (h === null) return null;
    const hours = Math.floor(h);
    const minutes = Math.round((h - hours) * 60);
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
  };

  await sleepScienceRepository.saveCalculation(userId, {
    method: "mctq_corrected",
    calculatedNeed: Math.round(sleepNeedIdeal * 100) / 100,
    confidence,
    basedOnDays: history.length,
    sdWorkday: Math.round(sdWorkday * 100) / 100,
    sdFreeday: Math.round(sdFreeday * 100) / 100,
    sdWeek: Math.round(sdWeek * 100) / 100,
    socialJetlag: socialJetlag !== null ? Math.round(socialJetlag * 100) / 100 : null,
    midSleepWorkday: formatTimeFromHour(mswHour),
    midSleepFreeday: formatTimeFromHour(msfHour),
    midSleepCorrected: null,
    workdaysCount: workdayEntries.length,
    freedaysCount: freedayEntries.length,
    dataStartDate,
    dataEndDate,
  });

  // Save day classifications
  const dayStats = getDayOfWeekStats(history, dayClassification);
  for (const stat of dayStats) {
    await sleepScienceRepository.upsertDayClassification(userId, stat.dayOfWeek, {
      classifiedAs: stat.dayType,
      meanWakeHour: stat.meanWakeHour,
      varianceMinutes: stat.varianceMinutes,
      sampleCount: stat.sampleCount,
    });
  }

  return {
    success: true,
    sleepNeedIdeal: Math.round(sleepNeedIdeal * 100) / 100,
    sdWorkday: Math.round(sdWorkday * 100) / 100,
    sdFreeday: Math.round(sdFreeday * 100) / 100,
    sdWeek: Math.round(sdWeek * 100) / 100,
    socialJetlag: socialJetlag !== null ? Math.round(socialJetlag * 100) / 100 : null,
    confidence,
    basedOnDays: history.length,
    workdaysCount: workdayEntries.length,
    freedaysCount: freedayEntries.length,
    method: "mctq_corrected",
    dataStartDate,
    dataEndDate,
  };
}

function getDayOfWeekStats(history, classification) {
  const buckets = new Map();

  for (const entry of history) {
    const wakeHour = getWakeHour(entry);
    if (wakeHour === null) continue;

    const dateStr = typeof entry.date === "string" ? entry.date : entry.date.toISOString().slice(0, 10);
    const dow = new Date(dateStr).getDay();

    if (!buckets.has(dow)) buckets.set(dow, []);
    buckets.get(dow).push(wakeHour);
  }

  const stats = [];
  for (let dow = 0; dow < 7; dow++) {
    const wakeHours = buckets.get(dow) || [];
    const dayType = classification ? classification.get(dow) : (dow === 0 || dow === 6 ? "freeday" : "workday");

    stats.push({
      dayOfWeek: dow,
      meanWakeHour: wakeHours.length > 0 ? Math.round(mean(wakeHours) * 100) / 100 : null,
      varianceMinutes:
        wakeHours.length >= 2
          ? Math.round(standardDeviation(wakeHours) * 60 * 100) / 100
          : null,
      sampleCount: wakeHours.length,
      dayType,
    });
  }

  return stats;
}

// ==========================================
// MCTQ STATS
// ==========================================

async function getMCTQStats(userId) {
  log("info", `Getting MCTQ stats for user ${userId}`);

  const profile = await sleepScienceRepository.getSleepProfile(userId);
  const latestCalc = await sleepScienceRepository.getLatestCalculation(userId);
  const dayClassifications = await sleepScienceRepository.getDayClassifications(userId);

  return {
    profile: profile
      ? {
          baselineSleepNeed: Number(profile.baseline_sleep_need) || DEFAULT_SLEEP_NEED_HOURS,
          method: profile.sleep_need_method || "default",
          confidence: profile.sleep_need_confidence || "low",
          basedOnDays: profile.sleep_need_based_on_days || 0,
          lastCalculated: profile.sleep_need_last_calculated,
          sdWorkday: profile.sd_workday_hours ? Number(profile.sd_workday_hours) : null,
          sdFreeday: profile.sd_freeday_hours ? Number(profile.sd_freeday_hours) : null,
          socialJetlag: profile.social_jetlag_hours ? Number(profile.social_jetlag_hours) : null,
        }
      : null,
    latestCalculation: latestCalc,
    dayClassifications: dayClassifications.map((d) => ({
      dayOfWeek: d.day_of_week,
      classifiedAs: d.classified_as,
      meanWakeHour: d.mean_wake_hour ? Number(d.mean_wake_hour) : null,
      varianceMinutes: d.variance_minutes ? Number(d.variance_minutes) : null,
      sampleCount: d.sample_count,
    })),
  };
}

// ==========================================
// DAILY NEED (WHOOP-style decomposition)
// ==========================================

async function getDailyNeed(userId, targetDate) {
  log("info", `Getting daily sleep need for user ${userId}, date=${targetDate}`);

  const profile = await sleepScienceRepository.getSleepProfile(userId);
  const baselineNeed = profile?.baseline_sleep_need
    ? Number(profile.baseline_sleep_need)
    : DEFAULT_SLEEP_NEED_HOURS;

  // Calculate sleep debt for strain/debt components
  const debtData = await calculateSleepDebt(userId);

  // Simple decomposition
  const strainAddition = 0; // Would need training data integration
  const debtAddition = Math.min(debtData.currentDebt * 0.25, 2.0);
  const napSubtraction = 0; // Would need nap detection
  const totalNeed = Math.max(
    MCTQ_CONFIG.minSleepNeed,
    Math.min(MCTQ_CONFIG.maxSleepNeed + 2, baselineNeed + strainAddition + debtAddition - napSubtraction)
  );

  const breakdown = {
    date: targetDate,
    baseline: baselineNeed,
    strainAddition: Math.round(strainAddition * 100) / 100,
    debtAddition: Math.round(debtAddition * 100) / 100,
    napSubtraction: Math.round(napSubtraction * 100) / 100,
    totalNeed: Math.round(totalNeed * 100) / 100,
    method: profile?.sleep_need_method || "default",
    confidence: profile?.sleep_need_confidence || "low",
    trainingLoadScore: null,
    currentDebtHours: debtData.currentDebt,
    napMinutes: 0,
    recoveryScoreYesterday: null,
  };

  // Cache it
  await sleepScienceRepository.upsertDailyNeed(userId, targetDate, breakdown);

  return breakdown;
}

// ==========================================
// ENERGY CURVE (Two-Process Model)
// ==========================================

async function getEnergyCurve(userId) {
  log("info", `Generating energy curve for user ${userId}`);

  const history = await sleepScienceRepository.getSleepHistory(userId, 14);

  if (history.length < 3) {
    return {
      success: false,
      error: "Insufficient data",
      message: "Need at least 3 days of sleep data for energy curve",
    };
  }

  // Extract wake/sleep times for chronotype
  const wakeTimes = [];
  const sleepTimes = [];
  for (const entry of history) {
    const wh = getWakeHour(entry);
    const sh = getSleepHour(entry);
    if (wh !== null) wakeTimes.push(wh);
    if (sh !== null) sleepTimes.push(sh);
  }

  if (wakeTimes.length < 3) {
    return {
      success: false,
      error: "Insufficient timestamp data",
      message: "Need at least 3 days with wake/sleep timestamps",
    };
  }

  const medianWakeHour = median(wakeTimes);
  const medianSleepHour = sleepTimes.length > 0 ? median(sleepTimes) : medianWakeHour - 8;

  // Circadian parameters
  const nadirHour = medianWakeHour - 2;
  const acrophaseHour = nadirHour + 12;

  // Sleep debt
  const debtData = await calculateSleepDebt(userId);
  const debtPenaltyPercent = Math.min(debtData.currentDebt * 3, 30);

  // Generate 96 points (every 15 min)
  const now = new Date();
  const points = [];
  const startHour = 0;

  for (let i = 0; i < 96; i++) {
    const hour = startHour + i * 0.25;
    const time = new Date(now);
    time.setHours(Math.floor(hour), (hour % 1) * 60, 0, 0);

    // Hours since wake
    let hoursAwake = hour - medianWakeHour;
    if (hoursAwake < 0) hoursAwake += 24;

    // Process S (homeostatic)
    const tauRise = 18.2;
    let processS;
    if (hour >= medianSleepHour || hour < medianWakeHour) {
      // During sleep - decay
      const tauDecay = 4.2;
      let hoursSleeping;
      if (hour >= medianSleepHour) {
        hoursSleeping = hour - medianSleepHour;
      } else {
        hoursSleeping = (24 - medianSleepHour) + hour;
      }
      processS = 0.8 * Math.exp(-hoursSleeping / tauDecay);
    } else {
      // During wake - rise
      processS = 1 - (1 - 0.1) * Math.exp(-hoursAwake / tauRise);
    }

    // Process C (circadian) - multi-harmonic
    const harmonics = [0.97, 0.22, 0.07, 0.03, 0.001];
    const phaseHours = hour - nadirHour;
    let processC = 0;
    for (let k = 0; k < harmonics.length; k++) {
      processC += harmonics[k] * Math.sin((2 * Math.PI * (k + 1) * phaseHours) / 24);
    }
    // Normalize to 0-1
    const maxC = harmonics.reduce((s, h) => s + Math.abs(h), 0);
    processC = (processC + maxC) / (2 * maxC);

    // Energy calculation
    let energy = Math.round(processC * 100 - processS * 40);
    energy = Math.max(0, Math.min(100, energy));

    // Apply debt penalty
    energy = Math.round(energy * (1 - debtPenaltyPercent / 100));

    // Determine zone
    let zone;
    const melatoninStart = medianSleepHour - 2;
    if (hour >= medianSleepHour || hour < medianWakeHour) {
      zone = "sleep";
    } else if (hour >= melatoninStart && hour < medianSleepHour) {
      zone = "wind-down";
    } else if (energy >= 70) {
      zone = "peak";
    } else if (energy <= 40) {
      zone = "dip";
    } else {
      zone = "rising";
    }

    points.push({
      hour: Math.round(hour * 100) / 100,
      time: time.toISOString(),
      energy,
      zone,
      processS: Math.round(processS * 1000) / 1000,
      processC: Math.round(processC * 1000) / 1000,
    });
  }

  // Find current energy
  const currentHour = now.getHours() + now.getMinutes() / 60;
  const currentIdx = Math.min(95, Math.round(currentHour * 4));
  const currentPoint = points[currentIdx];

  // Find next peak and dip
  let nextPeak = null;
  let nextDip = null;
  for (let i = currentIdx + 1; i < points.length; i++) {
    if (!nextPeak && points[i].energy >= 70 && (i === 0 || points[i].energy > points[i - 1].energy)) {
      nextPeak = { hour: points[i].hour, energy: points[i].energy };
    }
    if (!nextDip && points[i].energy <= 40 && (i === 0 || points[i].energy < points[i - 1].energy)) {
      nextDip = { hour: points[i].hour, energy: points[i].energy };
    }
    if (nextPeak && nextDip) break;
  }

  return {
    success: true,
    points,
    currentEnergy: currentPoint?.energy || 0,
    currentZone: currentPoint?.zone || "rising",
    nextPeak,
    nextDip,
    melatoninWindow: {
      start: medianSleepHour - 2,
      end: medianSleepHour,
    },
    wakeTime: medianWakeHour,
    sleepDebtPenalty: debtPenaltyPercent,
  };
}

// ==========================================
// CHRONOTYPE
// ==========================================

async function getChronotype(userId) {
  log("info", `Getting chronotype for user ${userId}`);

  const history = await sleepScienceRepository.getSleepHistory(userId, 30);

  if (history.length < 7) {
    return {
      success: false,
      error: "Insufficient data",
      message: `Only ${history.length} days available, need at least 7`,
    };
  }

  const wakeTimes = [];
  const sleepTimes = [];

  for (const entry of history) {
    const wh = getWakeHour(entry);
    const sh = getSleepHour(entry);
    if (wh !== null) wakeTimes.push(wh);
    if (sh !== null) sleepTimes.push(sh);
  }

  if (wakeTimes.length < 7) {
    return {
      success: false,
      error: "Insufficient timestamp data",
      message: "Need at least 7 days with wake timestamps",
    };
  }

  const medianWakeHour = median(wakeTimes);
  const medianSleepHour = sleepTimes.length > 0 ? median(sleepTimes) : null;

  // Classify
  let chronotype;
  if (medianWakeHour < CHRONOTYPE_BOUNDARIES.EARLY_BEFORE) {
    chronotype = "early";
  } else if (medianWakeHour > CHRONOTYPE_BOUNDARIES.LATE_AFTER) {
    chronotype = "late";
  } else {
    chronotype = "intermediate";
  }

  // Circadian markers
  const nadirHour = medianWakeHour - 2;
  const acrophaseHour = nadirHour + 12;
  const melatoninStart = medianSleepHour !== null ? medianSleepHour - 2 : null;

  // Confidence
  let confidence;
  if (wakeTimes.length >= 14) {
    confidence = "high";
  } else if (wakeTimes.length >= 10) {
    confidence = "medium";
  } else {
    confidence = "low";
  }

  // Format helpers
  const formatHour = (h) => {
    if (h === null) return null;
    const normalizedH = ((h % 24) + 24) % 24;
    const hours = Math.floor(normalizedH);
    const minutes = Math.round((normalizedH - hours) * 60);
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  };

  return {
    success: true,
    chronotype,
    averageWakeTime: formatHour(medianWakeHour),
    averageSleepTime: formatHour(medianSleepHour),
    circadianNadir: formatHour(nadirHour),
    circadianAcrophase: formatHour(acrophaseHour),
    melatoninWindowStart: formatHour(melatoninStart),
    melatoninWindowEnd: formatHour(medianSleepHour),
    basedOnDays: wakeTimes.length,
    confidence,
  };
}

// ==========================================
// DATA SUFFICIENCY CHECK
// ==========================================

async function checkDataSufficiency(userId) {
  log("info", `Checking data sufficiency for user ${userId}`);

  const history = await sleepScienceRepository.getSleepHistory(userId, 90);

  const entriesWithTimestamps = history.filter(
    (e) => e.sleepStartTimestampGMT && e.sleepEndTimestampGMT
  );

  // Classify to count workdays/freedays
  let workdayCount = 0;
  let freedayCount = 0;
  for (const entry of entriesWithTimestamps) {
    const dateStr = typeof entry.date === "string" ? entry.date : entry.date.toISOString().slice(0, 10);
    const dow = new Date(dateStr).getDay();
    if (dow === 0 || dow === 6) {
      freedayCount++;
    } else {
      workdayCount++;
    }
  }

  const sufficient =
    workdayCount >= MCTQ_CONFIG.minWorkdaysForCalculation &&
    freedayCount >= MCTQ_CONFIG.minFreedaysForCalculation;

  let projectedConfidence = "low";
  if (workdayCount >= 40 && freedayCount >= 16) {
    projectedConfidence = "high";
  } else if (workdayCount >= 20 && freedayCount >= 8) {
    projectedConfidence = "medium";
  }

  let recommendation;
  if (sufficient) {
    recommendation = "Sufficient data available for MCTQ calculation.";
  } else {
    const workdaysNeeded = Math.max(0, MCTQ_CONFIG.minWorkdaysForCalculation - workdayCount);
    const freedaysNeeded = Math.max(0, MCTQ_CONFIG.minFreedaysForCalculation - freedayCount);
    recommendation = `Need ${workdaysNeeded} more workdays and ${freedaysNeeded} more free days of data.`;
  }

  return {
    sufficient,
    totalDays: history.length,
    daysWithTimestamps: entriesWithTimestamps.length,
    workdaysAvailable: workdayCount,
    freedaysAvailable: freedayCount,
    workdaysNeeded: MCTQ_CONFIG.minWorkdaysForCalculation,
    freedaysNeeded: MCTQ_CONFIG.minFreedaysForCalculation,
    projectedConfidence,
    recommendation,
  };
}

module.exports = {
  calculateSleepDebt,
  calculateBaseline,
  getMCTQStats,
  getDailyNeed,
  getEnergyCurve,
  getChronotype,
  checkDataSufficiency,
};
