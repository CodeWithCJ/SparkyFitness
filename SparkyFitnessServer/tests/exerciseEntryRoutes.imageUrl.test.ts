/**
 * An entry's stored image path is later deleted from disk, so only the
 * server's own upload may set it: a path in the request body is ignored, and
 * an upload the request does not keep is removed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'
import request from 'supertest';
import express from 'express';

const { uploadsDir } = await vi.hoisted(async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'entry-uploads-'));
  process.env.SPARKY_FITNESS_CUSTOM_UPLOADS_DIRECTORY = dir;
  return { uploadsDir: dir };
});

import exerciseEntryRoutes from '../routes/exerciseEntryRoutes.js';
import exerciseEntryDb from '../models/exerciseEntry.js';
import exerciseService from '../services/exerciseService.js';

vi.mock('../middleware/authMiddleware.js', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticate: vi.fn((req: any, _res: any, next: any) => {
    req.userId = 'user-123';
    req.originalUserId = 'user-123';
    next();
  }),
}));
vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  default: vi.fn(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => (_req: any, _res: any, next: any) => next()
  ),
}));
vi.mock('../services/exerciseService.js', () => ({
  default: { createExerciseEntry: vi.fn(), updateExerciseEntry: vi.fn() },
}));
vi.mock('../models/exerciseEntry.js', () => ({
  default: { isExerciseImageReferenced: vi.fn() },
}));
vi.mock('../services/exerciseEntryService.js', () => ({ default: {} }));
vi.mock('../services/fitImportService.js', () => ({ default: {} }));
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

const ENTRY_ID = '11111111-1111-1111-1111-111111111111';
const EXERCISE_ID = '22222222-2222-2222-2222-222222222222';
const crafted = '/uploads/exercise_entries/../../../etc/passwd';

const uploadedFiles = () => {
  const dir = path.join(uploadsDir, 'exercise_entries');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((item) => item.isFile());
};

const updateData = () =>
  vi.mocked(exerciseService.updateExerciseEntry).mock.calls[0][3];
const createData = () =>
  vi.mocked(exerciseService.createExerciseEntry).mock.calls[0][2];

beforeEach(() => {
  vi.clearAllMocks();
  fs.rmSync(path.join(uploadsDir, 'exercise_entries'), {
    recursive: true,
    force: true,
  });
  vi.mocked(exerciseService.updateExerciseEntry).mockResolvedValue({
    id: ENTRY_ID,
  });
  vi.mocked(exerciseService.createExerciseEntry).mockResolvedValue({
    id: ENTRY_ID,
  });
  vi.mocked(exerciseEntryDb.isExerciseImageReferenced).mockResolvedValue(false);
});

afterAll(() => {
  fs.rmSync(uploadsDir, { recursive: true, force: true });
});

describe('PUT /exercise-entries/:id image_url', () => {
  it('ignores a path sent in the body', async () => {
    await request(app)
      .put(`/exercise-entries/${ENTRY_ID}`)
      .send({ image_url: crafted, notes: 'edited' })
      .expect(200);

    expect(updateData()).not.toHaveProperty('image_url');
    expect(updateData().notes).toBe('edited');
  });

  it('still clears the image with null', async () => {
    await request(app)
      .put(`/exercise-entries/${ENTRY_ID}`)
      .send({ image_url: null })
      .expect(200);

    expect(updateData().image_url).toBeNull();
  });

  it('sets the image from the upload, not from a body field next to it', async () => {
    await request(app)
      .put(`/exercise-entries/${ENTRY_ID}`)
      .field('image_url', crafted)
      .attach('image', Buffer.from('fake-image'), 'photo.jpg')
      .expect(200);

    expect(updateData().image_url).toMatch(
      /^\/uploads\/exercise_entries\/\d{8}\/[^/]+_photo\.jpg$/
    );
    expect(uploadedFiles()).toHaveLength(1);
  });

  it('removes the upload when the update fails', async () => {
    vi.mocked(exerciseService.updateExerciseEntry).mockRejectedValue(
      new Error('Exercise entry not found.')
    );

    await request(app)
      .put(`/exercise-entries/${ENTRY_ID}`)
      .attach('image', Buffer.from('fake-image'), 'photo.jpg')
      .expect(404);

    await vi.waitFor(() => expect(uploadedFiles()).toHaveLength(0));
  });

  it('keeps the upload when the entry was saved before a later step failed', async () => {
    vi.mocked(exerciseService.updateExerciseEntry).mockRejectedValue(
      new Error('Activity details could not be saved')
    );
    vi.mocked(exerciseEntryDb.isExerciseImageReferenced).mockResolvedValue(
      true
    );

    await request(app)
      .put(`/exercise-entries/${ENTRY_ID}`)
      .attach('image', Buffer.from('fake-image'), 'photo.jpg')
      .expect(500);

    await vi.waitFor(() =>
      expect(exerciseEntryDb.isExerciseImageReferenced).toHaveBeenCalled()
    );
    expect(uploadedFiles()).toHaveLength(1);
  });

  it('removes the upload when the request is refused', async () => {
    await request(app)
      .put(`/exercise-entries/${ENTRY_ID}`)
      .field('entry_time', 'not-a-time')
      .attach('image', Buffer.from('fake-image'), 'photo.jpg')
      .expect(400);

    expect(exerciseService.updateExerciseEntry).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(uploadedFiles()).toHaveLength(0));
  });
});

describe('POST /exercise-entries/from-plan image_url', () => {
  it('ignores a path sent in the body', async () => {
    await request(app)
      .post('/exercise-entries/from-plan')
      .send({
        entry_date: '2026-10-25',
        exercises: [
          {
            exercise_id: EXERCISE_ID,
            duration_minutes: 30,
            image_url: crafted,
          },
        ],
      })
      .expect(201);

    expect(createData()).not.toHaveProperty('image_url');
  });
});

describe('POST /exercise-entries image_url', () => {
  const entry = {
    exercise_id: EXERCISE_ID,
    duration_minutes: 30,
    calories_burned: 200,
    entry_date: '2026-10-25',
  };

  it('ignores a path sent in the body', async () => {
    await request(app)
      .post('/exercise-entries')
      .send({ ...entry, image_url: crafted })
      .expect(201);

    expect(createData().image_url).toBeNull();
  });

  it('removes the upload when the entry could not be created', async () => {
    vi.mocked(exerciseService.createExerciseEntry).mockRejectedValue(
      new Error('Unexpected failure')
    );

    await request(app)
      .post('/exercise-entries')
      .field('exercise_id', EXERCISE_ID)
      .field('duration_minutes', '30')
      .field('entry_date', '2026-10-25')
      .attach('image', Buffer.from('fake-image'), 'photo.jpg')
      .expect(500);

    await vi.waitFor(() => expect(uploadedFiles()).toHaveLength(0));
  });
});
