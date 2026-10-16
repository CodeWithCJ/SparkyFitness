import {
  findProgram,
  storedProgramStatus,
  type RunProgramResponse,
} from '@workspace/shared';

/** A stored Beginner 5K program for screen tests, three workouts done. */
export function storedBeginnerProgram(
  overrides: Partial<RunProgramResponse> = {}
): RunProgramResponse {
  return {
    id: 'rp1',
    program_id: 'beginner5k',
    name: null,
    activity: null,
    enabled: true,
    next_index: 3,
    workouts: findProgram('beginner5k')!.workouts,
    adjustment_log: [],
    effort_log: [{ index: 1, rating: 7, at: '2026-10-08T12:30:00.000Z' }],
    completion_log: [
      { index: 0, entry_id: 'entry-0', at: '2026-10-06T12:00:00.000Z' },
      { index: 1, entry_id: 'entry-1', at: '2026-10-08T12:00:00.000Z' },
      { index: 2, entry_id: 'entry-2', at: '2026-10-11T12:00:00.000Z' },
    ],
    run_days: [2, 4, 0],
    start_date: null,
    end_date: null,
    last_done_date: '2026-10-11',
    updated_at: '2026-10-11T12:00:00.000Z',
    ...overrides,
  };
}

/** What `useRunProgram` returns for `program`. */
export function runProgramHookValue(program: RunProgramResponse | null) {
  return {
    program,
    status: program ? storedProgramStatus(program) : null,
    enabled: program?.enabled ?? false,
    lastAdjustment: null,
    schedule: {
      days: program?.run_days ?? [],
      startDay: program?.start_date ?? null,
      endDay: program?.end_date ?? null,
    },
    doneDay: program?.last_done_date ?? null,
    loaded: true,
    refetch: jest.fn(() => Promise.resolve()),
  };
}
