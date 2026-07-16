import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'
import request from 'supertest';
import express from 'express';
import syncedDataService from '../services/syncedDataService.js';
import syncedDataRoutes from '../routes/syncedDataRoutes.js';

vi.mock('../services/syncedDataService.js', () => ({
  default: {
    getSyncedSources: vi.fn(),
    deleteSyncedSource: vi.fn(),
  },
}));

vi.mock('../middleware/authMiddleware.js', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticate: (req: any, _res: any, next: any) => {
    req.userId = 'test-user-id';
    req.authenticatedUserId = 'test-user-id';
    next();
  },
}));

vi.mock('../config/logging.js', () => ({
  log: vi.fn(),
}));

const app = express();
app.use(express.json());
app.use('/api/synced-data', syncedDataRoutes);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.use((err: any, _req: any, res: any, _next: any) => {
  res.status(err.status || 500).json({ error: err.message });
});

describe('Synced Data Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/synced-data/sources', () => {
    it('returns the synced source summary for the user', async () => {
      const summary = [
        {
          source: 'healthkit',
          totalCount: 214,
          byTable: { food_entries: 100, exercise_entries: 114 },
        },
        { source: 'garmin', totalCount: 30, byTable: { exercise_entries: 30 } },
      ];
      // @ts-expect-error TS(2339): mock helper not on typed fn
      syncedDataService.getSyncedSources.mockResolvedValue(summary);

      const res = await request(app).get('/api/synced-data/sources');

      expect(res.statusCode).toEqual(200);
      expect(res.body).toEqual(summary);
      expect(syncedDataService.getSyncedSources).toHaveBeenCalledWith(
        'test-user-id'
      );
    });

    it('returns 500 on unexpected service error', async () => {
      // @ts-expect-error TS(2339): mock helper not on typed fn
      syncedDataService.getSyncedSources.mockRejectedValue(
        new Error('DB error')
      );

      const res = await request(app).get('/api/synced-data/sources');

      expect(res.statusCode).toEqual(500);
    });
  });

  describe('DELETE /api/synced-data/sources/:source', () => {
    it('deletes all synced rows for a source and returns per-table counts', async () => {
      // @ts-expect-error TS(2339): mock helper not on typed fn
      syncedDataService.deleteSyncedSource.mockResolvedValue({
        byTable: { food_entries: 100, exercise_entries: 114 },
        totalDeleted: 214,
      });

      const res = await request(app).delete(
        '/api/synced-data/sources/healthkit'
      );

      expect(res.statusCode).toEqual(200);
      expect(res.body.totalDeleted).toEqual(214);
      expect(res.body.byTable).toEqual({
        food_entries: 100,
        exercise_entries: 114,
      });
      expect(syncedDataService.deleteSyncedSource).toHaveBeenCalledWith(
        'test-user-id',
        'healthkit'
      );
    });

    it.each([
      ['manual', 'lowercase manual'],
      ['Manual', 'capitalized Manual (exercise_entries default)'],
      ['sparky', 'logged via the Sparky AI assistant'],
      ['Workout Preset', 'workout logged from a preset'],
      ['Workout Plan', 'diary entries from a scheduled plan'],
      ['workout preset', 'preset, lowercased'],
    ])(
      "rejects user-created source '%s' (%s) with 400 before calling the service",
      async (source) => {
        const res = await request(app).delete(
          `/api/synced-data/sources/${encodeURIComponent(source)}`
        );

        expect(res.statusCode).toEqual(400);
        expect(res.body).toHaveProperty('error');
        expect(syncedDataService.deleteSyncedSource).not.toHaveBeenCalled();
      }
    );

    it('returns 500 on unexpected service error', async () => {
      // @ts-expect-error TS(2339): mock helper not on typed fn
      syncedDataService.deleteSyncedSource.mockRejectedValue(
        new Error('DB error')
      );

      const res = await request(app).delete('/api/synced-data/sources/garmin');

      expect(res.statusCode).toEqual(500);
    });
  });
});
