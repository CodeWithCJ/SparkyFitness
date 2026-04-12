import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supe... Remove this comment to see the full error message
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import measurementService from '../services/measurementService.js';
import errorHandler from '../middleware/errorHandler.js';
// @ts-expect-error TS(1192): Module '"/home/simsat/dev/SparkyFitness/SparkyFitn... Remove this comment to see the full error message
import waterIntakeRoutes from '../routes/v2/waterIntakeRoutes.js';
vi.mock('../services/measurementService.js', () => ({
  default: {
    getWaterIntakeEntryById: vi.fn(),
    getWaterIntake: vi.fn(),
    upsertWaterIntake: vi.fn(),
    updateWaterIntake: vi.fn(),
    deleteWaterIntake: vi.fn(),
  },
}));

vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: vi.fn(() => (req: any, res: any, next: any) => next()),
}));

vi.mock('../middleware/onBehalfOfMiddleware.js', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: (req: any, res: any, next: any) => next(),
}));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const injectUser = (req: any, res: any, next: any) => {
  req.userId = 'test-user-id';
  next();
};
const app = express();
app.use(express.json());
app.use(injectUser);
app.use('/api/v2/measurements', waterIntakeRoutes);
app.use(errorHandler);
const VALID_UUID = uuidv4();
describe('Water Intake Routes (v2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  // ---------------------------------------------------------------------------
  // GET /entry/:id
  // ---------------------------------------------------------------------------
  describe('GET /api/v2/measurements/water-intake/entry/:id', () => {
    it('returns a water intake entry by ID', async () => {
      const entry = { id: VALID_UUID, water_ml: 250, entry_date: '2023-01-01' };
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      measurementService.getWaterIntakeEntryById.mockResolvedValue(entry);
      const res = await request(app).get(
        `/api/v2/measurements/water-intake/entry/${VALID_UUID}`
      );
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(entry);
      expect(measurementService.getWaterIntakeEntryById).toHaveBeenCalledWith(
        'test-user-id',
        VALID_UUID
      );
    });
    it('returns 404 when entry does not exist', async () => {
      // @ts-expect-error TS(2339): Property 'mockRejectedValue' does not exist on typ... Remove this comment to see the full error message
      measurementService.getWaterIntakeEntryById.mockRejectedValue(
        new Error('Water intake entry not found.')
      );
      const res = await request(app).get(
        `/api/v2/measurements/water-intake/entry/${VALID_UUID}`
      );
      expect(res.statusCode).toBe(404);
      expect(res.body).toHaveProperty('error', 'Water intake entry not found.');
    });
    it('returns 403 when access is forbidden', async () => {
      // @ts-expect-error TS(2339): Property 'mockRejectedValue' does not exist on typ... Remove this comment to see the full error message
      measurementService.getWaterIntakeEntryById.mockRejectedValue(
        new Error('Forbidden: you do not have access to this entry.')
      );
      const res = await request(app).get(
        `/api/v2/measurements/water-intake/entry/${VALID_UUID}`
      );
      expect(res.statusCode).toBe(403);
      expect(res.body.error).toMatch(/^Forbidden/);
    });
  });
  // ---------------------------------------------------------------------------
  // GET /:date
  // ---------------------------------------------------------------------------
  describe('GET /api/v2/measurements/water-intake/:date', () => {
    it('returns water intake data for a date', async () => {
      const data = {
        date: '2023-01-01',
        total_water_ml: 500,
        entries: [{ id: VALID_UUID, water_ml: 250 }],
      };
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      measurementService.getWaterIntake.mockResolvedValue(data);
      const res = await request(app).get(
        '/api/v2/measurements/water-intake/2023-01-01'
      );
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(data);
      expect(measurementService.getWaterIntake).toHaveBeenCalledWith(
        'test-user-id',
        'test-user-id',
        '2023-01-01'
      );
    });
    it('returns 403 when access is forbidden', async () => {
      // @ts-expect-error TS(2339): Property 'mockRejectedValue' does not exist on typ... Remove this comment to see the full error message
      measurementService.getWaterIntake.mockRejectedValue(
        new Error('Forbidden: access denied.')
      );
      const res = await request(app).get(
        '/api/v2/measurements/water-intake/2023-01-01'
      );
      expect(res.statusCode).toBe(403);
      expect(res.body.error).toMatch(/^Forbidden/);
    });
    it('delegates unexpected service errors to the error handler', async () => {
      // @ts-expect-error TS(2339): Property 'mockRejectedValue' does not exist on typ... Remove this comment to see the full error message
      measurementService.getWaterIntake.mockRejectedValue(
        new Error('DB connection failed')
      );
      const res = await request(app).get(
        '/api/v2/measurements/water-intake/2023-01-01'
      );
      expect(res.statusCode).toBe(500);
    });
  });
  // ---------------------------------------------------------------------------
  // POST /
  // ---------------------------------------------------------------------------
  describe('POST /api/v2/measurements/water-intake', () => {
    it('upserts a water intake entry and returns 200', async () => {
      const result = {
        id: VALID_UUID,
        water_ml: 250,
        entry_date: '2023-01-01',
      };
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      measurementService.upsertWaterIntake.mockResolvedValue(result);
      const res = await request(app)
        .post('/api/v2/measurements/water-intake')
        .send({ entry_date: '2023-01-01', change_drinks: 1, container_id: 2 });
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(result);
      expect(measurementService.upsertWaterIntake).toHaveBeenCalledWith(
        'test-user-id',
        'test-user-id',
        '2023-01-01',
        1,
        2
      );
    });
    it('returns 400 when entry_date is missing', async () => {
      const res = await request(app)
        .post('/api/v2/measurements/water-intake')
        .send({ change_drinks: 1 });
      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('error', 'Invalid request body');
      expect(measurementService.upsertWaterIntake).not.toHaveBeenCalled();
    });
    it('returns 400 when change_drinks is missing', async () => {
      const res = await request(app)
        .post('/api/v2/measurements/water-intake')
        .send({ entry_date: '2023-01-01' });
      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('error', 'Invalid request body');
      expect(measurementService.upsertWaterIntake).not.toHaveBeenCalled();
    });
    it('returns 403 when access is forbidden', async () => {
      // @ts-expect-error TS(2339): Property 'mockRejectedValue' does not exist on typ... Remove this comment to see the full error message
      measurementService.upsertWaterIntake.mockRejectedValue(
        new Error('Forbidden: access denied.')
      );
      const res = await request(app)
        .post('/api/v2/measurements/water-intake')
        .send({
          entry_date: '2023-01-01',
          change_drinks: 1,
          container_id: null,
        });
      // The route should catch the Forbidden error and return 403
      expect(res.statusCode).toBe(403);
      expect(res.body.error).toMatch(/^Forbidden/);
    });
  });
  // ---------------------------------------------------------------------------
  // PUT /:id
  // ---------------------------------------------------------------------------
  describe('PUT /api/v2/measurements/water-intake/:id', () => {
    it('updates a water intake entry and returns 200', async () => {
      const updated = { id: VALID_UUID, water_ml: 300 };
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      measurementService.updateWaterIntake.mockResolvedValue(updated);
      const res = await request(app)
        .put(`/api/v2/measurements/water-intake/${VALID_UUID}`)
        .send({ water_ml: 300 });
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(updated);
      expect(measurementService.updateWaterIntake).toHaveBeenCalledWith(
        'test-user-id',
        'test-user-id',
        VALID_UUID,
        expect.objectContaining({ water_ml: 300 })
      );
    });
    it('returns 404 when entry does not exist', async () => {
      // @ts-expect-error TS(2339): Property 'mockRejectedValue' does not exist on typ... Remove this comment to see the full error message
      measurementService.updateWaterIntake.mockRejectedValue(
        new Error('Water intake entry not found.')
      );
      const res = await request(app)
        .put(`/api/v2/measurements/water-intake/${VALID_UUID}`)
        .send({ water_ml: 300 });
      expect(res.statusCode).toBe(404);
      expect(res.body).toHaveProperty('error', 'Water intake entry not found.');
    });
    it('returns 404 with not authorized message', async () => {
      // @ts-expect-error TS(2339): Property 'mockRejectedValue' does not exist on typ... Remove this comment to see the full error message
      measurementService.updateWaterIntake.mockRejectedValue(
        new Error('Water intake entry not found or not authorized to update.')
      );
      const res = await request(app)
        .put(`/api/v2/measurements/water-intake/${VALID_UUID}`)
        .send({ water_ml: 300 });
      expect(res.statusCode).toBe(404);
    });
    it('returns 403 when access is forbidden', async () => {
      // @ts-expect-error TS(2339): Property 'mockRejectedValue' does not exist on typ... Remove this comment to see the full error message
      measurementService.updateWaterIntake.mockRejectedValue(
        new Error('Forbidden: access denied.')
      );
      const res = await request(app)
        .put(`/api/v2/measurements/water-intake/${VALID_UUID}`)
        .send({ water_ml: 300 });
      expect(res.statusCode).toBe(403);
      expect(res.body.error).toMatch(/^Forbidden/);
    });
  });
  // ---------------------------------------------------------------------------
  // DELETE /:id
  // ---------------------------------------------------------------------------
  describe('DELETE /api/v2/measurements/water-intake/:id', () => {
    it('deletes a water intake entry and returns 200', async () => {
      const result = { success: true, id: VALID_UUID };
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      measurementService.deleteWaterIntake.mockResolvedValue(result);
      const res = await request(app).delete(
        `/api/v2/measurements/water-intake/${VALID_UUID}`
      );
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(result);
      expect(measurementService.deleteWaterIntake).toHaveBeenCalledWith(
        'test-user-id',
        'test-user-id',
        VALID_UUID
      );
    });
    it('returns 404 when entry does not exist', async () => {
      // @ts-expect-error TS(2339): Property 'mockRejectedValue' does not exist on typ... Remove this comment to see the full error message
      measurementService.deleteWaterIntake.mockRejectedValue(
        new Error('Water intake entry not found.')
      );
      const res = await request(app).delete(
        `/api/v2/measurements/water-intake/${VALID_UUID}`
      );
      expect(res.statusCode).toBe(404);
      expect(res.body).toHaveProperty('error', 'Water intake entry not found.');
    });
    it('returns 404 with not authorized message', async () => {
      // @ts-expect-error TS(2339): Property 'mockRejectedValue' does not exist on typ... Remove this comment to see the full error message
      measurementService.deleteWaterIntake.mockRejectedValue(
        new Error('Water intake entry not found or not authorized to delete.')
      );
      const res = await request(app).delete(
        `/api/v2/measurements/water-intake/${VALID_UUID}`
      );
      expect(res.statusCode).toBe(404);
    });
    it('returns 403 when access is forbidden', async () => {
      // @ts-expect-error TS(2339): Property 'mockRejectedValue' does not exist on typ... Remove this comment to see the full error message
      measurementService.deleteWaterIntake.mockRejectedValue(
        new Error('Forbidden: access denied.')
      );
      const res = await request(app).delete(
        `/api/v2/measurements/water-intake/${VALID_UUID}`
      );
      expect(res.statusCode).toBe(403);
      expect(res.body.error).toMatch(/^Forbidden/);
    });
  });
});
