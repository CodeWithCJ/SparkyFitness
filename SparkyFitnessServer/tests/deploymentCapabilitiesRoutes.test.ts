import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'.
import request from 'supertest';
import express from 'express';
import deploymentCapabilitiesRoutes from '../routes/deploymentCapabilitiesRoutes.js';

const app = express();
app.use('/deployment-capabilities', deploymentCapabilitiesRoutes);

describe('deploymentCapabilitiesRoutes', () => {
  afterEach(() => {
    delete process.env.SPARKY_FITNESS_STORAGE_MODE;
    delete process.env.SPARKY_FITNESS_SERVER_BACKUPS_ENABLED;
    delete process.env.SPARKY_FITNESS_DISABLE_BACKGROUND_JOBS;
  });

  it('returns non-secret deployment capabilities', async () => {
    process.env.SPARKY_FITNESS_STORAGE_MODE = 'disabled';
    process.env.SPARKY_FITNESS_SERVER_BACKUPS_ENABLED = 'false';
    process.env.SPARKY_FITNESS_DISABLE_BACKGROUND_JOBS = 'true';

    const res = await request(app).get('/deployment-capabilities');

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      storageMode: 'disabled',
      uploadsEnabled: false,
      serverBackupsEnabled: false,
      backgroundJobsEnabled: false,
    });
  });
});
