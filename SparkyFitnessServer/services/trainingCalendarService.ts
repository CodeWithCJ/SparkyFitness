import reportRepository, {
  type CalendarEntryRow,
} from '../models/reportRepository.js';
import workoutPlanTemplateRepository from '../models/workoutPlanTemplateRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import { getRunProgram } from '../models/runProgramRepository.js';
import heartRateZoneService from './heartRateZoneService.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import { log } from '../config/logging.js';
import {
  addDays,
  classifyActivitySport,
  compareDays,
  computeFitnessFatigue,
  calendarEntryLinks,
  CURVE_DAYS,
  groupPresetEntries,
  loadSportGroup,
  MATCH_WINDOW_DAYS,
  matchPlan,
  planMinutes,
  planSessionSlot,
  programActivity,
  programSlots,
  sportLoadOf,
  todayInZone,
  weeklyPlanSlots,
  weeklyTotals,
  type CalendarEntry,
  type GroupableEntry,
  type LoadSportGroup,
  type PlanAssignmentInput,
  type PlanSlot,
  type PlanTemplateInput,
  type TrainingCalendarResponse,
} from '@workspace/shared';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A plan assignment's sport: a preset is strength work, an exercise by its name. */
function assignmentSport(
  name: string | null,
  isPreset: boolean
): LoadSportGroup {
  if (isPreset || !name) return 'strength';
  const group = loadSportGroup(
    classifyActivitySport({ exerciseName: name }).sport
  );
  return group === 'other' ? 'strength' : group;
}

function toEntry(
  row: CalendarEntryRow,
  programIndexByEntry: Map<string, number>
): GroupableEntry {
  const programIndex = programIndexByEntry.get(row.id);
  const links = [
    ...(programIndex !== undefined ? [`runProgram:${programIndex}`] : []),
    ...(row.workoutPlanAssignmentId !== null
      ? [`plan:${row.workoutPlanAssignmentId}`]
      : []),
  ];
  return {
    id: row.id,
    day: row.day,
    name: row.exerciseName,
    sport: loadSportGroup(
      classifyActivitySport({
        exerciseName: row.exerciseName,
        category: row.category,
        notes: row.notes,
        providerName: row.providerName,
        detailData: row.detailData,
        exerciseSourceId: row.exerciseSourceId,
      }).sport
    ),
    durationMinutes: row.durationMinutes,
    distanceKm: row.distanceKm,
    avgHeartRate: row.avgHeartRate,
    presetEntryId: row.presetEntryId,
    presetName: row.presetName,
    // An entry can be both a program workout and a plan item; it keeps both
    // links so each planned item can find it.
    linkKey: links[0] ?? null,
    alsoLinked: links.slice(1),
  };
}

/**
 * Planned against completed for a range of local days: the run program's
 * workouts and the scheduled workout plans (planned), the diary's exercise
 * entries (completed), weekly totals, and training load per sport. Load is the
 * training-load report's own model (`sessionLoad`), and the fitness / fatigue /
 * form figure is the same curve the readiness score uses.
 */
async function getTrainingCalendar(
  authenticatedUserId: string,
  targetUserId: string,
  start: string,
  end: string
): Promise<TrainingCalendarResponse> {
  try {
    const inRange = (day: string) =>
      compareDays(day, start) >= 0 && compareDays(day, end) <= 0;
    // A planned item matches an entry up to MATCH_WINDOW_DAYS from its day, and
    // a past program day is rebuilt from the completions around it. So slots and
    // entries are both read and matched over the range widened by that margin,
    // and only the result is trimmed back: a day then has the same status
    // whatever range it was asked for.
    const matchStart = addDays(start, -MATCH_WINDOW_DAYS);
    const matchEnd = addDays(end, MATCH_WINDOW_DAYS);
    const timezone = await loadUserTimezone(targetUserId);
    const today = todayInZone(timezone);
    const preferences =
      await preferenceRepository.getUserPreferences(targetUserId);
    const rawFirstDay = preferences?.first_day_of_week;
    const firstDayOfWeek =
      rawFirstDay !== null && rawFirstDay !== undefined
        ? Number(rawFirstDay)
        : 0;

    const [rows, templates, program, zones, curveSessions] = await Promise.all([
      reportRepository.getCalendarEntries(targetUserId, matchStart, matchEnd),
      workoutPlanTemplateRepository.getPlanTemplatesForCalendar(
        targetUserId,
        matchStart,
        matchEnd
      ),
      getRunProgram(targetUserId, authenticatedUserId),
      heartRateZoneService.resolveZonesForUser(targetUserId),
      reportRepository.getTrainingLoadSessions(
        targetUserId,
        addDays(today, -(CURVE_DAYS - 1)),
        today
      ),
    ]);

    // Which diary entry each finished program workout was done as, and on
    // which local day.
    const completionLog = (program?.completion_log ?? []).filter((c) =>
      UUID.test(c.entry_id)
    );
    const completionDays = await reportRepository.getEntryDays(
      targetUserId,
      completionLog.map((c) => c.entry_id)
    );
    const programIndexByEntry = new Map(
      completionLog.map((c) => [c.entry_id, c.index])
    );
    const completions = completionLog.flatMap((c) => {
      const day = completionDays.get(c.entry_id);
      return day ? [{ index: c.index, entryId: c.entry_id, day }] : [];
    });

    const entries = groupPresetEntries(
      rows.map((row) => toEntry(row, programIndexByEntry)),
      zones.floors
    );

    const slots: PlanSlot[] = [];
    if (program) {
      slots.push(
        ...programSlots(
          {
            programId: program.program_id,
            activity: programActivity(program.program_id),
            enabled: program.enabled,
            total: program.workouts.length,
            next: program.next_index,
            minutes: program.workouts.map((w) => planMinutes(w.plan)),
            schedule: {
              runDays: program.run_days,
              startDay: program.start_date,
              endDay: program.end_date,
            },
            doneDay: program.last_done_date,
            completions,
          },
          today,
          matchStart,
          matchEnd
        )
      );
    }

    const plans: PlanTemplateInput[] = templates.map((t) => ({
      id: t.id,
      name: t.plan_name,
      scheduleType: t.schedule_type,
      start: t.start_day,
      end: t.end_day,
      assignments: t.assignments.map((a): PlanAssignmentInput => ({
        id: a.id,
        dayOfWeek: a.day_of_week,
        sessionIndex: a.session_index,
        sessionName: a.session_name,
        name: a.name,
        sport: assignmentSport(a.name, a.is_preset),
        minutes: a.minutes === null ? null : Number(a.minutes),
      })),
    }));
    slots.push(...weeklyPlanSlots(plans, matchStart, matchEnd));
    const nextByPlan = new Map<string, number[]>();
    if (
      compareDays(today, start) >= 0 &&
      compareDays(today, end) <= 0 &&
      plans.some((p) => p.scheduleType === 'sequential')
    ) {
      // The plan's own progression says which session is next.
      const active =
        await workoutPlanTemplateRepository.getActiveWorkoutPlanForDate(
          targetUserId,
          today
        );
      for (const plan of active) {
        nextByPlan.set(
          String(plan.id),
          (plan.next_assignments ?? []).map((a) => Number(a.id))
        );
      }
    }
    slots.push(...sequentialPlanSlots(plans, entries, today, nextByPlan));

    const matched = matchPlan(slots, entries, today, zones.floors);
    // The margin only served matching: what is shown and totalled is the range.
    const planned = matched.planned.filter((item) => inRange(item.day));
    const completed = matched.completed.filter((item) => inRange(item.day));
    const curve = computeFitnessFatigue(curveSessions, today, zones.floors);

    return {
      start,
      end,
      today,
      planned,
      completed,
      weeks: weeklyTotals(planned, completed, start, end, firstDayOfWeek),
      sportLoad: sportLoadOf(completed, start, end, firstDayOfWeek),
      fitnessFatigue: { today: curve.today, status: curve.status },
    };
  } catch (error) {
    log(
      'error',
      `Error building training calendar for user ${targetUserId} by ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}

/**
 * Sequential plans have no weekdays: the next session is simply the next one
 * in order. Sessions already logged show on the day they were done; the next
 * one (per the plan's own progression) shows today, unless a session of that
 * plan was already logged today.
 */
function sequentialPlanSlots(
  plans: readonly PlanTemplateInput[],
  entries: readonly CalendarEntry[],
  today: string,
  nextByPlan: ReadonlyMap<string, readonly (number | string)[]>
): PlanSlot[] {
  const slots = new Map<string, PlanSlot>();
  const loggedToday = new Set<string>();
  for (const plan of plans) {
    if (plan.scheduleType !== 'sequential') continue;
    const sessions = new Map<number, PlanAssignmentInput[]>();
    for (const a of plan.assignments) {
      const key = a.sessionIndex ?? 1;
      sessions.set(key, [...(sessions.get(key) ?? []), a]);
    }
    for (const entry of entries) {
      const match = [...sessions.entries()].find(([, group]) =>
        group.some((a) => calendarEntryLinks(entry).includes(`plan:${a.id}`))
      );
      if (!match) continue;
      const slot = planSessionSlot(plan, entry.day, match[0], match[1]);
      slots.set(slot.id, slot);
      if (entry.day === today) loggedToday.add(String(plan.id));
    }
    if (loggedToday.has(String(plan.id))) continue;
    const nextIds = new Set(
      (nextByPlan.get(String(plan.id)) ?? []).map(String)
    );
    const next = plan.assignments.filter((a) => nextIds.has(String(a.id)));
    if (next.length > 0) {
      const slot = planSessionSlot(
        plan,
        today,
        next[0]?.sessionIndex ?? null,
        next
      );
      slots.set(slot.id, slot);
    }
  }
  return [...slots.values()];
}

export { getTrainingCalendar };
export default { getTrainingCalendar };
