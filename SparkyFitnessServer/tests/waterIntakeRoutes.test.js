import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import measurementService from '../services/measurementService.js';
import errorHandler from '../middleware/errorHandler.js';
import waterIntakeRoutes from '../routes/v2/waterIntakeRoutes.js';
jest.mock('../services/measurementService');
// checkPermissionMiddleware is a factory — mock it to return a pass-through
jest.mock('../middleware/checkPermissionMiddleware', () =>
  jest.fn(() => (req, res, next) => next())
);
// onBehalfOfMiddleware sets req.userId / req.originalUserId — pass through in tests
jest.mock(
  '../middleware/onBehalfOfMiddleware',
  () => (req, res, next) => next()
);
const injectUser = (req, res, next) => {
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
    jest.clearAllMocks();
  });
  // ---------------------------------------------------------------------------
  // GET /entry/:id
  // ---------------------------------------------------------------------------
  describe('GET /api/v2/measurements/water-intake/entry/:id', () => {
    it('returns a water intake entry by ID', async () => {
      const entry = { id: VALID_UUID, water_ml: 250, entry_date: '2023-01-01' };
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
      measurementService.updateWaterIntake.mockRejectedValue(
        new Error('Water intake entry not found or not authorized to update.')
      );
      const res = await request(app)
        .put(`/api/v2/measurements/water-intake/${VALID_UUID}`)
        .send({ water_ml: 300 });
      expect(res.statusCode).toBe(404);
    });
    it('returns 403 when access is forbidden', async () => {
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
      measurementService.deleteWaterIntake.mockRejectedValue(
        new Error('Water intake entry not found or not authorized to delete.')
      );
      const res = await request(app).delete(
        `/api/v2/measurements/water-intake/${VALID_UUID}`
      );
      expect(res.statusCode).toBe(404);
    });
    it('returns 403 when access is forbidden', async () => {
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
