import {
  findProgram,
  type CustomRunProgramResponse,
  type RunProgramResponse,
} from '@workspace/shared';

/** A stored Beginner 5K program (27 workouts, three a week) at its first workout. */
export const makeRunProgram = (
  overrides: Partial<RunProgramResponse> = {}
): RunProgramResponse => ({
  id: 'run-program-1',
  program_id: 'beginner5k',
  name: null,
  activity: null,
  enabled: true,
  next_index: 0,
  workouts: findProgram('beginner5k')?.workouts ?? [],
  adjustment_log: [],
  effort_log: [],
  completion_log: [],
  run_days: [],
  start_date: null,
  end_date: null,
  last_done_date: null,
  updated_at: '2026-10-14T08:00:00.000Z',
  ...overrides,
});

export const makeCustomProgram = (
  overrides: Partial<CustomRunProgramResponse> = {}
): CustomRunProgramResponse => ({
  id: 'custom-1',
  name: 'My tempo plan',
  activity: 'run',
  workouts: (findProgram('returnToRunning')?.workouts ?? []).slice(0, 2),
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z',
  ...overrides,
});
