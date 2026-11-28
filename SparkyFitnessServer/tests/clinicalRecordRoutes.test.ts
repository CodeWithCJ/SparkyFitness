import { describe, it, expect, vi } from 'vitest';
import express from 'express';
// @ts-expect-error TS(7016): supertest does not publish declarations in this workspace
import request from 'supertest';
import path from 'node:path';
import fs from 'node:fs';
import clinicalRecordRoutes from '../routes/v2/clinicalRecordRoutes.js';

// Mock auth & permissions middlewares
vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: (req: any, res: any, next: any) => {
    req.userId = 'test-user-123';
    req.authenticatedUserId = 'test-user-123';
    next();
  },
}));

vi.mock('../middleware/onBehalfOfMiddleware.js', () => ({
  default: (req: any, res: any, next: any) => next(),
}));

vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  default: () => (req: any, res: any, next: any) => next(),
}));

// Mock measurementService & labResultRepository
vi.mock('../services/measurementService.js', () => ({
  default: {
    processHealthData: vi.fn().mockResolvedValue({
      processed: [{ id: 1 }, { id: 2 }],
      skipped: [],
      errors: [],
    }),
  },
}));

vi.mock('../models/labResultRepository.js', () => ({
  importLabReport: vi.fn().mockResolvedValue({
    report: { id: 'report-abc-123' },
    results: [{ id: 'res-1' }, { id: 'res-2' }],
  }),
}));

describe('Clinical Record Routes (/api/v2/clinical-records)', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/v2/clinical-records', clinicalRecordRoutes);
  app.use((err: any, _req: any, res: any, _next: any) => {
    res
      .status(err.name === 'ValidationError' ? 400 : 500)
      .json({ error: err.message });
  });

  it('returns 400 for unparseable uploads', async () => {
    const res = await request(app)
      .post('/api/v2/clinical-records/preview')
      .attach('file', Buffer.from('not an xml or zip'), 'corrupted.txt');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Failed to parse clinical record');
  });

  it('POST /preview parses uploaded XML and returns counts and items', async () => {
    const fixturePath = path.resolve(
      __dirname,
      'fixtures/sample_mychart_vitals_and_labs.xml'
    );
    if (!fs.existsSync(fixturePath)) return;

    const res = await request(app)
      .post('/api/v2/clinical-records/preview')
      .attach('file', fixturePath);

    expect(res.status).toBe(200);
    expect(res.body.vitalsCount).toBeGreaterThan(0);
    expect(res.body.labsCount).toBeGreaterThan(0);
    expect(Array.isArray(res.body.vitals)).toBe(true);
    expect(Array.isArray(res.body.labs)).toBe(true);
  });

  it('POST /import ingests parsed entries via JSON body', async () => {
    const res = await request(app)
      .post('/api/v2/clinical-records/import')
      .send({
        vitals: [
          {
            kind: 'systolic',
            sparkyType: 'blood_pressure_systolic',
            value: 120,
            unit: 'mmHg',
            isoDate: '2026-11-27',
            recordedAt: '2026-11-27T10:00:00Z',
          },
        ],
        labs: [
          {
            markerName: 'Glucose',
            entryDate: '2026-11-27',
            recordedAt: '2026-11-27T10:00:00Z',
            valueNumeric: 95,
            unit: 'mg/dL',
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.vitalsImported).toBe(2); // mocked measurementService
    expect(res.body.labsImported).toBe(2); // mocked labResultRepository
    expect(res.body.labReportId).toBe('report-abc-123');
  });
});
