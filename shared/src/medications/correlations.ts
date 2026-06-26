export interface CorrelationDataPoint {
  date: string;
  xValue: number;
  yValue: number;
}

/**
 * Calculates Pearson Correlation Coefficient for two arrays of numbers.
 * Returns { r: number, confidence: number } where confidence is a rating based on sample size and |r|.
 */
export function calculatePearsonCorrelation(
  x: number[],
  y: number[],
): {
  r: number;
  confidence: number;
  strength: "none" | "weak" | "moderate" | "strong";
  n: number;
} {
  const n = x.length;
  // Require a minimum number of overlapping observations before reporting a correlation,
  // so a couple of stray data points can't masquerade as a real signal.
  const MIN_SAMPLE = 5;
  if (n < MIN_SAMPLE) {
    return { r: 0, confidence: 0, strength: "none", n };
  }

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  let sumY2 = 0;

  for (let i = 0; i < n; i++) {
    const xv = x[i];
    const yv = y[i];
    if (xv === undefined || yv === undefined) {
      continue;
    }
    sumX += xv;
    sumY += yv;
    sumXY += xv * yv;
    sumX2 += xv * xv;
    sumY2 += yv * yv;
  }

  const num = n * sumXY - sumX * sumY;
  const termX = Math.max(0, n * sumX2 - sumX * sumX);
  const termY = Math.max(0, n * sumY2 - sumY * sumY);
  const den = Math.sqrt(termX * termY);

  if (den === 0) {
    return { r: 0, confidence: 0, strength: "none", n };
  }

  const r = num / den;
  const absR = Math.abs(r);

  let strength: "none" | "weak" | "moderate" | "strong" = "none";
  if (absR >= 0.7) strength = "strong";
  else if (absR >= 0.4) strength = "moderate";
  else if (absR >= 0.1) strength = "weak";

  // Confidence is a function of number of data points and strength
  let confidence = Math.round(absR * 100);
  if (n < 5) {
    confidence = Math.round(confidence * 0.5); // Penalty for small sample size
  } else if (n > 15) {
    confidence = Math.min(100, Math.round(confidence * 1.2)); // Bonus for larger sample size
  }

  return { r, confidence, strength, n };
}

/**
 * Aligns daily water intake (from nutritionData or waterEntries) and constipation severity (from symptomEntries).
 */
export function getHydrationConstipationCorrelation(
  nutritionData: Array<{ date: string; water?: number | null }>,
  symptomEntries: Array<{
    entry_date: string;
    symptom_name_snapshot: string;
    severity: number;
  }>,
) {
  const waterMap: Record<string, number> = {};
  for (const day of nutritionData) {
    waterMap[day.date] = day.water || 0;
  }

  const constipationMap: Record<string, number> = {};
  for (const s of symptomEntries) {
    if (s.symptom_name_snapshot.toLowerCase().trim() === "constipation") {
      const dateStr = s.entry_date.split("T")[0];
      if (dateStr) {
        const current = constipationMap[dateStr] || 0;
        const severity = Number(s.severity) || 0;
        if (severity > current) {
          constipationMap[dateStr] = severity;
        }
      }
    }
  }

  const allDates = Array.from(
    new Set([...Object.keys(waterMap), ...Object.keys(constipationMap)]),
  ).sort();

  const x: number[] = [];
  const y: number[] = [];
  const points: CorrelationDataPoint[] = [];

  for (const date of allDates) {
    const w = waterMap[date] || 0;
    const c = constipationMap[date] || 0;
    if (w > 0) {
      x.push(w);
      y.push(c);
      points.push({ date, xValue: w, yValue: c });
    }
  }

  return {
    points,
    ...calculatePearsonCorrelation(x, y),
  };
}

/**
 * Aligns daily protein intake (from nutritionData) and nausea severity (from symptomEntries).
 */
export function getProteinNauseaCorrelation(
  nutritionData: Array<{ date: string; protein?: number | null }>,
  symptomEntries: Array<{
    entry_date: string;
    symptom_name_snapshot: string;
    severity: number;
  }>,
) {
  const proteinMap: Record<string, number> = {};
  for (const day of nutritionData) {
    proteinMap[day.date] = day.protein || 0;
  }

  const nauseaMap: Record<string, number> = {};
  for (const s of symptomEntries) {
    if (s.symptom_name_snapshot.toLowerCase().trim() === "nausea") {
      const dateStr = s.entry_date.split("T")[0];
      if (dateStr) {
        const current = nauseaMap[dateStr] || 0;
        const severity = Number(s.severity) || 0;
        if (severity > current) {
          nauseaMap[dateStr] = severity;
        }
      }
    }
  }

  const allDates = Array.from(
    new Set([...Object.keys(proteinMap), ...Object.keys(nauseaMap)]),
  ).sort();
  const x: number[] = [];
  const y: number[] = [];
  const points: CorrelationDataPoint[] = [];

  for (const date of allDates) {
    const p = proteinMap[date] || 0;
    const n = nauseaMap[date] || 0;
    if (p > 0) {
      x.push(p);
      y.push(n);
      points.push({ date, xValue: p, yValue: n });
    }
  }

  return {
    points,
    ...calculatePearsonCorrelation(x, y),
  };
}

/**
 * Aligns daily sleep duration (from sleepAnalyticsData or sleepEntries) and fatigue severity (from symptomEntries).
 */
export function getSleepFatigueCorrelation(
  sleepData: Array<{
    date: string;
    total_sleep_duration_hours?: number | null;
  }>,
  symptomEntries: Array<{
    entry_date: string;
    symptom_name_snapshot: string;
    severity: number;
  }>,
) {
  const sleepMap: Record<string, number> = {};
  for (const s of sleepData) {
    sleepMap[s.date] = s.total_sleep_duration_hours || 0;
  }

  const fatigueMap: Record<string, number> = {};
  for (const s of symptomEntries) {
    if (s.symptom_name_snapshot.toLowerCase().trim() === "fatigue") {
      const dateStr = s.entry_date.split("T")[0];
      if (dateStr) {
        const current = fatigueMap[dateStr] || 0;
        const severity = Number(s.severity) || 0;
        if (severity > current) {
          fatigueMap[dateStr] = severity;
        }
      }
    }
  }

  const allDates = Array.from(
    new Set([...Object.keys(sleepMap), ...Object.keys(fatigueMap)]),
  ).sort();
  const x: number[] = [];
  const y: number[] = [];
  const points: CorrelationDataPoint[] = [];

  for (const date of allDates) {
    const s = sleepMap[date] || 0;
    const f = fatigueMap[date] || 0;
    if (s > 0) {
      x.push(s);
      y.push(f);
      points.push({ date, xValue: s, yValue: f });
    }
  }

  return {
    points,
    ...calculatePearsonCorrelation(x, y),
  };
}

/**
 * Aligns dose amount (injection dose_mg or medication_entries dose_amount_snapshot) and symptom severity.
 */
export function getDoseSymptomCorrelation(
  medEntriesOrInjections: Array<{ date: string; dose: number }>,
  symptomEntries: Array<{
    entry_date: string;
    symptom_name_snapshot: string;
    severity: number;
  }>,
  symptomName: string,
) {
  const doseMap: Record<string, number> = {};
  for (const entry of medEntriesOrInjections) {
    doseMap[entry.date] = (doseMap[entry.date] || 0) + entry.dose;
  }

  const symMap: Record<string, number> = {};
  const targetSym = symptomName.toLowerCase().trim();
  for (const s of symptomEntries) {
    if (s.symptom_name_snapshot.toLowerCase().trim() === targetSym) {
      const dateStr = s.entry_date.split("T")[0];
      if (dateStr) {
        const current = symMap[dateStr] || 0;
        const severity = Number(s.severity) || 0;
        if (severity > current) {
          symMap[dateStr] = severity;
        }
      }
    }
  }

  const allDates = Array.from(
    new Set([...Object.keys(doseMap), ...Object.keys(symMap)]),
  ).sort();
  const x: number[] = [];
  const y: number[] = [];
  const points: CorrelationDataPoint[] = [];

  for (const date of allDates) {
    const d = doseMap[date] || 0;
    const s = symMap[date] || 0;
    if (d > 0 || s > 0) {
      x.push(d);
      y.push(s);
      points.push({ date, xValue: d, yValue: s });
    }
  }

  return {
    points,
    ...calculatePearsonCorrelation(x, y),
  };
}
