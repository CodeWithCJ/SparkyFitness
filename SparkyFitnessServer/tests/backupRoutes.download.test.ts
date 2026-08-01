import { vi, describe, it, expect, beforeEach, afterAll } from 'vitest';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'
import request from 'supertest';
import express from 'express';
import path from 'path';
import { writeFileSync, rmSync, utimesSync } from 'fs';

vi.mock('../services/backupService.js', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const os = require('os');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('path');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-test-'));
  // @ts-expect-error allow attaching to globalThis for test coordination
  globalThis.__TEST_BACKUP_DIR = tempDir;
  return { BACKUP_DIR: tempDir };
});

vi.mock('../middleware/authMiddleware', () => ({
  authenticate: vi.fn((req: any, res: any, next: any) => next()),
  isAdmin: vi.fn((req: any, res: any, next: any) => next()),
}));

import backupRoutes from '../routes/backupRoutes.js';
// @ts-expect-error access test-only global
const TEMP_DIR_BASE: string = globalThis.__TEST_BACKUP_DIR;

const app = express();
app.use(express.json());
app.use('/admin/backup', backupRoutes);

describe('Backup routes - /download', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterAll(() => {
    try {
      rmSync(TEMP_DIR_BASE, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('returns 404 when no backup file exists', async () => {
    const res = await request(app).get('/admin/backup/download');
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ message: 'No backup file found.' });
  });

  it('serves the most recent backup file when present', async () => {
    const newFileName = 'sparkyfitness_full_backup_20260101.tar.gz';
    const oldFileName = 'sparkyfitness_full_backup_20250101.tar.gz';
    const newFilePath = path.join(TEMP_DIR_BASE, newFileName);
    const oldFilePath = path.join(TEMP_DIR_BASE, oldFileName);
    const newContent = 'NEW BACKUP CONTENT';
    const oldContent = 'OLD BACKUP CONTENT';

    writeFileSync(oldFilePath, oldContent);
    const past = new Date('2025-01-02T00:00:00Z');
    utimesSync(oldFilePath, past, past);

    writeFileSync(newFilePath, newContent);

    const res = await request(app).get('/admin/backup/download');

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toMatch(new RegExp(newFileName));
    expect(res.body.toString()).toContain('NEW BACKUP CONTENT');
  });
});
