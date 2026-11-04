import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS7016 supertest typing
import request from 'supertest';
import express from 'express';
import { addDays, dayOfWeek, findProgram } from '@workspace/shared';
import errorHandler from '../middleware/errorHandler.js';
import runProgramRoutes from '../routes/v2/runProgramRoutes.js';
import {
  adjustRunProgram,
  createCustomRunProgram,
  CustomRunProgramLimitError,
  deleteCustomRunProgram,
  listCustomRunPrograms,
  updateCustomRunProgram,
  completeRunProgramWorkout,
  getRunProgram,
  rateRunProgramWorkout,
  UnknownRunProgramError,
  upsertRunProgram,
} from '../models/runProgramRepository.js';

vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn().mockResolvedValue('UTC'),
}));

vi.mock('../models/runProgramRepository.js', () => {
  class UnknownRunProgramError extends Error {}
  return {
    getRunProgram: vi.fn(),
    adjustRunProgram: vi.fn(),
    upsertRunProgram: vi.fn(),
    completeRunProgramWorkout: vi.fn(),
    rateRunProgramWorkout: vi.fn(),
    UnknownRunProgramError,
    CustomRunProgramLimitError: class CustomRunProgramLimitError extends Error {},
    createCustomRunProgram: vi.fn(),
    deleteCustomRunProgram: vi.fn(),
    listCustomRunPrograms: vi.fn(),
    updateCustomRunProgram: vi.fn(),
  };
});

let actingAs = 'test-user-id';
const app = express();
app.use(express.json());
app.use(
  (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => {
    req.userId = 'test-user-id';
    req.authenticatedUserId = actingAs;
    req.originalUserId = actingAs;
    next();
  }
);
app.use('/api/v2/run-program', runProgramRoutes);
app.use(errorHandler);

const program = {
  id: 'p1',
  program_id: 'beginner5k',
  name: null,
  activity: null,
  enabled: true,
  next_index: 0,
  workouts: [],
  adjustment_log: [],
  effort_log: [],
  completion_log: [],
  run_days: [],
  start_date: null,
  end_date: null,
  last_done_date: null,
  updated_at: '2026-10-10T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  actingAs = 'test-user-id';
});

describe('run program routes', () => {
  it('returns null before a program is chosen', async () => {
    vi.mocked(getRunProgram).mockResolvedValue(null);
    const res = await request(app).get('/api/v2/run-program');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ program: null });
  });

  it('starts a program', async () => {
    vi.mocked(upsertRunProgram).mockResolvedValue(program);
    const res = await request(app)
      .put('/api/v2/run-program')
      .send({ program_id: 'beginner5k' });
    expect(res.status).toBe(200);
    expect(upsertRunProgram).toHaveBeenCalledWith(
      'test-user-id',
      { program_id: 'beginner5k' },
      'test-user-id'
    );
  });

  it('starts the Zone 2 program in either version', async () => {
    vi.mocked(upsertRunProgram).mockResolvedValue({
      ...program,
      program_id: 'zone2Base4',
    });
    const res = await request(app)
      .put('/api/v2/run-program')
      .send({ program_id: 'zone2Base4' });
    expect(res.status).toBe(200);
    expect(upsertRunProgram).toHaveBeenCalledWith(
      'test-user-id',
      { program_id: 'zone2Base4' },
      'test-user-id'
    );
  });

  it('rejects a bad body and an unknown program', async () => {
    const bad = await request(app)
      .put('/api/v2/run-program')
      .send({ program_id: 'beginner5k', next_index: -1 });
    expect(bad.status).toBe(400);

    vi.mocked(upsertRunProgram).mockRejectedValue(
      new UnknownRunProgramError('nope')
    );
    const unknown = await request(app)
      .put('/api/v2/run-program')
      .send({ program_id: 'nope' });
    expect(unknown.status).toBe(400);
  });

  it('completes the due workout and returns the program', async () => {
    vi.mocked(completeRunProgramWorkout).mockResolvedValue(program);
    vi.mocked(getRunProgram).mockResolvedValue(program);
    const res = await request(app)
      .post('/api/v2/run-program/complete')
      .send({ index: 0 });
    expect(res.status).toBe(200);
    expect(completeRunProgramWorkout).toHaveBeenCalledWith(
      'test-user-id',
      0,
      'test-user-id',
      { programId: undefined, day: undefined, entryId: undefined }
    );
    expect(res.body.program.id).toBe('p1');
  });

  it('only completes a workout of the program it was done under', async () => {
    vi.mocked(completeRunProgramWorkout).mockResolvedValue(program);
    vi.mocked(getRunProgram).mockResolvedValue(program);
    await request(app)
      .post('/api/v2/run-program/complete')
      .send({ index: 2, program_id: 'beginner5k' });
    expect(completeRunProgramWorkout).toHaveBeenLastCalledWith(
      'test-user-id',
      2,
      'test-user-id',
      { programId: 'beginner5k', day: undefined, entryId: undefined }
    );
  });

  it('records which diary entry a workout was done as', async () => {
    vi.mocked(completeRunProgramWorkout).mockResolvedValue(program);
    vi.mocked(getRunProgram).mockResolvedValue(program);
    await request(app)
      .post('/api/v2/run-program/complete')
      .send({ index: 1, day: '2026-10-12', entry_id: 'entry-9' });
    expect(completeRunProgramWorkout).toHaveBeenLastCalledWith(
      'test-user-id',
      1,
      'test-user-id',
      { programId: undefined, day: '2026-10-12', entryId: 'entry-9' }
    );
  });

  it('records how hard a finished workout felt', async () => {
    vi.mocked(rateRunProgramWorkout).mockResolvedValue(program);
    vi.mocked(getRunProgram).mockResolvedValue(program);
    const res = await request(app)
      .post('/api/v2/run-program/effort')
      .send({ index: 3, rating: 8, program_id: 'beginner5k' });
    expect(res.status).toBe(200);
    expect(rateRunProgramWorkout).toHaveBeenCalledWith(
      'test-user-id',
      3,
      8,
      'test-user-id',
      'beginner5k'
    );
  });

  it('rejects a rating outside 1 to 10', async () => {
    for (const rating of [0, 11, 5.5]) {
      const res = await request(app)
        .post('/api/v2/run-program/effort')
        .send({ index: 3, rating });
      expect(res.status).toBe(400);
    }
    expect(rateRunProgramWorkout).not.toHaveBeenCalled();
  });

  it('refuses to rate on behalf of someone else', async () => {
    actingAs = 'someone-else';
    const res = await request(app)
      .post('/api/v2/run-program/effort')
      .send({ index: 3, rating: 8 });
    expect(res.status).toBe(403);
    expect(rateRunProgramWorkout).not.toHaveBeenCalled();
  });

  it('records the day a workout was done', async () => {
    vi.mocked(completeRunProgramWorkout).mockResolvedValue(program);
    vi.mocked(getRunProgram).mockResolvedValue(program);
    await request(app)
      .post('/api/v2/run-program/complete')
      .send({ index: 1, day: '2026-10-12' });
    expect(completeRunProgramWorkout).toHaveBeenLastCalledWith(
      'test-user-id',
      1,
      'test-user-id',
      { programId: undefined, day: '2026-10-12', entryId: undefined }
    );
  });

  it('saves the Diary days and the first day, and rejects bad ones', async () => {
    vi.mocked(upsertRunProgram).mockResolvedValue(program);
    const ok = await request(app)
      .put('/api/v2/run-program')
      .send({
        program_id: 'beginner5k',
        run_days: [1, 3, 5],
        start_date: '2026-10-13',
      });
    expect(ok.status).toBe(200);
    expect(upsertRunProgram).toHaveBeenLastCalledWith(
      'test-user-id',
      expect.objectContaining({
        run_days: [1, 3, 5],
        start_date: '2026-10-13',
      }),
      'test-user-id'
    );
    const cleared = await request(app)
      .put('/api/v2/run-program')
      .send({ program_id: 'beginner5k', start_date: null });
    expect(cleared.status).toBe(200);
    const goal = await request(app)
      .put('/api/v2/run-program')
      .send({ program_id: 'beginner5k', end_date: '2026-12-06' });
    expect(goal.status).toBe(200);
    expect(upsertRunProgram).toHaveBeenLastCalledWith(
      'test-user-id',
      expect.objectContaining({ end_date: '2026-12-06' }),
      'test-user-id'
    );
    for (const bad of [
      { run_days: [7] },
      { start_date: 'tomorrow' },
      { end_date: '12/06' },
      // The right shape but not a day, and a goal before the first day.
      { start_date: '2026-02-31' },
      { end_date: '2026-13-01' },
      { start_date: '2026-10-20', end_date: '2026-10-19' },
    ]) {
      const res = await request(app)
        .put('/api/v2/run-program')
        .send({ program_id: 'beginner5k', ...bad });
      expect(res.status).toBe(400);
    }
  });

  it('rejects an impossible day on completion too', async () => {
    const res = await request(app)
      .post('/api/v2/run-program/complete')
      .send({ index: 0, day: '2026-02-30' });
    expect(res.status).toBe(400);
  });

  it('validates the completed index', async () => {
    const res = await request(app)
      .post('/api/v2/run-program/complete')
      .send({ index: 'x' });
    expect(res.status).toBe(400);
  });

  it('is owner-only: a delegated context is refused', async () => {
    actingAs = 'someone-else';
    const res = await request(app).get('/api/v2/run-program');
    expect(res.status).toBe(403);
    expect(getRunProgram).not.toHaveBeenCalled();
  });

  it('adjusts the next workouts as the person', async () => {
    vi.mocked(adjustRunProgram).mockResolvedValue(program);
    const res = await request(app)
      .post('/api/v2/run-program/adjust')
      .send({ percent: -15, count: 2 });
    expect(res.status).toBe(200);
    expect(adjustRunProgram).toHaveBeenCalledWith(
      'test-user-id',
      'user',
      expect.any(Function),
      'test-user-id'
    );
  });

  it('refuses an out-of-range adjustment and a missing program', async () => {
    const bad = await request(app)
      .post('/api/v2/run-program/adjust')
      .send({ percent: -50, count: 2 });
    expect(bad.status).toBe(400);
    expect(adjustRunProgram).not.toHaveBeenCalled();

    vi.mocked(adjustRunProgram).mockResolvedValue(null);
    const none = await request(app)
      .post('/api/v2/run-program/adjust')
      .send({ percent: -15, count: 2 });
    expect(none.status).toBe(400);
  });

  describe('custom programs', () => {
    const id = '0b6f1c1e-6a52-4a8e-9a3b-2f1d4f5a9c10';
    const body = {
      name: 'My plan',
      activity: 'run',
      workouts: [
        {
          title: 'Easy',
          plan: {
            style: 'runWalk',
            steps: [
              { kind: 'warmup', seconds: 300 },
              { kind: 'work', seconds: 600 },
            ],
          },
        },
      ],
    };
    const saved = {
      id,
      name: 'My plan',
      activity: 'run',
      workouts: [],
      created_at: '2026-10-13T00:00:00.000Z',
      updated_at: '2026-10-13T00:00:00.000Z',
    };

    it('lists, creates, changes and deletes', async () => {
      vi.mocked(listCustomRunPrograms).mockResolvedValue([saved] as never);
      const list = await request(app).get('/api/v2/run-program/custom');
      expect(list.status).toBe(200);
      expect(list.body.programs).toHaveLength(1);

      vi.mocked(createCustomRunProgram).mockResolvedValue(saved as never);
      const created = await request(app)
        .post('/api/v2/run-program/custom')
        .send(body);
      expect(created.status).toBe(200);
      expect(createCustomRunProgram).toHaveBeenCalledWith(
        'test-user-id',
        expect.objectContaining({ name: 'My plan' }),
        'test-user-id'
      );

      vi.mocked(updateCustomRunProgram).mockResolvedValue(saved as never);
      const changed = await request(app)
        .put(`/api/v2/run-program/custom/${id}`)
        .send(body);
      expect(changed.status).toBe(200);

      vi.mocked(deleteCustomRunProgram).mockResolvedValue(true);
      const removed = await request(app).delete(
        `/api/v2/run-program/custom/${id}`
      );
      expect(removed.status).toBe(204);
    });

    it('rejects a bad program and one over the limit', async () => {
      for (const bad of [
        { ...body, name: '' },
        { ...body, workouts: [] },
        { ...body, activity: 'swim' },
        {
          ...body,
          workouts: [
            {
              plan: { style: 'runWalk', steps: [{ kind: 'work', seconds: 0 }] },
            },
          ],
        },
      ]) {
        const res = await request(app)
          .post('/api/v2/run-program/custom')
          .send(bad);
        expect(res.status).toBe(400);
      }
      expect(createCustomRunProgram).not.toHaveBeenCalled();

      vi.mocked(createCustomRunProgram).mockRejectedValue(
        new CustomRunProgramLimitError('max')
      );
      const over = await request(app)
        .post('/api/v2/run-program/custom')
        .send(body);
      expect(over.status).toBe(400);
    });

    it('accepts a pace and heart-rate target on a step, and refuses bad ones', async () => {
      vi.mocked(createCustomRunProgram).mockResolvedValue(saved as never);
      const withTargets = (step: Record<string, unknown>) => ({
        ...body,
        workouts: [
          {
            plan: {
              style: 'runWalk',
              steps: [{ kind: 'work', seconds: 600, ...step }],
            },
          },
        ],
      });
      const ok = await request(app)
        .post('/api/v2/run-program/custom')
        .send(
          withTargets({
            pace: { minSecondsPerKm: 300, maxSecondsPerKm: 360 },
            heartRate: { minBpm: 130, maxBpm: 150 },
          })
        );
      expect(ok.status).toBe(200);
      expect(createCustomRunProgram).toHaveBeenCalledWith(
        'test-user-id',
        expect.objectContaining({
          workouts: [
            expect.objectContaining({
              plan: expect.objectContaining({
                steps: [
                  expect.objectContaining({
                    pace: { minSecondsPerKm: 300, maxSecondsPerKm: 360 },
                  }),
                ],
              }),
            }),
          ],
        }),
        'test-user-id'
      );
      for (const bad of [
        { pace: { minSecondsPerKm: 360, maxSecondsPerKm: 300 } },
        { pace: { minSecondsPerKm: 60, maxSecondsPerKm: 300 } },
        { heartRate: { minBpm: 150, maxBpm: 130 } },
        { heartRate: { minBpm: 20, maxBpm: 130 } },
      ]) {
        const res = await request(app)
          .post('/api/v2/run-program/custom')
          .send(withTargets(bad));
        expect(res.status).toBe(400);
      }
    });

    it('answers 404 for an unknown or malformed id', async () => {
      vi.mocked(updateCustomRunProgram).mockResolvedValue(null);
      vi.mocked(deleteCustomRunProgram).mockResolvedValue(false);
      expect(
        (await request(app).put(`/api/v2/run-program/custom/${id}`).send(body))
          .status
      ).toBe(404);
      expect(
        (await request(app).delete(`/api/v2/run-program/custom/${id}`)).status
      ).toBe(404);
      expect(
        (await request(app).delete('/api/v2/run-program/custom/nope')).status
      ).toBe(404);
    });

    it('is owner-only', async () => {
      actingAs = 'someone-else';
      const res = await request(app).get('/api/v2/run-program/custom');
      expect(res.status).toBe(403);
      expect(listCustomRunPrograms).not.toHaveBeenCalled();
    });
  });
});

describe('POST /api/v2/run-program/realign', () => {
  // A Monday; three workout days a week.
  const today = '2026-11-02';
  const endForSlots = (slots: number): string => {
    let seen = 0;
    for (let d = today; ; d = addDays(d, 1)) {
      if ([1, 3, 5].includes(dayOfWeek(d)) && ++seen === slots) return d;
    }
  };
  const behind = (slots: number) => ({
    ...program,
    program_id: 'halfMarathon',
    workouts: findProgram('halfMarathon')!.workouts,
    next_index: 3,
    run_days: [1, 3, 5],
    end_date: endForSlots(slots),
  });

  it('previews without saving anything', async () => {
    vi.mocked(getRunProgram).mockResolvedValue(behind(30));
    const res = await request(app)
      .post('/api/v2/run-program/realign')
      .send({ today });
    expect(res.status).toBe(200);
    expect(res.body.applied).toBe(false);
    expect(res.body.program).toBeNull();
    expect(res.body.realign.state).toBe('plan');
    expect(res.body.realign.preview).toMatchObject({
      slots: 30,
      dropped: 3,
      keptTail: 6,
    });
    expect(res.body.realign.preview.token).toEqual(expect.any(String));
    expect(adjustRunProgram).not.toHaveBeenCalled();
  });

  it('reports an unrealistic goal with the options instead of forcing it', async () => {
    vi.mocked(getRunProgram).mockResolvedValue(behind(24));
    const res = await request(app)
      .post('/api/v2/run-program/realign')
      .send({ today });
    expect(res.status).toBe(200);
    expect(res.body.realign).toMatchObject({
      state: 'unrealistic',
      reasons: ['tooMuchToDrop'],
      distance: 'half',
      lowerDistance: '10k',
      options: ['later', 'lower', 'continue'],
    });
    expect(res.body.realign.continuePreview.after.workouts).toBe(24);
  });

  it('applies only when confirmed, as the person, under the row lock', async () => {
    const held = behind(30);
    vi.mocked(getRunProgram).mockResolvedValue(held);
    const preview = (
      await request(app).post('/api/v2/run-program/realign').send({ today })
    ).body.realign.preview;
    vi.mocked(adjustRunProgram).mockImplementation(
      async (_user, source, change) => {
        expect(source).toBe('user');
        const result = change({
          workouts: held.workouts,
          next: held.next_index,
          programId: held.program_id,
          program: held,
        });
        expect(result.workouts).toHaveLength(held.workouts.length - 3);
        expect(result.summary).toBe(preview.summary);
        return { ...held, workouts: result.workouts };
      }
    );
    const res = await request(app)
      .post('/api/v2/run-program/realign')
      .send({ today, confirmed: true, token: preview.token });
    expect(res.status).toBe(200);
    expect(res.body.applied).toBe(true);
    expect(res.body.program.workouts).toHaveLength(held.workouts.length - 3);
    expect(adjustRunProgram).toHaveBeenCalledWith(
      'test-user-id',
      'user',
      expect.any(Function),
      'test-user-id'
    );
  });

  it('refuses with 409 when the plan changed since the preview', async () => {
    const held = behind(30);
    vi.mocked(adjustRunProgram).mockImplementation(async (_u, _s, change) => {
      change({
        workouts: held.workouts,
        next: held.next_index,
        programId: held.program_id,
        program: held,
      });
      return held;
    });
    const res = await request(app)
      .post('/api/v2/run-program/realign')
      .send({ today, confirmed: true, token: 'stale' });
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('plan changed');
  });

  it('refuses an unrealistic goal when confirmed without force, and allows it with force', async () => {
    const held = behind(24);
    vi.mocked(adjustRunProgram).mockImplementation(async (_u, _s, change) => {
      const result = change({
        workouts: held.workouts,
        next: held.next_index,
        programId: held.program_id,
        program: held,
      });
      return { ...held, workouts: result.workouts };
    });
    const refused = await request(app)
      .post('/api/v2/run-program/realign')
      .send({ today, confirmed: true });
    expect(refused.status).toBe(400);
    expect(refused.body.error).toContain('not realistic');
    const forced = await request(app)
      .post('/api/v2/run-program/realign')
      .send({ today, confirmed: true, force: true });
    expect(forced.status).toBe(200);
    expect(forced.body.program.workouts).toHaveLength(held.workouts.length - 9);
  });

  it('says there is no program, rejects a bad body, and is owner-only', async () => {
    vi.mocked(getRunProgram).mockResolvedValue(null);
    const none = await request(app)
      .post('/api/v2/run-program/realign')
      .send({ today });
    expect(none.status).toBe(400);
    vi.mocked(adjustRunProgram).mockResolvedValue(null);
    const none2 = await request(app)
      .post('/api/v2/run-program/realign')
      .send({ today, confirmed: true });
    expect(none2.status).toBe(400);
    const bad = await request(app)
      .post('/api/v2/run-program/realign')
      .send({ today: '2026-02-31' });
    expect(bad.status).toBe(400);
    actingAs = 'someone-else';
    const delegated = await request(app)
      .post('/api/v2/run-program/realign')
      .send({ today });
    expect(delegated.status).toBe(403);
  });
});
