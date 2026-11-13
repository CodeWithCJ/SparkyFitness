import express from 'express';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import mealTypeRoutes from '../routes/mealTypeRoutes.js';
import { getAllMealTypes } from '../models/mealType.js';
import familyAccessRepository from '../models/familyAccessRepository.js';
import errorHandler from '../middleware/errorHandler.js';

vi.mock('../models/mealType.js');
vi.mock('../models/familyAccessRepository.js');
vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => {
    req.userId = 'switched-profile';
    req.originalUserId = '11111111-1111-4111-8111-111111111111';
    req.authenticatedUserId = req.originalUserId;
    next();
  },
}));
const app = express();
app.use('/meal-types', mealTypeRoutes);
app.use(errorHandler);
const RECIPIENT = '22222222-2222-4222-8222-222222222222';
const mealTypes = [
  {
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Recipient lunch',
    user_id: RECIPIENT,
    sort_order: 3,
    is_visible: true,
    show_in_quick_log: true,
    default_time: '12:00:00',
  },
];

describe('GET /meal-types/family/:familyUserId', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(familyAccessRepository.checkCopyPermissions).mockResolvedValue(
      true
    );
    vi.mocked(getAllMealTypes).mockResolvedValue(mealTypes);
  });
  it('checks the actual actor and reads recipient types without switching active profile', async () => {
    const response = await request(app).get(`/meal-types/family/${RECIPIENT}`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual(mealTypes);
    expect(
      familyAccessRepository.checkCopyPermissions
    ).toHaveBeenCalledExactlyOnceWith(
      '11111111-1111-4111-8111-111111111111',
      RECIPIENT
    );
    expect(getAllMealTypes).toHaveBeenCalledExactlyOnceWith(
      RECIPIENT,
      '11111111-1111-4111-8111-111111111111'
    );
  });
  it('rejects invalid UUIDs before any permission or data query', async () => {
    const response = await request(app).get('/meal-types/family/not-a-uuid');
    expect(response.status).toBe(400);
    expect(familyAccessRepository.checkCopyPermissions).not.toHaveBeenCalled();
    expect(getAllMealTypes).not.toHaveBeenCalled();
  });
  it('denies read-only, missing or expired grants before reading recipient types', async () => {
    vi.mocked(familyAccessRepository.checkCopyPermissions).mockResolvedValue(
      false
    );
    const response = await request(app).get(`/meal-types/family/${RECIPIENT}`);
    expect(response.status).toBe(403);
    expect(getAllMealTypes).not.toHaveBeenCalled();
  });
});
