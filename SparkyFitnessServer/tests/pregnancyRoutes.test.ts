import {
  vi,
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
// @ts-expect-error supertest has no bundled types in this project
import request from 'supertest';
import express from 'express';
import pregnancyRepository from '../models/pregnancyRepository.js';
import pregnancyService from '../services/pregnancyService.js';
import pregnancyRoutes from '../routes/v2/pregnancyRoutes.js';

vi.mock('../models/pregnancyRepository.js');
vi.mock('../services/pregnancyService.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../services/pregnancyService.js')>();
  return {
    default: {
      ...actual.default,
      getOverview: vi.fn(),
      getContractionAnalysis: vi.fn(),
      getPhotoFile: vi.fn(),
      deletePhoto: vi.fn(),
    },
  };
});
vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn(async () => 'UTC'),
}));

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.userId = 'testUser';
  next();
});
app.use('/api/v2/pregnancy', pregnancyRoutes);

describe('Pregnancy Routes V2', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POST / computes due date from LMP', async () => {
    const saved = { id: 'p1', due_date: '2026-10-08' };
    vi.mocked(pregnancyRepository.createPregnancy).mockResolvedValue(saved);
    const res = await request(app)
      .post('/api/v2/pregnancy')
      .send({ lmp_date: '2026-01-01', due_date_basis: 'lmp' });
    expect(res.statusCode).toBe(201);
    expect(pregnancyRepository.createPregnancy).toHaveBeenCalledWith(
      'testUser',
      expect.objectContaining({ due_date: '2026-10-08' })
    );
  });

  it('POST / rejects when no date basis is given', async () => {
    const res = await request(app).post('/api/v2/pregnancy').send({});
    expect(res.statusCode).toBe(400);
  });

  it('GET /current returns the active pregnancy', async () => {
    const p = { id: 'p1', status: 'active' };
    vi.mocked(pregnancyRepository.getActivePregnancy).mockResolvedValue(p);
    const res = await request(app).get('/api/v2/pregnancy/current');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(p);
  });

  it('GET /overview returns composite payload', async () => {
    const overview = { pregnancy: { id: 'p1' }, gestation: { week: 24 } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(pregnancyService.getOverview).mockResolvedValue(overview as any);
    const res = await request(app).get('/api/v2/pregnancy/overview');
    expect(res.statusCode).toBe(200);
    expect(res.body.gestation.week).toBe(24);
  });

  it('POST /kicks/start starts a session', async () => {
    const session = { id: 'k1', kick_count: 0 };
    vi.mocked(pregnancyRepository.startKickSession).mockResolvedValue(session);
    const res = await request(app)
      .post('/api/v2/pregnancy/kicks/start')
      .send({ pregnancy_id: '550e8400-e29b-41d4-a716-446655440000' });
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual(session);
  });

  it('POST /contractions creates a contraction', async () => {
    const c = { id: 'c1' };
    vi.mocked(pregnancyRepository.createContraction).mockResolvedValue(c);
    const res = await request(app)
      .post('/api/v2/pregnancy/contractions')
      .send({ pregnancy_id: '550e8400-e29b-41d4-a716-446655440000' });
    expect(res.statusCode).toBe(201);
  });

  it('GET /contractions returns analysis with 5-1-1 flag', async () => {
    vi.mocked(pregnancyService.getContractionAnalysis).mockResolvedValue({
      contractions: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stats: {
        count: 0,
        avgDurationSec: null,
        avgIntervalMin: null,
        isFiveOneOne: false,
      } as any,
    });
    const res = await request(app).get('/api/v2/pregnancy/contractions');
    expect(res.statusCode).toBe(200);
    expect(res.body.stats.isFiveOneOne).toBe(false);
  });

  it('DELETE /:id returns 404 when missing', async () => {
    vi.mocked(pregnancyRepository.deletePregnancy).mockResolvedValue(false);
    const res = await request(app).delete(
      '/api/v2/pregnancy/00000000-0000-0000-0000-000000000000'
    );
    expect(res.statusCode).toBe(404);
  });
});

describe('Pregnancy bump photos', () => {
  const PHOTO_ID = '11111111-1111-4111-8111-111111111111';
  let tempFile: string;

  beforeAll(async () => {
    tempFile = path.join(os.tmpdir(), `sparky-bump-${process.pid}.jpg`);
    await fs.writeFile(tempFile, Buffer.from([0xff, 0xd8, 0xff, 0xdb]));
  });

  afterAll(async () => {
    await fs.rm(tempFile, { force: true });
  });

  beforeEach(() => vi.clearAllMocks());

  // file_path is a server-side storage detail; clients address photos by id.
  it('omits file_path from the photo list', async () => {
    vi.mocked(pregnancyRepository.listPhotos).mockResolvedValue([
      { id: PHOTO_ID, pregnancy_id: 'p1', week: 12, notes: null },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any);
    const res = await request(app).get(
      '/api/v2/pregnancy/photos?pregnancy_id=p1'
    );
    expect(res.statusCode).toBe(200);
    expect(res.body[0]).not.toHaveProperty('file_path');
  });

  it('serves an owned photo with nosniff', async () => {
    vi.mocked(pregnancyService.getPhotoFile).mockResolvedValue(tempFile);
    const res = await request(app).get(
      `/api/v2/pregnancy/photos/file/${PHOTO_ID}`
    );
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(pregnancyService.getPhotoFile).toHaveBeenCalledWith(
      'testUser',
      PHOTO_ID
    );
  });

  // Non-owner, deleted row, and missing-file all collapse to null at the
  // service so the route cannot confirm which case it was.
  it('404s when the service resolves nothing', async () => {
    vi.mocked(pregnancyService.getPhotoFile).mockResolvedValue(null);
    const res = await request(app).get(
      `/api/v2/pregnancy/photos/file/${PHOTO_ID}`
    );
    expect(res.statusCode).toBe(404);
  });

  it('rejects a non-UUID id without touching the service', async () => {
    const res = await request(app).get(
      '/api/v2/pregnancy/photos/file/not-a-uuid'
    );
    expect(res.statusCode).toBe(400);
    expect(pregnancyService.getPhotoFile).not.toHaveBeenCalled();
  });

  it('deletes through the service so the file is removed too', async () => {
    vi.mocked(pregnancyService.deletePhoto).mockResolvedValue(true);
    const res = await request(app).delete(
      `/api/v2/pregnancy/photos/${PHOTO_ID}`
    );
    expect(res.statusCode).toBe(204);
    expect(pregnancyService.deletePhoto).toHaveBeenCalledWith(
      'testUser',
      PHOTO_ID
    );
    expect(pregnancyRepository.deletePhoto).not.toHaveBeenCalled();
  });
});
