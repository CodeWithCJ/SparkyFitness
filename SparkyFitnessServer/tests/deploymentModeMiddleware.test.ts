import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'.
import request from 'supertest';
import express from 'express';
import {
  requireMultipartUploadsEnabled,
  requireServerBackupsEnabled,
  requireUploadsEnabled,
  serverBackupsUnavailableBody,
  uploadsUnavailableBody,
} from '../middleware/deploymentModeMiddleware.js';

describe('deploymentModeMiddleware', () => {
  afterEach(() => {
    delete process.env.SPARKY_FITNESS_STORAGE_MODE;
    delete process.env.SPARKY_FITNESS_SERVER_BACKUPS_ENABLED;
  });

  it('blocks upload routes before handlers can write files', async () => {
    const handler = vi.fn((_req, res) => res.json({ ok: true }));
    const app = express();
    app.post('/upload', requireUploadsEnabled, handler);

    process.env.SPARKY_FITNESS_STORAGE_MODE = 'disabled';

    const res = await request(app).post('/upload').field('name', 'avatar');

    expect(res.statusCode).toBe(501);
    expect(res.body).toEqual(uploadsUnavailableBody);
    expect(handler).not.toHaveBeenCalled();
  });

  it('allows upload routes when local storage is active', async () => {
    const handler = vi.fn((_req, res) => res.json({ ok: true }));
    const app = express();
    app.post('/upload', requireUploadsEnabled, handler);

    const res = await request(app).post('/upload');

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(handler).toHaveBeenCalledOnce();
  });

  it('blocks non-multipart requests on upload-only routes when storage is disabled', async () => {
    const handler = vi.fn((_req, res) => res.json({ ok: true }));
    const app = express();
    app.post('/upload', requireUploadsEnabled, handler);

    process.env.SPARKY_FITNESS_STORAGE_MODE = 'disabled';

    const res = await request(app).post('/upload').send({ name: 'entry' });

    expect(res.statusCode).toBe(501);
    expect(res.body).toEqual(uploadsUnavailableBody);
    expect(handler).not.toHaveBeenCalled();
  });

  it('allows JSON writes on mixed JSON/multipart routes when uploads are disabled', async () => {
    const handler = vi.fn((_req, res) => res.json({ ok: true }));
    const app = express();
    app.use(express.json());
    app.post('/mixed', requireMultipartUploadsEnabled, handler);

    process.env.SPARKY_FITNESS_STORAGE_MODE = 'disabled';

    const res = await request(app).post('/mixed').send({ name: 'Push-ups' });

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(handler).toHaveBeenCalledOnce();
  });

  it('blocks multipart writes on mixed JSON/multipart routes when uploads are disabled', async () => {
    const handler = vi.fn((_req, res) => res.json({ ok: true }));
    const app = express();
    app.post('/mixed', requireMultipartUploadsEnabled, handler);

    process.env.SPARKY_FITNESS_STORAGE_MODE = 'disabled';

    const res = await request(app).post('/mixed').field('name', 'Push-ups');

    expect(res.statusCode).toBe(501);
    expect(res.body).toEqual(uploadsUnavailableBody);
    expect(handler).not.toHaveBeenCalled();
  });

  it('blocks server-managed backup routes when disabled', async () => {
    const handler = vi.fn((_req, res) => res.json({ ok: true }));
    const app = express();
    app.post('/backup', requireServerBackupsEnabled, handler);

    process.env.SPARKY_FITNESS_SERVER_BACKUPS_ENABLED = 'false';

    const res = await request(app).post('/backup');

    expect(res.statusCode).toBe(501);
    expect(res.body).toEqual(serverBackupsUnavailableBody);
    expect(handler).not.toHaveBeenCalled();
  });
});
