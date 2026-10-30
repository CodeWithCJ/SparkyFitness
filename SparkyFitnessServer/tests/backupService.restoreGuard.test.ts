/**
 * performRestore checks for other instances before any work and again right
 * before the destructive steps. child_process is mocked: tar "extracts" two
 * files and every other command is recorded, never run.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
    pathSync.join(osSync.tmpdir(), 'restore-guard-')
  );
  process.env.SPARKY_FITNESS_CUSTOM_BACKUP_DIRECTORY = pathSync.join(
    root,
    'backup'
  );
  process.env.SPARKY_FITNESS_CUSTOM_UPLOADS_DIRECTORY = pathSync.join(
    root,
    'uploads'
  );
  return { root };
});

const mocks = vi.hoisted(() => ({
  commands: [] as string[],
  assertRestoreAllowed: vi.fn(),
  endPool: vi.fn(),
}));

vi.mock('child_process', async () => {
  const fsSync = await import('fs');
  const pathSync = await import('path');
  const util = await import('util');
  const execFile = (
    file: string,
    args: string[],
    _options: unknown,
    callback: (
      error: Error | null,
      result?: { stdout: string; stderr: string }
    ) => void
  ) => {
    mocks.commands.push(`${file} ${args[0]}`);
    if (file === 'tar' && args[0] === '-xzf') {
      const dir = args[3]!;
      fsSync.writeFileSync(
        pathSync.join(dir, 'sparkyfitness_db_backup_x.sql.gz'),
        ''
      );
      fsSync.writeFileSync(
        pathSync.join(dir, 'sparkyfitness_uploads_backup_x.tar.gz'),
        ''
      );
    }
    callback(null, { stdout: '', stderr: '' });
  };
  Object.defineProperty(execFile, util.promisify.custom, {
    value: (file: string, args: string[], options?: unknown) =>
      new Promise((resolve, reject) =>
        execFile(file, args, options, (error, result) =>
          error ? reject(error) : resolve(result)
        )
      ),
  });
  const spawn = vi.fn();
  return { execFile, spawn, default: { execFile, spawn } };
});
vi.mock('../services/onlineRestoreGuard.js', async () => {
  class RestoreRefusedError extends Error {}
  return {
    assertRestoreAllowed: mocks.assertRestoreAllowed,
    RestoreRefusedError,
  };
});
vi.mock('../models/backupSettingsRepository.js', () => ({ default: {} }));
vi.mock('../db/poolManager.js', () => ({
  endPool: mocks.endPool,
  resetPool: vi.fn(),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

import { BACKUP_DIR, performRestore } from '../services/backupService.js';
import { RestoreRefusedError } from '../services/onlineRestoreGuard.js';

const archivePath = path.join(env.root, 'upload.tar.gz');
const backupDirEntries = () => fs.readdirSync(BACKUP_DIR);
// Stands in for everything from endPool on: reaching it means the restore
// passed both checks and would now wipe the database.
const STOP = 'stopped at the first destructive step';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.commands.length = 0;
  fs.rmSync(BACKUP_DIR, { recursive: true, force: true });
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.writeFileSync(archivePath, 'archive');
  mocks.endPool.mockRejectedValue(new Error(STOP));
});

afterAll(() => {
  fs.rmSync(env.root, { recursive: true, force: true });
});

describe('performRestore guard', () => {
  it('refuses before touching anything when other instances are seen', async () => {
    mocks.assertRestoreAllowed.mockRejectedValue(
      new RestoreRefusedError('refused')
    );

    await expect(performRestore(archivePath)).rejects.toBeInstanceOf(
      RestoreRefusedError
    );
    expect(mocks.commands).toEqual([]);
    expect(mocks.endPool).not.toHaveBeenCalled();
    expect(backupDirEntries()).toEqual([]);
  });

  it('refuses after extracting when another instance appeared meanwhile', async () => {
    mocks.assertRestoreAllowed
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new RestoreRefusedError('refused'));

    await expect(performRestore(archivePath)).rejects.toBeInstanceOf(
      RestoreRefusedError
    );
    expect(mocks.commands).toEqual(['tar -xzf']);
    expect(mocks.endPool).not.toHaveBeenCalled();
    // The extraction directory is cleaned up as on any failure.
    expect(backupDirEntries()).toEqual([]);
  });

  it('goes on to the destructive steps when this is the only instance', async () => {
    mocks.assertRestoreAllowed.mockResolvedValue(undefined);

    await expect(performRestore(archivePath)).resolves.toEqual({
      success: false,
      error: STOP,
    });
    expect(mocks.assertRestoreAllowed).toHaveBeenCalledTimes(2);
    expect(mocks.endPool).toHaveBeenCalledOnce();
  });
});
