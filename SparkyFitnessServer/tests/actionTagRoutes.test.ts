import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS7016 supertest typing
import request from 'supertest';
import express from 'express';
import errorHandler from '../middleware/errorHandler.js';
import actionTagRoutes from '../routes/v2/actionTagRoutes.js';
import * as repo from '../models/actionTagRepository.js';
import * as service from '../services/actionTagService.js';

vi.mock('../models/actionTagRepository.js', () => {
  class ActionTagLimitError extends Error {}
  return {
    ActionTagLimitError,
    listActionTags: vi.fn(),
    createActionTag: vi.fn(),
    updateActionTag: vi.fn(),
    deleteActionTag: vi.fn(),
  };
});

vi.mock('../services/actionTagService.js', () => ({
  scanActionTag: vi.fn(),
}));

vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => {
    req.userId = 'test-user-id';
    req.authenticatedUserId = 'test-user-id';
    next();
  },
}));

vi.mock('../middleware/onBehalfOfMiddleware.js', () => ({
  default: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => next(),
}));

vi.mock('../middleware/requireSelfMiddleware.js', () => ({
  createRequireSelfActor:
    () =>
    (
      _req: express.Request,
      _res: express.Response,
      next: express.NextFunction
    ) =>
      next(),
}));

const app = express();
app.use(express.json());
app.use('/api/v2/action-tags', actionTagRoutes);
app.use(errorHandler);

const CODE = 'b'.repeat(32);
const TAG_ID = '3f2b8c1e-7d4a-4e5b-9a6c-1d2e3f4a5b6c';
const WATER = { type: 'water', container_id: 3, drinks: 1 };

describe('Action tag routes (v2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists the tags', async () => {
    vi.mocked(repo.listActionTags).mockResolvedValue([]);
    const res = await request(app).get('/api/v2/action-tags');
    expect(res.statusCode).toBe(200);
    expect(repo.listActionTags).toHaveBeenCalledWith(
      'test-user-id',
      'test-user-id'
    );
  });

  it('creates a tag', async () => {
    vi.mocked(repo.createActionTag).mockResolvedValue({
      id: 't1',
    } as Awaited<ReturnType<typeof repo.createActionTag>>);
    const res = await request(app)
      .post('/api/v2/action-tags')
      .send({ tag_code: CODE, label: 'Stanley', action: WATER });
    expect(res.statusCode).toBe(201);
  });

  it('rejects a code that is not 32 hex characters', async () => {
    const res = await request(app)
      .post('/api/v2/action-tags')
      .send({ tag_code: 'short', label: 'x', action: WATER });
    expect(res.statusCode).toBe(400);
    expect(repo.createActionTag).not.toHaveBeenCalled();
  });

  it('rejects an unknown action type', async () => {
    const res = await request(app)
      .post('/api/v2/action-tags')
      .send({ tag_code: CODE, label: 'x', action: { type: 'teleport' } });
    expect(res.statusCode).toBe(400);
  });

  it('answers 409 when the code is already saved', async () => {
    vi.mocked(repo.createActionTag).mockRejectedValue(
      Object.assign(new Error('dup'), { code: '23505' })
    );
    const res = await request(app)
      .post('/api/v2/action-tags')
      .send({ tag_code: CODE, label: 'x', action: WATER });
    expect(res.statusCode).toBe(409);
  });

  it('answers 409 at the tag limit', async () => {
    vi.mocked(repo.createActionTag).mockRejectedValue(
      new repo.ActionTagLimitError()
    );
    const res = await request(app)
      .post('/api/v2/action-tags')
      .send({ tag_code: CODE, label: 'x', action: WATER });
    expect(res.statusCode).toBe(409);
  });

  it('answers 404 when updating or deleting a missing tag', async () => {
    vi.mocked(repo.updateActionTag).mockResolvedValue(null);
    vi.mocked(repo.deleteActionTag).mockResolvedValue(false);
    const patch = await request(app)
      .patch(`/api/v2/action-tags/${TAG_ID}`)
      .send({ label: 'New' });
    const del = await request(app).delete(`/api/v2/action-tags/${TAG_ID}`);
    expect(patch.statusCode).toBe(404);
    expect(del.statusCode).toBe(404);
  });

  it('answers 404 for an id that is not a UUID, without touching the database', async () => {
    const patch = await request(app)
      .patch('/api/v2/action-tags/abc')
      .send({ label: 'New' });
    const del = await request(app).delete('/api/v2/action-tags/abc');
    expect(patch.statusCode).toBe(404);
    expect(del.statusCode).toBe(404);
    expect(repo.updateActionTag).not.toHaveBeenCalled();
    expect(repo.deleteActionTag).not.toHaveBeenCalled();
  });

  it('scans a tag with the device day', async () => {
    vi.mocked(service.scanActionTag).mockResolvedValue({
      status: 'unknown_tag',
      tag: null,
      summary: null,
    });
    const res = await request(app)
      .post('/api/v2/action-tags/scan')
      .send({ tag_code: CODE, entry_date: '2026-10-30' });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('unknown_tag');
    expect(service.scanActionTag).toHaveBeenCalledWith(
      'test-user-id',
      'test-user-id',
      { tag_code: CODE, entry_date: '2026-10-30' }
    );
  });

  it('rejects a scan with a bad day', async () => {
    const res = await request(app)
      .post('/api/v2/action-tags/scan')
      .send({ tag_code: CODE, entry_date: 'today' });
    expect(res.statusCode).toBe(400);
    expect(service.scanActionTag).not.toHaveBeenCalled();
  });
});
