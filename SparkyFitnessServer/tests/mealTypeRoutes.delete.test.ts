import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS(7016): supertest has no bundled type declarations.
import request from 'supertest';
import express from 'express';
import {
  deleteMealType,
  getMealTypeById,
  getMealTypeDeletionImpact,
  MEAL_TYPE_IN_USE_MESSAGE,
  MEAL_TYPE_INVALID_TARGET_MESSAGE,
  MEAL_TYPE_SYSTEM_MESSAGE,
} from '../models/mealType.js';
import mealTypeRoutes from '../routes/mealTypeRoutes.js';

// Keep the real message constants so these tests assert the actual mapping
// from repository error to HTTP status, not a stubbed copy of it.
vi.mock('../models/mealType.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../models/mealType.js')>();
  return {
    ...actual,
    deleteMealType: vi.fn(),
    getMealTypeById: vi.fn(),
    getMealTypeDeletionImpact: vi.fn(),
  };
});
vi.mock('../middleware/authMiddleware.js', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticate: (req: any, _res: any, next: any) => {
    req.userId = 'test-user';
    next();
  },
}));

const app = express();
app.use(express.json());
app.use('/api/meal-types', mealTypeRoutes);

const MEAL_TYPE_ID = 'meal-type-1';
const TARGET_ID = 'meal-type-2';

describe('DELETE /meal-types/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(deleteMealType).mockResolvedValue({
      deleted: true,
      mode: 'strict',
    });
  });

  it('defaults to strict mode when no query params are given', async () => {
    // Back-compat matters: the mobile client calls the bare endpoint.
    const res = await request(app).delete(`/api/meal-types/${MEAL_TYPE_ID}`);

    expect(res.status).toBe(200);
    expect(deleteMealType).toHaveBeenCalledWith(MEAL_TYPE_ID, 'test-user', {
      mode: 'strict',
      targetMealTypeId: null,
    });
  });

  it('passes the reassign target through', async () => {
    vi.mocked(deleteMealType).mockResolvedValue({
      deleted: true,
      mode: 'reassign',
      reassignedTo: TARGET_ID,
    });

    const res = await request(app).delete(
      `/api/meal-types/${MEAL_TYPE_ID}?mode=reassign&reassignTo=${TARGET_ID}`
    );

    expect(res.status).toBe(200);
    expect(res.body.reassignedTo).toBe(TARGET_ID);
    expect(deleteMealType).toHaveBeenCalledWith(MEAL_TYPE_ID, 'test-user', {
      mode: 'reassign',
      targetMealTypeId: TARGET_ID,
    });
  });

  it('rejects reassign with no target before reaching the repository', async () => {
    const res = await request(app).delete(
      `/api/meal-types/${MEAL_TYPE_ID}?mode=reassign`
    );

    expect(res.status).toBe(400);
    expect(deleteMealType).not.toHaveBeenCalled();
  });

  it('rejects an unknown mode', async () => {
    const res = await request(app).delete(
      `/api/meal-types/${MEAL_TYPE_ID}?mode=obliterate`
    );

    expect(res.status).toBe(400);
    expect(deleteMealType).not.toHaveBeenCalled();
  });

  it('maps an in-use meal type to 409', async () => {
    vi.mocked(deleteMealType).mockRejectedValue(
      new Error(MEAL_TYPE_IN_USE_MESSAGE)
    );

    const res = await request(app).delete(`/api/meal-types/${MEAL_TYPE_ID}`);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe(MEAL_TYPE_IN_USE_MESSAGE);
  });

  it('maps a system default meal type to 403', async () => {
    vi.mocked(deleteMealType).mockRejectedValue(
      new Error(MEAL_TYPE_SYSTEM_MESSAGE)
    );

    const res = await request(app).delete(`/api/meal-types/${MEAL_TYPE_ID}`);

    expect(res.status).toBe(403);
  });

  it('maps an invalid reassign target to 400', async () => {
    vi.mocked(deleteMealType).mockRejectedValue(
      new Error(MEAL_TYPE_INVALID_TARGET_MESSAGE)
    );

    const res = await request(app).delete(
      `/api/meal-types/${MEAL_TYPE_ID}?mode=reassign&reassignTo=${TARGET_ID}`
    );

    expect(res.status).toBe(400);
  });

  it('returns 404 when nothing was deleted', async () => {
    vi.mocked(deleteMealType).mockResolvedValue({
      deleted: false,
      mode: 'strict',
    });

    const res = await request(app).delete(`/api/meal-types/${MEAL_TYPE_ID}`);

    expect(res.status).toBe(404);
  });

  it('does not leak unexpected errors', async () => {
    vi.mocked(deleteMealType).mockRejectedValue(new Error('connection reset'));

    const res = await request(app).delete(`/api/meal-types/${MEAL_TYPE_ID}`);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to delete meal type');
  });
});

describe('GET /meal-types/:id/deletion-impact', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the impact counts', async () => {
    const impact = {
      foodEntries: 12,
      foodEntryMeals: 2,
      mealPlans: 1,
      templateAssignments: 0,
      totalReferences: 15,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(getMealTypeById).mockResolvedValue({ id: MEAL_TYPE_ID } as any);
    vi.mocked(getMealTypeDeletionImpact).mockResolvedValue(impact);

    const res = await request(app).get(
      `/api/meal-types/${MEAL_TYPE_ID}/deletion-impact`
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual(impact);
  });

  it('returns 404 for a meal type the user cannot see', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(getMealTypeById).mockResolvedValue(undefined as any);

    const res = await request(app).get(
      `/api/meal-types/${MEAL_TYPE_ID}/deletion-impact`
    );

    expect(res.status).toBe(404);
    expect(getMealTypeDeletionImpact).not.toHaveBeenCalled();
  });
});
