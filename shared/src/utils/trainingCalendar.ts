import {
  LOAD_SPORT_GROUPS,
  type CalendarWeekTotals,
  type CompletedItem,
  type LoadBySport,
  type LoadSportGroup,
  type PlannedItem,
  type PlannedStatus,
  type SportLoad,
} from '../schemas/api/TrainingCalendar.api.zod.ts';
import type { ActivitySport } from './activitySport.ts';
import { projectRuns, type ProgramSchedule } from './runProgramSchedule.ts';
import { addDays, compareDays, dayOfWeek, daysBetween } from './timezone.ts';
import { weekStartOf } from './trainingConsistency.ts';
import { FALLBACK_MAX_HR, percentMaxFloors } from './heartRateZones.ts';
import { sessionLoad } from './trainingLoad.ts';

/**
 * Planned against completed work. What was PLANNED comes from the run program
 * and the scheduled workout plans; what was DONE is the diary's exercise
 * entries. Load is the one model of the training-load report
 * (`sessionLoad`): minutes weighted by average heart rate, or by the moderate
 * weight when there is none. There is no second formula here.
 */

/** A planned item counts as done from this share of its planned minutes. */
export const DONE_SHARE = 0.8;
/** Most future workouts projected. */
const MAX_PROJECTED = 200;
/** How many days apart a diary entry and the day it was planned for may be. */
export const MATCH_WINDOW_DAYS = 3;

/**
 * Ceilings on what the calendar builds from user-owned plans, so one oversized
 * plan cannot make a request expensive: plans read, assignments read per plan,
 * distinct sessions per weekday, and weekly-plan slots emitted per request.
 */
export const MAX_CALENDAR_PLANS = 50;
export const MAX_PLAN_ASSIGNMENTS = 500;
const MAX_SESSIONS_PER_DAY = 20;
const MAX_PLAN_SLOTS = 3000;

/** Days before the range the past run-day walk starts, so earlier completions still claim their run days. */
const PAST_WALK_MARGIN_DAYS = 14;

/** Folds the full sport taxonomy into the groups load is split by. */
export function loadSportGroup(sport: ActivitySport): LoadSportGroup {
  switch (sport) {
    case 'running':
      return 'running';
    case 'cycling':
      return 'cycling';
    case 'walking':
    case 'hiking':
      return 'walking';
    case 'swimming':
    case 'rowing':
    case 'fitness_equipment':
      return 'cardio';
    case 'strength':
      return 'strength';
    default:
      return 'other';
  }
}

/** A finished diary entry, as far as the calendar is concerned. */
export interface CalendarEntry {
  id: string;
  /** The person's local day, YYYY-MM-DD. */
  day: string;
  name: string | null;
  sport: LoadSportGroup;
  durationMinutes: number;
  distanceKm: number | null;
  avgHeartRate: number | null;
  /**
   * What the entry was logged as part of: `runProgram:<workout index>` or
   * `plan:<assignment id>`; null for a free entry.
   */
  linkKey: string | null;
  /** Further links when several logged exercises were merged into one workout. */
  alsoLinked?: string[];
  /**
   * Training load worked out before several exercises were merged into this
   * entry (the sum of each exercise's own load). When absent the load comes
   * from the entry's duration and average heart rate.
   */
  load?: number;
}

/** Shortest entry that counts as a workout session, in minutes. */
export const MIN_SESSION_MINUTES = 1;
/** A day-long entry is a device rollup, not one session. */
export const MAX_SESSION_MINUTES = 24 * 60;

const PASSIVE_NAME =
  /^\s*((daily\s+)?steps?(\s+count)?|step\s+count|floors?\s+climbed|active\s+minutes|(active|total|basal|resting)\s+(calories|energy)(\s+burned)?)\s*$/i;

/**
 * A diary row that is not a workout session: a device's daily summary such as
 * "Active Calories" or imported steps, an entry with no real length, or a
 * day-long rollup. These never count as completed work or as extras.
 */
export function isPassiveEntry(
  entry: Pick<CalendarEntry, 'name' | 'durationMinutes'>
): boolean {
  if (entry.name && PASSIVE_NAME.test(entry.name)) return true;
  return (
    !Number.isFinite(entry.durationMinutes) ||
    entry.durationMinutes < MIN_SESSION_MINUTES ||
    entry.durationMinutes >= MAX_SESSION_MINUTES
  );
}

/** Every link an entry carries: its own plus the ones merged into it. */
export const calendarEntryLinks = (
  entry: Pick<CalendarEntry, 'linkKey' | 'alsoLinked'>
): string[] =>
  entry.linkKey ? [entry.linkKey, ...(entry.alsoLinked ?? [])] : [];

const keysOf = calendarEntryLinks;

/** A diary exercise that may belong to a logged workout preset. */
export interface GroupableEntry extends CalendarEntry {
  /** The preset session it was logged in; null for a single exercise. */
  presetEntryId: string | null;
  presetName: string | null;
}

/**
 * The exercises of one logged workout preset are one session, not one per
 * exercise: they merge into a single entry named after the preset, with the
 * summed time and distance and a minutes-weighted average heart rate. Its
 * sport is strength, unless the cardio exercises in it outweigh the rest: a
 * logged preset is a strength-style session, and its exercises (a leg press,
 * a stair climber) often classify as other.
 */
function presetSport(group: readonly GroupableEntry[]): LoadSportGroup {
  const minutes = new Map<LoadSportGroup, number>();
  for (const e of group) {
    minutes.set(e.sport, (minutes.get(e.sport) ?? 0) + e.durationMinutes);
  }
  const cardio = (['running', 'cycling', 'walking', 'cardio'] as const)
    .map((sport) => [sport, minutes.get(sport) ?? 0] as const)
    .sort((a, b) => b[1] - a[1]);
  const rest = (minutes.get('strength') ?? 0) + (minutes.get('other') ?? 0);
  const total = cardio.reduce((sum, [, m]) => sum + m, 0);
  return total > rest && cardio[0] ? cardio[0][0] : 'strength';
}

const sameName = (a: string | null, b: string | null) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

export function groupPresetEntries(
  entries: readonly GroupableEntry[],
  zoneFloors: readonly number[] = percentMaxFloors(FALLBACK_MAX_HR)
): CalendarEntry[] {
  const out: CalendarEntry[] = [];
  const groups = new Map<string, GroupableEntry[]>();
  for (const entry of entries) {
    if (isPassiveEntry(entry)) continue;
    const { presetEntryId, presetName, ...plain } = entry;
    void presetName;
    if (!presetEntryId) {
      out.push(plain);
      continue;
    }
    const list = groups.get(presetEntryId) ?? [];
    list.push(entry);
    groups.set(presetEntryId, list);
    if (list.length === 1) out.push(plain); // placeholder keeps day order
  }
  return out.map((entry) => {
    const group = [...groups.values()].find((g) => g[0]?.id === entry.id);
    if (!group) return entry;
    if (group.length === 1) {
      return { ...entry, sport: presetSport(group) };
    }
    const minutes = group.reduce((sum, e) => sum + e.durationMinutes, 0);
    const sport = presetSport(group);
    const beats = group.filter((e) => hasHeartRate(e.avgHeartRate));
    const beatMinutes = beats.reduce((sum, e) => sum + e.durationMinutes, 0);
    const distances = group.filter((e) => e.distanceKm != null);
    const links = [...new Set(group.flatMap(keysOf))];
    return {
      id: entry.id,
      day: entry.day,
      name: group[0]?.presetName ?? entry.name,
      sport,
      durationMinutes: minutes,
      distanceKm:
        distances.length === 0
          ? null
          : distances.reduce((sum, e) => sum + (e.distanceKm ?? 0), 0),
      avgHeartRate:
        beatMinutes > 0
          ? beats.reduce(
              (sum, e) => sum + (e.avgHeartRate ?? 0) * e.durationMinutes,
              0
            ) / beatMinutes
          : null,
      linkKey: links[0] ?? null,
      alsoLinked: links.slice(1),
      // Each exercise is weighted by its own heart rate; the averaged heart
      // rate above is for display only.
      load: group.reduce((sum, e) => sum + sessionLoad(e, zoneFloors), 0),
    };
  });
}

/** Something planned for one day. */
export interface PlanSlot {
  id: string;
  day: string;
  source: 'runProgram' | 'workoutPlan';
  sport: LoadSportGroup;
  label: string | null;
  programId: string | null;
  workoutNumber: number | null;
  plannedMinutes: number | null;
  /** Entries carrying one of these were logged as this item. */
  linkKeys: string[];
}

const hasHeartRate = (bpm: number | null) =>
  bpm != null && Number.isFinite(bpm) && bpm > 0;

const emptyLoad = (): LoadBySport =>
  Object.fromEntries(LOAD_SPORT_GROUPS.map((g) => [g, 0])) as LoadBySport;

/**
 * Matches entries to planned slots and gives every slot a status.
 *
 * 1. An entry logged as a plan item or program workout (its `linkKey`) belongs
 *    to the slot with that key that is within three days of it.
 * 2. A slot left over takes the free entries of its own day in its own sport
 *    (someone who ran on the planned day without opening the program).
 * 3. Entries nothing took are extra, unplanned work.
 *
 * A slot with no entry is `missed` before today and `upcoming` from today on.
 * A slot logged through its link is `done` when every part of it is logged and
 * `partial` when only some parts are; one matched by day and sport is `done`
 * from 80% of its planned minutes (or any, when none are planned), else
 * `partial`.
 */
export function matchPlan(
  slots: readonly PlanSlot[],
  entries: readonly CalendarEntry[],
  today: string,
  zoneFloors: readonly number[] = percentMaxFloors(FALLBACK_MAX_HR)
): { planned: PlannedItem[]; completed: CompletedItem[] } {
  const ordered = [...slots].sort(
    (a, b) => compareDays(a.day, b.day) || a.id.localeCompare(b.id)
  );
  const free = entries
    .filter((entry) => !isPassiveEntry(entry))
    .sort((a, b) => compareDays(a.day, b.day) || a.id.localeCompare(b.id));
  // Indexes, so matching costs about the number of slots plus entries rather
  // than their product.
  const slotLinks = new Map(
    ordered.map((slot) => [slot.id, new Set(slot.linkKeys)])
  );
  const slotsByKey = new Map<string, PlanSlot[]>();
  for (const slot of ordered) {
    for (const key of slotLinks.get(slot.id) ?? []) {
      const list = slotsByKey.get(key) ?? [];
      list.push(slot);
      slotsByKey.set(key, list);
    }
  }
  const entriesByDay = new Map<string, CalendarEntry[]>();
  for (const entry of free) {
    const list = entriesByDay.get(entry.day) ?? [];
    list.push(entry);
    entriesByDay.set(entry.day, list);
  }
  const taken = new Map<string, string>(); // entry id -> slot id
  const matched = new Map<
    string,
    { entries: CalendarEntry[]; linked: boolean }
  >();
  const take = (slot: PlanSlot, entry: CalendarEntry, linked: boolean) => {
    taken.set(entry.id, slot.id);
    const current = matched.get(slot.id) ?? { entries: [], linked };
    current.entries.push(entry);
    matched.set(slot.id, current);
  };

  // A key can belong to several slots (the same program workout is planned
  // again on a later day), so each linked entry picks its own occurrence: the
  // one on its own day, else the nearest within the window, preferring a slot
  // that does not hold that link yet. An earlier slot never takes an entry
  // that fits a later occurrence better.
  for (const entry of free) {
    const links = keysOf(entry);
    if (links.length === 0) continue;
    const near = new Map<string, PlanSlot>();
    for (const key of links) {
      for (const slot of slotsByKey.get(key) ?? []) {
        if (Math.abs(daysBetween(slot.day, entry.day)) <= MATCH_WINDOW_DAYS) {
          near.set(slot.id, slot);
        }
      }
    }
    const candidates = [...near.values()]
      .map((slot) => ({
        slot,
        exact: slot.day === entry.day ? 0 : 1,
        held: (matched.get(slot.id)?.entries ?? []).some((e) =>
          keysOf(e).some(
            (k) => links.includes(k) && slotLinks.get(slot.id)?.has(k)
          )
        )
          ? 1
          : 0,
        distance: Math.abs(daysBetween(slot.day, entry.day)),
      }))
      .sort(
        (a, b) =>
          a.exact - b.exact ||
          a.held - b.held ||
          a.distance - b.distance ||
          compareDays(a.slot.day, b.slot.day)
      );
    const best = candidates[0];
    if (best) take(best.slot, entry, true);
  }
  for (const slot of ordered) {
    if (matched.has(slot.id)) continue;
    for (const entry of entriesByDay.get(slot.day) ?? []) {
      if (taken.has(entry.id) || entry.linkKey) continue;
      if (entry.sport === slot.sport || sameName(entry.name, slot.label)) {
        take(slot, entry, false);
      }
    }
  }
  // An entry logged against some other plan item still counts for a slot of
  // its own day and sport that nothing else filled (a run done inside a plan
  // session satisfies that day's run). It stays with the item that took it,
  // and only crosses between a workout plan and the run program: distinct
  // sessions of one plan are never all done by one workout.
  const sourceOf = new Map(ordered.map((slot) => [slot.id, slot.source]));
  for (const slot of ordered) {
    if (matched.has(slot.id)) continue;
    for (const entry of entriesByDay.get(slot.day) ?? []) {
      if (!taken.has(entry.id)) continue;
      if (entry.sport !== slot.sport) continue;
      if (sourceOf.get(taken.get(entry.id) ?? '') === slot.source) continue;
      const current = matched.get(slot.id) ?? { entries: [], linked: false };
      current.entries.push(entry);
      matched.set(slot.id, current);
    }
  }

  const loadOf = (entry: CalendarEntry) =>
    entry.load ?? sessionLoad(entry, zoneFloors);

  const planned: PlannedItem[] = ordered.map((slot) => {
    const found = matched.get(slot.id);
    const minutes = found
      ? found.entries.reduce((sum, e) => sum + e.durationMinutes, 0)
      : 0;
    let status: PlannedStatus;
    if (!found)
      status = compareDays(slot.day, today) < 0 ? 'missed' : 'upcoming';
    else if (found.linked) {
      const covered = new Set(
        found.entries
          .flatMap(keysOf)
          .filter((k) => slotLinks.get(slot.id)?.has(k))
      ).size;
      status =
        covered >= (slotLinks.get(slot.id)?.size ?? 0) ? 'done' : 'partial';
    } else if (slot.plannedMinutes != null && slot.plannedMinutes > 0) {
      status = minutes / slot.plannedMinutes >= DONE_SHARE ? 'done' : 'partial';
    } else {
      status = 'done';
    }
    return {
      id: slot.id,
      day: slot.day,
      source: slot.source,
      sport: slot.sport,
      label: slot.label,
      programId: slot.programId,
      workoutNumber: slot.workoutNumber,
      plannedMinutes: slot.plannedMinutes,
      plannedLoad:
        slot.plannedMinutes == null
          ? null
          : Math.round(
              sessionLoad(
                { durationMinutes: slot.plannedMinutes, avgHeartRate: null },
                zoneFloors
              )
            ),
      status,
      completedMinutes: Math.round(minutes),
      completedLoad: Math.round(
        (found?.entries ?? []).reduce((sum, e) => sum + loadOf(e), 0)
      ),
      entryIds: (found?.entries ?? []).map((e) => e.id),
    };
  });

  const completed: CompletedItem[] = free.map((entry) => ({
    id: entry.id,
    day: entry.day,
    name: entry.name,
    sport: entry.sport,
    minutes: Math.round(entry.durationMinutes),
    distanceKm:
      entry.distanceKm == null
        ? null
        : Math.round(entry.distanceKm * 100) / 100,
    avgHeartRate: hasHeartRate(entry.avgHeartRate) ? entry.avgHeartRate : null,
    load: Math.round(loadOf(entry)),
    loadBasis: hasHeartRate(entry.avgHeartRate) ? 'heartRate' : 'estimated',
    plannedItemId: taken.get(entry.id) ?? null,
  }));
  return { planned, completed };
}

/** Weekly planned-against-completed totals for the weeks the range touches. */
export function weeklyTotals(
  planned: readonly PlannedItem[],
  completed: readonly CompletedItem[],
  start: string,
  end: string,
  firstDayOfWeek: number = 1
): CalendarWeekTotals[] {
  const weeks = new Map<string, CalendarWeekTotals>();
  for (
    let week = weekStartOf(start, firstDayOfWeek);
    compareDays(week, end) <= 0;
    week = addDays(week, 7)
  ) {
    weeks.set(week, {
      start: week,
      plannedSessions: 0,
      doneSessions: 0,
      partialSessions: 0,
      missedSessions: 0,
      extraSessions: 0,
      completedSessions: 0,
      plannedMinutes: 0,
      completedMinutes: 0,
      matchedMinutes: 0,
      plannedLoad: 0,
      completedLoad: 0,
      matchedLoad: 0,
      completedDistanceKm: 0,
    });
  }
  const bucket = (day: string) => weeks.get(weekStartOf(day, firstDayOfWeek));
  const measured = new Set(
    planned.filter((item) => item.plannedMinutes != null).map((item) => item.id)
  );
  for (const item of planned) {
    const week = bucket(item.day);
    if (!week) continue;
    week.plannedSessions += 1;
    week.plannedMinutes += item.plannedMinutes ?? 0;
    week.plannedLoad += item.plannedLoad ?? 0;
    if (item.status === 'done') week.doneSessions += 1;
    else if (item.status === 'partial') week.partialSessions += 1;
    else if (item.status === 'missed') week.missedSessions += 1;
  }
  for (const item of completed) {
    const week = bucket(item.day);
    if (!week) continue;
    week.completedSessions += 1;
    week.completedMinutes += item.minutes;
    week.completedLoad += item.load;
    week.completedDistanceKm += item.distanceKm ?? 0;
    if (item.plannedItemId === null) week.extraSessions += 1;
    else if (measured.has(item.plannedItemId)) {
      week.matchedMinutes += item.minutes;
      week.matchedLoad += item.load;
    }
  }
  return [...weeks.values()].map((week) => ({
    ...week,
    completedDistanceKm: Math.round(week.completedDistanceKm * 100) / 100,
  }));
}

/** Load per sport group, by week and by month, from the same entries. */
export function sportLoadOf(
  completed: readonly CompletedItem[],
  start: string,
  end: string,
  firstDayOfWeek: number = 1
): SportLoad {
  const weeks = new Map<string, LoadBySport>();
  for (
    let week = weekStartOf(start, firstDayOfWeek);
    compareDays(week, end) <= 0;
    week = addDays(week, 7)
  ) {
    weeks.set(week, emptyLoad());
  }
  const months = new Map<string, LoadBySport>();
  for (
    let month = start.slice(0, 7);
    month <= end.slice(0, 7);
    month = nextMonth(month)
  ) {
    months.set(month, emptyLoad());
  }
  const total = emptyLoad();
  for (const item of completed) {
    const week = weeks.get(weekStartOf(item.day, firstDayOfWeek));
    const month = months.get(item.day.slice(0, 7));
    if (week) week[item.sport] += item.load;
    if (month) month[item.sport] += item.load;
    total[item.sport] += item.load;
  }
  return {
    weeks: [...weeks.entries()].map(([weekStart, bySport]) => ({
      start: weekStart,
      bySport,
    })),
    months: [...months.entries()].map(([month, bySport]) => ({
      month,
      bySport,
    })),
    total,
  };
}

function nextMonth(month: string): string {
  const [year, m] = month.split('-').map(Number) as [number, number];
  return m === 12
    ? `${year + 1}-01`
    : `${year}-${String(m + 1).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Slots from a run program
// ---------------------------------------------------------------------------

export interface ProgramPlanInput {
  programId: string;
  /** What the program's workouts are recorded as. */
  activity: 'run' | 'walk';
  enabled: boolean;
  total: number;
  /** Index of the next workout due. */
  next: number;
  /** Planned minutes of each workout, by index. */
  minutes: readonly number[];
  schedule: ProgramSchedule;
  /** The local day a program workout was last completed. */
  doneDay: string | null;
  /** Every workout completed so far, with the local day of its diary entry. */
  completions: readonly { index: number; entryId: string; day: string }[];
}

/**
 * Where the run program puts workouts between `start` and `end`.
 *
 * From today on this is the program's own projection (`projectRuns`). Before
 * today the program keeps no record of when a workout was due, so the past is
 * rebuilt from the chosen weekdays since the first day: a completed workout
 * fills the run day it was done on, or the oldest empty one in the three days
 * before it; run days nothing fills are missed. Without a first day there are
 * no past run days, only the completed workouts. A switched-off or finished
 * program has no missed days.
 */
export function programSlots(
  input: ProgramPlanInput,
  today: string,
  start: string,
  end: string
): PlanSlot[] {
  const { schedule } = input;
  const sport: LoadSportGroup =
    input.activity === 'walk' ? 'walking' : 'running';
  const slot = (index: number, day: string): PlanSlot => ({
    id: `runProgram:${day}:${index}`,
    day,
    source: 'runProgram',
    sport,
    label: null,
    programId: input.programId,
    workoutNumber: index + 1,
    plannedMinutes: input.minutes[index] ?? null,
    linkKeys: [`runProgram:${index}`],
  });
  const slots: PlanSlot[] = [];

  // Today and later.
  const from = compareDays(start, today) > 0 ? start : today;
  if (
    input.enabled &&
    input.next < input.total &&
    compareDays(from, end) <= 0
  ) {
    const doneToday = input.doneDay === today;
    if (schedule.runDays.length > 0) {
      for (const run of projectRuns({
        total: input.total,
        next: input.next,
        schedule,
        today,
        doneToday,
        limit: MAX_PROJECTED,
      })) {
        if (compareDays(run.day, from) >= 0 && compareDays(run.day, end) <= 0) {
          slots.push(slot(run.index, run.day));
        }
      }
    } else if (
      !doneToday &&
      compareDays(today, from) >= 0 &&
      compareDays(today, end) <= 0 &&
      (!schedule.startDay || compareDays(today, schedule.startDay) >= 0) &&
      (!schedule.endDay || compareDays(today, schedule.endDay) <= 0)
    ) {
      slots.push(slot(input.next, today));
    }
  }

  // Before today: the run days since the first day, then the completions.
  const completions = [...input.completions].sort(
    (a, b) => compareDays(a.day, b.day) || a.index - b.index
  );
  const lastPastDay = (() => {
    const yesterday = addDays(today, -1);
    const stop =
      input.next >= input.total ? (input.doneDay ?? null) : yesterday;
    if (stop === null) return null;
    const capped = compareDays(stop, yesterday) < 0 ? stop : yesterday;
    return schedule.endDay && compareDays(schedule.endDay, capped) < 0
      ? schedule.endDay
      : capped;
  })();
  const runDays = new Set(schedule.runDays);
  const open: { day: string; index: number }[] = [];
  if (
    input.enabled &&
    schedule.startDay &&
    runDays.size > 0 &&
    lastPastDay !== null
  ) {
    // Only walk the days the range can show, plus a margin so completions
    // before the range still claim the run days they would have claimed. The
    // stored first day can be arbitrarily far back, so it never sets the
    // length of the walk.
    const walkStart = addDays(start, -PAST_WALK_MARGIN_DAYS);
    const walkEnd = compareDays(end, lastPastDay) < 0 ? end : lastPastDay;
    for (
      let day =
        compareDays(schedule.startDay, walkStart) > 0
          ? schedule.startDay
          : walkStart;
      compareDays(day, walkEnd) <= 0;
      day = addDays(day, 1)
    ) {
      if (!runDays.has(dayOfWeek(day))) continue;
      const before = completions.filter((c) => compareDays(c.day, day) < 0);
      const last = before.at(-1);
      const index = Math.min(
        input.total - 1,
        last ? last.index + 1 : (completions[0]?.index ?? input.next)
      );
      open.push({ day, index });
    }
  }
  const inRange = (day: string) =>
    compareDays(day, start) >= 0 && compareDays(day, end) <= 0;
  for (const done of completions) {
    const sameDay = open.findIndex((o) => o.day === done.day);
    const earlier = open.findIndex(
      (o) =>
        compareDays(o.day, done.day) < 0 &&
        daysBetween(o.day, done.day) <= MATCH_WINDOW_DAYS
    );
    const at = sameDay >= 0 ? sameDay : earlier;
    const day = at >= 0 ? open.splice(at, 1)[0]!.day : done.day;
    if (inRange(day)) slots.push(slot(done.index, day));
  }
  for (const o of open) {
    if (inRange(o.day)) slots.push(slot(o.index, o.day));
  }
  return slots.sort((a, b) => compareDays(a.day, b.day));
}

// ---------------------------------------------------------------------------
// Slots from workout plans
// ---------------------------------------------------------------------------

export interface PlanAssignmentInput {
  id: number | string;
  /** 0 = Sunday; null in a sequential plan. */
  dayOfWeek: number | null;
  sessionIndex: number | null;
  sessionName: string | null;
  /** The preset or exercise it names. */
  name: string | null;
  sport: LoadSportGroup;
  /** Planned minutes, when the plan gives sets with times. */
  minutes: number | null;
}

export interface PlanTemplateInput {
  id: number | string;
  name: string;
  scheduleType: 'weekly' | 'sequential';
  /** First and last day the plan runs; the end is open when null. */
  start: string;
  end: string | null;
  assignments: readonly PlanAssignmentInput[];
}

/** One session of a plan on one day: its assignments make a single item. */
export function planSessionSlot(
  template: Pick<PlanTemplateInput, 'id' | 'name'>,
  day: string,
  sessionIndex: number | null,
  assignments: readonly PlanAssignmentInput[]
): PlanSlot {
  const first = assignments[0];
  const known = assignments.filter((a) => a.minutes != null);
  return {
    id: `workoutPlan:${template.id}:${day}:${sessionIndex ?? 0}`,
    day,
    source: 'workoutPlan',
    sport: first?.sport ?? 'strength',
    label: first?.sessionName ?? first?.name ?? template.name,
    programId: null,
    workoutNumber: null,
    plannedMinutes:
      known.length === 0
        ? null
        : known.reduce((sum, a) => sum + (a.minutes ?? 0), 0),
    linkKeys: assignments.map((a) => `plan:${a.id}`),
  };
}

/**
 * The sessions of the weekly plans on each of their days between `start` and
 * `end`. A sequential plan has no days of its own, so it is not here.
 */
export function weeklyPlanSlots(
  templates: readonly PlanTemplateInput[],
  start: string,
  end: string
): PlanSlot[] {
  const slots: PlanSlot[] = [];
  for (const template of templates.slice(0, MAX_CALENDAR_PLANS)) {
    if (template.scheduleType !== 'weekly') continue;
    const first =
      compareDays(template.start, start) > 0 ? template.start : start;
    const last =
      template.end && compareDays(template.end, end) < 0 ? template.end : end;
    // Sessions of each weekday, grouped once instead of per day.
    const byWeekday = new Map<number, Map<number, PlanAssignmentInput[]>>();
    for (const a of template.assignments.slice(0, MAX_PLAN_ASSIGNMENTS)) {
      if (a.dayOfWeek == null) continue;
      const sessions =
        byWeekday.get(a.dayOfWeek) ?? new Map<number, PlanAssignmentInput[]>();
      const key = a.sessionIndex ?? 0;
      const group = sessions.get(key);
      if (group) group.push(a);
      else if (sessions.size < MAX_SESSIONS_PER_DAY) sessions.set(key, [a]);
      byWeekday.set(a.dayOfWeek, sessions);
    }
    for (let day = first; compareDays(day, last) <= 0; day = addDays(day, 1)) {
      for (const [sessionIndex, group] of byWeekday.get(dayOfWeek(day)) ?? []) {
        if (slots.length >= MAX_PLAN_SLOTS) return slots;
        slots.push(planSessionSlot(template, day, sessionIndex, group));
      }
    }
  }
  return slots;
}
