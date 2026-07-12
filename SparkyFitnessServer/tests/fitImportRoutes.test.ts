import { beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'
import request from 'supertest';
import express from 'express';
import { importFitResponseSchema } from '@workspace/shared';
import type { ImportFitResponse } from '@workspace/shared';
import exerciseEntryRoutes from '../routes/exerciseEntryRoutes.js';
import fitImportService from '../services/fitImportService.js';

vi.mock('../middleware/authMiddleware.js', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticate: vi.fn((req: any, _res: any, next: any) => {
    req.userId = 'user-123';
    req.originalUserId = 'actor-123';
    next();
  }),
}));
vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  default: vi.fn(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => (_req: any, _res: any, next: any) => next()
  ),
}));
vi.mock('../middleware/uploadMiddleware.js', () => ({
  createUploadMiddleware: vi.fn(() => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    single: vi.fn(() => (_req: any, _res: any, next: any) => next()),
  })),
}));
vi.mock('../services/exerciseService.js', () => ({ default: {} }));
vi.mock('../services/exerciseEntryService.js', () => ({ default: {} }));
vi.mock('../services/fitImportService.js', () => ({
  default: { importFitFiles: vi.fn() },
}));
vi.mock('../utils/permissionUtils.js', () => ({
  canAccessUserData: vi.fn(),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const app = express();
app.use(express.json());
app.use('/exercise-entries', exerciseEntryRoutes);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.use((err: any, _req: any, res: any, _next: any) => {
  res.status(500).json({ error: err.message });
});

const mixedResponse: ImportFitResponse = {
  message: 'Imported 1 of 2 FIT file(s).',
  created: 1,
  updated: 0,
  failed: 1,
  results: [
    {
      fileName: 'tennis.fit',
      status: 'created',
      exerciseEntryId: 'entry-1',
      entryDate: '2026-06-23',
      activityName: 'Tenis',
      sport: 'tennis',
    },
    {
      fileName: 'notes.txt',
      status: 'failed',
      reason: 'Only .fit files are supported.',
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fitImportService.importFitFiles).mockResolvedValue(mixedResponse);
});

describe('POST /exercise-entries/import-fit', () => {
  it('returns 200 with mixed per-file results and preserves the acting user', async () => {
    const res = await request(app)
      .post('/exercise-entries/import-fit')
      .attach('files', Buffer.from('fake-fit-bytes'), 'tennis.fit')
      .attach('files', Buffer.from('plain text'), 'notes.txt');

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(mixedResponse);
    expect(importFitResponseSchema.safeParse(res.body).success).toBe(true);
    expect(fitImportService.importFitFiles).toHaveBeenCalledWith(
      'user-123',
      'actor-123',
      expect.arrayContaining([
        expect.objectContaining({ originalname: 'tennis.fit' }),
        expect.objectContaining({ originalname: 'notes.txt' }),
      ])
    );
  });

  it('returns 200 even when every file fails', async () => {
    const allFailed: ImportFitResponse = {
      message: 'Imported 0 of 1 FIT file(s).',
      created: 0,
      updated: 0,
      failed: 1,
      results: [
        { fileName: 'bad.fit', status: 'failed', reason: 'Not a FIT file.' },
      ],
    };
    vi.mocked(fitImportService.importFitFiles).mockResolvedValue(allFailed);

    const res = await request(app)
      .post('/exercise-entries/import-fit')
      .attach('files', Buffer.from('junk'), 'bad.fit');

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(allFailed);
  });

  it('returns 400 when no files are attached', async () => {
    const res = await request(app).post('/exercise-entries/import-fit');

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/No files uploaded/);
    expect(fitImportService.importFitFiles).not.toHaveBeenCalled();
  });

  it('maps an oversized file to a 400 instead of a server error', async () => {
    const res = await request(app)
      .post('/exercise-entries/import-fit')
      .attach('files', Buffer.alloc(10 * 1024 * 1024 + 1), 'huge.fit');

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/Upload rejected/);
    expect(fitImportService.importFitFiles).not.toHaveBeenCalled();
  });

  it('maps too many files to a 400', async () => {
    let req = request(app).post('/exercise-entries/import-fit');
    for (let i = 0; i < 11; i++) {
      req = req.attach('files', Buffer.from(`file ${i}`), `activity-${i}.fit`);
    }
    const res = await req;

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/Upload rejected/);
  });

  it('rejects a service result that violates the shared contract', async () => {
    vi.mocked(fitImportService.importFitFiles).mockResolvedValue({
      message: 'oops',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const res = await request(app)
      .post('/exercise-entries/import-fit')
      .attach('files', Buffer.from('fake'), 'tennis.fit');

    expect(res.statusCode).toBe(500);
  });
});
