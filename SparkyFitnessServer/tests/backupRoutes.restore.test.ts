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
  assertRestoreAllowed: vi.fn(),
}));

vi.mock('../services/backupService.js', () => ({
  performBackup: vi.fn(),
  performRestore: mocks.performRestore,
  BACKUP_DIR: env.backups,
  BACKUP_FILE_PATTERN: /^sparkyfitness_full_backup_[\w.-]+\.tar\.gz$/,
  listBackups: vi.fn(),
}));
vi.mock('../services/onlineRestoreGuard.js', () => {
  class RestoreRefusedError extends Error {
    readonly code = 'restore_requires_single_instance';
  }
  return {
    assertRestoreAllowed: mocks.assertRestoreAllowed,
    RestoreRefusedError,
    RESTORE_REFUSED_CODE: 'restore_requires_single_instance',
  };
});
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
import { RestoreRefusedError } from '../services/onlineRestoreGuard.js';

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
  mocks.assertRestoreAllowed.mockResolvedValue(undefined);
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

describe('POST /admin/backup/restore with other instances running', () => {
  const uploadedFiles = () => fs.readdirSync(env.uploads);

  it('refuses with 409 before accepting the upload when other instances are seen', async () => {
    mocks.assertRestoreAllowed.mockRejectedValue(
      new RestoreRefusedError('Restore refused: other server instances ...')
    );

    const res = await postRestore();

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({
      code: 'restore_requires_single_instance',
      message: 'Restore refused: other server instances ...',
    });
    expect(mocks.performRestore).not.toHaveBeenCalled();
    expect(uploadedFiles()).toEqual([]);
    expect(fs.readdirSync(env.backups)).toEqual([]);
  });

  it('answers 503 without restoring when the check cannot reach the database', async () => {
    mocks.assertRestoreAllowed.mockRejectedValue(new Error('ECONNREFUSED'));

    const res = await postRestore();

    expect(res.statusCode).toBe(503);
    expect(res.body.message).toMatch(/restore was not started/);
    expect(mocks.performRestore).not.toHaveBeenCalled();
    expect(uploadedFiles()).toEqual([]);
  });

  it('checks once, then restores, when this looks like the only instance', async () => {
    mocks.performRestore.mockResolvedValue({ success: true });

    const res = await postRestore();

    expect(res.statusCode).toBe(200);
    expect(mocks.assertRestoreAllowed).toHaveBeenCalledOnce();
    expect(mocks.performRestore).toHaveBeenCalledOnce();
  });

  it('answers 409 and removes the archive when performRestore itself refuses', async () => {
    mocks.performRestore.mockRejectedValue(
      new RestoreRefusedError('Restore refused: late arrival')
    );

    const res = await postRestore();

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe('Restore refused: late arrival');
    await expectBackupFolder([]);
  });
});
