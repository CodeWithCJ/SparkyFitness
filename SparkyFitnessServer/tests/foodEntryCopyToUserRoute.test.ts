import express from 'express';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import foodEntryRoutes from '../routes/foodEntryRoutes.js';
import foodEntryService from '../services/foodEntryService.js';
import { clearUserTdeeCache } from '../services/AdaptiveTdeeService.js';
import errorHandler from '../middleware/errorHandler.js';

const ACTOR = '11111111-1111-4111-8111-111111111111';
const { diaryPermissionMiddleware } = vi.hoisted(() => ({
  diaryPermissionMiddleware: vi.fn(
    (_req: unknown, _res: unknown, next: () => void) => next()
  ),
}));
vi.mock('../services/foodEntryService.js');
vi.mock('../services/AdaptiveTdeeService.js', () => ({
  clearUserTdeeCache: vi.fn(),
}));
vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  default: vi.fn(() => diaryPermissionMiddleware),
}));
vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: vi.fn(
    (
      req: express.Request,
      _res: express.Response,
      next: express.NextFunction
    ) => {
      req.userId = 'active-family-context';
      req.authenticatedUserId = '11111111-1111-4111-8111-111111111111';
      req.originalUserId = '11111111-1111-4111-8111-111111111111';
      next();
    }
  ),
}));

const app = express();
app.use(express.json());
app.use('/', foodEntryRoutes);
app.use(errorHandler);
const selectedBody = {
  familyUserId: '22222222-2222-4222-8222-222222222222',
  sourceDate: '2026-10-27',
  targetDate: '2026-10-28',
  targetMealType: '33333333-3333-4333-8333-333333333333',
  entries: [
    {
      entryId: '44444444-4444-4444-8444-444444444444',
      quantity: 150,
      sourceFingerprint: 'snapshot',
    },
  ],
};
const reviewedBody = {
  ...selectedBody,
  sourceMealType: 'Lunch',
  entries: selectedBody.entries.map(({ entryId, sourceFingerprint }) => ({
    entryId,
    sourceFingerprint,
  })),
};

describe('actor-scoped copy-to-user routes', () => {
  beforeEach(() => vi.resetAllMocks());
  it.each(['reviewed', 'selected'] as const)(
    'copies %s entries from the signed-in actor regardless of active profile',
    async (mode) => {
      const method =
        mode === 'reviewed'
          ? foodEntryService.copyReviewedFoodEntriesToUser
          : foodEntryService.copySelectedFoodEntriesToUser;
      const body = mode === 'reviewed' ? reviewedBody : selectedBody;
      vi.mocked(method).mockResolvedValue([{ id: 'copy' }]);
      const response = await request(app)
        .post(`/copy-${mode}-to-user`)
        .send(body);
      expect(response.status).toBe(201);
      expect(diaryPermissionMiddleware).not.toHaveBeenCalled();
      expect(method).toHaveBeenCalledWith(
        ACTOR,
        body.familyUserId,
        body.sourceDate,
        ...(mode === 'reviewed' ? ['Lunch'] : []),
        body.targetDate,
        body.targetMealType,
        body.entries
      );
      expect(clearUserTdeeCache).toHaveBeenCalledExactlyOnceWith(
        body.familyUserId
      );
    }
  );
  it.each(['reviewed', 'selected'] as const)(
    'rejects a forged source user for %s copies',
    async (mode) => {
      const response = await request(app)
        .post(`/copy-${mode}-to-user`)
        .send({
          ...(mode === 'reviewed' ? reviewedBody : selectedBody),
          sourceUserId: 'forged',
        });
      expect(response.status).toBe(400);
      expect(
        foodEntryService.copyReviewedFoodEntriesToUser
      ).not.toHaveBeenCalled();
      expect(
        foodEntryService.copySelectedFoodEntriesToUser
      ).not.toHaveBeenCalled();
      expect(clearUserTdeeCache).not.toHaveBeenCalled();
    }
  );
  it.each([403, 409])(
    'preserves %i errors and leaves recipient cache untouched',
    async (statusCode) => {
      vi.mocked(
        foodEntryService.copySelectedFoodEntriesToUser
      ).mockRejectedValue(
        Object.assign(new Error('Copy rejected'), { statusCode })
      );
      const response = await request(app)
        .post('/copy-selected-to-user')
        .send(selectedBody);
      expect(response.status).toBe(statusCode);
      expect(clearUserTdeeCache).not.toHaveBeenCalled();
    }
  );
});
