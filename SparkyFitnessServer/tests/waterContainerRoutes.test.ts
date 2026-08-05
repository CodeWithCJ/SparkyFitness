import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'
import request from 'supertest';
import express from 'express';
import waterContainerService from '../services/waterContainerService.js';
import errorHandler from '../middleware/errorHandler.js';
import waterContainerRoutes from '../routes/waterContainerRoutes.js';

vi.mock('../services/waterContainerService.js', () => ({
  default: {
    createWaterContainer: vi.fn(),
    getWaterContainersByUserId: vi.fn(),
    updateWaterContainer: vi.fn(),
    deleteWaterContainer: vi.fn(),
    setPrimaryWaterContainer: vi.fn(),
    getPrimaryWaterContainerByUserId: vi.fn(),
  },
}));

vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    req.userId = 'test-user-id';
    next();
  },
}));

vi.mock('../utils/permissionUtils.js', () => ({
  canAccessUserData: vi.fn().mockResolvedValue(true),
}));

const app = express();
app.use(express.json());
app.use('/api/water-containers', waterContainerRoutes);
app.use(errorHandler);

describe('Water Container Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/water-containers', () => {
    const validBody = { name: 'Jug', volume: 2000, unit: 'ml' };

    it('creates a container and applies defaults for omitted fields', async () => {
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist
      waterContainerService.createWaterContainer.mockResolvedValue({ id: 1 });

      const res = await request(app)
        .post('/api/water-containers')
        .send(validBody);

      expect(res.statusCode).toBe(201);
      expect(waterContainerService.createWaterContainer).toHaveBeenCalledWith(
        'test-user-id',
        {
          name: 'Jug',
          volume: 2000,
          unit: 'ml',
          is_primary: false,
          servings_per_container: 1,
        }
      );
    });

    it('strips unknown fields before they reach the service', async () => {
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist
      waterContainerService.createWaterContainer.mockResolvedValue({ id: 1 });

      await request(app)
        .post('/api/water-containers')
        .send({ ...validBody, user_id: 'someone-else', id: 99 });

      const passed =
        // @ts-expect-error TS(2339): Property 'mock' does not exist
        waterContainerService.createWaterContainer.mock.calls[0][1];
      expect(passed).not.toHaveProperty('user_id');
      expect(passed).not.toHaveProperty('id');
    });

    it('rejects an unknown unit', async () => {
      const res = await request(app)
        .post('/api/water-containers')
        .send({ ...validBody, unit: 'cup' });

      expect(res.statusCode).toBe(400);
      expect(waterContainerService.createWaterContainer).not.toHaveBeenCalled();
    });

    it('rejects a non-positive volume', async () => {
      const res = await request(app)
        .post('/api/water-containers')
        .send({ ...validBody, volume: 0 });

      expect(res.statusCode).toBe(400);
    });

    it('rejects a volume below the numeric(10,3) precision floor', async () => {
      const res = await request(app)
        .post('/api/water-containers')
        .send({ ...validBody, volume: 0.0001 });

      expect(res.statusCode).toBe(400);
    });

    it('rejects servings_per_container of 0', async () => {
      const res = await request(app)
        .post('/api/water-containers')
        .send({ ...validBody, servings_per_container: 0 });

      expect(res.statusCode).toBe(400);
    });

    it('rejects a missing name', async () => {
      const res = await request(app)
        .post('/api/water-containers')
        .send({ volume: 2000, unit: 'ml' });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('PUT /api/water-containers/:id', () => {
    it('accepts a partial body and passes the numeric id through', async () => {
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist
      waterContainerService.updateWaterContainer.mockResolvedValue({ id: 7 });

      const res = await request(app)
        .put('/api/water-containers/7')
        .send({ name: 'Renamed' });

      expect(res.statusCode).toBe(200);
      expect(waterContainerService.updateWaterContainer).toHaveBeenCalledWith(
        7,
        'test-user-id',
        { name: 'Renamed' }
      );
    });

    it('rejects a non-integer id', async () => {
      const res = await request(app)
        .put('/api/water-containers/not-a-number')
        .send({ name: 'Renamed' });

      expect(res.statusCode).toBe(400);
      expect(waterContainerService.updateWaterContainer).not.toHaveBeenCalled();
    });

    it('rejects servings_per_container of 0', async () => {
      const res = await request(app)
        .put('/api/water-containers/7')
        .send({ servings_per_container: 0 });

      expect(res.statusCode).toBe(400);
    });

    it('returns 404 when the container is not found', async () => {
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist
      waterContainerService.updateWaterContainer.mockResolvedValue(undefined);

      const res = await request(app)
        .put('/api/water-containers/7')
        .send({ name: 'Renamed' });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/water-containers/:id', () => {
    it('deletes by numeric id', async () => {
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist
      waterContainerService.deleteWaterContainer.mockResolvedValue({
        message: 'Water container deleted successfully.',
      });

      const res = await request(app).delete('/api/water-containers/7');

      expect(res.statusCode).toBe(200);
      expect(waterContainerService.deleteWaterContainer).toHaveBeenCalledWith(
        7,
        'test-user-id'
      );
    });

    it('rejects a non-integer id', async () => {
      const res = await request(app).delete('/api/water-containers/abc');

      expect(res.statusCode).toBe(400);
      expect(waterContainerService.deleteWaterContainer).not.toHaveBeenCalled();
    });
  });

  describe('PUT /api/water-containers/:id/set-primary', () => {
    it('sets primary by numeric id', async () => {
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist
      waterContainerService.setPrimaryWaterContainer.mockResolvedValue({
        id: 7,
        is_primary: true,
      });

      const res = await request(app).put('/api/water-containers/7/set-primary');

      expect(res.statusCode).toBe(200);
      expect(
        waterContainerService.setPrimaryWaterContainer
      ).toHaveBeenCalledWith(7, 'test-user-id');
    });

    it('rejects a non-integer id', async () => {
      const res = await request(app).put(
        '/api/water-containers/abc/set-primary'
      );

      expect(res.statusCode).toBe(400);
      expect(
        waterContainerService.setPrimaryWaterContainer
      ).not.toHaveBeenCalled();
    });
  });
});
