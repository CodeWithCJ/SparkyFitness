import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'
import request from 'supertest';
import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express';

vi.mock('../services/cnfBulkImportService.js', () => ({
  startCnfImport: vi.fn(),
  getCnfImportStatus: vi.fn(),
  deleteCnfLibraryFoods: vi.fn(),
}));

vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: (req: Request, _res: Response, next: NextFunction) => {
    req.userId = 'test-user-id';
    req.authenticatedUserId = 'test-user-id';
    next();
  },
  isAdmin: (_req: Request, _res: Response, next: NextFunction) => {
    next();
  },
}));

vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  default: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('../config/logging.js', () => ({
  log: vi.fn(),
}));

import {
  startCnfImport,
  getCnfImportStatus,
  deleteCnfLibraryFoods,
} from '../services/cnfBulkImportService.js';
import foodIntegrationRoutes from '../routes/foodIntegrationRoutes.js';

const app = express();
app.use(express.json());
app.use('/api/foods', foodIntegrationRoutes);
app.use(
  (
    err: { status?: number; message?: string },
    _req: Request,
    res: Response,
    _next: NextFunction
  ) => {
    res.status(err.status || 500).json({ error: err.message });
  }
);

describe('foodIntegrationRoutes - Canadian Nutrient File endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/foods/canadian-nutrient-file/status', () => {
    it('returns the bulk import status', async () => {
      vi.mocked(getCnfImportStatus).mockResolvedValueOnce({
        userId: 'test-user-id',
        isRunning: false,
        status: 'completed',
        progress: 100,
        total: 5690,
        processed: 5690,
        imported: 5690,
        updated: 0,
      });

      const res = await request(app).get(
        '/api/foods/canadian-nutrient-file/status'
      );
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('completed');
      expect(res.body.imported).toBe(5690);
      expect(getCnfImportStatus).toHaveBeenCalledWith('test-user-id');
    });
  });

  describe('POST /api/foods/canadian-nutrient-file/bulk-import', () => {
    it('handles file upload with wait=true', async () => {
      vi.mocked(startCnfImport).mockResolvedValueOnce({
        done: Promise.resolve({ imported: 10, updated: 0, total: 10 }),
      });

      const res = await request(app)
        .post('/api/foods/canadian-nutrient-file/bulk-import?wait=true')
        .attach('file', Buffer.from('mock-zip-content'), 'archive.zip')
        .field('syncPastEntries', 'false')
        .field('language', 'en');

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toBe('Bulk import completed successfully');
      expect(res.body.imported).toBe(10);
      expect(startCnfImport).toHaveBeenCalledWith(
        'test-user-id',
        { zip: expect.any(Buffer) },
        { syncPastEntries: false, language: 'en' }
      );
    });

    it('handles URL import asynchronously by default', async () => {
      vi.mocked(startCnfImport).mockResolvedValueOnce({
        done: Promise.resolve({ imported: 5690, updated: 0, total: 5690 }),
      });
      vi.mocked(getCnfImportStatus).mockResolvedValueOnce({
        userId: 'test-user-id',
        isRunning: true,
        status: 'running',
        progress: 0,
        total: 0,
        processed: 0,
        imported: 0,
        updated: 0,
      });

      const res = await request(app)
        .post('/api/foods/canadian-nutrient-file/bulk-import')
        .send({
          archiveUrl: 'https://example.com/cnf.zip',
          syncPastEntries: true,
          language: 'fr',
        });

      expect(res.statusCode).toBe(202);
      expect(res.body.message).toBe('Bulk import started');
      expect(res.body.status.isRunning).toBe(true);
      expect(startCnfImport).toHaveBeenCalledWith(
        'test-user-id',
        { url: 'https://example.com/cnf.zip' },
        { syncPastEntries: true, language: 'fr' }
      );
    });

    it('returns 409 while an import runs on any instance', async () => {
      vi.mocked(startCnfImport).mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/foods/canadian-nutrient-file/bulk-import')
        .send({});

      expect(res.statusCode).toBe(409);
    });

    it('returns 400 for non-positive or NaN maxFoods', async () => {
      const res = await request(app)
        .post('/api/foods/canadian-nutrient-file/bulk-import')
        .send({
          maxFoods: 'not-a-number',
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('maxFoods must be a positive integer');
    });

    it('returns 400 for non-HTTPS archiveUrl', async () => {
      const res = await request(app)
        .post('/api/foods/canadian-nutrient-file/bulk-import')
        .send({
          archiveUrl: 'http://insecure.com/cnf.zip',
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Invalid request body');
    });
  });

  describe('DELETE /api/foods/canadian-nutrient-file', () => {
    it('deletes library items for the authenticated user', async () => {
      vi.mocked(deleteCnfLibraryFoods).mockResolvedValueOnce({
        deletedCount: 15,
      });

      const res = await request(app).delete(
        '/api/foods/canadian-nutrient-file'
      );
      expect(res.statusCode).toBe(200);
      expect(res.body.deletedCount).toBe(15);
      expect(deleteCnfLibraryFoods).toHaveBeenCalledWith('test-user-id');
    });
  });
});
