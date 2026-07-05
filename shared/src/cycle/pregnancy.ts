// Pure pregnancy logic for the Cycle hub: gestational age, due-date math,
// contraction analysis (5-1-1), and IOM weight-gain ranges. All day math is on
// YYYY-MM-DD strings via the shared timezone helpers. Content tables (baby
// development, checklist, food/med safety) live in ./pregnancyContent.ts.

import { addDays, compareDays, daysBetween } from "../utils/timezone.ts";

export type PregnancyDueDateBasis = "lmp" | "conception" | "manual" | "scan";
export type PregnancyStatus = "active" | "completed" | "ended";

export interface SharedPregnancy {
  id?: string;
  user_id?: string;
  due_date: string;
  due_date_basis: PregnancyDueDateBasis;
  lmp_date?: string | null;
  conception_date?: string | null;
  fetus_count: number;
  status: PregnancyStatus;
  ended_on?: string | null;
  outcome?: string | null;
  prenatal_medication_id?: string | null;
  supplement_medication_id?: string | null;
  notes?: string | null;
}

export interface SharedKickSession {
  id?: string;
  user_id?: string;
  pregnancy_id: string;
  started_at: string;
  ended_at?: string | null;
  kick_count: number;
  kick_times: string[];
}

export interface SharedContraction {
  id?: string;
  user_id?: string;
  pregnancy_id: string;
  started_at: string;
  ended_at?: string | null;
  intensity?: number | null;
}

export type Trimester = 1 | 2 | 3;

export interface GestationalAge {
  week: number; // completed weeks (0-42)
  day: number; // 0-6 into the current week
  totalDays: number;
  trimester: Trimester;
  daysRemaining: number;
  progress: number; // 0-1 across the full 280-day term
}

const TERM_DAYS = 280; // 40 weeks from LMP

/** EDD (due date) from last menstrual period: LMP + 280 days (Naegele). */
export function eddFromLmp(lmp: string): string {
  return addDays(lmp, TERM_DAYS);
}

/** EDD from conception/ovulation date: conception + 266 days. */
export function eddFromConception(conception: string): string {
  return addDays(conception, 266);
}

/**
 * Gestational age on `onDay` given the due date. Weeks are counted from the
 * conceptual LMP (dueDate - 280d), matching how clinicians and apps report it.
 */
export function gestationalAge(dueDate: string, onDay: string): GestationalAge {
  const lmp = addDays(dueDate, -TERM_DAYS);
  const totalDays = Math.max(0, daysBetween(lmp, onDay));
  const week = Math.floor(totalDays / 7);
  const day = totalDays % 7;
  const daysRemaining = daysBetween(onDay, dueDate);
  const trimester: Trimester = week < 13 ? 1 : week < 27 ? 2 : 3;
  return {
    week,
    day,
    totalDays,
    trimester,
    daysRemaining,
    progress: Math.min(1, Math.max(0, totalDays / TERM_DAYS)),
  };
}

export interface ContractionStats {
  count: number;
  avgDurationSec: number | null;
  avgIntervalMin: number | null;
  isFiveOneOne: boolean;
}

/**
 * Analyzes recent contractions for the classic 5-1-1 pattern:
 * ~5 min apart, each ~1 min long, sustained for ~1 hour. Contractions are
 * expected sorted oldest→newest; only the last hour is considered.
 */
export function contractionStats(
  contractions: SharedContraction[],
  nowMs: number = Date.now(),
): ContractionStats {
  const recent = contractions
    .filter((c) => c.ended_at)
    .filter((c) => nowMs - new Date(c.started_at).getTime() <= 65 * 60 * 1000)
    .sort(
      (a, b) =>
        new Date(a.started_at).getTime() - new Date(b.started_at).getTime(),
    );

  if (recent.length === 0) {
    return { count: 0, avgDurationSec: null, avgIntervalMin: null, isFiveOneOne: false };
  }

  const durations = recent.map(
    (c) =>
      (new Date(c.ended_at!).getTime() - new Date(c.started_at).getTime()) /
      1000,
  );
  const avgDurationSec =
    durations.reduce((a, b) => a + b, 0) / durations.length;

  const intervals: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    intervals.push(
      (new Date(recent[i]!.started_at).getTime() -
        new Date(recent[i - 1]!.started_at).getTime()) /
        60000,
    );
  }
  const avgIntervalMin =
    intervals.length > 0
      ? intervals.reduce((a, b) => a + b, 0) / intervals.length
      : null;

  // 5-1-1: intervals ~<=5 min, durations ~>=60s, spanning ~>=1 hour.
  const spanMin =
    (new Date(recent[recent.length - 1]!.started_at).getTime() -
      new Date(recent[0]!.started_at).getTime()) /
    60000;
  const isFiveOneOne =
    recent.length >= 6 &&
    avgIntervalMin != null &&
    avgIntervalMin <= 5.5 &&
    avgDurationSec >= 45 &&
    spanMin >= 50;

  return {
    count: recent.length,
    avgDurationSec: Math.round(avgDurationSec),
    avgIntervalMin: avgIntervalMin != null ? Math.round(avgIntervalMin * 10) / 10 : null,
    isFiveOneOne,
  };
}

export interface WeightGainRange {
  lowKg: number;
  highKg: number;
  category: "underweight" | "normal" | "overweight" | "obese";
}

/**
 * IOM cumulative recommended weight-gain range (kg) by pre-pregnancy BMI and
 * gestational week. Twins widen the range. Returns null before week 1.
 */
export function weightGainRange(
  prePregnancyBmi: number,
  week: number,
  fetusCount = 1,
): WeightGainRange | null {
  if (week < 1) return null;
  const w = Math.min(week, 40);

  // Total-term targets (singleton) per IOM.
  let category: WeightGainRange["category"];
  let totalLow: number;
  let totalHigh: number;
  if (prePregnancyBmi < 18.5) {
    category = "underweight";
    totalLow = 12.5;
    totalHigh = 18;
  } else if (prePregnancyBmi < 25) {
    category = "normal";
    totalLow = 11.5;
    totalHigh = 16;
  } else if (prePregnancyBmi < 30) {
    category = "overweight";
    totalLow = 7;
    totalHigh = 11.5;
  } else {
    category = "obese";
    totalLow = 5;
    totalHigh = 9;
  }

  if (fetusCount >= 2) {
    // IOM twin guidance (normal/overweight/obese; underweight extrapolated).
    totalLow = category === "obese" ? 11 : category === "overweight" ? 14 : 17;
    totalHigh = category === "obese" ? 19 : category === "overweight" ? 23 : 25;
  }

  // ~2 kg in T1, then linear to term.
  const t1 = 2;
  const frac = w <= 13 ? (w / 13) * (t1 / totalLow) : (w - 13) / (40 - 13);
  const lowKg =
    w <= 13 ? (w / 13) * t1 : t1 + (totalLow - t1) * ((w - 13) / (40 - 13));
  const highKg =
    w <= 13
      ? (w / 13) * (t1 * 1.3)
      : t1 * 1.3 + (totalHigh - t1 * 1.3) * ((w - 13) / (40 - 13));
  void frac;

  return {
    lowKg: Math.round(lowKg * 10) / 10,
    highKg: Math.round(highKg * 10) / 10,
    category,
  };
}

export function isPregnancyActive(p: { status: PregnancyStatus }): boolean {
  return p.status === "active";
}

/** Whether `day` falls within the pregnancy term window (for calendar overlays). */
export function isWithinTerm(dueDate: string, day: string): boolean {
  const lmp = addDays(dueDate, -TERM_DAYS);
  return compareDays(day, lmp) >= 0 && compareDays(day, dueDate) <= 0;
}

export const PREGNANCY_SYMPTOMS = [
  { name: "nausea", displayName: "Nausea", category: "digestion", icon: "symptom-nausea", color: "green" },
  { name: "heartburn", displayName: "Heartburn", category: "digestion", icon: "symptom-nausea", color: "green" },
  { name: "swelling", displayName: "Swelling", category: "pain", icon: "symptom-cramps", color: "period" },
  { name: "back_pain", displayName: "Back pain", category: "pain", icon: "symptom-cramps", color: "period" },
  { name: "braxton_hicks", displayName: "Braxton-Hicks", category: "pain", icon: "symptom-cramps", color: "period" },
  { name: "fatigue", displayName: "Fatigue", category: "mental", icon: "symptom-fatigue", color: "amber" },
  { name: "headache", displayName: "Headache", category: "mental", icon: "symptom-headache", color: "lavender" },
  { name: "cravings", displayName: "Cravings", category: "digestion", icon: "symptom-nausea", color: "green" },
  { name: "insomnia", displayName: "Insomnia", category: "mental", icon: "symptom-fatigue", color: "amber" },
  { name: "constipation", displayName: "Constipation", category: "digestion", icon: "symptom-nausea", color: "green" },
] as const;

export const APPOINTMENT_TYPES = [
  { value: "checkup", displayName: "Prenatal checkup" },
  { value: "ultrasound", displayName: "Ultrasound / scan" },
  { value: "glucose_test", displayName: "Glucose screening" },
  { value: "bloodwork", displayName: "Bloodwork" },
  { value: "specialist", displayName: "Specialist" },
  { value: "class", displayName: "Birth / parenting class" },
  { value: "other", displayName: "Other" },
] as const;
