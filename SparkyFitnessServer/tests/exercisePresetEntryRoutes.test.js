const { z } = require("zod");

const exerciseEntrySetRequestSchema = z.object({
  set_number: z.number().int().positive(),
  set_type: z.string().nullable().optional(),
  reps: z.number().nullable().optional(),
  weight: z.number().nullable().optional(),
  duration: z.number().nullable().optional(),
  rest_time: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
  rpe: z.number().nullable().optional(),
}).strict();

const presetSessionExerciseRequestSchema = z.object({
  exercise_id: z.string().uuid(),
  sort_order: z.number().int().min(0).default(0),
  duration_minutes: z.number().min(0).default(0),
  notes: z.string().nullable().optional(),
  sets: z.array(exerciseEntrySetRequestSchema).default([]),
}).strict();

const createPresetSessionRequestSchema = z.object({
  workout_preset_id: z.number().int().nullable().optional(),
  entry_date: z.string(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  source: z.string().default("manual"),
  exercises: z.array(presetSessionExerciseRequestSchema).min(1).optional(),
}).strict().superRefine((data, ctx) => {
  const hasPresetId =
    data.workout_preset_id !== undefined && data.workout_preset_id !== null;
  const hasExercises = data.exercises !== undefined;

  if (hasPresetId === hasExercises) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "Provide exactly one workout source: workout_preset_id or exercises.",
    });
  }

  if (!hasPresetId && !data.name) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Name is required when creating a freeform workout.",
      path: ["name"],
    });
  }
});

const updatePresetSessionRequestSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  entry_date: z.string().optional(),
  exercises: z.array(presetSessionExerciseRequestSchema).min(1).optional(),
}).strict().superRefine((data, ctx) => {
  const hasAnyField =
    data.name !== undefined ||
    data.description !== undefined ||
    data.notes !== undefined ||
    data.entry_date !== undefined ||
    data.exercises !== undefined;

  if (!hasAnyField) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "At least one field must be provided.",
    });
  }
});

const presetSessionResponseSchema = z.object({
  type: z.literal("preset"),
  id: z.string().uuid(),
  entry_date: z.string().nullable(),
  workout_preset_id: z.number().int().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  notes: z.string().nullable(),
  source: z.string(),
  total_duration_minutes: z.number(),
  exercises: z.array(
    z.object({
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
        z.object({
          id: z.number(),
          set_number: z.number(),
          set_type: z.string().nullable(),
          reps: z.number().nullable(),
          weight: z.number().nullable(),
          duration: z.number().nullable(),
          rest_time: z.number().nullable(),
          notes: z.string().nullable(),
          rpe: z.number().nullable(),
        }).strict(),
      ),
      exercise_snapshot: z.object({
        id: z.string().uuid(),
        name: z.string(),
        category: z.string().nullable(),
      }).nullable(),
      activity_details: z.array(z.object({
        id: z.string(),
        provider_name: z.string(),
        detail_type: z.string(),
        detail_data: z.unknown(),
      }).strict()),
    }).strict(),
  ),
  activity_details: z.array(z.object({
    id: z.string(),
    provider_name: z.string(),
    detail_type: z.string(),
    detail_data: z.unknown(),
  }).strict()),
}).strict();

const mockShared = {
  createPresetSessionRequestSchema,
  updatePresetSessionRequestSchema,
  presetSessionResponseSchema,
};

jest.mock("@workspace/shared", () => mockShared);

jest.mock("../services/exerciseService", () => ({
  createGroupedWorkoutSession: jest.fn(),
  getGroupedWorkoutSessionById: jest.fn(),
  updateGroupedWorkoutSession: jest.fn(),
}));

jest.mock("../models/exercisePresetEntryRepository", () => ({
  deleteExercisePresetEntry: jest.fn(),
}));

jest.mock("../config/logging", () => ({
  log: jest.fn(),
}));

const exerciseService = require("../services/exerciseService");
const exercisePresetEntryRepository = require("../models/exercisePresetEntryRepository");
const exercisePresetEntryRoutes = require("../routes/exercisePresetEntryRoutes");

function getRouteHandlers(method, path) {
  const layer = exercisePresetEntryRoutes.stack.find(
    (entry) =>
      entry.route &&
      entry.route.path === path &&
      entry.route.methods[method.toLowerCase()],
  );

  if (!layer) {
    throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
  }

  return layer.route.stack.map((entry) => entry.handle);
}

async function invokeRoute(method, path, { body = {}, params = {} } = {}) {
  const handlers = getRouteHandlers(method, path);
  const req = {
    body,
    params,
    userId: "99999999-9999-4999-8999-999999999999",
    originalUserId: "99999999-9999-4999-8999-999999999999",
  };

  let statusCode = 200;
  let responseBody;
  let finished = false;

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      responseBody = payload;
      finished = true;
      return this;
    },
    send(payload) {
      responseBody = payload;
      finished = true;
      return this;
    },
  };

  for (const handler of handlers) {
    let nextCalled = false;

    await new Promise((resolve, reject) => {
      const next = (error) => {
        nextCalled = true;
        if (error) {
          reject(error);
          return;
        }
        resolve();
      };

      try {
        const result = handler(req, res, next);
        Promise.resolve(result)
          .then(() => {
            if (!nextCalled) {
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
  type: "preset",
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  entry_date: "2026-03-12",
  workout_preset_id: null,
  name: "Morning Workout",
  description: null,
  notes: null,
  source: "sparky",
  total_duration_minutes: 0,
  exercises: [
    {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      exercise_id: "11111111-1111-4111-8111-111111111111",
      duration_minutes: 0,
      calories_burned: 0,
      entry_date: "2026-03-12",
      notes: null,
      distance: null,
      avg_heart_rate: null,
      source: "sparky",
      sets: [
        {
          id: 1,
          set_number: 1,
          set_type: "working",
          reps: 10,
          weight: 60,
          duration: null,
          rest_time: null,
          notes: null,
          rpe: null,
        },
      ],
      exercise_snapshot: {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Bench Press",
        category: "Strength",
      },
      activity_details: [],
    },
  ],
  activity_details: [],
});

describe("exercisePresetEntryRoutes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates a freeform grouped workout session", async () => {
    exerciseService.createGroupedWorkoutSession.mockResolvedValue(
      groupedSessionFixture,
    );

    const response = await invokeRoute("post", "/", {
      body: {
        name: "Morning Workout",
        entry_date: "2026-03-12",
        description: null,
        notes: null,
        source: "sparky",
        exercises: [
          {
            exercise_id: "11111111-1111-4111-8111-111111111111",
            sort_order: 0,
            duration_minutes: 0,
            notes: null,
            sets: [
              {
                set_number: 1,
                set_type: "working",
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
      "99999999-9999-4999-8999-999999999999",
      "99999999-9999-4999-8999-999999999999",
      {
        name: "Morning Workout",
        entry_date: "2026-03-12",
        description: null,
        notes: null,
        source: "sparky",
        exercises: [
          {
            exercise_id: "11111111-1111-4111-8111-111111111111",
            sort_order: 0,
            duration_minutes: 0,
            notes: null,
            sets: [
              {
                set_number: 1,
                set_type: "working",
                reps: 10,
                weight: 60,
                notes: null,
              },
            ],
          },
        ],
      },
    );
  });

  it("rejects ambiguous create payloads", async () => {
    const response = await invokeRoute("post", "/", {
      body: {
        workout_preset_id: 42,
        name: "Morning Workout",
        entry_date: "2026-03-12",
        exercises: [
          {
            exercise_id: "11111111-1111-4111-8111-111111111111",
          },
        ],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toBe("Invalid grouped workout payload.");
    expect(exerciseService.createGroupedWorkoutSession).not.toHaveBeenCalled();
  });

  it("returns a grouped workout session by id", async () => {
    exerciseService.getGroupedWorkoutSessionById.mockResolvedValue(
      groupedSessionFixture,
    );

    const response = await invokeRoute("get", "/:id", {
      params: { id: groupedSessionFixture.id },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual(groupedSessionFixture);
    expect(exerciseService.getGroupedWorkoutSessionById).toHaveBeenCalledWith(
      "99999999-9999-4999-8999-999999999999",
      groupedSessionFixture.id,
    );
  });

  it("surfaces 409 conflicts from grouped workout updates", async () => {
    const conflictError = new Error(
      "Nested exercise editing is only supported for manual or sparky workouts.",
    );
    conflictError.status = 409;
    exerciseService.updateGroupedWorkoutSession.mockRejectedValue(conflictError);

    const response = await invokeRoute("put", "/:id", {
      params: { id: groupedSessionFixture.id },
      body: {
        exercises: [
          {
            exercise_id: "11111111-1111-4111-8111-111111111111",
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
        "Nested exercise editing is only supported for manual or sparky workouts.",
    });
  });

  it("deletes grouped workout sessions", async () => {
    exercisePresetEntryRepository.deleteExercisePresetEntry.mockResolvedValue(
      true,
    );

    const response = await invokeRoute("delete", "/:id", {
      params: { id: groupedSessionFixture.id },
    });

    expect(response.statusCode).toBe(204);
    expect(exercisePresetEntryRepository.deleteExercisePresetEntry).toHaveBeenCalledWith(
      groupedSessionFixture.id,
      "99999999-9999-4999-8999-999999999999",
    );
  });
});
