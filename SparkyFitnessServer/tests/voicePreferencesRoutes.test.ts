import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express';
// @ts-expect-error supertest has no declarations in this package.
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import routes from '../routes/preferenceRoutes.js';
import preferenceService from '../services/preferenceService.js';

vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: (req: Request, res: Response, next: NextFunction) => {
    if (!req.headers['x-test-auth']) return res.sendStatus(401);
    req.userId = 'actor';
    req.authenticatedUserId = 'actor';
    next();
  },
}));
vi.mock('../services/preferenceService.js', () => ({
  default: {
    updateUserPreferences: vi.fn(),
    upsertUserPreferences: vi.fn(),
  },
}));
vi.mock('../services/AdaptiveTdeeService.js', () => ({
  clearUserTdeeCache: vi.fn(),
}));
const app = express();
app.use(express.json());
app.use('/api/user-preferences', routes);
const serviceId = '00000000-0000-4000-8000-000000000042';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(preferenceService.updateUserPreferences).mockResolvedValue({
    voice_input_enabled: false,
  });
  vi.mocked(preferenceService.upsertUserPreferences).mockResolvedValue({
    voice_input_enabled: false,
  });
});

describe.each(['put', 'post'] as const)('%s voice preferences', (method) => {
  const api = request(app);
  it('requires authentication', async () => {
    const response = await api[method]('/api/user-preferences').send({
      voice_input_enabled: false,
    });
    expect(response.status).toBe(401);
  });

  it.each([
    { voice_input_enabled: 'false' },
    { voice_input_enabled: null },
    { active_voice_ai_service_id: 'system' },
    { active_voice_ai_service_id: false },
  ])('rejects malformed voice preferences: %j', async (body) => {
    const response = await api[method]('/api/user-preferences')
      .set('x-test-auth', 'true')
      .send(body);
    expect(response.status).toBe(400);
    expect(preferenceService.updateUserPreferences).not.toHaveBeenCalled();
    expect(preferenceService.upsertUserPreferences).not.toHaveBeenCalled();
  });

  it.each([
    { voice_input_enabled: false },
    { voice_input_enabled: true },
    { active_voice_ai_service_id: null },
    { active_voice_ai_service_id: serviceId },
    { show_net_carbs: true },
  ])(
    'accepts partial patches without injecting voice defaults: %j',
    async (body) => {
      const response = await api[method]('/api/user-preferences')
        .set('x-test-auth', 'true')
        .send(body);
      expect(response.status).toBe(200);
      if (method === 'put')
        expect(preferenceService.updateUserPreferences).toHaveBeenCalledWith(
          'actor',
          'actor',
          body
        );
      else
        expect(preferenceService.upsertUserPreferences).toHaveBeenCalledWith(
          'actor',
          body
        );
    }
  );
});
