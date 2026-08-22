import type { SharedScheduleRule } from "./schedules.ts";

export const DAY_LABELS = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;

/** Minimal medication fields needed by the dose formatters. */
export interface MedicationDoseFields {
  dose_amount?: number | null;
  dose_unit?: string | null;
  strength_value?: number | null;
  strength_unit?: string | null;
  is_supplement?: boolean | null;
}

/**
 * Placeholders rather than real units. A supplement's quantity is a serving, so the form
 * stores a sentinel instead of asking for a unit it does not have. Supplements created
 * before the wording settled hold 'dose'; ones created since hold 'serving'.
 */
const SUPPLEMENT_UNIT_SENTINELS = new Set(["dose", "serving", "servings"]);

/**
 * The word to show after a supplement's amount.
 *
 * Normalises the legacy sentinel so a cabinet stocked before and after the rename does not
 * read "1 dose" beside "1 serving", and pluralises, since "2 serving" is not English.
 * A supplement carrying a REAL unit (one set through the API, say "5 ml") keeps it: only
 * the placeholders are rewritten.
 */
function supplementUnit(
  amount: number,
  unit: string | null | undefined,
): string | null {
  if (
    unit != null &&
    unit !== "" &&
    !SUPPLEMENT_UNIT_SENTINELS.has(unit.toLowerCase())
  ) {
    return unit;
  }
  return amount === 1 ? "serving" : "servings";
}

function joinAmountUnit(
  amount: number,
  unit: string | null | undefined,
  isSupplement?: boolean | null,
): string {
  const resolved = isSupplement ? supplementUnit(amount, unit) : unit;
  return resolved != null && resolved !== ""
    ? `${amount} ${resolved}`
    : `${amount}`;
}

/**
 * Formats the amount to take for a dose slot, e.g. "2 tablet" or "10 mg".
 *
 * Display precedence: the schedule's dose override (implicitly in the
 * medication's dose_unit) → the medication's default dose → its strength.
 * Returns null when none of those are set.
 */
export function formatDose(
  med: MedicationDoseFields,
  schedule?: Pick<SharedScheduleRule, "dose_amount"> | null,
): string | null {
  if (schedule != null && schedule.dose_amount != null) {
    return joinAmountUnit(
      schedule.dose_amount,
      med.dose_unit,
      med.is_supplement,
    );
  }
  if (med.dose_amount != null) {
    return joinAmountUnit(med.dose_amount, med.dose_unit, med.is_supplement);
  }
  if (med.strength_value != null) {
    return joinAmountUnit(med.strength_value, med.strength_unit);
  }
  return null;
}

/**
 * Secondary strength line shown under a dose, e.g. "500 mg per tablet".
 *
 * Returns null when there is no strength, when strength is already the
 * primary dose display (no default dose set), or when the dose merely
 * mirrors the strength (web-created rows) and repeating it would be noise.
 */
export function formatStrengthPerUnit(
  med: MedicationDoseFields,
): string | null {
  if (med.strength_value == null) return null;
  if (med.dose_amount == null) return null;
  const sameValue = med.dose_amount === med.strength_value;
  const sameUnit = (med.dose_unit ?? null) === (med.strength_unit ?? null);
  if (sameValue && sameUnit) return null;
  const strength = joinAmountUnit(med.strength_value, med.strength_unit);
  return med.dose_unit != null && med.dose_unit !== ""
    ? `${strength} per ${med.dose_unit}`
    : strength;
}

/** Formats an "HH:MM"(":SS") time-of-day string for display in the device locale. */
export function formatTimeOfDay(timeOfDay: string): string {
  const [h, m] = timeOfDay.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return timeOfDay;
  return new Date(2000, 0, 1, h, m).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Formats a schedule's meal-timing value ('before' | 'with' | 'after' | 'away_from_meals') for display. */
export function formatWithMeal(withMeal: string): string {
  if (withMeal === "before") return "Before meal";
  if (withMeal === "with") return "With meal";
  if (withMeal === "after") return "After meal";
  if (withMeal === "away_from_meals") return "Away from meals";
  return withMeal;
}

/**
 * Human-readable frequency summary for a schedule, e.g. "Daily at 8:00 AM",
 * "Mon, Wed, Fri at 9:00 PM", "Every 3 days", or "As needed".
 */
export function describeSchedule(
  schedule: Pick<
    SharedScheduleRule,
    | "schedule_type_id"
    | "time_of_day"
    | "days_of_week"
    | "interval_days"
    | "day_of_month"
    | "cycle_on_days"
    | "cycle_off_days"
  >,
): string {
  const frequency = describeFrequency(schedule);
  if (
    schedule.schedule_type_id !== "prn" &&
    schedule.time_of_day != null &&
    schedule.time_of_day !== ""
  ) {
    return `${frequency} at ${formatTimeOfDay(schedule.time_of_day)}`;
  }
  return frequency;
}

/**
 * One-line regimen summary across a medication's schedules, e.g.
 * "Daily at 8:00 AM & 8:00 PM" or "Daily at 8:00 AM; As needed".
 *
 * Schedules with the same frequency are merged with their times joined;
 * distinct frequencies are separated with "; ". Inactive schedules are
 * ignored. No schedules at all means the medication is taken as needed.
 */
export function describeSchedules(
  schedules: Array<
    Pick<
      SharedScheduleRule,
      | "schedule_type_id"
      | "time_of_day"
      | "days_of_week"
      | "interval_days"
      | "day_of_month"
      | "cycle_on_days"
      | "cycle_off_days"
      | "active"
    >
  >,
): string {
  if (schedules.length === 0) return "As needed";
  const activeSchedules = schedules.filter((s) => s.active !== false);
  if (activeSchedules.length === 0) return "";
  const timesByFrequency = new Map<string, string[]>();
  for (const schedule of activeSchedules) {
    const frequency = describeFrequency(schedule);
    const times = timesByFrequency.get(frequency) ?? [];
    if (
      schedule.schedule_type_id !== "prn" &&
      schedule.time_of_day != null &&
      schedule.time_of_day !== ""
    ) {
      times.push(schedule.time_of_day);
    }
    timesByFrequency.set(frequency, times);
  }
  return [...timesByFrequency.entries()]
    .map(([frequency, times]) => {
      if (times.length === 0) return frequency;
      const formatted = [...times].sort().map(formatTimeOfDay);
      return `${frequency} at ${formatted.join(" & ")}`;
    })
    .join("; ");
}

function describeFrequency(
  schedule: Pick<
    SharedScheduleRule,
    | "schedule_type_id"
    | "days_of_week"
    | "interval_days"
    | "day_of_month"
    | "cycle_on_days"
    | "cycle_off_days"
  >,
): string {
  const type = schedule.schedule_type_id;
  if (type === "daily") return "Daily";
  if (type === "weekly" || type === "specific_days") {
    if (schedule.days_of_week == null || schedule.days_of_week.length === 0)
      return "Weekly";
    return [...schedule.days_of_week]
      .sort((a, b) => a - b)
      .map((d) => DAY_LABELS[d])
      .filter((label) => label != null)
      .join(", ");
  }
  if (
    type === "every_n_days" &&
    schedule.interval_days != null &&
    schedule.interval_days > 0
  ) {
    return schedule.interval_days === 1
      ? "Daily"
      : `Every ${schedule.interval_days} days`;
  }
  if (type === "monthly") {
    return schedule.day_of_month != null
      ? `Monthly on day ${schedule.day_of_month}`
      : "Monthly";
  }
  if (
    type === "cyclic" &&
    schedule.cycle_on_days != null &&
    schedule.cycle_on_days > 0
  ) {
    return `${schedule.cycle_on_days} days on, ${schedule.cycle_off_days ?? 0} days off`;
  }
  if (type === "prn") return "As needed";
  if (type === "taper") return "Taper";
  const words = type.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
