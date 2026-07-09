import { vi, beforeEach, describe, expect, it } from 'vitest';
import workoutPresetService from '../services/workoutPresetService.js';
import workoutPresetRoutes from '../routes/workoutPresetRoutes.js';

vi.mock('../middleware/authMiddleware', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticate: (req: any, res: any, next: any) => next(),
}));

vi.mock('../services/workoutPresetService.js', () => ({
  default: {
    createWorkoutPreset: vi.fn(),
    updateWorkoutPreset: vi.fn(),
  },
}));

vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));

const USER_ID = '99999999-9999-4999-8999-999999999999';
const EXERCISE_ID = '11111111-1111-4111-8111-111111111111';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getRouteHandlers(method: any, path: any) {
  const layer = workoutPresetRoutes.stack.find(
    (entry) =>
      entry.route &&
      entry.route.path === path &&
      // @ts-expect-error TS(2339): Property 'methods' does not exist on type 'IRoute'.
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
    userId: USER_ID,
    originalUserId: USER_ID,
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
        // @ts-expect-error TS(2794): Expected 1 arguments, but got 0.
        resolve();
      };
      try {
        // @ts-expect-error TS(2345): req is a partial stub.
        const result = handler(req, res, next);
        Promise.resolve(result)
          .then(() => {
            if (!nextCalled) {
              // @ts-expect-error TS(2794): Expected 1 arguments, but got 0.
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

function validCreateBody() {
  return {
    user_id: USER_ID,
    name: 'Push Day',
    description: null,
    is_public: false,
    exercises: [
      {
        exercise_id: EXERCISE_ID,
        image_url: null,
        sort_order: 0,
        superset_group: 1,
        sets: [
          {
            set_number: 1,
            set_type: 'normal',
            reps: 10,
            weight: 60,
            duration: null,
            rest_time: 90,
            notes: null,
          },
        ],
      },
    ],
  };
}

describe('workoutPresetRoutes request validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(workoutPresetService.createWorkoutPreset).mockResolvedValue({
      id: 7,
    });
    vi.mocked(workoutPresetService.updateWorkoutPreset).mockResolvedValue({
      id: 7,
    });
  });

  it('accepts a valid create payload and passes superset_group through', async () => {
    const { statusCode } = await invokeRoute('post', '/', {
      body: validCreateBody(),
    });

    expect(statusCode).toBe(201);
    const [userId, data] = vi.mocked(workoutPresetService.createWorkoutPreset)
      .mock.calls[0];
    expect(userId).toBe(USER_ID);
    // Ownership comes from the authenticated request; a body user_id (even
    // the caller's own) is stripped by the schema and never reaches the
    // service, which injects req.userId itself.
    expect(data.user_id).toBeUndefined();
    expect(data.exercises[0].superset_group).toBe(1);
  });

  it('strips a spoofed body user_id so ownership cannot be forged', async () => {
    const body = {
      ...validCreateBody(),
      user_id: '00000000-0000-4000-8000-000000000000',
    };

    const { statusCode } = await invokeRoute('post', '/', { body });

    expect(statusCode).toBe(201);
    const [userId, data] = vi.mocked(workoutPresetService.createWorkoutPreset)
      .mock.calls[0];
    expect(userId).toBe(USER_ID);
    expect(data.user_id).toBeUndefined();
  });

  it('accepts an absent superset_group (repository defaults it to null)', async () => {
    const body = {
      user_id: USER_ID,
      name: 'Push Day',
      exercises: [{ exercise_id: EXERCISE_ID, sort_order: 0, sets: [] }],
    };

    const { statusCode } = await invokeRoute('post', '/', { body });

    expect(statusCode).toBe(201);
    const [, data] = vi.mocked(workoutPresetService.createWorkoutPreset).mock
      .calls[0];
    expect(data.exercises[0].superset_group).toBeUndefined();
  });

  it('rejects a non-integer superset_group with 400', async () => {
    const body = validCreateBody();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (body.exercises[0] as any).superset_group = 1.5;

    const { statusCode } = await invokeRoute('post', '/', { body });

    expect(statusCode).toBe(400);
    expect(workoutPresetService.createWorkoutPreset).not.toHaveBeenCalled();
  });

  it('rejects a string superset_group on update with 400', async () => {
    const { statusCode } = await invokeRoute('put', '/:id', {
      body: {
        exercises: [
          {
            exercise_id: EXERCISE_ID,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            superset_group: 'a' as any,
            sets: [],
          },
        ],
      },
      params: { id: '7' },
    });

    expect(statusCode).toBe(400);
    expect(workoutPresetService.updateWorkoutPreset).not.toHaveBeenCalled();
  });

  it('strips web-shaped spread fields instead of rejecting them', async () => {
    // The web preset editor spreads full response objects (ids, exercise_name,
    // category, joined fields) into its save payload; strip mode must accept.
    const { statusCode } = await invokeRoute('put', '/:id', {
      body: {
        name: 'Push Day',
        description: null,
        is_public: false,
        exercises: [
          {
            id: 101,
            exercise_id: EXERCISE_ID,
            exercise_name: 'Bench Press',
            category: 'Strength',
            image_url: null,
            sort_order: 0,
            superset_group: 2,
            sets: [
              {
                id: 55,
                set_number: 1,
                set_type: 'normal',
                reps: 10,
                weight: 60,
                duration: null,
                rest_time: null,
                notes: null,
              },
            ],
          },
        ],
      },
      params: { id: '7' },
    });

    expect(statusCode).toBe(200);
    const [, , data] = vi.mocked(workoutPresetService.updateWorkoutPreset).mock
      .calls[0];
    const exercise = data.exercises[0];
    expect(exercise.superset_group).toBe(2);
    expect(exercise).not.toHaveProperty('id');
    expect(exercise).not.toHaveProperty('exercise_name');
    expect(exercise.sets[0]).not.toHaveProperty('id');
  });
});
