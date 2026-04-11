import { vi, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import exerciseService from '../services/exerciseService.js';
import exercisePresetEntryRepository from '../models/exercisePresetEntryRepository.js';
import exercisePresetEntryRoutes from '../routes/exercisePresetEntryRoutes.js';

vi.mock('@workspace/shared', () => ({
  createPresetSessionRequestSchema: {
    safeParse: vi.fn((data) => {
      const hasPresetId =
        data.workout_preset_id !== undefined && data.workout_preset_id !== null;
      const hasExercises = data.exercises !== undefined;

      if (hasPresetId === hasExercises) {
        return {
          success: false,
          error: {
            issues: [
              {
                message:
                  'Provide exactly one workout source: workout_preset_id or exercises.',
              },
            ],
            flatten: () => ({ formErrors: [], fieldErrors: {} }),
          },
        };
      }
      return { success: true, data };
    }),
  },
  updatePresetSessionRequestSchema: {
    safeParse: vi.fn((data) => {
      const hasAnyField = Object.keys(data).length > 0;
      if (!hasAnyField) {
        return {
          success: false,
          error: {
            issues: [{ message: 'At least one field must be provided.' }],
            flatten: () => ({ formErrors: [], fieldErrors: {} }),
          },
        };
      }
      return { success: true, data };
    }),
  },
  presetSessionResponseSchema: {
    parse: vi.fn((data) => data),
  },
}));

vi.mock('../services/exerciseService.js', () => ({
  default: {
    createGroupedWorkoutSession: vi.fn(),
    getGroupedWorkoutSessionById: vi.fn(),
    updateGroupedWorkoutSession: vi.fn(),
  },
}));

vi.mock('../models/exercisePresetEntryRepository.js', () => ({
  default: {
    deleteExercisePresetEntry: vi.fn(),
  },
}));

vi.mock('../config/logging.js', () => ({
  log: vi.fn(),
}));

const presetSessionResponseSchema = z
  .object({
    type: z.literal('preset'),
    id: z.string().uuid(),
    entry_date: z.string().nullable(),
    workout_preset_id: z.number().int().nullable(),
    name: z.string(),
    description: z.string().nullable(),
    notes: z.string().nullable(),
    source: z.string(),
    total_duration_minutes: z.number(),
    exercises: z.array(
      z
        .object({
          id: z.string().uuid(),
          exercise_id: z.string().uuid(),
          duration_minutes: z.number(),
          calories_burned: z.number(),
          entry_date: z.string().nullable(),
          notes: z.string().nullable(),
          distance: z.number().nullable(),
          avg_heart_rate: z.number().nullable(),
          source: z.string().nullable(),
          sets: z.array(
            z
              .object({
                id: z.number(),
                set_number: z.number(),
                set_type: z.string().nullable(),
                reps: z.number().nullable(),
                weight: z.number().nullable(),
                duration: z.number().nullable(),
                rest_time: z.number().nullable(),
                notes: z.string().nullable(),
                rpe: z.number().nullable(),
              })
              .strict()
          ),
          exercise_snapshot: z
            .object({
              id: z.string().uuid(),
              name: z.string(),
              category: z.string().nullable(),
            })
            .nullable(),
          activity_details: z.array(
            z
              .object({
                id: z.string(),
                provider_name: z.string(),
                detail_type: z.string(),
                detail_data: z.unknown(),
              })
              .strict()
          ),
        })
        .strict()
    ),
    activity_details: z.array(
      z
        .object({
          id: z.string(),
          provider_name: z.string(),
          detail_type: z.string(),
          detail_data: z.unknown(),
        })
        .strict()
    ),
  })
  .strict();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getRouteHandlers(method: any, path: any) {
  const layer = exercisePresetEntryRoutes.stack.find(
    (entry) =>
      entry.route &&
      entry.route.path === path &&
      // @ts-expect-error TS(2339): Property 'methods' does not exist on type 'IRoute<... Remove this comment to see the full error message
      entry.route.methods[method.toLowerCase()]
  );
  if (!layer) {
    throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
  }
  // @ts-expect-error TS(2532): Object is possibly 'undefined'.
  return layer.route.stack.map((entry) => entry.handle);
}

async function invokeRoute(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  method: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  path: any,
  { body = {}, params = {} } = {}
) {
  const handlers = getRouteHandlers(method, path);
  const req = {
    body,
    params,
    userId: '99999999-9999-4999-8999-999999999999',
    originalUserId: '99999999-9999-4999-8999-999999999999',
  };
  let statusCode = 200;
  let responseBody;
  let finished = false;
  const res = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    status(code: any) {
      statusCode = code;
      return this;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    json(payload: any) {
      responseBody = payload;
      finished = true;
      return this;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    send(payload: any) {
      responseBody = payload;
      finished = true;
      return this;
    },
  };
  for (const handler of handlers) {
    let nextCalled = false;
    await new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const next = (error: any) => {
        nextCalled = true;
        if (error) {
          reject(error);
          return;
        }
        // @ts-expect-error TS(2794): Expected 1 arguments, but got 0. Did you forget to... Remove this comment to see the full error message
        resolve();
      };
      try {
        // @ts-expect-error TS(2345): Argument of type '{ body: {}; params: {}; userId: ... Remove this comment to see the full error message
        const result = handler(req, res, next);
        Promise.resolve(result)
          .then(() => {
            if (!nextCalled) {
              // @ts-expect-error TS(2794): Expected 1 arguments, but got 0. Did you forget to... Remove this comment to see the full error message
              resolve();
            }
          })
          .catch(reject);
      } catch (error) {
        reject(error);
      }
    });
    if (finished) {
      break;
    }
  }
  return {
    statusCode,
    body: responseBody,
  };
}
const groupedSessionFixture = presetSessionResponseSchema.parse({
  type: 'preset',
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  entry_date: '2026-03-12',
  workout_preset_id: null,
  name: 'Morning Workout',
  description: null,
  notes: null,
  source: 'sparky',
  total_duration_minutes: 0,
  exercises: [
    {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      exercise_id: '11111111-1111-4111-8111-111111111111',
      duration_minutes: 0,
      calories_burned: 0,
      entry_date: '2026-03-12',
      notes: null,
      distance: null,
      avg_heart_rate: null,
      source: 'sparky',
      sets: [
        {
          id: 1,
          set_number: 1,
          set_type: 'working',
          reps: 10,
          weight: 60,
          duration: null,
          rest_time: null,
          notes: null,
          rpe: null,
        },
      ],
      exercise_snapshot: {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Bench Press',
        category: 'Strength',
      },
      activity_details: [],
    },
  ],
  activity_details: [],
});
describe('exercisePresetEntryRoutes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('creates a freeform grouped workout session', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    exerciseService.createGroupedWorkoutSession.mockResolvedValue(
      groupedSessionFixture
    );
    const response = await invokeRoute('post', '/', {
      body: {
        name: 'Morning Workout',
        entry_date: '2026-03-12',
        description: null,
        notes: null,
        source: 'sparky',
        exercises: [
          {
            exercise_id: '11111111-1111-4111-8111-111111111111',
            sort_order: 0,
            duration_minutes: 0,
            notes: null,
            sets: [
              {
                set_number: 1,
                set_type: 'working',
                reps: 10,
                weight: 60,
                notes: null,
              },
            ],
          },
        ],
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.body).toEqual(groupedSessionFixture);
    expect(exerciseService.createGroupedWorkoutSession).toHaveBeenCalledWith(
      '99999999-9999-4999-8999-999999999999',
      '99999999-9999-4999-8999-999999999999',
      {
        name: 'Morning Workout',
        entry_date: '2026-03-12',
        description: null,
        notes: null,
        source: 'sparky',
        exercises: [
          {
            exercise_id: '11111111-1111-4111-8111-111111111111',
            sort_order: 0,
            duration_minutes: 0,
            notes: null,
            sets: [
              {
                set_number: 1,
                set_type: 'working',
                reps: 10,
                weight: 60,
                notes: null,
              },
            ],
          },
        ],
      }
    );
  });
  it('rejects ambiguous create payloads', async () => {
    const response = await invokeRoute('post', '/', {
      body: {
        workout_preset_id: 42,
        name: 'Morning Workout',
        entry_date: '2026-03-12',
        exercises: [
          {
            exercise_id: '11111111-1111-4111-8111-111111111111',
          },
        ],
      },
    });
    expect(response.statusCode).toBe(400);
    // @ts-expect-error TS(2532): Object is possibly 'undefined'.
    expect(response.body.error).toBe('Invalid grouped workout payload.');
    expect(exerciseService.createGroupedWorkoutSession).not.toHaveBeenCalled();
  });
  it('returns a grouped workout session by id', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    exerciseService.getGroupedWorkoutSessionById.mockResolvedValue(
      groupedSessionFixture
    );
    const response = await invokeRoute('get', '/:id', {
      params: { id: groupedSessionFixture.id },
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual(groupedSessionFixture);
    expect(exerciseService.getGroupedWorkoutSessionById).toHaveBeenCalledWith(
      '99999999-9999-4999-8999-999999999999',
      groupedSessionFixture.id
    );
  });
  it('surfaces 409 conflicts from grouped workout updates', async () => {
    const conflictError = new Error(
      'Nested exercise editing is only supported for manual or sparky workouts.'
    );
    // @ts-expect-error TS(2339): Property 'status' does not exist on type 'Error'.
    conflictError.status = 409;
    // @ts-expect-error TS(2339): Property 'mockRejectedValue' does not exist on typ... Remove this comment to see the full error message
    exerciseService.updateGroupedWorkoutSession.mockRejectedValue(
      conflictError
    );
    const response = await invokeRoute('put', '/:id', {
      params: { id: groupedSessionFixture.id },
      body: {
        exercises: [
          {
            exercise_id: '11111111-1111-4111-8111-111111111111',
            sort_order: 0,
            duration_minutes: 0,
            sets: [],
          },
        ],
      },
    });
    expect(response.statusCode).toBe(409);
    expect(response.body).toEqual({
      message:
        'Nested exercise editing is only supported for manual or sparky workouts.',
    });
  });
  it('deletes grouped workout sessions', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    exercisePresetEntryRepository.deleteExercisePresetEntry.mockResolvedValue(
      true
    );
    const response = await invokeRoute('delete', '/:id', {
      params: { id: groupedSessionFixture.id },
    });
    expect(response.statusCode).toBe(204);
    expect(
      exercisePresetEntryRepository.deleteExercisePresetEntry
    ).toHaveBeenCalledWith(
      groupedSessionFixture.id,
      '99999999-9999-4999-8999-999999999999'
    );
  });
});
