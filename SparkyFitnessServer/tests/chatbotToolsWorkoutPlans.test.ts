import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/workoutPlanTemplateService.js', () => ({
  default: {
    getWorkoutPlanTemplatesByUserId: vi.fn(),
    getWorkoutPlanTemplateById: vi.fn(),
    deleteWorkoutPlanTemplate: vi.fn(),
  },
}));

vi.mock('../config/logging.js', () => ({
  log: vi.fn(),
}));

import workoutPlanTemplateService from '../services/workoutPlanTemplateService.js';
import { buildWorkoutPlanTools } from '../ai/tools/workoutPlanTools.js';

const opts = { toolCallId: 'tc-1', messages: [] };

const PLAN_ID = '123e4567-e89b-12d3-a456-426614174000';

const DB_ERROR_TEXT =
  'Error [DB_ERROR]: A database error occurred.\n\nSuggestion: Do NOT retry the same call — it will fail the same way. Tell the user what failed and stop.';

const svc = workoutPlanTemplateService as unknown as {
  getWorkoutPlanTemplatesByUserId: ReturnType<typeof vi.fn>;
  getWorkoutPlanTemplateById: ReturnType<typeof vi.fn>;
  deleteWorkoutPlanTemplate: ReturnType<typeof vi.fn>;
};

function getTool() {
  const tools = buildWorkoutPlanTools('user-1', 'UTC');
  return tools.sparky_manage_workout_plans;
}

describe('sparky_manage_workout_plans', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists workout plans (inferred from {})', async () => {
    svc.getWorkoutPlanTemplatesByUserId.mockResolvedValue([
      {
        id: PLAN_ID,
        plan_name: 'Push Pull Legs',
        is_active: true,
        assignments: [{ day_of_week: 1 }, { day_of_week: 3 }],
      },
      {
        id: '223e4567-e89b-12d3-a456-426614174000',
        plan_name: 'Beginner',
        is_active: false,
        assignments: [{ day_of_week: 0 }],
      },
    ]);
    const result = await getTool().execute!({}, opts);
    expect(result).toBe(
      '# Workout Plans\n\n**Push Pull Legs** (active, 2 assignments)\n  ID: ' +
        PLAN_ID +
        '\n\n**Beginner** (inactive, 1 assignment)\n  ID: 223e4567-e89b-12d3-a456-426614174000'
    );
  });

  it('renders no results when there are no plans', async () => {
    svc.getWorkoutPlanTemplatesByUserId.mockResolvedValue([]);
    const result = await getTool().execute!(
      { action: 'list_workout_plans' },
      opts
    );
    expect(result).toBe('# Workout Plans\n\nNo results found.');
  });

  it('gets a workout plan with its assignments', async () => {
    svc.getWorkoutPlanTemplateById.mockResolvedValue({
      id: PLAN_ID,
      plan_name: 'Push Pull Legs',
      is_active: true,
      assignments: [
        {
          day_of_week: 1,
          workout_preset_name: 'Push Day',
          sets: [{ id: 's1' }, { id: 's2' }, { id: 's3' }],
        },
        {
          day_of_week: 3,
          exercise_name: 'Deadlift',
          sets: [{ id: 's4' }],
        },
        { day_of_week: 5 },
      ],
    });
    const result = await getTool().execute!(
      { action: 'get_workout_plan', plan_id: PLAN_ID },
      opts
    );
    expect(result).toBe(
      '# Workout Plan: Push Pull Legs\n\nMonday: Push Day — 3 sets\n\nWednesday: Deadlift — 1 set\n\nFriday: Unknown item'
    );
    expect(svc.getWorkoutPlanTemplateById).toHaveBeenCalledWith(
      'user-1',
      PLAN_ID
    );
  });

  it('returns NOT_FOUND when getting a missing plan', async () => {
    svc.getWorkoutPlanTemplateById.mockRejectedValue(
      new Error('Workout plan template not found.')
    );
    const result = await getTool().execute!(
      { action: 'get_workout_plan', plan_id: PLAN_ID },
      opts
    );
    expect(result).toBe(
      "Error [NOT_FOUND]: Workout plan with ID '" +
        PLAN_ID +
        "' not found.\n\nSuggestion: Check the ID and try again."
    );
  });

  it('deletes a workout plan', async () => {
    svc.deleteWorkoutPlanTemplate.mockResolvedValue({
      message: 'Workout plan template deleted successfully.',
    });
    const result = await getTool().execute!(
      { action: 'delete_workout_plan', plan_id: PLAN_ID },
      opts
    );
    expect(result).toBe('✅ Workout plan deleted.');
    expect(svc.deleteWorkoutPlanTemplate).toHaveBeenCalledWith(
      'user-1',
      PLAN_ID
    );
  });

  it('returns NOT_FOUND when deleting a missing plan', async () => {
    svc.deleteWorkoutPlanTemplate.mockRejectedValue(
      new Error('Workout plan template not found.')
    );
    const result = await getTool().execute!(
      { action: 'delete_workout_plan', plan_id: PLAN_ID },
      opts
    );
    expect(result).toBe(
      "Error [NOT_FOUND]: Workout plan with ID '" +
        PLAN_ID +
        "' not found.\n\nSuggestion: Check the ID and try again."
    );
  });

  it('rejects a non-UUID plan_id (VALIDATION)', async () => {
    const result = await getTool().execute!(
      { action: 'get_workout_plan', plan_id: 'not-a-uuid' },
      opts
    );
    expect(result).toContain('Error [VALIDATION]');
    expect(svc.getWorkoutPlanTemplateById).not.toHaveBeenCalled();
  });

  it('returns DB_ERROR when the service throws a generic error', async () => {
    svc.getWorkoutPlanTemplatesByUserId.mockRejectedValue(new Error('boom'));
    const result = await getTool().execute!(
      { action: 'list_workout_plans' },
      opts
    );
    expect(result).toBe(DB_ERROR_TEXT);
  });
});
