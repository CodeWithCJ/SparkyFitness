import { vi, describe, it, expect, beforeEach, afterAll } from 'vitest';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'
import request from 'supertest';
import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { writeFileSync, rmSync, utimesSync } from 'fs';

vi.mock('../services/backupService.js', async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const os = require('os');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('path');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-test-'));
  // @ts-expect-error allow attaching to globalThis for test coordination
  globalThis.__TEST_BACKUP_DIR = tempDir;
  // Keep the real listBackups/BACKUP_FILE_PATTERN, only override BACKUP_DIR.
  const actual = await vi.importActual('../services/backupService.js');
  return { ...actual, BACKUP_DIR: tempDir };
});

vi.mock('../middleware/authMiddleware', () => ({
  authenticate: vi.fn((req: Request, res: Response, next: NextFunction) =>
    next()
  ),
  isAdmin: vi.fn((req: Request, res: Response, next: NextFunction) => next()),
}));

import backupRoutes from '../routes/backupRoutes.js';
// @ts-expect-error access test-only global
const TEMP_DIR_BASE: string = globalThis.__TEST_BACKUP_DIR;

const app = express();
app.use(express.json());
app.use('/admin/backup', backupRoutes);

afterAll(() => {
  try {
    rmSync(TEMP_DIR_BASE, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

describe('Backup routes - /list', () => {
  it('returns an empty list when no backup file exists', async () => {
    const res = await request(app).get('/admin/backup/list');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ backups: [] });
  });

  it('lists backup files newest first, using the timestamp encoded in the filename rather than mtime', async () => {
    const newFileName =
      'sparkyfitness_full_backup_2026-01-01T00-00-00-000Z.tar.gz';
    const oldFileName =
      'sparkyfitness_full_backup_2025-01-01T00-00-00-000Z.tar.gz';
    const newFilePath = path.join(TEMP_DIR_BASE, newFileName);
    const oldFilePath = path.join(TEMP_DIR_BASE, oldFileName);

    writeFileSync(newFilePath, 'NEW BACKUP CONTENT');
    writeFileSync(oldFilePath, 'OLD BACKUP CONTENT');
    // Newer mtime on the older file: sorting must follow the filename, not this.
    const recentMtime = new Date();
    utimesSync(oldFilePath, recentMtime, recentMtime);

    const res = await request(app).get('/admin/backup/list');

    expect(res.statusCode).toBe(200);
    expect(res.body.backups).toHaveLength(2);
    expect(res.body.backups[0].fileName).toBe(newFileName);
    expect(res.body.backups[0].createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(res.body.backups[1].fileName).toBe(oldFileName);
    expect(res.body.backups[1].createdAt).toBe('2025-01-01T00:00:00.000Z');
    expect(res.body.backups[0]).toHaveProperty('size');
  });

  it('reports completedAt from the archive mtime, independently of the name-derived createdAt', async () => {
    const fileName =
      'sparkyfitness_full_backup_2026-03-01T00-00-00-000Z.tar.gz';
    const filePath = path.join(TEMP_DIR_BASE, fileName);
    writeFileSync(filePath, 'CONTENT');
    // Backup started at the time in the name and finished 90 seconds later.
    const finishedAt = new Date('2026-03-01T00:01:30.000Z');
    utimesSync(filePath, finishedAt, finishedAt);

    const res = await request(app).get('/admin/backup/list');

    const entry = res.body.backups.find(
      (b: { fileName: string }) => b.fileName === fileName
    );
    expect(entry.createdAt).toBe('2026-03-01T00:00:00.000Z');
    expect(entry.completedAt).toBe('2026-03-01T00:01:30.000Z');
  });

  it('falls back to mtime for a backup file whose name has no parseable timestamp', async () => {
    const fileName = 'sparkyfitness_full_backup_manual-restore-copy.tar.gz';
    const filePath = path.join(TEMP_DIR_BASE, fileName);
    writeFileSync(filePath, 'FALLBACK CONTENT');
    const mtime = new Date('2024-06-15T12:00:00Z');
    utimesSync(filePath, mtime, mtime);

    const res = await request(app).get('/admin/backup/list');

    const entry = res.body.backups.find(
      (b: { fileName: string }) => b.fileName === fileName
    );
    expect(entry).toBeDefined();
    expect(entry.createdAt).toBe('2024-06-15T12:00:00.000Z');
  });
});

describe('Backup routes - /download/:fileName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 for a file name that does not match the backup pattern', async () => {
    const res = await request(app).get(
      '/admin/backup/download/not_a_backup_file.tar.gz'
    );
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when the requested backup file does not exist', async () => {
    const res = await request(app).get(
      '/admin/backup/download/sparkyfitness_full_backup_20990101.tar.gz'
    );
    expect(res.statusCode).toBe(404);
  });

  it('serves the requested backup file', async () => {
    const fileName = 'sparkyfitness_full_backup_20260101.tar.gz';
    const filePath = path.join(TEMP_DIR_BASE, fileName);
    writeFileSync(filePath, 'NEW BACKUP CONTENT');

    const res = await request(app).get(`/admin/backup/download/${fileName}`);

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toMatch(new RegExp(fileName));
    expect(res.body.toString()).toContain('NEW BACKUP CONTENT');
  });
});
