export interface SharedSymptomEntry {
  id: string;
  user_id: string;
  medication_id?: string | null;
  symptom_id?: string | null;
  symptom_name_snapshot: string;
  severity: number;
  severity_label?: string | null;
  logged_at: string;
  entry_date: string;
  body_location?: string | null;
  context_text?: string | null;
  bristol_type?: number | null;
}

export interface SharedUserCustomSymptom {
  id: string;
  user_id: string;
  name: string;
  display_name: string | null;
  scale_type: "1-10" | "none-severe" | "count" | "text";
  unit?: string | null;
  is_glp1_flagged: boolean;
}

export const BUILT_IN_SYMPTOMS = [
  { name: "nausea", displayName: "Nausea", isGlp1: true },
  { name: "fatigue", displayName: "Fatigue", isGlp1: true },
  { name: "headache", displayName: "Headache", isGlp1: false },
  { name: "constipation", displayName: "Constipation", isGlp1: true },
  { name: "diarrhea", displayName: "Diarrhea", isGlp1: true },
  { name: "vomiting", displayName: "Vomiting", isGlp1: true },
  { name: "acid_reflux", displayName: "Acid Reflux / GERD", isGlp1: true },
  {
    name: "stomach_pain",
    displayName: "Stomach Pain / Cramping",
    isGlp1: true,
  },
  { name: "dizziness", displayName: "Dizziness", isGlp1: false },
];

/**
 * Correlates logged symptom entries with the most recent GLP-1 injection entry.
 * Generates descriptive pattern hints based on hours-elapsed logic.
 */
export function getSymptomPatternHints(
  injections: Array<{
    injected_at: string;
    dose_mg?: number | null;
    medication_name?: string;
  }>,
  symptoms: Array<{
    logged_at: string;
    severity: number;
    symptom_name_snapshot: string;
  }>,
): Array<{
  symptomName: string;
  message: string;
  severityLevel: "low" | "medium" | "high";
  sampleSize: number;
}> {
  const hints: Array<{
    symptomName: string;
    message: string;
    severityLevel: "low" | "medium" | "high";
    sampleSize: number;
  }> = [];
  if (injections.length < 2 || symptoms.length === 0) return hints;

  // Minimum logs of a symptom before we'll surface a hint (avoids 1-2-log noise).
  const MIN_OCCURRENCES = 4;
  const POST_DOSE_WINDOW_H = 48;
  const HOUR_MS = 3600 * 1000;

  // Group symptoms by name
  const symptomsByName: Record<string, typeof symptoms> = {};
  for (const s of symptoms) {
    const key = s.symptom_name_snapshot.toLowerCase().trim();
    if (!symptomsByName[key]) {
      symptomsByName[key] = [];
    }
    symptomsByName[key].push(s);
  }

  // Build the post-dose window: union of [injection, injection + 48h], clipped to the
  // observation period, so we can compare how often a symptom occurs in that window vs. baseline.
  const injTimes = injections
    .map((i) => new Date(i.injected_at).getTime())
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => a - b);
  if (injTimes.length < 2) return hints;

  const symTimes = symptoms
    .map((s) => new Date(s.logged_at).getTime())
    .filter((t) => !Number.isNaN(t));
  const obsStart = Math.min(injTimes[0]!, ...symTimes);
  const obsEnd = Math.max(injTimes[injTimes.length - 1]!, ...symTimes);
  const obsHours = Math.max(1, (obsEnd - obsStart) / HOUR_MS);

  // Merge overlapping post-dose windows.
  const merged: Array<[number, number]> = [];
  for (const t of injTimes) {
    const start = Math.max(t, obsStart);
    const end = Math.min(t + POST_DOSE_WINDOW_H * HOUR_MS, obsEnd);
    if (end <= start) continue;
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  const postHours = merged.reduce((sum, [s, e]) => sum + (e - s) / HOUR_MS, 0);
  const baselineHours = Math.max(1, obsHours - postHours);
  const inWindow = (t: number) => merged.some(([s, e]) => t >= s && t <= e);

  for (const [name, list] of Object.entries(symptomsByName)) {
    const total = list.length;
    if (total < MIN_OCCURRENCES) continue; // not enough data to be meaningful

    let postCount = 0;
    let onsetSum = 0;
    let onsetCount = 0;
    for (const s of list) {
      const t = new Date(s.logged_at).getTime();
      if (Number.isNaN(t) || !inWindow(t)) continue;
      postCount++;
      // nearest preceding injection (for the "avg onset" detail)
      let nearest = -1;
      for (const it of injTimes) {
        if (it <= t && t - it <= POST_DOSE_WINDOW_H * HOUR_MS) nearest = it;
      }
      if (nearest > 0) {
        onsetSum += (t - nearest) / HOUR_MS;
        onsetCount++;
      }
    }

    const baseCount = total - postCount;
    const postRate = postCount / postHours; // events per hour inside the window
    const baseRate = baseCount / baselineHours; // events per hour outside it
    const displayName =
      name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, " ");
    const avgOnset = onsetCount > 0 ? Math.round(onsetSum / onsetCount) : null;
    const onsetTxt = avgOnset != null ? ` (avg onset ${avgOnset}h)` : "";

    let message = "";
    let severityLevel: "low" | "medium" | "high" = "low";

    if (baseRate <= 0 && postCount > 0) {
      message = `${displayName} only shows up after your dose${onsetTxt} — ${postCount} of ${total} logs. N=${total}.`;
      severityLevel = "medium";
    } else if (baseRate > 0) {
      const ratio = postRate / baseRate;
      if (ratio >= 1.3) {
        message = `${displayName} is ${ratio.toFixed(1)}× more frequent in the ${POST_DOSE_WINDOW_H}h after your dose${onsetTxt}. N=${total}.`;
        severityLevel = ratio >= 2 ? "high" : "medium";
      } else if (ratio <= 0.7) {
        message = `${displayName} is actually less frequent right after your dose (${ratio.toFixed(1)}×). N=${total}.`;
        severityLevel = "low";
      } else {
        continue; // no meaningful link — don't add noise
      }
    } else {
      continue;
    }

    const avgSeverity =
      list.reduce((sum, s) => sum + s.severity, 0) / list.length;
    if (avgSeverity >= 7 && severityLevel !== "low") severityLevel = "high";

    hints.push({
      symptomName: name,
      message,
      severityLevel,
      sampleSize: total,
    });
  }

  return hints;
}
