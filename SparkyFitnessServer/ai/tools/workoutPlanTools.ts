import { tool } from 'ai';
import { z } from 'zod';
import { kgInUnit, todayInZone } from '@workspace/shared';
import type { PlanProposal } from '@workspace/shared';
import { log } from '../../config/logging.js';
import planProposalService from '../../services/planProposalService.js';
import workoutPlanTemplateService from '../../services/workoutPlanTemplateService.js';
import workoutPresetRepository from '../../models/workoutPresetRepository.js';
import type { WorkoutPlanAssignmentInput } from '../../models/workoutPlanTemplateRepository.js';
import { ERRORS, formatZodError } from './errors.js';
import { findExerciseByExactName } from './exerciseLookup.js';
import { formatConfirmation, formatList } from './formatting.js';
import {
  manageWorkoutPlansSchema,
  manageWorkoutPlansInput,
  WORKOUT_PLAN_ACTIONS,
  type ManageWorkoutPlansInput,
  type WorkoutPlanSessionItemInput,
  workoutPlanSessionItemSchema,
} from './schemas/workoutPlans.js';
import { normalizeActionArgs } from './dates.js';

const VALID_ACTIONS = [...WORKOUT_PLAN_ACTIONS];

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const WEEKDAY_MAP: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

interface WorkoutPlanAssignmentRow {
  id: number | string;
  day_of_week?: number | null;
  session_index?: number | null;
  session_name?: string | null;
  workout_preset_id?: number | null;
  workout_preset_name?: string | null;
  workout_preset_format?: string | null;
  exercise_id?: string | null;
  exercise_name?: string | null;
  sets?: unknown[] | null;
}

interface WorkoutPlanTemplateRow {
  id: string | number;
  plan_name: string;
  description?: string | null;
  is_active?: boolean;
  schedule_type?: 'weekly' | 'sequential' | null;
  entry_mode?: 'prompt' | 'prefill' | null;
  assignments?: WorkoutPlanAssignmentRow[];
  next_assignment?: WorkoutPlanAssignmentRow | null;
  next_assignments?: WorkoutPlanAssignmentRow[];
  start_date?: string | null;
  end_date?: string | null;
  sequence_position?: {
    current: number;
    total: number;
    session_name?: string | null;
  } | null;
}

const PROPOSAL_REASONS: Record<PlanProposal['reason'], string> = {
  hit_plan_twice:
    'the planned weight and reps were met in each of the last two sessions',
  too_easy_repeated: 'it was rated too easy twice in a row',
  too_hard_repeated: 'it was rated too hard twice in a row',
  too_hard: 'it was rated too hard last time',
  high_effort: 'the logged effort was at or near failure',
  low_effort: 'the logged effort was well short of failure',
  pain_reported: 'pain was reported in this exercise',
  pain_repeated: 'pain was reported in this exercise twice in a row',
  session_pain: 'pain was reported for the last session',
  stalled: 'the estimated one-rep max has stopped improving',
};

function formatPlanProposals(
  planName: string | undefined,
  proposals: PlanProposal[],
  unit: 'kg' | 'lbs',
  prefill: boolean
): string {
  const weight = (kg: number): string => `${kgInUnit(kg, unit)}`;
  const lines = [`# Proposed changes to "${planName ?? 'workout plan'}"`, ''];
  if (proposals.length === 0) {
    lines.push(
      'No change is warranted right now. Say so plainly rather than suggesting one.'
    );
    return lines.join('\n');
  }
  for (const p of proposals) {
    const why = PROPOSAL_REASONS[p.reason];
    const head = `- **${p.exerciseName}** (assignment_id ${p.assignmentId})`;
    if (p.setChanges.length > 0) {
      const from = [...new Set(p.setChanges.map((c) => weight(c.fromKg)))];
      const to = [...new Set(p.setChanges.map((c) => weight(c.toKg)))];
      lines.push(
        `${head}: ${p.kind} working sets ${from.join('/')} → ${to.join('/')} ${unit}, because ${why}.`
      );
    } else {
      lines.push(`${head}: keep the weights, because ${why}.`);
    }
    if (p.reason === 'stalled') {
      lines.push(
        '  A stall can be a planned deload; ask before suggesting a deload or a swap.'
      );
    }
    if (p.suggestAlternative) {
      lines.push(
        '  Offer alternatives with sparky_manage_exercise suggest_alternatives.'
      );
    }
  }
  lines.push('');
  const editable = proposals.some((p) => p.setChanges.length > 0);
  if (prefill && editable) {
    lines.push(
      'This plan pre-fills diary entries, so these weights cannot be applied here. Describe the changes and, if the user agrees, use update_workout_plan.'
    );
  } else if (editable) {
    lines.push(
      'Nothing was changed. Present these to the user, and apply only the ones they agree to with apply_plan_changes (plan_id, assignment_ids, confirmed=true).'
    );
  } else {
    lines.push('Nothing was changed, and none of these edits the plan.');
  }
  return lines.join('\n');
}

function planMutationConfirmPrompt(
  confirmed: boolean | undefined,
  action: 'update' | 'delete',
  planId: number
): string | null {
  if (confirmed === true) return null;
  if (action === 'delete') {
    return `Deleting workout plan ${planId} is permanent. Confirm with the user first. If they agree, call delete_workout_plan again with plan_id=${planId} and confirmed=true. Nothing was deleted.`;
  }
  return `Updating workout plan ${planId} can replace all assignments and unlinks history if changing schedule type. Confirm with the user first. If they agree, call update_workout_plan again with the same fields and confirmed=true. Call get_workout_plan with plan_id=${planId} first to inspect current assignments. Nothing was changed.`;
}

function formatPlanAssignmentLine(a: WorkoutPlanAssignmentRow): string {
  const item = a.workout_preset_name ?? a.exercise_name ?? 'Unknown item';
  const format = a.workout_preset_format;
  const formatSuffix = format && format !== 'standard' ? `, ${format}` : '';
  const isPreset = Boolean(a.workout_preset_name || a.workout_preset_id);
  const typeSuffix = isPreset ? ` (preset${formatSuffix})` : '';
  const setCount = a.sets?.length ?? 0;
  const setsSuffix =
    setCount > 0 ? ` — ${setCount} set${setCount === 1 ? '' : 's'}` : '';
  return `${item}${typeSuffix}${setsSuffix}`;
}

async function resolvePlanAssignments(
  userId: string,
  rawSessions: WorkoutPlanSessionItemInput[],
  scheduleType: 'sequential' | 'weekly'
): Promise<WorkoutPlanAssignmentInput[]> {
  if (!rawSessions || rawSessions.length === 0) {
    return [];
  }
  const assignments: WorkoutPlanAssignmentInput[] = [];
  let currentSessionIndex = 1;
  let prevSessionName: string | null = null;

  for (let i = 0; i < rawSessions.length; i++) {
    const item = rawSessions[i];
    let workoutPresetId: number | null = item.workout_preset_id ?? null;
    let exerciseId: string | null = item.exercise_id ?? null;

    if (!workoutPresetId && !exerciseId && item.preset_name) {
      const preset = await workoutPresetRepository.getWorkoutPresetByName(
        userId,
        item.preset_name
      );
      if (!preset) {
        throw new Error(`Preset with name "${item.preset_name}" not found.`);
      }
      workoutPresetId = preset.id;
    }

    if (!workoutPresetId && !exerciseId && item.exercise_name) {
      const exercise = await findExerciseByExactName(
        userId,
        item.exercise_name
      );
      if (!exercise) {
        throw new Error(
          `Exercise with name "${item.exercise_name}" not found. Use sparky_manage_exercise search_exercises to find the exact name or ID.`
        );
      }
      exerciseId = String(exercise.id);
    }

    if (!workoutPresetId && !exerciseId) {
      throw new Error(
        `Assignment at position ${i + 1} must specify a workout preset (preset_name or workout_preset_id) or an exercise (exercise_name or exercise_id).`
      );
    }

    let dayOfWeek: number | null;
    let sessionIndex: number | null;
    const sessionName: string | null = item.session_name || null;

    if (scheduleType === 'sequential') {
      if (item.session_index !== undefined && item.session_index !== null) {
        sessionIndex = item.session_index;
        currentSessionIndex = item.session_index;
      } else if (
        sessionName &&
        prevSessionName &&
        sessionName === prevSessionName
      ) {
        sessionIndex = currentSessionIndex;
      } else {
        if (i > 0) {
          currentSessionIndex++;
        }
        sessionIndex = currentSessionIndex;
      }
      prevSessionName = sessionName;
      dayOfWeek = null;
    } else {
      if (item.day_of_week === undefined || item.day_of_week === null) {
        throw new Error(
          `Weekly assignment at position ${i + 1} is missing required day_of_week (0-6 or Sunday-Saturday).`
        );
      }
      if (typeof item.day_of_week === 'number') {
        dayOfWeek = item.day_of_week;
      } else {
        const s = item.day_of_week.trim().toLowerCase();
        if (/^\d+$/.test(s)) {
          dayOfWeek = Number(s);
        } else if (s in WEEKDAY_MAP) {
          dayOfWeek = WEEKDAY_MAP[s];
        } else {
          throw new Error(
            `Invalid day_of_week "${item.day_of_week}" at position ${i + 1}. Expected 0-6 or Sunday-Saturday.`
          );
        }
      }
      if (dayOfWeek < 0 || dayOfWeek > 6) {
        throw new Error(
          `Invalid day_of_week "${item.day_of_week}" at position ${i + 1}. Expected 0-6.`
        );
      }
      sessionIndex = null;
    }

    const sets =
      exerciseId && item.sets && item.sets.length > 0
        ? item.sets.map((s, sIdx) => ({
            set_number: sIdx + 1,
            set_type: s.set_type || 'Working Set',
            reps: s.reps ?? null,
            weight: s.weight ?? null,
            duration: s.duration ?? null,
            distance: s.distance ?? null,
            rest_time: s.rest_time ?? null,
            notes: s.notes ?? null,
          }))
        : null;

    assignments.push({
      workout_preset_id: workoutPresetId,
      exercise_id: exerciseId,
      day_of_week: dayOfWeek,
      session_index: sessionIndex,
      session_name: sessionName,
      sort_order: item.sort_order ?? i,
      sets,
    });
  }

  return assignments;
}

// `sessions` arrives as an array or a JSON string. A JSON string skips the
// published schema, so every item is validated here either way.
function parseSessionsInput(
  raw: string | WorkoutPlanSessionItemInput[] | undefined
):
  | { ok: true; sessions: WorkoutPlanSessionItemInput[] | undefined }
  | {
      ok: false;
      error: string;
    } {
  if (raw === undefined) return { ok: true, sessions: undefined };
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return {
        ok: false,
        error: ERRORS.VALIDATION('Invalid JSON format for sessions'),
      };
    }
  }
  const result = z.array(workoutPlanSessionItemSchema).safeParse(value);
  if (!result.success) {
    return { ok: false, error: formatZodError(result.error) };
  }
  return { ok: true, sessions: result.data };
}

// Service-side assignment validation errors (unknown preset/exercise ID,
// missing weekday) are input problems, not a missing plan.
function isAssignmentValidationError(message: string): boolean {
  return (
    message.startsWith('Workout Preset with ID') ||
    message.startsWith('Exercise with ID') ||
    message.includes('Changing schedule_type requires') ||
    message.includes('Weekly workout plan assignments must have')
  );
}

export function buildWorkoutPlanTools(userId: string, tz: string) {
  return {
    sparky_manage_workout_plans: tool({
      description: `Workout plan templates: list, inspect, create, update, delete workout plans, or check active plan progression.

This tool takes a FLAT object with an "action" field. Do NOT nest fields under the action name.

Workout plans support two schedule types:
1. "sequential" (DEFAULT) — Sessions are ordered (Session 1 -> Session 2 -> ... -> Session N -> wraps). Missed days do NOT skip sessions; the next incomplete session is always ready. Ideal for PPL, Upper/Lower, or full-body cycles.
2. "weekly" — Tied to specific weekdays (Mon, Wed, Fri). Missed weekdays are skipped.

Actions:
- action: 'list_workout_plans' — returns every saved workout plan template (name, active state, mode, session/day count, ID)
- action: 'get_workout_plan' (fields: plan_id) — returns one plan with its full session/day assignments
- action: 'get_active_workout_plan' (fields: date?) — returns the user's active workout plan progression and upcoming session/assignments for today or the specified date
- action: 'create_workout_plan' (fields: plan_name, schedule_type?, is_active?, description?, start_date?, end_date?, sessions) — creates a workout plan. "sessions" is an array of assignments (preset_name/workout_preset_id or exercise_name/exercise_id). Default schedule_type is sequential.
- action: 'update_workout_plan' (fields: plan_id, confirmed, plan_name?, schedule_type?, is_active?, description?, start_date?, end_date?, sessions?) — updates a plan. confirmed=true required. If sessions is provided, replaces all assignments.
- action: 'delete_workout_plan' (fields: plan_id, confirmed) — permanently deletes the plan with the given ID. confirmed=true required.
- action: 'propose_plan_changes' (fields: plan_id?) — read-only: reviews the active (or given) plan against recent training and proposes planned-weight changes (add a step, lighten, or hold) with the reason for each. Changes nothing.
- action: 'apply_plan_changes' (fields: plan_id, assignment_ids, confirmed) — writes the planned weights proposed by propose_plan_changes for the assignment_ids the user agreed to. confirmed=true required. Weights come from the rules, never from you.`,
      inputSchema: manageWorkoutPlansInput,
      execute: async (rawArgs) => {
        const normalized = normalizeActionArgs(
          rawArgs,
          tz,
          VALID_ACTIONS,
          () => 'list_workout_plans'
        );
        const parsed = manageWorkoutPlansSchema.safeParse(normalized);
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        const args: ManageWorkoutPlansInput = parsed.data;
        try {
          switch (args.action) {
            case 'list_workout_plans': {
              const rows =
                (await workoutPlanTemplateService.getWorkoutPlanTemplatesByUserId(
                  userId
                )) as unknown as WorkoutPlanTemplateRow[];
              return formatList(rows, 'Workout Plans', (row) => {
                const isSequential = row.schedule_type === 'sequential';
                const state = row.is_active ? 'active' : 'inactive';
                if (isSequential) {
                  const sessionCount =
                    new Set(
                      row.assignments
                        ?.map((a) => a.session_index)
                        .filter((idx) => idx !== null && idx !== undefined)
                    ).size || (row.assignments?.length ? 1 : 0);
                  return `**${row.plan_name}** (${state}, sequential, ${sessionCount} session${sessionCount === 1 ? '' : 's'})\n  ID: ${row.id}`;
                } else {
                  const dayCount =
                    new Set(
                      row.assignments
                        ?.map((a) => a.day_of_week)
                        .filter((d) => d !== null && d !== undefined)
                    ).size || (row.assignments?.length ? 1 : 0);
                  return `**${row.plan_name}** (${state}, weekly, ${dayCount} day${dayCount === 1 ? '' : 's'})\n  ID: ${row.id}`;
                }
              });
            }

            case 'get_workout_plan': {
              const plan =
                (await workoutPlanTemplateService.getWorkoutPlanTemplateById(
                  userId,
                  args.plan_id
                )) as unknown as WorkoutPlanTemplateRow;
              const assignments = plan.assignments ?? [];
              const isSequential = plan.schedule_type === 'sequential';

              if (assignments.length === 0) {
                return `# Workout Plan: ${plan.plan_name} (${isSequential ? 'Sequential' : 'Weekly'})\n\n_No assignments in this plan._`;
              }

              if (isSequential) {
                const sessionMap = new Map<
                  number,
                  WorkoutPlanAssignmentRow[]
                >();
                for (const a of assignments) {
                  const idx = a.session_index ?? 1;
                  if (!sessionMap.has(idx)) {
                    sessionMap.set(idx, []);
                  }
                  sessionMap.get(idx)!.push(a);
                }
                const sortedIndexes = Array.from(sessionMap.keys()).sort(
                  (x, y) => x - y
                );
                const sections: string[] = [
                  `# Workout Plan: ${plan.plan_name} (Sequential)\n`,
                ];
                for (const sIdx of sortedIndexes) {
                  const sAssignments = sessionMap.get(sIdx)!;
                  const sName = sAssignments.find(
                    (a) => a.session_name
                  )?.session_name;
                  const header = sName
                    ? `Session ${sIdx} — ${sName}:`
                    : `Session ${sIdx}:`;
                  sections.push(header);
                  sAssignments.forEach((a, i) => {
                    sections.push(`  ${i + 1}. ${formatPlanAssignmentLine(a)}`);
                  });
                  sections.push('');
                }
                return sections.join('\n').trim();
              } else {
                const dayMap = new Map<number, WorkoutPlanAssignmentRow[]>();
                for (const a of assignments) {
                  const dow = a.day_of_week ?? 0;
                  if (!dayMap.has(dow)) {
                    dayMap.set(dow, []);
                  }
                  dayMap.get(dow)!.push(a);
                }
                const sortedDays = Array.from(dayMap.keys()).sort(
                  (x, y) => x - y
                );
                const sections: string[] = [
                  `# Workout Plan: ${plan.plan_name} (Weekly)\n`,
                ];
                for (const dow of sortedDays) {
                  const dayName = DAY_NAMES[dow] ?? `Day ${dow}`;
                  sections.push(`${dayName}:`);
                  const dayAssignments = dayMap.get(dow)!;
                  dayAssignments.forEach((a, i) => {
                    sections.push(`  ${i + 1}. ${formatPlanAssignmentLine(a)}`);
                  });
                  sections.push('');
                }
                return sections.join('\n').trim();
              }
            }

            case 'get_active_workout_plan': {
              const targetDate = args.date || todayInZone(tz);
              const plans =
                (await workoutPlanTemplateService.getActiveWorkoutPlanForDate(
                  userId,
                  targetDate
                )) as unknown as WorkoutPlanTemplateRow[];
              if (!plans || plans.length === 0) {
                return `No active workout plan found for ${targetDate}.`;
              }
              const lines: string[] = [];
              for (const plan of plans) {
                const isSequential = plan.schedule_type === 'sequential';
                if (isSequential) {
                  const pos = plan.sequence_position;
                  const posStr = pos
                    ? `Session ${pos.current} of ${pos.total}${pos.session_name ? ' — ' + pos.session_name : ''}`
                    : 'Next session';
                  lines.push(
                    `# Active Plan: **${plan.plan_name}** (Sequential)`
                  );
                  lines.push(`Next up: ${posStr}`);
                  const nextList =
                    plan.next_assignments && plan.next_assignments.length > 0
                      ? plan.next_assignments
                      : plan.next_assignment
                        ? [plan.next_assignment]
                        : [];
                  if (nextList.length > 0) {
                    lines.push('\n**Assignments in this session:**');
                    nextList.forEach((a, idx) => {
                      lines.push(`${idx + 1}. ${formatPlanAssignmentLine(a)}`);
                    });
                  } else {
                    lines.push('\n_No assignments remaining in this cycle._');
                  }
                } else {
                  // The repository already selects this date's weekday
                  // assignments into next_assignments.
                  const dayAssignments = plan.next_assignments ?? [];
                  const dayOfWeek =
                    dayAssignments[0]?.day_of_week ??
                    new Date(`${targetDate}T12:00:00Z`).getUTCDay();
                  const dayName = DAY_NAMES[dayOfWeek] ?? `Day ${dayOfWeek}`;
                  lines.push(`# Active Plan: **${plan.plan_name}** (Weekly)`);
                  if (dayAssignments.length > 0) {
                    lines.push(`\n**Session for ${dayName} (${targetDate}):**`);
                    dayAssignments.forEach((a, idx) => {
                      lines.push(`${idx + 1}. ${formatPlanAssignmentLine(a)}`);
                    });
                  } else {
                    lines.push(
                      `\nRest day: nothing scheduled for ${dayName} (${targetDate}).`
                    );
                  }
                }
              }
              return lines.join('\n');
            }

            case 'create_workout_plan': {
              const sessionsResult = parseSessionsInput(
                args.sessions ?? args.assignments
              );
              if (!sessionsResult.ok) return sessionsResult.error;
              const parsedSessions = sessionsResult.sessions ?? [];

              const scheduleType = args.schedule_type || 'sequential';
              let entryMode = args.entry_mode;
              let notice = '';
              if (scheduleType === 'sequential') {
                if (entryMode === 'prefill') {
                  notice =
                    ' Note: Sequential plans only support "prompt" entry mode (coerced to prompt).';
                }
                entryMode = 'prompt';
              }

              let resolvedAssignments: WorkoutPlanAssignmentInput[] = [];
              if (parsedSessions.length > 0) {
                try {
                  resolvedAssignments = await resolvePlanAssignments(
                    userId,
                    parsedSessions,
                    scheduleType
                  );
                } catch (err) {
                  return ERRORS.VALIDATION(
                    err instanceof Error ? err.message : String(err)
                  );
                }
              }

              const created =
                await workoutPlanTemplateService.createWorkoutPlanTemplate(
                  userId,
                  {
                    plan_name: args.plan_name,
                    description: args.description,
                    schedule_type: scheduleType,
                    entry_mode: entryMode,
                    is_active: args.is_active ?? false,
                    start_date: args.start_date,
                    end_date: args.end_date,
                    assignments: resolvedAssignments,
                    currentClientDate: todayInZone(tz),
                  }
                );

              return formatConfirmation(
                `Workout plan "${created.plan_name}" created (ID: ${created.id}, ${scheduleType}, ${resolvedAssignments.length} assignment${resolvedAssignments.length === 1 ? '' : 's'}).${notice}`
              );
            }

            case 'update_workout_plan': {
              const blocked = planMutationConfirmPrompt(
                args.confirmed,
                'update',
                args.plan_id
              );
              if (blocked) return blocked;

              const sessionsResult = parseSessionsInput(
                args.sessions ?? args.assignments
              );
              if (!sessionsResult.ok) return sessionsResult.error;
              const parsedSessions = sessionsResult.sessions;

              // Always load the plan: the effective schedule type decides how
              // sessions resolve and whether entry_mode is forced to prompt.
              // Guessing 'sequential' here would flip a weekly prefill plan to
              // prompt on an unrelated edit (e.g. renaming it).
              const existing =
                (await workoutPlanTemplateService.getWorkoutPlanTemplateById(
                  userId,
                  args.plan_id
                )) as unknown as WorkoutPlanTemplateRow;

              const targetScheduleType =
                args.schedule_type ?? existing.schedule_type ?? 'weekly';

              let resolvedAssignments: WorkoutPlanAssignmentInput[] | undefined;
              if (parsedSessions !== undefined) {
                try {
                  resolvedAssignments = await resolvePlanAssignments(
                    userId,
                    parsedSessions,
                    targetScheduleType
                  );
                } catch (err) {
                  return ERRORS.VALIDATION(
                    err instanceof Error ? err.message : String(err)
                  );
                }
              }

              let entryMode = args.entry_mode;
              let notice = '';
              if (targetScheduleType === 'sequential' && entryMode) {
                if (entryMode === 'prefill') {
                  notice =
                    ' Note: Sequential plans only support "prompt" entry mode (coerced to prompt).';
                }
                entryMode = 'prompt';
              }

              const updated =
                await workoutPlanTemplateService.updateWorkoutPlanTemplate(
                  userId,
                  args.plan_id,
                  {
                    plan_name: args.plan_name ?? existing.plan_name,
                    description:
                      args.description ?? existing.description ?? null,
                    schedule_type:
                      args.schedule_type ?? existing.schedule_type ?? undefined,
                    entry_mode: entryMode ?? existing.entry_mode ?? undefined,
                    is_active: args.is_active ?? existing.is_active ?? false,
                    start_date: args.start_date ?? existing.start_date ?? null,
                    end_date: args.end_date ?? existing.end_date ?? null,
                    assignments: resolvedAssignments,
                    currentClientDate: todayInZone(tz),
                  }
                );

              return formatConfirmation(
                `Workout plan "${updated.plan_name}" updated.${notice}`
              );
            }

            case 'delete_workout_plan': {
              const blocked = planMutationConfirmPrompt(
                args.confirmed,
                'delete',
                args.plan_id
              );
              if (blocked) return blocked;

              await workoutPlanTemplateService.deleteWorkoutPlanTemplate(
                userId,
                args.plan_id
              );
              return formatConfirmation('Workout plan deleted.');
            }

            case 'propose_plan_changes': {
              const result = await planProposalService.getPlanProposals(
                userId,
                args.plan_id
              );
              if (!result) {
                return args.plan_id === undefined
                  ? 'The user has no active workout plan. Offer to create one or to activate one; do not invent changes.'
                  : ERRORS.NOT_FOUND('Workout plan', String(args.plan_id));
              }
              return formatPlanProposals(
                result.plan.plan_name,
                result.proposals,
                result.unit,
                result.plan.entry_mode === 'prefill'
              );
            }

            case 'apply_plan_changes': {
              if (args.confirmed !== true) {
                return `Applying plan changes edits the planned weights of plan ${args.plan_id}. Confirm with the user first, naming each exercise and the new weight from propose_plan_changes. If they agree, call apply_plan_changes again with the same plan_id and assignment_ids and confirmed=true. Nothing was changed.`;
              }
              const result = await planProposalService.applyPlanProposals(
                userId,
                args.plan_id,
                args.assignment_ids
              );
              if (result === null) {
                return ERRORS.NOT_FOUND('Workout plan', String(args.plan_id));
              }
              if (result === 'prefill') {
                return ERRORS.VALIDATION(
                  'This plan pre-fills diary entries, so its weights cannot be edited here. Use update_workout_plan instead.'
                );
              }
              if (result.applied.length === 0) {
                return 'No planned weight was changed: none of those assignments has a current proposal with a weight change. Call propose_plan_changes again for the current list.';
              }
              const done = result.applied.map((p) => p.exerciseName).join(', ');
              return formatConfirmation(
                `Updated planned weights for ${done}.` +
                  (result.skipped.length > 0
                    ? ` Not changed (no current proposal): assignment ${result.skipped.join(', ')}.`
                    : '')
              );
            }

            default:
              return ERRORS.INVALID_ACTION(
                String((args as ManageWorkoutPlansInput).action),
                VALID_ACTIONS
              );
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : '';
          if (isAssignmentValidationError(message)) {
            return ERRORS.VALIDATION(message);
          }
          if (message.includes('not found')) {
            return ERRORS.NOT_FOUND(
              'Workout plan',
              'plan_id' in args ? String(args.plan_id) : ''
            );
          }
          log('error', '[Workout Plan Tool] Error:', error);
          return ERRORS.DB_ERROR(error);
        }
      },
    }),
  };
}
