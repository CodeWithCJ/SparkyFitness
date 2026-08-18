import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'
import request from 'supertest';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import exerciseService from '../services/exerciseService.js';
import exerciseRoutes from '../routes/exerciseRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Matches exerciseRoutes.ts's own baseUploadsDir resolution (no
// SPARKY_FITNESS_CUSTOM_UPLOADS_DIRECTORY set in this test environment) and
// its destination() sanitization, which turns the fallback name's hyphen
// into an underscore (exerciseName.replace(/[^a-zA-Z0-9]/g, '_')).
const unknownExerciseUploadDir = path.join(
  __dirname,
  '../uploads/exercises/unknown_exercise'
);

vi.mock('../middleware/authMiddleware.js', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticate: (req: any, _res: any, next: any) => {
    req.userId = 'test-user-id';
    req.authenticatedUserId = 'test-user-id';
    next();
  },
}));

vi.mock('../services/exerciseService.js', () => ({
  default: {
    createExercise: vi.fn(),
    updateExercise: vi.fn(),
  },
}));

vi.mock('../models/reportRepository.js', () => ({ default: {} }));
vi.mock('../integrations/wger/wgerService.js', () => ({ default: {} }));

vi.mock('../config/logging.js', () => ({
  log: vi.fn(),
}));

const app = express();
app.use('/exercises', exerciseRoutes);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.use((err: any, _req: any, res: any, _next: any) => {
  res.status(err.status || 500).json({ error: err.message });
});

describe('exercise create/update array-field normalization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // @ts-expect-error TS(2339): mockResolvedValue not on typed function.
    exerciseService.createExercise.mockResolvedValue({ id: 'created-id' });
    // @ts-expect-error TS(2339): mockResolvedValue not on typed function.
    exerciseService.updateExercise.mockResolvedValue({ id: 'updated-id' });
  });

  describe('POST /exercises', () => {
    it('passes an already-correct array through unchanged', async () => {
      const res = await request(app)
        .post('/exercises')
        .field(
          'exerciseData',
          JSON.stringify({ name: 'Bench Press', equipment: ['Barbell'] })
        );

      expect(res.statusCode).toBe(201);
      expect(exerciseService.createExercise).toHaveBeenCalledWith(
        'test-user-id',
        expect.objectContaining({ equipment: ['Barbell'] })
      );
    });

    it('normalizes a bare string into a one-item array instead of rejecting it', async () => {
      // The exact shape free-exercise-db's raw JSON sends for a single
      // value — the client contract must tolerate it, not 400 it.
      const res = await request(app)
        .post('/exercises')
        .field(
          'exerciseData',
          JSON.stringify({
            name: 'Bench Press',
            equipment: 'Barbell',
            primary_muscles: 'chest',
            secondary_muscles: ['triceps'],
            instructions: 'Lie on the bench.',
          })
        );

      expect(res.statusCode).toBe(201);
      expect(exerciseService.createExercise).toHaveBeenCalledWith(
        'test-user-id',
        expect.objectContaining({
          equipment: ['Barbell'],
          primary_muscles: ['chest'],
          secondary_muscles: ['triceps'],
          instructions: ['Lie on the bench.'],
        })
      );
    });

    it('leaves null and omitted array fields alone', async () => {
      const res = await request(app)
        .post('/exercises')
        .field(
          'exerciseData',
          JSON.stringify({ name: 'Bench Press', equipment: null })
        );

      expect(res.statusCode).toBe(201);
      expect(exerciseService.createExercise).toHaveBeenCalledWith(
        'test-user-id',
        expect.objectContaining({ equipment: null })
      );
      const [, payload] = (
        exerciseService.createExercise as unknown as {
          mock: { calls: unknown[][] };
        }
      ).mock.calls[0];
      expect(payload).not.toHaveProperty('primary_muscles');
    });

    it('rejects a genuinely wrong type (not a string/array formatting quirk)', async () => {
      const res = await request(app)
        .post('/exercises')
        .field(
          'exerciseData',
          JSON.stringify({ name: 'Bench Press', equipment: 5 })
        );

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Invalid exercise payload.');
      expect(exerciseService.createExercise).not.toHaveBeenCalled();
    });

    it('returns the standard 400 for malformed JSON instead of a generic 500', async () => {
      const res = await request(app)
        .post('/exercises')
        .field('exerciseData', '{not valid json');

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Invalid exercise payload.');
      expect(exerciseService.createExercise).not.toHaveBeenCalled();
    });

    it('returns the standard 400 when the exerciseData field is missing', async () => {
      const res = await request(app).post('/exercises');

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Invalid exercise payload.');
      expect(exerciseService.createExercise).not.toHaveBeenCalled();
    });

    it('does not crash and cleans up the upload when malformed JSON arrives alongside an attached file', async () => {
      // multer's storage.destination JSON.parses exerciseData itself, before
      // the route handler's own validation ever runs, and only runs at all
      // when a file is actually attached — the earlier malformed-JSON tests
      // never exercised that path.
      const res = await request(app)
        .post('/exercises')
        .field('exerciseData', '{not valid json')
        .attach('images', Buffer.from('fake image bytes'), 'test.jpg');

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Invalid exercise payload.');
      expect(exerciseService.createExercise).not.toHaveBeenCalled();

      // The rejected upload must not be left behind under the fallback
      // 'unknown-exercise' folder multer used before validation ran.
      const leftoverFiles = fs.existsSync(unknownExerciseUploadDir)
        ? fs.readdirSync(unknownExerciseUploadDir)
        : [];
      expect(leftoverFiles).toEqual([]);
    });

    it('keeps unrelated fields untouched via passthrough', async () => {
      const res = await request(app)
        .post('/exercises')
        .field(
          'exerciseData',
          JSON.stringify({
            name: 'Bench Press',
            category: 'Strength',
            modality: 'weight_reps',
            is_public: true,
          })
        );

      expect(res.statusCode).toBe(201);
      expect(exerciseService.createExercise).toHaveBeenCalledWith(
        'test-user-id',
        expect.objectContaining({
          name: 'Bench Press',
          category: 'Strength',
          modality: 'weight_reps',
          is_public: true,
        })
      );
    });
  });

  describe('PUT /exercises/:id', () => {
    const VALID_UUID = '11111111-1111-4111-8111-111111111111';

    it('normalizes a bare string into a one-item array instead of rejecting it', async () => {
      const res = await request(app)
        .put(`/exercises/${VALID_UUID}`)
        .field(
          'exerciseData',
          JSON.stringify({ name: 'Bench Press', equipment: 'Barbell' })
        );

      expect(res.statusCode).toBe(200);
      expect(exerciseService.updateExercise).toHaveBeenCalledWith(
        'test-user-id',
        VALID_UUID,
        expect.objectContaining({ equipment: ['Barbell'] })
      );
    });

    it('rejects a genuinely wrong type', async () => {
      const res = await request(app)
        .put(`/exercises/${VALID_UUID}`)
        .field(
          'exerciseData',
          JSON.stringify({ name: 'Bench Press', equipment: true })
        );

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Invalid exercise payload.');
      expect(exerciseService.updateExercise).not.toHaveBeenCalled();
    });

    it('returns the standard 400 for malformed JSON instead of a generic 500', async () => {
      const res = await request(app)
        .put(`/exercises/${VALID_UUID}`)
        .field('exerciseData', '{not valid json');

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Invalid exercise payload.');
      expect(exerciseService.updateExercise).not.toHaveBeenCalled();
    });

    it('does not crash and cleans up the upload when malformed JSON arrives alongside an attached file', async () => {
      const res = await request(app)
        .put(`/exercises/${VALID_UUID}`)
        .field('exerciseData', '{not valid json')
        .attach('images', Buffer.from('fake image bytes'), 'test.jpg');

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Invalid exercise payload.');
      expect(exerciseService.updateExercise).not.toHaveBeenCalled();

      const leftoverFiles = fs.existsSync(unknownExerciseUploadDir)
        ? fs.readdirSync(unknownExerciseUploadDir)
        : [];
      expect(leftoverFiles).toEqual([]);
    });
  });
});
