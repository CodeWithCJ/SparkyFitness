import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../models/runProgramRepository.js', () => ({
  getRunProgram: vi.fn(),
  upsertRunProgram: vi.fn(),
  adjustRunProgram: vi.fn(),
}));
vi.mock('../models/fitnessTestRepository.js', () => ({
  listFitnessTests: vi.fn(),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

import {
  evaluateFitnessTest,
  addDays,
  dayOfWeek,
  findProgram,
  type RunProgramResponse,
} from '@workspace/shared';
import {
  adjustRunProgram,
  getRunProgram,
  upsertRunProgram,
} from '../models/runProgramRepository.js';
import { listFitnessTests } from '../models/fitnessTestRepository.js';
import { buildRunProgramTools } from '../ai/tools/runProgramTools.js';
import { toolOpts } from './helpers/toolExecutionOptions.js';

const tool = buildRunProgramTools('user-1', 'UTC').sparky_manage_run_program;
const run = (args: Record<string, unknown>) =>
  (tool.execute as (a: unknown, o: unknown) => Promise<string>)(args, toolOpts);

const program = (overrides: Partial<RunProgramResponse> = {}) =>
  ({
    id: 'p1',
    program_id: 'beginner5k',
    name: null,
    activity: null,
    enabled: true,
    next_index: 4,
    workouts: findProgram('beginner5k')!.workouts,
    adjustment_log: [],
    effort_log: [],
    completion_log: [],
    run_days: [],
    start_date: null,
    end_date: null,
    last_done_date: null,
    updated_at: '2026-10-10T00:00:00.000Z',
    ...overrides,
  }) as RunProgramResponse;

beforeEach(() => vi.clearAllMocks());

describe('sparky_manage_run_program', () => {
  it('says there is no program rather than assuming one', async () => {
    vi.mocked(getRunProgram).mockResolvedValue(null);
    expect(await run({ action: 'get_run_program' })).toContain(
      'not following a run program'
    );
  });

  it('reports how recent workouts felt and suggests easing after two hard ones', async () => {
    const at = '2026-10-09T10:00:00.000Z';
    vi.mocked(getRunProgram).mockResolvedValue(
      program({
        effort_log: [
          { index: 2, rating: 9, at },
          { index: 3, rating: 8, at },
        ],
      })
    );
    const text = await run({ action: 'get_run_program' });
    expect(text).toContain('workout 4: 8/10');
    expect(text).toContain('felt hard');
  });

  it('says nothing about effort when none was rated', async () => {
    vi.mocked(getRunProgram).mockResolvedValue(program());
    expect(await run({ action: 'get_run_program' })).not.toContain('felt hard');
  });

  it('reports progress, the next workouts and recent changes', async () => {
    vi.mocked(getRunProgram).mockResolvedValue(
      program({
        adjustment_log: [
          {
            at: '2026-10-09T10:00:00.000Z',
            summary: 'Repeating week 2.',
            source: 'assistant',
          },
        ],
      })
    );
    const text = await run({ action: 'get_run_program' });
    expect(text).toContain('4 of 27 workouts done');
    expect(text).toContain('week 2, run 2');
    expect(text).toContain('Repeating week 2.');
  });

  it('asks for confirmation and changes nothing without it', async () => {
    vi.mocked(getRunProgram).mockResolvedValue(program());
    const text = await run({
      action: 'adjust_run_program_running',
      percent: -20,
      count: 2,
    });
    expect(text).toContain('Confirm with the user first');
    expect(adjustRunProgram).not.toHaveBeenCalled();
  });

  it('applies a confirmed change as the assistant', async () => {
    vi.mocked(getRunProgram).mockResolvedValue(program());
    vi.mocked(adjustRunProgram).mockResolvedValue(
      program({
        adjustment_log: [
          {
            at: '2026-10-10T10:00:00.000Z',
            summary: 'Eased the running in the next 2 workouts by 20%.',
            source: 'assistant',
          },
        ],
      })
    );
    const text = await run({
      action: 'adjust_run_program_running',
      percent: -20,
      count: 2,
      confirmed: true,
    });
    expect(adjustRunProgram).toHaveBeenCalledWith(
      'user-1',
      'assistant',
      expect.any(Function),
      'user-1'
    );
    expect(text).toContain('Eased the running in the next 2 workouts');
  });

  it('refuses an increase beyond the limit at validation', async () => {
    vi.mocked(getRunProgram).mockResolvedValue(program());
    const text = await run({
      action: 'adjust_run_program_running',
      percent: 25,
      confirmed: true,
    });
    expect(adjustRunProgram).not.toHaveBeenCalled();
    expect(text.toLowerCase()).toContain('percent');
  });

  it('rejects a week that does not exist', async () => {
    vi.mocked(getRunProgram).mockResolvedValue(program());
    const text = await run({
      action: 'repeat_run_program_week',
      week: 30,
      confirmed: true,
    });
    expect(text).toContain('There is no week 30');
    expect(adjustRunProgram).not.toHaveBeenCalled();
  });

  it('starts the default program once confirmed', async () => {
    vi.mocked(getRunProgram).mockResolvedValue(null);
    vi.mocked(upsertRunProgram).mockResolvedValue(program({ next_index: 0 }));
    expect(await run({ action: 'start_run_program' })).toContain(
      'Confirm with the user first'
    );
    const text = await run({ action: 'start_run_program', confirmed: true });
    expect(upsertRunProgram).toHaveBeenCalledWith(
      'user-1',
      { program_id: 'beginner5k', enabled: true },
      'user-1'
    );
    expect(text).toContain('Run program started');
  });

  it('starts the Zone 2 base with four runs a week by id', async () => {
    vi.mocked(getRunProgram).mockResolvedValue(null);
    vi.mocked(upsertRunProgram).mockResolvedValue(
      program({ program_id: 'zone2Base4', next_index: 0 })
    );
    const text = await run({
      action: 'start_run_program',
      program_id: 'zone2Base4',
      confirmed: true,
    });
    expect(upsertRunProgram).toHaveBeenCalledWith(
      'user-1',
      { program_id: 'zone2Base4', enabled: true },
      'user-1'
    );
    expect(text).toContain('Run program started');
  });

  it('warns that switching to another program replaces the current one and its adjustments', async () => {
    vi.mocked(getRunProgram).mockResolvedValue(program());
    const text = await run({
      action: 'start_run_program',
      program_id: 'marathon',
      confirmed: false,
    });
    expect(text).toContain('replace');
    expect(text).toContain('beginner5k');
    expect(text).toContain('dropping any adjustments');
    expect(upsertRunProgram).not.toHaveBeenCalled();
  });

  it('takes the adjustment baseline from the program under the lock', async () => {
    vi.mocked(getRunProgram).mockResolvedValue(program());
    vi.mocked(adjustRunProgram).mockImplementation(async (_u, _s, change) => {
      // The program was switched after the read: the lock-time state wins.
      const state = {
        workouts: findProgram('marathon')!.workouts,
        next: 0,
        programId: 'marathon',
        program: program(),
      };
      expect(() => change(state)).not.toThrow();
      return program();
    });
    await run({
      action: 'adjust_run_program_running',
      percent: -10,
      confirmed: true,
    });
    expect(adjustRunProgram).toHaveBeenCalled();
  });

  it('says so when asked to start the program already held, rather than claiming a restart', async () => {
    vi.mocked(getRunProgram).mockResolvedValue(program({ next_index: 5 }));
    vi.mocked(upsertRunProgram).mockResolvedValue(program({ next_index: 5 }));
    const text = await run({ action: 'start_run_program', confirmed: true });
    expect(text).toContain('already on this program');
    expect(text).not.toContain('Run program started');
  });

  it('refuses a run number the week does not have', async () => {
    vi.mocked(getRunProgram).mockResolvedValue(program());
    const text = await run({
      action: 'move_run_program',
      week: 1,
      run: 7,
      confirmed: true,
    });
    expect(text).toContain('has 3 runs');
    expect(adjustRunProgram).not.toHaveBeenCalled();
  });

  it('switches the program off, keeping the place', async () => {
    vi.mocked(getRunProgram).mockResolvedValue(program());
    vi.mocked(upsertRunProgram).mockResolvedValue(program({ enabled: false }));
    const text = await run({
      action: 'set_run_program_enabled',
      enabled: false,
      confirmed: true,
    });
    expect(upsertRunProgram).toHaveBeenCalledWith(
      'user-1',
      { program_id: 'beginner5k', enabled: false },
      'user-1'
    );
    expect(text).toContain('switched off');
  });

  describe('set_run_program_schedule', () => {
    it('asks first and changes nothing', async () => {
      vi.mocked(getRunProgram).mockResolvedValue(program());
      const text = await run({
        action: 'set_run_program_schedule',
        run_days: ['mon', 'Wednesday', 6],
        end_date: '2026-12-06',
      });
      expect(text).toContain('Mon, Wed, Sat');
      expect(text).toContain('goal day to 2026-12-06');
      expect(text).toContain('confirmed=true');
      expect(upsertRunProgram).not.toHaveBeenCalled();
    });

    it('saves the days, first day and goal day, keeping the program', async () => {
      vi.mocked(getRunProgram).mockResolvedValue(program());
      vi.mocked(upsertRunProgram).mockResolvedValue(
        program({
          run_days: [1, 3, 6],
          start_date: '2026-10-20',
          end_date: null,
        })
      );
      const text = await run({
        action: 'set_run_program_schedule',
        run_days: ['mon', 'wed', 'sat'],
        start_date: '2026-10-20',
        end_date: null,
        confirmed: true,
      });
      expect(upsertRunProgram).toHaveBeenCalledWith(
        'user-1',
        {
          program_id: 'beginner5k',
          run_days: [1, 3, 6],
          start_date: '2026-10-20',
          end_date: null,
        },
        'user-1'
      );
      expect(text).toContain('Diary days: Mon, Wed, Sat');
      expect(text).toContain('First day: 2026-10-20');
    });

    it('refuses an empty change and a bad date', async () => {
      vi.mocked(getRunProgram).mockResolvedValue(program());
      expect(
        await run({ action: 'set_run_program_schedule', confirmed: true })
      ).toContain('run_days, start_date or end_date');
      expect(
        await run({
          action: 'set_run_program_schedule',
          start_date: 'next friday',
          confirmed: true,
        })
      ).toContain('YYYY-MM-DD');
      expect(upsertRunProgram).not.toHaveBeenCalled();
    });

    it('does nothing without a program', async () => {
      vi.mocked(getRunProgram).mockResolvedValue(null);
      const text = await run({
        action: 'set_run_program_schedule',
        run_days: [1],
        confirmed: true,
      });
      expect(text).toContain('not following a run program');
    });
  });
});

describe('sparky_manage_run_program get_fitness_tests', () => {
  it('says there is no test rather than guessing paces', async () => {
    vi.mocked(listFitnessTests).mockResolvedValue([]);
    expect(await run({ action: 'get_fitness_tests' })).toContain(
      'has not run a fitness test'
    );
  });

  it('lists the tests and the latest paces', async () => {
    const outcome = evaluateFitnessTest({
      type: '5k',
      distanceMeters: 5000,
      durationSeconds: 1500,
    })!;
    vi.mocked(listFitnessTests).mockResolvedValue([
      {
        id: 't1',
        test_type: '5k',
        test_date: '2020-01-01',
        distance_meters: 5000,
        duration_seconds: 1500,
        split_distance_meters: null,
        result_value: 1500,
        exercise_entry_id: null,
        surface: 'outdoor',
        incline_percent: null,
        incline_adjusted: false,
        paces: outcome.paces,
        created_at: '2020-01-01T10:00:00.000Z',
      },
    ]);
    const text = await run({ action: 'get_fitness_tests' });
    expect(text).toContain('5K time trial (outdoors), 5K in 25:00');
    expect(text).toContain('Equivalent 5K time: 25:00');
    expect(text).toContain('- easy:');
    expect(text).toContain('retest is overdue');
  });

  it('takes no other fields and reads nothing when they are sent', async () => {
    await run({ action: 'get_fitness_tests', confirmed: true });
    expect(listFitnessTests).not.toHaveBeenCalled();
  });

  it('says when a test was run on a treadmill, and whether it was adjusted', async () => {
    const outcome = evaluateFitnessTest({
      type: 'cooper',
      distanceMeters: 3000,
      durationSeconds: 720,
      inclinePercent: 3,
    })!;
    vi.mocked(listFitnessTests).mockResolvedValue([
      {
        id: 't1',
        test_type: 'cooper',
        test_date: '2026-10-17',
        distance_meters: 3000,
        duration_seconds: 720,
        split_distance_meters: null,
        result_value: outcome.resultValue,
        exercise_entry_id: null,
        surface: 'indoor',
        incline_percent: 3,
        incline_adjusted: true,
        paces: outcome.paces,
        created_at: '2026-10-17T10:00:00.000Z',
      },
    ]);
    expect(await run({ action: 'get_fitness_tests' })).toContain(
      '(on a treadmill at 3% incline, adjusted for incline)'
    );
  });
});

describe('sparky_manage_run_program: realign_run_program', () => {
  // A Monday, three workout days a week.
  const today = '2026-11-02';
  const endForSlots = (slots: number): string => {
    let seen = 0;
    for (let d = today; ; d = addDays(d, 1)) {
      if ([1, 3, 5].includes(dayOfWeek(d)) && ++seen === slots) return d;
    }
  };
  const behind = (slots: number) =>
    program({
      program_id: 'halfMarathon',
      workouts: findProgram('halfMarathon')!.workouts,
      next_index: 3,
      run_days: [1, 3, 5],
      end_date: endForSlots(slots),
    });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${today}T09:00:00Z`));
  });
  afterEach(() => vi.useRealTimers());

  it('lists what it would change and changes nothing without confirmed', async () => {
    vi.mocked(getRunProgram).mockResolvedValue(behind(30));
    const text = await run({ action: 'realign_run_program' });
    expect(text).toContain('Confirm with the user first');
    expect(text).toContain('confirmed=true');
    expect(text).toContain('Nothing was changed');
    expect(text).toContain('Realigned to the goal day: dropped 3 workouts');
    expect(text).toContain('- drop week');
    expect(text).toContain('33 workouts left become 30');
    expect(adjustRunProgram).not.toHaveBeenCalled();
  });

  it('applies the realignment under the lock once confirmed, as the assistant', async () => {
    const held = behind(30);
    vi.mocked(getRunProgram).mockResolvedValue(held);
    vi.mocked(adjustRunProgram).mockImplementation(
      async (_u, source, change) => {
        expect(source).toBe('assistant');
        const result = change({
          workouts: held.workouts,
          next: held.next_index,
          programId: held.program_id,
          program: held,
        });
        expect(result.workouts).toHaveLength(held.workouts.length - 3);
        expect(result.next).toBe(3);
        return {
          ...held,
          adjustment_log: [
            { at: '2026-11-02T09:00:00.000Z', summary: result.summary, source },
          ],
        };
      }
    );
    const text = await run({ action: 'realign_run_program', confirmed: true });
    expect(adjustRunProgram).toHaveBeenCalledTimes(1);
    expect(text).toContain('Realigned to the goal day');
  });

  it('refuses to push through an unrealistic goal and offers the choices', async () => {
    vi.mocked(getRunProgram).mockResolvedValue(behind(24));
    const text = await run({ action: 'realign_run_program', confirmed: true });
    expect(text).toContain('not realistic');
    expect(text).toContain('Nothing was changed');
    expect(text).toContain('a later goal day');
    expect(text).toContain('a shorter race (10k');
    expect(text).toContain('force=true');
    expect(adjustRunProgram).not.toHaveBeenCalled();
  });

  it('goes ahead past the cap only with force, and still asks first', async () => {
    vi.mocked(getRunProgram).mockResolvedValue(behind(24));
    const text = await run({ action: 'realign_run_program', force: true });
    expect(text).toContain('Confirm with the user first');
    expect(text).toContain('dropped 9 workouts');
  });

  it('says when the plan already fits or there is no goal day', async () => {
    vi.mocked(getRunProgram).mockResolvedValue(
      program({
        program_id: 'halfMarathon',
        workouts: findProgram('halfMarathon')!.workouts,
        next_index: 0,
        run_days: [1, 3, 5],
        end_date: endForSlots(36),
      })
    );
    expect(await run({ action: 'realign_run_program' })).toContain(
      'already fits'
    );
    vi.mocked(getRunProgram).mockResolvedValue(program({ end_date: null }));
    expect(await run({ action: 'realign_run_program' })).toContain(
      'no goal day'
    );
  });

  it('tells the assistant when a plan has drifted from the goal day', async () => {
    vi.mocked(getRunProgram).mockResolvedValue(behind(30));
    const text = await run({ action: 'get_run_program' });
    expect(text).toContain('realign_run_program');
    vi.mocked(getRunProgram).mockResolvedValue(program());
    expect(await run({ action: 'get_run_program' })).not.toContain(
      'realign_run_program'
    );
  });
});
