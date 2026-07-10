import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'.
import request from 'supertest';
import exerciseRoutes from '../routes/exerciseRoutes.js';
import exerciseService from '../services/exerciseService.js';
import { uploadsUnavailableBody } from '../middleware/deploymentModeMiddleware.js';

vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: vi.fn(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req: any, _res: any, next: any) => {
      req.userId = 'user-123';
      next();
    }
  ),
}));

vi.mock('../services/exerciseService.js', () => ({
  default: {
    createExercise: vi.fn(),
    updateExercise: vi.fn(),
  },
}));

vi.mock('../models/reportRepository.js', () => ({
  default: {},
}));

vi.mock('../integrations/wger/wgerService.js', () => ({
  default: {},
}));

const app = express();
app.use(express.json());
app.use('/exercises', exerciseRoutes);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.use((error: any, _req: any, res: any, _next: any) => {
  res.status(error.status || 500).json({ error: error.message });
});

const exerciseData = {
  name: 'Launch Smoke Exercise',
  category: 'General',
  calories_per_hour: 300,
  description: 'Metadata-only exercise',
};

describe('exercise routes when uploads are disabled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SPARKY_FITNESS_STORAGE_MODE = 'disabled';
  });

  afterEach(() => {
    delete process.env.SPARKY_FITNESS_STORAGE_MODE;
  });

  it('creates an exercise from multipart fields when no image is attached', async () => {
    vi.mocked(exerciseService.createExercise).mockResolvedValue({
      id: 'exercise-123',
      ...exerciseData,
      images: [],
    } as never);

    const response = await request(app)
      .post('/exercises')
      .field('exerciseData', JSON.stringify(exerciseData));

    expect(response.statusCode).toBe(201);
    expect(exerciseService.createExercise).toHaveBeenCalledWith('user-123', {
      ...exerciseData,
      user_id: 'user-123',
      images: [],
    });
  });

  it('updates exercise metadata from multipart fields when no image is attached', async () => {
    const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    vi.mocked(exerciseService.updateExercise).mockResolvedValue({
      id,
      ...exerciseData,
    } as never);

    const response = await request(app)
      .put(`/exercises/${id}`)
      .field('exerciseData', JSON.stringify(exerciseData));

    expect(response.statusCode).toBe(200);
    expect(exerciseService.updateExercise).toHaveBeenCalledWith(
      'user-123',
      id,
      exerciseData
    );
  });

  it('still rejects an attached image before the exercise service runs', async () => {
    const response = await request(app)
      .post('/exercises')
      .field('exerciseData', JSON.stringify(exerciseData))
      .attach('images', Buffer.from([0xff, 0xd8, 0xff]), 'smoke.jpg');

    expect(response.statusCode).toBe(501);
    expect(response.body).toEqual(uploadsUnavailableBody);
    expect(exerciseService.createExercise).not.toHaveBeenCalled();
  });
});
