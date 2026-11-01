import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../models/reportRepository.js', () => ({
  default: { getExerciseEntries: vi.fn() },
}));
vi.mock('../models/workoutPlanTemplateRepository.js', () => ({
  default: {
    getWorkoutPlanTemplateById: vi.fn(),
    getWorkoutPlanTemplatesByUserId: vi.fn(),
    getWorkoutPlanTemplateOwnerId: vi.fn(),
    updatePlannedSetWeights: vi.fn(),
  },
}));
vi.mock('../services/preferenceService.js', () => ({
  default: { getUserPreferences: vi.fn() },
}));
vi.mock('../services/adaptiveWorkoutService.js', () => ({
  getWorkoutCoachingSignals: vi.fn(),
}));
vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn().mockResolvedValue('UTC'),
}));

import reportRepository from '../models/reportRepository.js';
import planRepo from '../models/workoutPlanTemplateRepository.js';
import preferenceService from '../services/preferenceService.js';
import { getWorkoutCoachingSignals } from '../services/adaptiveWorkoutService.js';
import planProposalService from '../services/planProposalService.js';

const repo = planRepo as unknown as {
  getWorkoutPlanTemplateById: ReturnType<typeof vi.fn>;
  getWorkoutPlanTemplatesByUserId: ReturnType<typeof vi.fn>;
  getWorkoutPlanTemplateOwnerId: ReturnType<typeof vi.fn>;
  updatePlannedSetWeights: ReturnType<typeof vi.fn>;
};
const entries = reportRepository as unknown as {
  getExerciseEntries: ReturnType<typeof vi.fn>;
};
const prefs = preferenceService as unknown as {
  getUserPreferences: ReturnType<typeof vi.fn>;
};

const plan = (entryMode: 'prompt' | 'prefill' = 'prompt') => ({
  id: 42,
  plan_name: 'Lower',
  is_active: true,
  schedule_type: 'sequential',
  entry_mode: entryMode,
  assignments: [
    {
      id: 7,
      exercise_id: 'ex-squat',
      exercise_name: 'Squat',
      modality: 'weight_reps',
      sets: [
        { id: 2, set_type: 'Working Set', reps: 5, weight: '100.00' },
        { id: 3, set_type: 'Working Set', reps: 5, weight: '100.00' },
      ],
    },
    {
      id: 8,
      workout_preset_id: 3,
      exercise_id: null,
      sets: [],
    },
  ],
});

const session = (day: string) => ({
  entry_date: day,
  exercise_id: 'ex-squat',
  exercise_name: 'Squat',
  exercise_modality: 'weight_reps',
  sets: [
    { set_type: 'Working Set', reps: 5, weight: 100 },
    { set_type: 'Working Set', reps: 5, weight: 100 },
  ],
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T12:00:00Z'));
  repo.getWorkoutPlanTemplateById.mockResolvedValue(plan());
  entries.getExerciseEntries.mockResolvedValue([
    session('2026-10-12'),
    session('2026-10-08'),
  ]);
  prefs.getUserPreferences.mockResolvedValue({ default_weight_unit: 'kg' });
  vi.mocked(getWorkoutCoachingSignals).mockResolvedValue({
    adaptive_suggestions: true,
    signals: [],
  });
  repo.getWorkoutPlanTemplateOwnerId.mockResolvedValue('user-1');
  repo.updatePlannedSetWeights.mockResolvedValue(2);
});

afterEach(() => vi.useRealTimers());

describe('getPlanProposals', () => {
  it('proposes from the plan and the logged sessions, skipping preset assignments', async () => {
    const result = await planProposalService.getPlanProposals('user-1', 42);
    expect(result?.proposals).toHaveLength(1);
    expect(result?.proposals[0]).toMatchObject({
      assignmentId: 7,
      kind: 'increase',
      reason: 'hit_plan_twice',
    });
    expect(result?.proposals[0]!.setChanges).toEqual([
      { setId: 2, fromKg: 100, toKg: 102.5 },
      { setId: 3, fromKg: 100, toKg: 102.5 },
    ]);
  });

  it('falls back to the active plan when no id is given', async () => {
    repo.getWorkoutPlanTemplatesByUserId.mockResolvedValue([
      { id: 5, is_active: false },
      { id: 42, is_active: true },
    ]);
    await planProposalService.getPlanProposals('user-1');
    expect(repo.getWorkoutPlanTemplateById).toHaveBeenCalledWith(42, 'user-1');
  });

  it('returns null with no plan', async () => {
    repo.getWorkoutPlanTemplatesByUserId.mockResolvedValue([]);
    expect(await planProposalService.getPlanProposals('user-1')).toBeNull();
    repo.getWorkoutPlanTemplateById.mockResolvedValue(null);
    expect(await planProposalService.getPlanProposals('user-1', 9)).toBeNull();
  });
});

describe('evidence already acted on', () => {
  const stamped = (appliedAt: string | null) => {
    const base = plan();
    return {
      ...base,
      assignments: [
        { ...base.assignments[0]!, proposals_applied_at: appliedAt },
        base.assignments[1]!,
      ],
    };
  };

  it("uses the assignment's last apply as the cutoff and drops older sessions", async () => {
    repo.getWorkoutPlanTemplateById.mockResolvedValue(
      stamped('2026-10-10T10:00:00Z')
    );
    entries.getExerciseEntries.mockResolvedValue([
      { ...session('2026-10-12'), created_at: '2026-10-12T18:00:00Z' },
      { ...session('2026-10-08'), created_at: '2026-10-08T18:00:00Z' },
    ]);
    const result = await planProposalService.getPlanProposals('user-1', 42);
    expect(getWorkoutCoachingSignals).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      ['ex-squat'],
      null,
      new Date('2026-10-10T10:00:00Z')
    );
    expect(result?.proposals).toEqual([]);
  });

  it('has no cutoff for an assignment nothing was applied to', async () => {
    repo.getWorkoutPlanTemplateById.mockResolvedValue(stamped(null));
    await planProposalService.getPlanProposals('user-1', 42);
    expect(getWorkoutCoachingSignals).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      ['ex-squat'],
      null,
      null
    );
  });
});

describe('applyPlanProposals', () => {
  it('writes only the recomputed weights for the asked assignments', async () => {
    const result = await planProposalService.applyPlanProposals(
      'user-1',
      42,
      [7, 99]
    );
    expect(repo.updatePlannedSetWeights).toHaveBeenCalledWith('user-1', 42, [
      { setId: 2, weightKg: 102.5 },
      { setId: 3, weightKg: 102.5 },
    ]);
    expect(result).toMatchObject({ skipped: [99] });
    expect(
      (result as { applied: { exerciseName: string }[] }).applied[0]!
        .exerciseName
    ).toBe('Squat');
  });

  it('writes nothing when the assignment has no current proposal', async () => {
    entries.getExerciseEntries.mockResolvedValue([session('2026-10-12')]);
    repo.updatePlannedSetWeights.mockResolvedValue(0);
    const result = await planProposalService.applyPlanProposals(
      'user-1',
      42,
      [7]
    );
    expect(repo.updatePlannedSetWeights).toHaveBeenCalledWith('user-1', 42, []);
    expect(result).toMatchObject({ applied: [], skipped: [7] });
  });

  it('refuses a prefill plan without writing', async () => {
    repo.getWorkoutPlanTemplateById.mockResolvedValue(plan('prefill'));
    expect(
      await planProposalService.applyPlanProposals('user-1', 42, [7])
    ).toBe('prefill');
    expect(repo.updatePlannedSetWeights).not.toHaveBeenCalled();
  });

  it('rejects a plan owned by another user without writing', async () => {
    repo.getWorkoutPlanTemplateOwnerId.mockResolvedValue('someone-else');
    await expect(
      planProposalService.applyPlanProposals('user-1', 42, [7])
    ).rejects.toThrow('Forbidden');
    expect(repo.updatePlannedSetWeights).not.toHaveBeenCalled();
  });

  it('returns null for a missing plan', async () => {
    repo.getWorkoutPlanTemplateOwnerId.mockResolvedValue(null);
    repo.getWorkoutPlanTemplateById.mockResolvedValue(null);
    expect(
      await planProposalService.applyPlanProposals('user-1', 9, [7])
    ).toBeNull();
  });
});
