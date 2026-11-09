import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
// @ts-expect-error supertest has no declarations in this package.
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import errorHandler from '../middleware/errorHandler.js';
import routes from '../routes/preferenceRoutes.js';
import preferenceService from '../services/preferenceService.js';

// The mock stands in for the real middleware: `x-test-user` is the profile the
// request acts on and `x-test-actor` the signed-in person, as a switched
// (delegated) context sets them.
vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: (req: Request, res: Response, next: NextFunction) => {
    const user = req.headers['x-test-user'];
    if (typeof user !== 'string') return res.sendStatus(401);
    const actor = req.headers['x-test-actor'];
    req.userId = user;
    req.authenticatedUserId = typeof actor === 'string' ? actor : user;
    req.originalUserId = typeof actor === 'string' ? actor : user;
    next();
  },
}));
vi.mock('../services/preferenceService.js', () => ({
  default: { updateFeatureChoices: vi.fn() },
}));
vi.mock('../services/AdaptiveTdeeService.js', () => ({
  clearUserTdeeCache: vi.fn(),
}));

const app = express();
app.use(express.json());
app.use('/api/user-preferences', routes);
app.use(errorHandler);

const OWNER = 'owner-1';

function patch(body: unknown, headers: Record<string, string> = {}) {
  return request(app)
    .patch('/api/user-preferences/features')
    .set({ 'x-test-user': OWNER, ...headers })
    .send(body);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(preferenceService.updateFeatureChoices).mockResolvedValue({
    status: 'ok',
    choices: { labResults: false },
  });
});

describe('PATCH /user-preferences/features', () => {
  it('requires authentication', async () => {
    const response = await request(app)
      .patch('/api/user-preferences/features')
      .send({ labResults: false });
    expect(response.status).toBe(401);
  });

  it('merges the patch for the owner and returns the stored choices', async () => {
    const body = { labResults: false, futureFeature: null };
    const response = await patch(body);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ feature_choices: { labResults: false } });
    expect(preferenceService.updateFeatureChoices).toHaveBeenCalledWith(
      OWNER,
      body
    );
  });

  it('refuses someone acting on the owner’s behalf', async () => {
    const response = await patch(
      { labResults: false },
      { 'x-test-actor': 'delegate-1' }
    );
    expect(response.status).toBe(403);
    expect(response.body.error).toBe(
      'Forbidden: features can only be turned on or off on your own account.'
    );
    expect(preferenceService.updateFeatureChoices).not.toHaveBeenCalled();
  });

  it.each([
    ['an empty patch', {}],
    ['an array', [true]],
    ['a malformed key', { 'Lab-Results': false }],
    ['a value that is not a boolean', { labResults: 'off' }],
    [
      'more than 64 keys',
      Object.fromEntries(
        Array.from({ length: 65 }, (_, index) => [`feature${index}`, true])
      ),
    ],
  ])('rejects %s', async (_label, body) => {
    const response = await patch(body);
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid feature choices.');
    expect(preferenceService.updateFeatureChoices).not.toHaveBeenCalled();
  });

  it.each([
    { cycle: true },
    { cycle: null },
    { cycle: false, labResults: true },
  ])('refuses cycle, which has its own setting: %j', async (body) => {
    const response = await patch(body);
    expect(response.status).toBe(400);
    expect(response.body.keys).toEqual(['cycle']);
    expect(preferenceService.updateFeatureChoices).not.toHaveBeenCalled();
  });

  it('answers 400 when the stored choices would pass the limit', async () => {
    vi.mocked(preferenceService.updateFeatureChoices).mockResolvedValue({
      status: 'tooMany',
    });
    const response = await patch({ labResults: false });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Too many feature choices.');
  });

  it('treats a missing preferences row as a server error, never a 404', async () => {
    vi.mocked(preferenceService.updateFeatureChoices).mockResolvedValue({
      status: 'noRow',
    });
    const response = await patch({ labResults: false });
    expect(response.status).toBe(500);
  });
});
