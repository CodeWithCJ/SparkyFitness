import { addDays } from '../utils/timezone.ts';
import type { MedicationEntryStatus } from './contracts.ts';
import { getDueDosesForDate, type SharedMedication } from './schedules.ts';

// Adherence, streak and month-calendar logic shared by the web Medications page and the
// mobile adherence screens. Everything here is pure: callers pass medications, entries and
// a timezone, and render the result with their own components and colours.

/** The slice of a logged entry the adherence rules read. */
export interface AdherenceEntry {
  medication_id: string;
  schedule_id: string | null;
  status: MedicationEntryStatus;
  /** Calendar day, 'YYYY-MM-DD' (a date-time string is tolerated and cut to its day). */
  entry_date: string;
  /** 'injection' rows are GLP-1 injection logs merged into the entries feed. */
  entry_type?: 'entry' | 'injection';
}

const entryDay = (entry: { entry_date: string }): string =>
  entry.entry_date.slice(0, 10);

/**
 * True when a logged entry belongs to a scheduled due dose slot.
 *
 * Entries logged without schedule attribution (e.g. via API or iOS Shortcuts)
 * count for any of the medication's scheduled doses, except PRN logs, which
 * never cover a scheduled slot.
 */
export function entryMatchesDue(
  entry: AdherenceEntry,
  due: { medication: { id: string }; schedule: { id: string } }
): boolean {
  if (entry.status === 'prn_taken') return false;

  return (
    entry.schedule_id === due.schedule.id ||
    (entry.entry_type === 'injection' &&
      entry.medication_id === due.medication.id) ||
    (entry.medication_id === due.medication.id && !entry.schedule_id)
  );
}

// --- Today's checklist ------------------------------------------------------

export interface ChecklistProgress {
  completed: number;
  total: number;
  /** 0-100. A day with nothing due reads as complete. */
  pct: number;
}

/** How many of a day's due doses have been taken or skipped. */
export function computeChecklistProgress(
  dueDoses: { medication: { id: string }; schedule: { id: string } }[],
  entries: AdherenceEntry[]
): ChecklistProgress {
  const completed = dueDoses.filter((due) =>
    entries.some(
      (e) =>
        entryMatchesDue(e, due) &&
        (e.status === 'taken' || e.status === 'skipped')
    )
  ).length;
  const total = dueDoses.length;
  return {
    completed,
    total,
    pct: total > 0 ? Math.round((completed / total) * 100) : 100,
  };
}

// --- Rolling adherence ------------------------------------------------------

export interface AdherenceDay {
  date: string;
  /** Scheduled doses due that day. */
  due: number;
  /** Scheduled doses that were taken. */
  taken: number;
  /** As-needed doses logged that day. */
  prnTaken: number;
  /** Completion 0-100 including as-needed doses; -1 when nothing was due or logged. */
  pct: number;
}

export interface AdherenceSummary {
  /** Doses expected across the window (a PRN-only day counts as one). */
  due: number;
  taken: number;
  /** Days where everything due was taken (or an as-needed dose was logged). */
  perfectDays: number;
  /** Oldest first, ending on `endDate`. */
  days: AdherenceDay[];
  /** Consecutive perfect days ending today (or yesterday while today is still open). */
  streak: number;
  /** 0-100 over the whole window. */
  pct: number;
}

export interface ComputeAdherenceInput<M extends SharedMedication> {
  medications: M[];
  entries: AdherenceEntry[];
  /** Last day of the window, 'YYYY-MM-DD'. */
  endDate: string;
  timezone: string;
  /** Window length in days. Defaults to 14. */
  windowDays?: number;
}

export const DEFAULT_ADHERENCE_WINDOW_DAYS = 14;

/**
 * Scores each day's scheduled doses against what was taken, over a window ending on
 * `endDate`. Logged as-needed doses top a day up (capped at the due count) and make a
 * day with nothing scheduled count as perfect. A skipped dose never counts as taken, and
 * any skip on a day breaks the streak.
 */
export function computeAdherence<M extends SharedMedication>({
  medications,
  entries,
  endDate,
  timezone,
  windowDays = DEFAULT_ADHERENCE_WINDOW_DAYS,
}: ComputeAdherenceInput<M>): AdherenceSummary {
  let due = 0;
  let taken = 0;
  let perfectDays = 0;
  const days: AdherenceDay[] = [];

  for (let i = windowDays - 1; i >= 0; i--) {
    const date = addDays(endDate, -i);
    const dayDue = getDueDosesForDate(medications, date, timezone);
    const dayEntries = entries.filter((e) => entryDay(e) === date);

    let dayTaken = 0;
    for (const dose of dayDue) {
      if (
        dayEntries.some(
          (e) =>
            entryMatchesDue(e, dose) &&
            (e.status === 'taken' || e.status === 'prn_taken')
        )
      ) {
        dayTaken++;
      }
    }
    const prnTaken = dayEntries.filter((e) => e.status === 'prn_taken').length;
    // Scheduled taken + as-needed activity, capped at what was due.
    const effectiveTaken =
      dayDue.length > 0
        ? Math.min(dayDue.length, dayTaken + prnTaken)
        : prnTaken;
    const pct =
      dayDue.length > 0
        ? Math.round((effectiveTaken / dayDue.length) * 100)
        : prnTaken > 0
          ? 100
          : -1;

    days.push({ date, due: dayDue.length, taken: dayTaken, prnTaken, pct });

    if (dayDue.length > 0) {
      due += dayDue.length;
      taken += effectiveTaken;
      if (effectiveTaken >= dayDue.length) perfectDays++;
    } else if (prnTaken > 0) {
      due += 1;
      taken += 1;
      perfectDays++;
    }
  }

  const hasSkips = (date: string): boolean =>
    entries.some((e) => entryDay(e) === date && e.status === 'skipped');

  // Walk back from the newest day. Today does not break the streak while it is still open
  // (incomplete and nothing skipped), so the walk starts from yesterday in that case.
  let streak = 0;
  let startIndex = days.length - 1;
  const latest = days[startIndex];
  if (latest) {
    const latestComplete =
      latest.due > 0 ? latest.taken === latest.due : latest.prnTaken > 0;
    if (!latestComplete && !hasSkips(latest.date)) startIndex -= 1;
  }
  for (let k = startIndex; k >= 0; k--) {
    const day = days[k];
    if (!day) continue;
    if (day.due > 0) {
      if (day.taken === day.due && !hasSkips(day.date)) streak++;
      else break;
    } else if (day.prnTaken > 0) {
      if (!hasSkips(day.date)) streak++;
      else break;
    }
  }

  return {
    due,
    taken,
    perfectDays,
    days,
    streak,
    pct: due > 0 ? Math.round((taken / due) * 100) : 100,
  };
}

export type AdherenceTier = 'good' | 'fair' | 'poor';

/** Ring colour band for an adherence percentage. */
export function adherenceTier(pct: number): AdherenceTier {
  if (pct >= 90) return 'good';
  if (pct >= 70) return 'fair';
  return 'poor';
}

export type AdherenceBarLevel = 'idle' | 'full' | 'partial' | 'low' | 'missed';

export interface AdherenceBar {
  level: AdherenceBarLevel;
  /** Bar height as a percentage of the strip, 0-100. */
  heightPct: number;
}

/** Colour level and height of one day's bar in the rolling adherence strip. */
export function adherenceBar(day: AdherenceDay): AdherenceBar {
  const noScheduled = day.due === 0;
  const hasPrn = day.prnTaken > 0;
  if (noScheduled && !hasPrn) return { level: 'idle', heightPct: 18 };

  const level: AdherenceBarLevel =
    day.pct === 100
      ? 'full'
      : day.pct >= 50
        ? 'partial'
        : day.pct > 0
          ? 'low'
          : 'missed';
  const heightPct =
    noScheduled && hasPrn
      ? Math.min(100, 40 + day.prnTaken * 20)
      : Math.max(14, day.pct);
  return { level, heightPct };
}

// --- Month log calendar -------------------------------------------------------

export interface DayDoseCounts {
  taken: number;
  prn: number;
  skipped: number;
  snoozed: number;
}

export interface EntryTallyOptions {
  /** Only count this medication's entries. Takes precedence over `include`. */
  medicationId?: string | null;
  /** Keeps an entry when it returns true; used to honour a meds/supplements filter. */
  include?: (medicationId: string) => boolean;
}

/** Counts logged doses per calendar day. */
export function tallyEntriesByDay(
  entries: AdherenceEntry[],
  { medicationId, include }: EntryTallyOptions = {}
): Record<string, DayDoseCounts> {
  const byDay: Record<string, DayDoseCounts> = {};
  for (const e of entries) {
    if (medicationId) {
      if (e.medication_id !== medicationId) continue;
    } else if (include && !include(e.medication_id)) {
      continue;
    }
    const day = entryDay(e);
    if (!day) continue;
    const counts = (byDay[day] ??= {
      taken: 0,
      prn: 0,
      skipped: 0,
      snoozed: 0,
    });
    if (e.status === 'taken') counts.taken++;
    else if (e.status === 'prn_taken') counts.prn++;
    else if (e.status === 'skipped') counts.skipped++;
    else if (e.status === 'snoozed') counts.snoozed++;
  }
  return byDay;
}

/** Doses taken (scheduled + as needed) in the given 'YYYY-MM' month. */
export function monthDoseTotal(
  byDay: Record<string, DayDoseCounts>,
  month: string
): number {
  return Object.entries(byDay).reduce(
    (sum, [day, counts]) =>
      day.slice(0, 7) === month ? sum + counts.taken + counts.prn : sum,
    0
  );
}

export type DayLogStatus =
  'all_taken' | 'partial' | 'mostly_skipped' | 'all_skipped' | 'snoozed_only';

/**
 * Colours a day by completion ratio (taken + as-needed vs skipped), not by a single
 * dominant status, so two taken and one skipped reads as partial rather than taken.
 */
export function dayLogStatus(counts: DayDoseCounts): DayLogStatus | null {
  const active = counts.taken + counts.prn;
  const total = active + counts.skipped;
  if (total === 0) return counts.snoozed > 0 ? 'snoozed_only' : null;

  const pct = (active / total) * 100;
  if (pct === 100) return 'all_taken';
  if (pct >= 50) return 'partial';
  if (pct > 0) return 'mostly_skipped';
  return 'all_skipped';
}

/** The dose count a day shows on its badge. */
export function dayDoseTotal(counts: DayDoseCounts): number {
  return counts.taken + counts.prn;
}

/** The slice of a symptom entry the calendar markers read. */
export interface CalendarSymptom {
  entry_date: string;
  medication_id?: string | null;
  symptom_name_snapshot: string;
  /** 'cycle' marks reproductive-health symptoms from the cycle hub. */
  source?: string | null;
}

export interface DaySymptomInfo {
  /** A symptom linked to the medication in view. */
  sideEffect: boolean;
  general: boolean;
  /** De-duplicated symptom names, for a day's summary. */
  names: string[];
}

/**
 * Marks days that have symptoms. With no `medicationId` any medication-linked symptom is
 * a side effect; with one, only symptoms linked to it are. A symptom linked to a
 * medication that `include` rejects is dropped outright, since reclassifying it as
 * general would keep it on a calendar meant to exclude it. Cycle-hub symptoms are
 * reproductive-health data and never appear on a medication calendar.
 */
export function tallySymptomsByDay(
  symptoms: CalendarSymptom[],
  { medicationId, include }: EntryTallyOptions = {}
): Record<string, DaySymptomInfo> {
  const byDay: Record<string, DaySymptomInfo> = {};
  for (const s of symptoms) {
    const day = entryDay(s);
    if (!day) continue;
    if (s.source === 'cycle') continue;
    if (s.medication_id && include && !include(s.medication_id)) continue;

    const info = (byDay[day] ??= {
      sideEffect: false,
      general: false,
      names: [],
    });
    const isSideEffect = medicationId
      ? s.medication_id === medicationId
      : !!s.medication_id;
    if (isSideEffect) info.sideEffect = true;
    else info.general = true;
    if (!info.names.includes(s.symptom_name_snapshot)) {
      info.names.push(s.symptom_name_snapshot);
    }
  }
  return byDay;
}
