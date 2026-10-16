import { findProgram, type RunProgramResponse } from '@workspace/shared';
import {
  nextProgramLine,
  programWorkoutForEntry,
} from '../../src/utils/runProgramSummary';

const t = ((_key: string, options: Record<string, unknown>) =>
  String(options.defaultValue)
    .replace('{{label}}', String(options.label ?? ''))
    .replace('{{date}}', String(options.date ?? ''))) as never;

const stored = (overrides: Partial<RunProgramResponse> = {}) =>
  ({
    id: 'p',
    program_id: 'beginner5k',
    enabled: true,
    next_index: 3,
    workouts: findProgram('beginner5k')!.workouts,
    adjustment_log: [],
    effort_log: [],
    completion_log: [],
    run_days: [],
    start_date: null,
    end_date: null,
    last_done_date: null,
    updated_at: '',
    ...overrides,
  }) as RunProgramResponse;

const label = () => 'Week 2, run 1';

test('names the next workout without a date when no run days are chosen', () => {
  expect(nextProgramLine(t, stored(), '2026-10-12', label)).toBe(
    'Next: Week 2, run 1'
  );
});

test('says which day the next workout falls on, never today', () => {
  // Monday 12 Oct, Mon/Wed/Sat chosen, today's run just done: Wednesday.
  const line = nextProgramLine(
    t,
    stored({ run_days: [1, 3, 6] }),
    '2026-10-12',
    label
  );
  expect(line).toMatch(/^Next: Week 2, run 1 on .*Oct 14/);
});

test('congratulates at the end of the program', () => {
  expect(
    nextProgramLine(t, stored({ next_index: 999 }), '2026-10-12', label)
  ).toBe('Program complete. Well done!');
});

test('finds the program workout a diary entry was done as', () => {
  const program = stored({
    completion_log: [
      { index: 0, entry_id: 'a', at: '' },
      { index: 2, entry_id: 'b', at: '' },
      // Done again after a restart: the newest record wins.
      { index: 0, entry_id: 'b', at: '' },
    ],
  });
  expect(programWorkoutForEntry(program, 'a')?.workout).toEqual(
    program.workouts[0]
  );
  expect(programWorkoutForEntry(program, 'b')?.workout).toEqual(
    program.workouts[0]
  );
  expect(programWorkoutForEntry(program, 'c')).toBeNull();
  // A record past the end of the (since shortened) workouts is ignored.
  expect(
    programWorkoutForEntry(
      stored({ completion_log: [{ index: 999, entry_id: 'x', at: '' }] }),
      'x'
    )
  ).toBeNull();
});
