import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
// @ts-expect-error TS(7016): supertest has no bundled types in this project.
import request from 'supertest';
import preferenceRoutes from '../routes/preferenceRoutes.js';
import {
  getOpenFoodFactsSyncSettings,
  updateOpenFoodFactsSyncSettings,
} from '../services/openFoodFactsSyncSettingsService.js';

vi.mock('../services/openFoodFactsSyncSettingsService.js', () => ({
  getOpenFoodFactsSyncSettings: vi.fn(),
  updateOpenFoodFactsSyncSettings: vi.fn(),
}));
vi.mock('../services/preferenceService.js', () => ({ default: {} }));
vi.mock('../services/AdaptiveTdeeService.js', () => ({
  clearUserTdeeCache: vi.fn(),
}));
vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: vi.fn((req, _res, next) => {
    req.authenticatedUserId = 'real-user';
    req.userId = 'delegated-user';
    next();
  }),
}));

const response = {
  serverEnabled: true,
  userEnabled: true,
  productLanguage: 'de',
  providerScope: 'personal' as const,
  status: { pending: 1, processing: 0, failed: 0, succeeded: 2 },
  recentFailures: [],
};

const app = express();
app.use(express.json());
app.use('/api/user-preferences', preferenceRoutes);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getOpenFoodFactsSyncSettings).mockResolvedValue(response);
  vi.mocked(updateOpenFoodFactsSyncSettings).mockResolvedValue(response);
});

describe('Open Food Facts preference routes', () => {
  it('always reads the signed-in user preference, never a delegated diary owner', async () => {
    const result = await request(app).get(
      '/api/user-preferences/openfoodfacts-contributions'
    );

    expect(result.statusCode).toBe(200);
    expect(getOpenFoodFactsSyncSettings).toHaveBeenCalledWith('real-user');
  });

  it('updates only the signed-in user with a normalized product language', async () => {
    const result = await request(app)
      .put('/api/user-preferences/openfoodfacts-contributions')
      .send({ enabled: true, productLanguage: ' DE ' });

    expect(result.statusCode).toBe(200);
    expect(updateOpenFoodFactsSyncSettings).toHaveBeenCalledWith('real-user', {
      enabled: true,
      productLanguage: 'de',
    });
  });

  it('rejects missing or non-language values before changing consent', async () => {
    const result = await request(app)
      .put('/api/user-preferences/openfoodfacts-contributions')
      .send({ enabled: true, productLanguage: 'de-DE' });

    expect(result.statusCode).toBe(400);
    expect(updateOpenFoodFactsSyncSettings).not.toHaveBeenCalled();
  });
});
