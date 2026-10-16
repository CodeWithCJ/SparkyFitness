import type {
  SaveWorkoutPlanPayload,
  WorkoutPlanDraft,
  WorkoutPlanDraftAssignment,
  WorkoutPlanScheduleType,
  WorkoutPlanTemplate,
  WorkoutPlanValidationErrors,
} from '../types/workoutPlans';

function calendarDay(value: string | null | undefined): string {
  return value?.slice(0, 10) ?? '';
}

let keyCounter = 0;
function nextKey(): string {
  keyCounter += 1;
  return `new-${keyCounter}`;
}

export function createPresetAssignment(
  preset: { id: string | number; name: string },
  slot: { dayOfWeek: number | null; sessionIndex: number | null }
): WorkoutPlanDraftAssignment {
  return {
    key: nextKey(),
    day_of_week: slot.dayOfWeek,
    session_index: slot.sessionIndex,
    workout_preset_id: String(preset.id),
    workout_preset_name: preset.name,
    exercise_id: null,
    exercise_name: null,
    sets: [],
  };
}

export function createWorkoutPlanDraft(
  today: string,
  template?: WorkoutPlanTemplate
): WorkoutPlanDraft {
  if (!template) {
    return {
      planName: '',
      description: '',
      scheduleType: 'weekly',
      entryMode: 'prompt',
      startDate: today,
      endDate: '',
      isActive: true,
      sessionNames: {},
      sessionCount: 1,
      assignments: [],
    };
  }

  const scheduleType: WorkoutPlanScheduleType =
    template.schedule_type === 'sequential' ? 'sequential' : 'weekly';
  const sessionNames: Record<number, string> = {};
  let sessionCount = 1;
  const assignments = (template.assignments ?? []).map((assignment) => {
    const sessionIndex =
      scheduleType === 'sequential' ? (assignment.session_index ?? 1) : null;
    if (sessionIndex !== null) {
      sessionCount = Math.max(sessionCount, sessionIndex);
      if (assignment.session_name && !sessionNames[sessionIndex]) {
        sessionNames[sessionIndex] = assignment.session_name;
      }
    }
    return {
      id: assignment.id,
      key: String(assignment.id),
      day_of_week: scheduleType === 'weekly' ? assignment.day_of_week : null,
      session_index: sessionIndex,
      workout_preset_id: assignment.workout_preset_id
        ? String(assignment.workout_preset_id)
        : null,
      workout_preset_name: assignment.workout_preset_name ?? null,
      exercise_id: assignment.exercise_id ?? null,
      exercise_name: assignment.exercise_name ?? null,
      sets: assignment.sets ?? [],
    };
  });

  return {
    planName: template.plan_name,
    description: template.description ?? '',
    scheduleType,
    entryMode: template.entry_mode === 'prefill' ? 'prefill' : 'prompt',
    startDate: calendarDay(template.start_date),
    endDate: calendarDay(template.end_date),
    isActive: template.is_active,
    sessionNames,
    sessionCount,
    assignments,
  };
}

export function validateWorkoutPlanDraft(
  draft: WorkoutPlanDraft
): WorkoutPlanValidationErrors {
  const errors: WorkoutPlanValidationErrors = {};
  if (!draft.planName.trim()) errors.planName = true;
  if (!draft.startDate) errors.startDate = true;
  if (draft.endDate && draft.startDate && draft.endDate < draft.startDate) {
    errors.endDate = true;
  }
  if (draft.assignments.length === 0) errors.assignments = true;
  return errors;
}

/**
 * Removes a sequential session and renumbers the ones after it, so session
 * numbers stay 1..n with no gap.
 */
export function removeSession(
  draft: WorkoutPlanDraft,
  sessionIndex: number
): WorkoutPlanDraft {
  const sessionNames: Record<number, string> = {};
  for (const [key, name] of Object.entries(draft.sessionNames)) {
    const index = Number(key);
    if (index < sessionIndex) sessionNames[index] = name;
    else if (index > sessionIndex) sessionNames[index - 1] = name;
  }
  return {
    ...draft,
    sessionNames,
    sessionCount: Math.max(1, draft.sessionCount - 1),
    assignments: draft.assignments
      .filter((assignment) => assignment.session_index !== sessionIndex)
      .map((assignment) =>
        assignment.session_index !== null &&
        assignment.session_index > sessionIndex
          ? { ...assignment, session_index: assignment.session_index - 1 }
          : assignment
      ),
  };
}

/** Switching the schedule type puts every assignment in the new shape. */
export function changeScheduleType(
  draft: WorkoutPlanDraft,
  scheduleType: WorkoutPlanScheduleType
): WorkoutPlanDraft {
  if (draft.scheduleType === scheduleType) return draft;
  // The two shapes do not map onto each other, as the server also insists
  // when it asks for new assignments with a type change.
  return {
    ...draft,
    scheduleType,
    entryMode: scheduleType === 'sequential' ? 'prompt' : draft.entryMode,
    sessionNames: {},
    sessionCount: 1,
    assignments: [],
  };
}

export function buildWorkoutPlanPayload(
  draft: WorkoutPlanDraft
): SaveWorkoutPlanPayload {
  const sequential = draft.scheduleType === 'sequential';
  const assignments = draft.assignments
    .filter(
      (assignment) => assignment.workout_preset_id || assignment.exercise_id
    )
    .map((assignment) => {
      const sameSlot = draft.assignments.filter((other) =>
        sequential
          ? other.session_index === assignment.session_index
          : other.day_of_week === assignment.day_of_week
      );
      const sessionName = sequential
        ? draft.sessionNames[assignment.session_index ?? 1]?.trim() || null
        : null;
      return {
        ...(assignment.id !== undefined ? { id: assignment.id } : {}),
        day_of_week: sequential ? null : assignment.day_of_week,
        session_index: sequential ? (assignment.session_index ?? 1) : null,
        session_name: sessionName,
        sort_order: sameSlot.indexOf(assignment),
        ...(assignment.workout_preset_id
          ? { workout_preset_id: assignment.workout_preset_id }
          : { exercise_id: assignment.exercise_id as string }),
        sets: assignment.exercise_id
          ? assignment.sets.map(({ id: _id, ...set }) => set)
          : [],
      };
    });

  return {
    plan_name: draft.planName.trim(),
    description: draft.description.trim(),
    start_date: draft.startDate,
    end_date: draft.endDate || null,
    is_active: draft.isActive,
    schedule_type: draft.scheduleType,
    entry_mode: sequential ? 'prompt' : draft.entryMode,
    assignments,
  };
}
