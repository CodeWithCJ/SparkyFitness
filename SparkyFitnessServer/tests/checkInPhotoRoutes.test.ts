import {
  vi,
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'
import request from 'supertest';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import checkInPhotoRoutes from '../routes/checkInPhotoRoutes.js';
import checkInPhotoService from '../services/checkInPhotoService.js';
import errorHandler from '../middleware/errorHandler.js';

vi.mock('../services/checkInPhotoService.js');
vi.mock('../middleware/authMiddleware', () => ({
  authenticate: vi.fn((req: any, _res: any, next: any) => {
    req.userId = 'test-user-id';
    next();
  }),
}));
vi.mock('../middleware/checkPermissionMiddleware', () => ({
  default: vi.fn(() => (_req: any, _res: any, next: any) => next()),
}));
// Keep the real isAllowedImageBuffer so the magic-byte validation is exercised;
// only stub the multer middleware and the disk-writing persist helper. The
// fake single() lets a test drive the validated bytes via an x-test-bytes
// header (hex), defaulting to a valid JPEG signature.
vi.mock('../middleware/checkInPhotoUpload', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../middleware/checkInPhotoUpload.js')
    >();
  return {
    ...actual,
    default: {
      single: vi.fn(() => (req: any, _res: any, next: any) => {
        const hex = req.headers['x-test-bytes'] as string | undefined;
        req.file = {
          originalname: 'front.jpg',
          buffer: hex
            ? Buffer.from(hex, 'hex')
            : Buffer.from([0xff, 0xd8, 0xff, 0x00]),
        };
        next();
      }),
    },
  };
});

const app = express();
app.use(express.json());
app.use('/', checkInPhotoRoutes);
app.use(errorHandler);

const MOCK_PHOTO = {
  id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  user_id: 'test-user-id',
  check_in_measurement_id: null,
  entry_date: '2026-06-14',
  photo_type: 'front',
  file_path: 'uploads/check-in/test-user-id/2026-06-14/front.jpg',
  created_at: '2026-06-14T10:00:00.000Z',
};

describe('GET /:date', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns photos for a valid date', async () => {
    // @ts-expect-error mock
    checkInPhotoService.getPhotosByDate.mockResolvedValue([MOCK_PHOTO]);
    const res = await request(app).get('/2026-06-14');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([MOCK_PHOTO]);
    expect(checkInPhotoService.getPhotosByDate).toHaveBeenCalledWith(
      'test-user-id',
      '2026-06-14'
    );
  });

  it('returns 400 for invalid date format', async () => {
    const res = await request(app).get('/not-a-date');
    expect(res.status).toBe(400);
  });

  it('returns 500 when service throws', async () => {
    // @ts-expect-error mock
    checkInPhotoService.getPhotosByDate.mockRejectedValue(
      new Error('DB error')
    );
    const res = await request(app).get('/2026-06-14');
    expect(res.status).toBe(500);
  });
});

describe('GET /file/:id', () => {
  const PHOTO_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  let tempFile: string;

  beforeAll(() => {
    tempFile = path.join(os.tmpdir(), `checkin-test-${Date.now()}.jpg`);
    fs.writeFileSync(tempFile, Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x42]));
  });
  afterAll(() => {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  });
  beforeEach(() => vi.clearAllMocks());

  it('serves the image with a nosniff header when accessible', async () => {
    // @ts-expect-error mock
    checkInPhotoService.getPhotoFileById.mockResolvedValue(tempFile);
    const res = await request(app).get(`/file/${PHOTO_ID}`);
    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(checkInPhotoService.getPhotoFileById).toHaveBeenCalledWith(
      'test-user-id',
      PHOTO_ID
    );
  });

  it('returns 404 when the photo is not found or not accessible', async () => {
    // @ts-expect-error mock
    checkInPhotoService.getPhotoFileById.mockResolvedValue(null);
    const res = await request(app).get(`/file/${PHOTO_ID}`);
    expect(res.status).toBe(404);
  });

  it('returns 400 for a non-UUID id', async () => {
    const res = await request(app).get('/file/not-a-uuid');
    expect(res.status).toBe(400);
    expect(checkInPhotoService.getPhotoFileById).not.toHaveBeenCalled();
  });

  it('returns 500 when the service throws', async () => {
    // @ts-expect-error mock
    checkInPhotoService.getPhotoFileById.mockRejectedValue(new Error('boom'));
    const res = await request(app).get(`/file/${PHOTO_ID}`);
    expect(res.status).toBe(500);
  });
});

describe('POST /:date/:type', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uploads a photo successfully', async () => {
    // @ts-expect-error mock
    checkInPhotoService.upsertPhoto.mockResolvedValue(MOCK_PHOTO);
    const res = await request(app).post('/2026-06-14/front');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(MOCK_PHOTO);
    expect(checkInPhotoService.upsertPhoto).toHaveBeenCalledWith(
      'test-user-id',
      '2026-06-14',
      'front',
      'front.jpg',
      expect.any(Buffer)
    );
  });

  it('returns 400 when the file content is not a valid image', async () => {
    const res = await request(app)
      .post('/2026-06-14/front')
      .set('x-test-bytes', '0001020304');
    expect(res.status).toBe(400);
    expect(checkInPhotoService.upsertPhoto).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid photo type', async () => {
    const res = await request(app).post('/2026-06-14/diagonal');
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid date format', async () => {
    const res = await request(app).post('/bad-date/front');
    expect(res.status).toBe(400);
  });

  it('returns 500 when service throws', async () => {
    // @ts-expect-error mock
    checkInPhotoService.upsertPhoto.mockRejectedValue(new Error('DB error'));
    const res = await request(app).post('/2026-06-14/front');
    expect(res.status).toBe(500);
  });
});

describe('DELETE /photo/:id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes a photo by id', async () => {
    // @ts-expect-error mock
    checkInPhotoService.deletePhoto.mockResolvedValue(undefined);
    const res = await request(app).delete(
      '/photo/a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    );
    expect(res.status).toBe(204);
    expect(checkInPhotoService.deletePhoto).toHaveBeenCalledWith(
      'test-user-id',
      'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    );
  });

  it('returns 400 for non-UUID id', async () => {
    const res = await request(app).delete('/photo/not-a-uuid');
    expect(res.status).toBe(400);
  });

  it('returns 500 when service throws', async () => {
    // @ts-expect-error mock
    checkInPhotoService.deletePhoto.mockRejectedValue(new Error('DB error'));
    const res = await request(app).delete(
      '/photo/a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    );
    expect(res.status).toBe(500);
  });
});
