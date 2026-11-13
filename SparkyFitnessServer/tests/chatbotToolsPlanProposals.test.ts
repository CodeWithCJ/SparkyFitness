import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/workoutPlanTemplateService.js', () => ({ default: {} }));
vi.mock('../models/workoutPresetRepository.js', () => ({ default: {} }));
vi.mock('../services/planProposalService.js', () => ({
  default: { getPlanProposals: vi.fn(), applyPlanProposals: vi.fn() },
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

import planProposalService from '../services/planProposalService.js';
import { buildWorkoutPlanTools } from '../ai/tools/workoutPlanTools.js';
import { toolOpts } from './helpers/toolExecutionOptions.js';

const svc = planProposalService as unknown as {
  getPlanProposals: ReturnType<typeof vi.fn>;
  applyPlanProposals: ReturnType<typeof vi.fn>;
};

const run = (args: Record<string, unknown>) =>
  buildWorkoutPlanTools('user-1', 'UTC').sparky_manage_workout_plans.execute!(
    args as never,
    toolOpts
  );

const increase = {
  assignmentId: 7,
  exerciseId: 'ex-squat',
  exerciseName: 'Squat',
  kind: 'increase',
  reason: 'hit_plan_twice',
  suggestAlternative: false,
  setChanges: [
    { setId: 2, fromKg: 100, toKg: 102.5 },
    { setId: 3, fromKg: 100, toKg: 102.5 },
  ],
};
const hold = {
  assignmentId: 8,
  exerciseId: 'ex-bench',
  exerciseName: 'Bench Press',
  kind: 'hold',
  reason: 'stalled',
  suggestAlternative: false,
  setChanges: [],
};

const proposed = (over: Record<string, unknown> = {}) => ({
  plan: {
    id: 42,
    plan_name: 'Push Pull',
    schedule_type: 'sequential',
    entry_mode: 'prompt',
  },
  unit: 'kg',
  proposals: [increase, hold],
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('propose_plan_changes', () => {
  it('lists each proposal with its id, weights and reason, and changes nothing', async () => {
    svc.getPlanProposals.mockResolvedValue(proposed());
    const result = (await run({ action: 'propose_plan_changes' })) as string;

    expect(svc.getPlanProposals).toHaveBeenCalledWith('user-1', undefined);
    expect(result).toContain('# Proposed changes to "Push Pull"');
    expect(result).toContain(
      '- **Squat** (assignment_id 7): increase working sets 100 → 102.5 kg, because the planned weight and reps were met in each of the last two sessions.'
    );
    expect(result).toContain(
      '- **Bench Press** (assignment_id 8): keep the weights, because the estimated one-rep max has stopped improving.'
    );
    expect(result).toContain('A stall can be a planned deload');
    expect(result).toContain('Nothing was changed.');
    expect(svc.applyPlanProposals).not.toHaveBeenCalled();
  });

  it('shows weights in pounds for a lbs lifter', async () => {
    svc.getPlanProposals.mockResolvedValue(proposed({ unit: 'lbs' }));
    const result = (await run({ action: 'propose_plan_changes' })) as string;
    expect(result).toContain('220.5 → 226 lbs');
  });

  it('says plainly when nothing is warranted', async () => {
    svc.getPlanProposals.mockResolvedValue(proposed({ proposals: [] }));
    const result = (await run({ action: 'propose_plan_changes' })) as string;
    expect(result).toContain('No change is warranted right now');
  });

  it('points a prefill plan at update_workout_plan', async () => {
    svc.getPlanProposals.mockResolvedValue(
      proposed({
        plan: { id: 42, plan_name: 'Weekly', entry_mode: 'prefill' },
      })
    );
    const result = (await run({
      action: 'propose_plan_changes',
      plan_id: 42,
    })) as string;
    expect(svc.getPlanProposals).toHaveBeenCalledWith('user-1', 42);
    expect(result).toContain('cannot be applied here');
    expect(result).not.toContain('apply_plan_changes (plan_id');
  });

  it('reports no active plan, and a missing plan id', async () => {
    svc.getPlanProposals.mockResolvedValue(null);
    expect((await run({ action: 'propose_plan_changes' })) as string).toContain(
      'no active workout plan'
    );
    expect(
      (await run({ action: 'propose_plan_changes', plan_id: 9 })) as string
    ).toContain('NOT_FOUND');
  });
});

describe('apply_plan_changes', () => {
  it('asks for confirmation and writes nothing without confirmed=true', async () => {
    const result = (await run({
      action: 'apply_plan_changes',
      plan_id: 42,
      assignment_ids: [7],
    })) as string;
    expect(result).toContain('Confirm with the user first');
    expect(svc.applyPlanProposals).not.toHaveBeenCalled();
  });

  it('applies the confirmed assignments and names what changed', async () => {
    svc.applyPlanProposals.mockResolvedValue({
      applied: [increase],
      skipped: [9],
    });
    const result = (await run({
      action: 'apply_plan_changes',
      plan_id: 42,
      assignment_ids: [7, 9],
      confirmed: true,
    })) as string;
    expect(svc.applyPlanProposals).toHaveBeenCalledWith('user-1', 42, [7, 9]);
    expect(result).toContain('Updated planned weights for Squat.');
    expect(result).toContain('Not changed (no current proposal): assignment 9');
  });

  it('refuses a prefill plan and reports an empty result', async () => {
    svc.applyPlanProposals.mockResolvedValue('prefill');
    expect(
      (await run({
        action: 'apply_plan_changes',
        plan_id: 42,
        assignment_ids: [7],
        confirmed: true,
      })) as string
    ).toContain('update_workout_plan');

    svc.applyPlanProposals.mockResolvedValue({ applied: [], skipped: [7] });
    expect(
      (await run({
        action: 'apply_plan_changes',
        plan_id: 42,
        assignment_ids: [7],
        confirmed: true,
      })) as string
    ).toContain('No planned weight was changed');
  });

  it('requires at least one assignment id', async () => {
    const result = (await run({
      action: 'apply_plan_changes',
      plan_id: 42,
      assignment_ids: [],
      confirmed: true,
    })) as string;
    expect(result).toContain('VALIDATION');
    expect(svc.applyPlanProposals).not.toHaveBeenCalled();
  });
});
