import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'
import request from 'supertest';
import express, { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

const env = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fsSync = require('fs') as typeof import('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const osSync = require('os') as typeof import('os');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pathSync = require('path') as typeof import('path');
  const root = fsSync.mkdtempSync(
    pathSync.join(osSync.tmpdir(), 'restore-cleanup-')
  );
  const uploads = pathSync.join(root, 'temp_uploads');
  const backups = pathSync.join(root, 'backup');
  fsSync.mkdirSync(backups);
  process.env.SPARKY_FITNESS_CUSTOM_TEMP_DIRECTORY = uploads;
  return { root, uploads, backups };
});

const mocks = vi.hoisted(() => ({
  performRestore: vi.fn(),
}));

vi.mock('../services/backupService.js', () => ({
  performBackup: vi.fn(),
  performRestore: mocks.performRestore,
  RestoreInProgressError: class RestoreInProgressError extends Error {},
  BACKUP_DIR: env.backups,
  BACKUP_FILE_PATTERN: /^sparkyfitness_full_backup_[\w.-]+\.tar\.gz$/,
  listBackups: vi.fn(),
}));
vi.mock('../services/backupScheduler.js', () => ({
  rescheduleBackups: vi.fn(),
}));
vi.mock('../models/backupSettingsRepository.js', () => ({ default: {} }));
vi.mock('../middleware/authMiddleware', () => ({
  authenticate: vi.fn((_req: Request, _res: Response, next: NextFunction) =>
    next()
  ),
  isAdmin: vi.fn((_req: Request, _res: Response, next: NextFunction) => next()),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

import backupRoutes from '../routes/backupRoutes.js';
import { RestoreInProgressError } from '../services/backupService.js';

const app = express();
app.use('/admin/backup', backupRoutes);

const postRestore = () =>
  request(app)
    .post('/admin/backup/restore')
    .attach(
      'backupFile',
      Buffer.from('not really a backup'),
      'sparkyfitness_full_backup_x.tar.gz'
    );

// The archive the route hands to performRestore must exist while it runs.
const expectArchiveDuringRestore = () => {
  let seen: string | undefined;
  mocks.performRestore.mockImplementation(async (archivePath: string) => {
    seen = archivePath;
    expect(path.dirname(archivePath)).toBe(env.backups);
    expect(fs.existsSync(archivePath)).toBe(true);
    return { success: true };
  });
  return () => seen;
};

// The route replies before its finally block runs, so the removal lands just
// after the response.
const expectBackupFolder = (names: string[]) =>
  vi.waitFor(() => expect(fs.readdirSync(env.backups)).toEqual(names), {
    timeout: 1000,
  });

beforeEach(() => {
  vi.clearAllMocks();
  fs.rmSync(env.backups, { recursive: true, force: true });
  fs.mkdirSync(env.backups);
});

afterAll(() => {
  fs.rmSync(env.root, { recursive: true, force: true });
});

describe('POST /admin/backup/restore leaves no archive behind', () => {
  it('removes the uploaded archive from the backup folder after a restore', async () => {
    const archivePath = expectArchiveDuringRestore();

    const res = await postRestore();

    expect(res.statusCode).toBe(200);
    expect(archivePath()).toMatch(/restore_[\w-]+\.tar\.gz$/);
    await expectBackupFolder([]);
    expect(fs.readdirSync(env.uploads)).toEqual([]);
  });

  it('removes it when the restore reports failure', async () => {
    mocks.performRestore.mockResolvedValue({
      success: false,
      error: 'pg_restore failed',
    });

    const res = await postRestore();

    expect(res.statusCode).toBe(500);
    expect(mocks.performRestore).toHaveBeenCalledOnce();
    await expectBackupFolder([]);
  });

  it('removes it when the restore throws', async () => {
    mocks.performRestore.mockRejectedValue(new Error('tar exited 2'));

    const res = await postRestore();

    expect(res.statusCode).toBe(500);
    await expectBackupFolder([]);
  });

  it('leaves real backups in the folder alone', async () => {
    const kept = path.join(
      env.backups,
      'sparkyfitness_full_backup_2026-10-15_00-00-00.tar.gz'
    );
    fs.writeFileSync(kept, 'a real backup');
    mocks.performRestore.mockResolvedValue({ success: true });

    await postRestore().expect(200);

    await expectBackupFolder([path.basename(kept)]);
  });
});

describe('POST /admin/backup/restore while another restore runs', () => {
  it('answers 409 and removes the archive', async () => {
    mocks.performRestore.mockRejectedValue(
      new RestoreInProgressError('Another restore is already running.')
    );

    const res = await postRestore();

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({
      message: 'Another restore is already running.',
    });
    await expectBackupFolder([]);
  });
});
