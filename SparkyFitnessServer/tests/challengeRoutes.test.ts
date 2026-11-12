import { beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error TS7016 supertest typing
import request from 'supertest';
import express from 'express';
import errorHandler from '../middleware/errorHandler.js';

vi.mock('../services/challengeService.js', async () => {
  const actual = await vi.importActual<
    typeof import('../services/challengeService.js')
  >('../services/challengeService.js');
  return {
    ChallengeError: actual.ChallengeError,
    challengesEnabled: vi.fn(),
    listChallenges: vi.fn(),
    createChallenge: vi.fn(),
    joinChallenge: vi.fn(),
    getChallenge: vi.fn(),
    updateRules: vi.fn(),
    getRuleChanges: vi.fn(),
    createInvite: vi.fn(),
    revokeInvite: vi.fn(),
    leaveChallenge: vi.fn(),
    getStandings: vi.fn(),
  };
});

const auth = vi.hoisted(() => ({ userId: 'owner', actor: 'owner' }));
vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => {
    req.userId = auth.userId;
    req.authenticatedUserId = auth.actor;
    req.originalUserId = auth.actor;
    next();
  },
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

import challengeRoutes from '../routes/v2/challengeRoutes.js';
import * as challengeService from '../services/challengeService.js';

const svc = vi.mocked(challengeService);
const app = express();
app.use(express.json());
app.use('/api/v2/challenges', challengeRoutes);
app.use(errorHandler);

const ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
  auth.userId = 'owner';
  auth.actor = 'owner';
  svc.challengesEnabled.mockResolvedValue(true);
});

describe('challenge routes', () => {
  it('lists the caller’s own challenges', async () => {
    svc.listChallenges.mockResolvedValue([]);
    const res = await request(app).get('/api/v2/challenges');
    expect(res.status).toBe(200);
    expect(svc.listChallenges).toHaveBeenCalledWith('owner');
  });

  it('refuses every route in a delegated or switched context', async () => {
    auth.userId = 'owner';
    auth.actor = 'delegate';
    for (const [method, path] of [
      ['get', '/api/v2/challenges'],
      ['post', '/api/v2/challenges/join'],
      ['post', `/api/v2/challenges/${ID}/leave`],
      ['get', `/api/v2/challenges/${ID}/standings`],
    ] as const) {
      const res = await request(app)[method](path).send({});
      expect(res.status, `${method} ${path}`).toBe(403);
    }
    expect(svc.listChallenges).not.toHaveBeenCalled();
    expect(svc.joinChallenge).not.toHaveBeenCalled();
    expect(svc.leaveChallenge).not.toHaveBeenCalled();
    expect(svc.getStandings).not.toHaveBeenCalled();
  });

  it('answers 403 CHALLENGES_DISABLED while the admin switch is off, but still reports the status', async () => {
    svc.challengesEnabled.mockResolvedValue(false);
    const res = await request(app).get('/api/v2/challenges');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CHALLENGES_DISABLED');
    expect(svc.listChallenges).not.toHaveBeenCalled();
    const status = await request(app).get('/api/v2/challenges/status');
    expect(status.status).toBe(200);
    expect(status.body).toEqual({ enabled: false });
  });

  it('validates a new challenge', async () => {
    let res = await request(app)
      .post('/api/v2/challenges')
      .send({ name: '', start_date: '2026-11-16', display_name: 'Me' });
    expect(res.status).toBe(400);
    res = await request(app)
      .post('/api/v2/challenges')
      .send({ name: 'Ok', start_date: '2026-02-30', display_name: 'Me' });
    expect(res.status).toBe(400);
    res = await request(app)
      .post('/api/v2/challenges')
      .send({
        name: 'Ok',
        start_date: '2026-11-16',
        display_name: 'Me',
        rules: { version: 1, metric: 'points' },
      });
    expect(res.status).toBe(400);
    expect(svc.createChallenge).not.toHaveBeenCalled();
  });

  it('creates a challenge with defaults filled', async () => {
    svc.createChallenge.mockResolvedValue({ id: ID } as never);
    const res = await request(app).post('/api/v2/challenges').send({
      name: 'Family',
      start_date: '2026-11-16',
      display_name: 'Me',
      preset: 'workweek_hustle',
    });
    expect(res.status).toBe(201);
    expect(svc.createChallenge).toHaveBeenCalledWith(
      'owner',
      expect.objectContaining({
        preset: 'workweek_hustle',
        member_limit: 50,
        late_join: true,
      })
    );
  });

  it('a malformed id is not found without reaching the service', async () => {
    const res = await request(app).get('/api/v2/challenges/not-a-uuid');
    expect(res.status).toBe(404);
    expect(svc.getChallenge).not.toHaveBeenCalled();
  });

  it('passes service errors through with their status and code', async () => {
    svc.getChallenge.mockRejectedValue(
      new challengeService.ChallengeError(
        404,
        'CHALLENGE_NOT_FOUND',
        'Challenge not found'
      )
    );
    const res = await request(app).get(`/api/v2/challenges/${ID}`);
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      error: 'Challenge not found',
      code: 'CHALLENGE_NOT_FOUND',
    });
  });

  it('joins with a well-formed code only', async () => {
    let res = await request(app)
      .post('/api/v2/challenges/join')
      .send({ code: 'short', display_name: 'Me' });
    expect(res.status).toBe(400);
    svc.joinChallenge.mockResolvedValue({ id: ID } as never);
    res = await request(app)
      .post('/api/v2/challenges/join')
      .send({ code: 'AAAAAAAAAAAAAAAAAAAAAA', display_name: 'Me' });
    expect(res.status).toBe(200);
    expect(svc.joinChallenge).toHaveBeenCalledWith('owner', {
      code: 'AAAAAAAAAAAAAAAAAAAAAA',
      display_name: 'Me',
    });
  });

  it('makes an invite with a 7-day default and caps the length', async () => {
    svc.createInvite.mockResolvedValue({
      code: 'AAAAAAAAAAAAAAAAAAAAAA',
      expires_at: '2026-11-19T00:00:00.000Z',
    });
    let res = await request(app).post(`/api/v2/challenges/${ID}/invite`);
    expect(res.status).toBe(201);
    expect(svc.createInvite).toHaveBeenCalledWith('owner', ID, 7);
    res = await request(app)
      .post(`/api/v2/challenges/${ID}/invite`)
      .send({ expires_in_days: 90 });
    expect(res.status).toBe(400);
    res = await request(app).delete(`/api/v2/challenges/${ID}/invite`);
    expect(res.status).toBe(204);
    expect(svc.revokeInvite).toHaveBeenCalledWith('owner', ID);
  });

  it('updates rules, leaves and reads standings', async () => {
    svc.updateRules.mockResolvedValue({ id: ID } as never);
    let res = await request(app)
      .put(`/api/v2/challenges/${ID}/rules`)
      .send({ rules: { version: 1, metric: 'steps' } });
    expect(res.status).toBe(200);
    expect(svc.updateRules.mock.calls[0]![2]).toMatchObject({
      metric: 'steps',
      period: 'week',
    });
    res = await request(app).post(`/api/v2/challenges/${ID}/leave`);
    expect(res.status).toBe(204);
    svc.getStandings.mockResolvedValue({ rows: [] } as never);
    res = await request(app).get(
      `/api/v2/challenges/${ID}/standings?date=2026-11-12`
    );
    expect(res.status).toBe(200);
    expect(svc.getStandings).toHaveBeenCalledWith('owner', ID, '2026-11-12');
    res = await request(app).get(
      `/api/v2/challenges/${ID}/standings?date=nope`
    );
    expect(res.status).toBe(400);
  });
});
