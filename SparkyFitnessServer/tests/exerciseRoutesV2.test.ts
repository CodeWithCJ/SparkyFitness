import { vi, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'super... Remove this comment to see the full error message
import request from 'supertest';
import exerciseService from '../services/exerciseService.js';
// @ts-expect-error TS(2691): An import path cannot end with a '.ts' extension.
import exerciseRoutesV2 from '../routes/v2/exerciseRoutes.js';

vi.mock('../services/exerciseService.js', () => ({
  default: {
    searchExercisesPaginated: vi.fn(),
    getExerciseStats: vi.fn(),
  },
}));

// The route registers `checkPermissionMiddleware('diary')` once at module load,
// so we mock the factory to return a stable middleware that delegates to a
// swappable handler — tests then mutate `permissionHandler` per-case.
const { permissionHandlerRef } = vi.hoisted(() => ({
  permissionHandlerRef: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    current: (_req: any, _res: any, next: any) => next(),
  },
}));
vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  default:
    () =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req: any, res: any, next: any) =>
      permissionHandlerRef.current(req, res, next),
}));

vi.mock('../config/logging.js', () => ({
  log: vi.fn(),
}));

// Mock authenticate to inject userId. Tests can override the implementation
// per-case (e.g. to return 401).
const authenticateMock = vi.fn(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (req: any, _res: any, next: any) => {
    req.userId = 'user-123';
    req.authenticatedUserId = 'user-123';
    next();
  }
);
vi.mock('../middleware/authMiddleware.js', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticate: (req: any, res: any, next: any) =>
    authenticateMock(req, res, next),
}));

const app = express();
app.use(express.json());
app.use('/v2/exercises', exerciseRoutesV2);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.use((err: any, _req: any, res: any, _next: any) => {
  res.status(err.status || 500).json({ error: err.message });
});

const SAMPLE_EXERCISE = {
  id: 'ex-1',
  source: 'manual',
  source_id: null,
  name: 'Push Up',
  force: 'push',
  level: 'beginner',
  mechanic: 'compound',
  equipment: ['bodyweight'],
  primary_muscles: ['chest'],
  secondary_muscles: ['triceps'],
  instructions: ['Start in plank position.'],
  category: 'strength',
  images: [],
  calories_per_hour: 300,
  description: null,
  user_id: 'user-123',
  is_custom: true,
  shared_with_public: false,
  tags: ['private'],
};

describe('GET /v2/exercises/search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticateMock.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (req: any, _res: any, next: any) => {
        req.userId = 'user-123';
        req.authenticatedUserId = 'user-123';
        next();
      }
    );
    permissionHandlerRef.current = (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      _req: any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      _res: any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      next: any
    ) => next();
  });

  it('returns 200 with default pagination shape', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ...
    exerciseService.searchExercisesPaginated.mockResolvedValue({
      exercises: [SAMPLE_EXERCISE],
      totalCount: 1,
    });

    const res = await request(app).get('/v2/exercises/search');

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      exercises: [SAMPLE_EXERCISE],
      pagination: {
        page: 1,
        pageSize: 20,
        totalCount: 1,
        hasMore: false,
      },
    });

    expect(exerciseService.searchExercisesPaginated).toHaveBeenCalledWith(
      'user-123',
      undefined,
      'user-123',
      [],
      [],
      20,
      0
    );
  });

  it('passes searchTerm through to the service and narrows results', async () => {
    // @ts-expect-error TS(2339): mockResolvedValue not on typ...
    exerciseService.searchExercisesPaginated.mockResolvedValue({
      exercises: [SAMPLE_EXERCISE],
      totalCount: 1,
    });

    const res = await request(app)
      .get('/v2/exercises/search')
      .query({ searchTerm: 'push' });

    expect(res.statusCode).toBe(200);
    expect(exerciseService.searchExercisesPaginated).toHaveBeenCalledWith(
      'user-123',
      'push',
      'user-123',
      [],
      [],
      20,
      0
    );
    expect(res.body.exercises).toHaveLength(1);
  });

  it('computes offset for page=2 and reports hasMore correctly', async () => {
    // @ts-expect-error TS(2339): mockResolvedValue not on typ...
    exerciseService.searchExercisesPaginated.mockResolvedValue({
      exercises: [SAMPLE_EXERCISE],
      totalCount: 50,
    });

    const res = await request(app)
      .get('/v2/exercises/search')
      .query({ page: '2', pageSize: '20' });

    expect(res.statusCode).toBe(200);
    expect(exerciseService.searchExercisesPaginated).toHaveBeenCalledWith(
      'user-123',
      undefined,
      'user-123',
      [],
      [],
      20,
      20
    );
    expect(res.body.pagination).toEqual({
      page: 2,
      pageSize: 20,
      totalCount: 50,
      hasMore: true,
    });
  });

  it('reports hasMore=false on the final page', async () => {
    // @ts-expect-error TS(2339): mockResolvedValue not on typ...
    exerciseService.searchExercisesPaginated.mockResolvedValue({
      exercises: [SAMPLE_EXERCISE],
      totalCount: 21,
    });

    const res = await request(app)
      .get('/v2/exercises/search')
      .query({ page: '2', pageSize: '20' });

    expect(res.statusCode).toBe(200);
    expect(res.body.pagination.hasMore).toBe(false);
  });

  it('returns an empty page when no exercises match', async () => {
    // @ts-expect-error TS(2339): mockResolvedValue not on typ...
    exerciseService.searchExercisesPaginated.mockResolvedValue({
      exercises: [],
      totalCount: 0,
    });

    const res = await request(app)
      .get('/v2/exercises/search')
      .query({ searchTerm: 'no-such-exercise' });

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      exercises: [],
      pagination: {
        page: 1,
        pageSize: 20,
        totalCount: 0,
        hasMore: false,
      },
    });
  });

  it('splits CSV equipmentFilter and muscleGroupFilter into arrays', async () => {
    // @ts-expect-error TS(2339): mockResolvedValue not on typ...
    exerciseService.searchExercisesPaginated.mockResolvedValue({
      exercises: [],
      totalCount: 0,
    });

    await request(app).get('/v2/exercises/search').query({
      equipmentFilter: 'bodyweight,dumbbell',
      muscleGroupFilter: 'chest,triceps',
    });

    expect(exerciseService.searchExercisesPaginated).toHaveBeenCalledWith(
      'user-123',
      undefined,
      'user-123',
      ['bodyweight', 'dumbbell'],
      ['chest', 'triceps'],
      20,
      0
    );
  });

  it('returns 400 on pageSize above max', async () => {
    const res = await request(app)
      .get('/v2/exercises/search')
      .query({ pageSize: '999' });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Invalid query parameters');
    expect(exerciseService.searchExercisesPaginated).not.toHaveBeenCalled();
  });

  it('returns 400 on page=0', async () => {
    const res = await request(app)
      .get('/v2/exercises/search')
      .query({ page: '0' });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Invalid query parameters');
    expect(exerciseService.searchExercisesPaginated).not.toHaveBeenCalled();
  });

  it('returns 401 when authenticate rejects', async () => {
    authenticateMock.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (_req: any, res: any, _next: any) => {
        res.status(401).json({ error: 'Unauthenticated' });
      }
    );

    const res = await request(app).get('/v2/exercises/search');

    expect(res.statusCode).toBe(401);
    expect(exerciseService.searchExercisesPaginated).not.toHaveBeenCalled();
  });
});

describe('GET /v2/exercises/:exerciseId/stats', () => {
  const EXERCISE_UUID = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    vi.clearAllMocks();
    authenticateMock.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (req: any, _res: any, next: any) => {
        req.userId = 'user-123';
        req.authenticatedUserId = 'user-123';
        next();
      }
    );
    permissionHandlerRef.current = (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      _req: any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      _res: any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      next: any
    ) => next();
  });

  it('returns 200 with a full payload when both sets are present', async () => {
    // @ts-expect-error TS(2339): mockResolvedValue not on typed function.
    exerciseService.getExerciseStats.mockResolvedValue({
      bestSet: {
        entryDate: '2026-05-20',
        weight: 100,
        reps: 5,
        setNumber: 3,
      },
      lastSet: {
        entryDate: '2026-05-19',
        weight: 80,
        reps: 8,
        setNumber: 1,
      },
    });

    const res = await request(app).get(`/v2/exercises/${EXERCISE_UUID}/stats`);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      bestSet: {
        entryDate: '2026-05-20',
        weight: 100,
        reps: 5,
        setNumber: 3,
      },
      lastSet: {
        entryDate: '2026-05-19',
        weight: 80,
        reps: 8,
        setNumber: 1,
      },
    });
    expect(exerciseService.getExerciseStats).toHaveBeenCalledWith(
      'user-123',
      EXERCISE_UUID,
      null
    );
  });

  it('forwards a valid excludePresetEntryId query param to the service', async () => {
    const excludeId = '22222222-2222-4222-8222-222222222222';
    // @ts-expect-error TS(2339): mockResolvedValue not on typed function.
    exerciseService.getExerciseStats.mockResolvedValue({
      bestSet: null,
      lastSet: null,
    });

    const res = await request(app).get(
      `/v2/exercises/${EXERCISE_UUID}/stats?excludePresetEntryId=${excludeId}`
    );

    expect(res.statusCode).toBe(200);
    expect(exerciseService.getExerciseStats).toHaveBeenCalledWith(
      'user-123',
      EXERCISE_UUID,
      excludeId
    );
  });

  it('returns 400 when excludePresetEntryId is not a UUID', async () => {
    const res = await request(app).get(
      `/v2/exercises/${EXERCISE_UUID}/stats?excludePresetEntryId=not-a-uuid`
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Invalid excludePresetEntryId');
    expect(exerciseService.getExerciseStats).not.toHaveBeenCalled();
  });

  it('returns 200 with both nulls when the user has no history', async () => {
    // @ts-expect-error TS(2339): mockResolvedValue not on typed function.
    exerciseService.getExerciseStats.mockResolvedValue({
      bestSet: null,
      lastSet: null,
    });

    const res = await request(app).get(`/v2/exercises/${EXERCISE_UUID}/stats`);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ bestSet: null, lastSet: null });
  });

  it('returns 400 when exerciseId is not a UUID', async () => {
    const res = await request(app).get('/v2/exercises/not-a-uuid/stats');

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Invalid exerciseId');
    expect(exerciseService.getExerciseStats).not.toHaveBeenCalled();
  });

  it('returns 401 when authenticate rejects', async () => {
    authenticateMock.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (_req: any, res: any, _next: any) => {
        res.status(401).json({ error: 'Unauthenticated' });
      }
    );

    const res = await request(app).get(`/v2/exercises/${EXERCISE_UUID}/stats`);

    expect(res.statusCode).toBe(401);
    expect(exerciseService.getExerciseStats).not.toHaveBeenCalled();
  });

  it('returns 403 when diary permission is denied', async () => {
    permissionHandlerRef.current = (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      _req: any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      res: any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      _next: any
    ) => {
      res.status(403).json({ error: 'Forbidden' });
    };

    const res = await request(app).get(`/v2/exercises/${EXERCISE_UUID}/stats`);

    expect(res.statusCode).toBe(403);
    expect(exerciseService.getExerciseStats).not.toHaveBeenCalled();
  });
});
