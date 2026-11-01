/**
 * performBackup, listing and retention against a real temporary
 * directory, with pg_dump and tar replaced by fakes (child_process mocked).
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { PassThrough } from 'stream';

const env = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fsSync = require('fs') as typeof import('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const osSync = require('os') as typeof import('os');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pathSync = require('path') as typeof import('path');
  const root = fsSync.mkdtempSync(
    pathSync.join(osSync.tmpdir(), 'backup-atomic-')
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

interface TarCall {
  args: string[];
  /** What BACKUP_DIR held when tar ran. */
  backupDirEntries: string[];
}

const mocks = vi.hoisted(() => ({
  tarCalls: [] as TarCall[],
  tarVersion: 'tar (GNU tar) 1.35',
  // Exit code per tar run, in order; missing entries mean 0.
  tarExitCodes: [] as number[],
  pgDumpExitCode: 0,
  // When set, pg_dump does not finish until it resolves.
  pgDumpGate: null as Promise<void> | null,
  getBackupSettings: vi.fn(),
  updateLastBackupStatus: vi.fn(),
}));

vi.mock('child_process', async () => {
  const fsSync = await import('fs');
  const util = await import('util');
  const execFile = (
    file: string,
    args: string[],
    _options: unknown,
    callback: (
      error: (Error & { code?: number; stderr?: string }) | null,
      result?: { stdout: string; stderr: string }
    ) => void
  ) => {
    if (args[0] === '--version') {
      callback(null, { stdout: mocks.tarVersion, stderr: '' });
      return;
    }
    mocks.tarCalls.push({
      args,
      backupDirEntries: fsSync.readdirSync(
        process.env.SPARKY_FITNESS_CUSTOM_BACKUP_DIRECTORY!
      ),
    });
    const code = mocks.tarExitCodes[mocks.tarCalls.length - 1] ?? 0;
    if (code !== 2) {
      // tar writes its archive before it exits, whatever the exit code.
      fsSync.writeFileSync(args[1], `archive by ${file}`);
    }
    if (code === 0) {
      callback(null, { stdout: '', stderr: '' });
    } else {
      callback(
        Object.assign(new Error(`tar exited with ${code}`), {
          code,
          stderr: 'tar: ./x: file changed as we read it',
        })
      );
    }
  };
  // promisify(execFile) resolves { stdout, stderr } like the real one.
  Object.defineProperty(execFile, util.promisify.custom, {
    value: (file: string, args: string[], options?: unknown) =>
      new Promise((resolve, reject) =>
        execFile(file, args, options, (error, result) =>
          error ? reject(error) : resolve(result)
        )
      ),
  });
  const spawn = () => {
    const child = new EventEmitter() as EventEmitter & { stdout: PassThrough };
    child.stdout = new PassThrough();
    void (mocks.pgDumpGate ?? Promise.resolve()).then(() => {
      child.stdout.end('-- dump');
      setImmediate(() => child.emit('close', mocks.pgDumpExitCode));
    });
    return child;
  };
  return { execFile, spawn, default: { execFile, spawn } };
});
vi.mock('../models/backupSettingsRepository.js', () => ({
  default: {
    getBackupSettings: mocks.getBackupSettings,
    updateLastBackupStatus: mocks.updateLastBackupStatus,
  },
}));
vi.mock('../db/poolManager.js', () => ({
  endPool: vi.fn(),
  resetPool: vi.fn(),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

import {
  BACKUP_DIR,
  BACKUP_TEMP_DIR,
  STALE_WORK_DIR_AGE_MS,
  UPLOADS_BASE_DIR,
  applyRetentionPolicy,
  listBackups,
  performBackup,
} from '../services/backupService.js';
import { log } from '../config/logging.js';

const HOUR = 60 * 60 * 1000;

function backdate(entry: string, ms: number) {
  const when = new Date(Date.now() - ms);
  fs.utimesSync(entry, when, when);
}

function tmpEntries() {
  return fs.existsSync(BACKUP_TEMP_DIR) ? fs.readdirSync(BACKUP_TEMP_DIR) : [];
}

beforeEach(() => {
  // Never touch a real backup directory.
  expect(BACKUP_DIR.startsWith(env.root)).toBe(true);
  vi.clearAllMocks();
  fs.rmSync(BACKUP_DIR, { recursive: true, force: true });
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.mkdirSync(UPLOADS_BASE_DIR, { recursive: true });
  mocks.tarCalls.length = 0;
  mocks.tarExitCodes = [];
  mocks.tarVersion = 'tar (GNU tar) 1.35';
  mocks.pgDumpExitCode = 0;
  mocks.getBackupSettings.mockResolvedValue({
    backup_enabled: true,
    retention_days: 7,
  });
});

afterAll(() => {
  fs.rmSync(env.root, { recursive: true, force: true });
});

describe('performBackup writes atomically', () => {
  it('builds every piece under .tmp and renames only the finished archive in', async () => {
    const result = await performBackup();

    expect(result.success).toBe(true);
    // Neither tar run saw anything but .tmp in BACKUP_DIR.
    expect(mocks.tarCalls).toHaveLength(2);
    for (const call of mocks.tarCalls) {
      expect(call.backupDirEntries).toEqual(['.tmp']);
      expect(call.args[1].startsWith(BACKUP_TEMP_DIR + path.sep)).toBe(true);
    }
    const listed = await listBackups(BACKUP_DIR);
    expect(listed.map((b) => b.fileName)).toEqual([result.fileName]);
    expect(fs.readFileSync(result.path!, 'utf8')).toBe('archive by tar');
    // The run's work directory is gone; nothing else was left behind.
    expect(tmpEntries()).toEqual([]);
    expect(fs.readdirSync(BACKUP_DIR).sort()).toEqual(
      ['.tmp', result.fileName].sort()
    );
  });

  it('lists nothing and leaves nothing when a step fails', async () => {
    mocks.tarExitCodes = [0, 2];

    const result = await performBackup();

    expect(result.success).toBe(false);
    expect(await listBackups(BACKUP_DIR)).toEqual([]);
    expect(tmpEntries()).toEqual([]);
    expect(mocks.updateLastBackupStatus).toHaveBeenCalledWith(
      'failed',
      expect.any(Date)
    );
  });

  it('fails when pg_dump fails, before any tar runs', async () => {
    mocks.pgDumpExitCode = 1;
    const result = await performBackup();
    expect(result).toEqual({
      success: false,
      error: 'pg_dump process exited with code 1',
    });
    expect(mocks.tarCalls).toHaveLength(0);
    expect(tmpEntries()).toEqual([]);
  });

  it('skips upload staging and tolerates files changing under GNU tar', async () => {
    mocks.tarExitCodes = [1, 0];

    const result = await performBackup();

    expect(result.success).toBe(true);
    const uploadsArgs = mocks.tarCalls[0].args;
    expect(uploadsArgs).toEqual([
      '-czf',
      expect.stringMatching(/sparkyfitness_uploads_backup_.*\.tar\.gz$/),
      '--warning=no-file-changed',
      '--warning=no-file-removed',
      '--anchored',
      '--exclude=./_staging',
      '-C',
      UPLOADS_BASE_DIR,
      '.',
    ]);
  });

  it('still fails on exit 1 from the combine step', async () => {
    mocks.tarExitCodes = [0, 1];
    const result = await performBackup();
    expect(result.success).toBe(false);
    expect(await listBackups(BACKUP_DIR)).toEqual([]);
  });

  it('uses only portable flags, and no exit-code tolerance, with another tar', async () => {
    vi.resetModules();
    mocks.tarVersion = 'bsdtar 3.7.2 - libarchive 3.7.2';
    const fresh = await import('../services/backupService.js');
    mocks.tarExitCodes = [1];

    const result = await fresh.performBackup();

    expect(result.success).toBe(false);
    expect(mocks.tarCalls[0].args).toEqual([
      '-czf',
      expect.any(String),
      '--exclude=./_staging',
      '-C',
      UPLOADS_BASE_DIR,
      '.',
    ]);
  });
});

describe('another run working at the same time', () => {
  it('keeps its work directory, which only that run removes', async () => {
    const otherRun = path.join(BACKUP_TEMP_DIR, 'other-run');
    fs.mkdirSync(otherRun, { recursive: true });
    fs.writeFileSync(path.join(otherRun, 'piece.sql.gz'), 'x');

    const result = await performBackup();

    expect(result.success).toBe(true);
    expect(tmpEntries()).toEqual(['other-run']);
    expect(fs.existsSync(path.join(otherRun, 'piece.sql.gz'))).toBe(true);
    expect(
      (await listBackups(BACKUP_DIR)).map((backup) => backup.fileName)
    ).toEqual([result.fileName]);
  });
});

describe('stale work directories', () => {
  function workDir(name: string, ageMs: number) {
    const dir = path.join(BACKUP_TEMP_DIR, name);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'partial.sql.gz');
    fs.writeFileSync(file, 'x');
    backdate(file, ageMs);
    backdate(dir, ageMs);
    return dir;
  }

  it('removes entries older than a day and keeps newer ones', async () => {
    const stale = workDir('killed-run', STALE_WORK_DIR_AGE_MS + HOUR);
    const fresh = workDir('live-run', STALE_WORK_DIR_AGE_MS - HOUR);

    const result = await performBackup();

    expect(result.success).toBe(true);
    expect(fs.existsSync(stale)).toBe(false);
    expect(fs.existsSync(fresh)).toBe(true);
  });

  it('is fine when .tmp does not exist yet', async () => {
    expect(fs.existsSync(BACKUP_TEMP_DIR)).toBe(false);

    const result = await performBackup();

    expect(result.success).toBe(true);
  });

  it('logs a failed removal and still backs up', async () => {
    const stuck = workDir('stuck-run', STALE_WORK_DIR_AGE_MS + HOUR);
    const gone = workDir('killed-run', STALE_WORK_DIR_AGE_MS + HOUR);
    const rm = fs.promises.rm;
    const spy = vi
      .spyOn(fs.promises, 'rm')
      .mockImplementation(async (target, options) => {
        if (target === stuck) throw new Error('EBUSY: stuck');
        return rm(target, options);
      });
    try {
      const result = await performBackup();
      expect(result.success).toBe(true);
    } finally {
      spy.mockRestore();
    }

    expect(fs.existsSync(stuck)).toBe(true);
    expect(fs.existsSync(gone)).toBe(false);
    expect(log).toHaveBeenCalledWith(
      'warn',
      expect.stringContaining(stuck),
      expect.any(Error)
    );
  });

  it('removes a stale symlink without touching its target', async () => {
    const outside = path.join(env.root, 'outside');
    fs.mkdirSync(outside, { recursive: true });
    fs.writeFileSync(path.join(outside, 'keep.txt'), 'x');
    fs.mkdirSync(BACKUP_TEMP_DIR, { recursive: true });
    const link = path.join(BACKUP_TEMP_DIR, 'link');
    fs.symlinkSync(outside, link);
    fs.lutimesSync(
      link,
      new Date(Date.now() - 2 * STALE_WORK_DIR_AGE_MS),
      new Date(Date.now() - 2 * STALE_WORK_DIR_AGE_MS)
    );
    // Old files elsewhere in BACKUP_DIR are not .tmp entries.
    const archive = path.join(
      BACKUP_DIR,
      'sparkyfitness_full_backup_2026-10-01T02-00-00-000Z.tar.gz'
    );
    fs.writeFileSync(archive, 'x');
    backdate(archive, 3 * STALE_WORK_DIR_AGE_MS);

    const result = await performBackup();

    expect(result.success).toBe(true);
    expect(fs.existsSync(link)).toBe(false);
    expect(fs.existsSync(path.join(outside, 'keep.txt'))).toBe(true);
    expect(fs.existsSync(archive)).toBe(true);
  });

  it('skips the sweep when .tmp is a symlink', async () => {
    const outside = path.join(env.root, 'outside-tmp');
    const victim = path.join(outside, 'old-run');
    fs.mkdirSync(victim, { recursive: true });
    backdate(victim, 2 * STALE_WORK_DIR_AGE_MS);
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    fs.symlinkSync(outside, BACKUP_TEMP_DIR);

    await performBackup();

    expect(fs.existsSync(victim)).toBe(true);
    expect(log).toHaveBeenCalledWith(
      'warn',
      expect.stringContaining('is not a directory')
    );
  });

  it('keeps an old directory whose files are still being written', async () => {
    const otherProcess = workDir(
      'other-replica-run',
      2 * STALE_WORK_DIR_AGE_MS
    );
    backdate(
      path.join(otherProcess, 'partial.sql.gz'),
      STALE_WORK_DIR_AGE_MS - HOUR
    );

    const result = await performBackup();

    expect(result.success).toBe(true);
    expect(fs.existsSync(otherProcess)).toBe(true);
  });

  it('leaves a run still in progress alone however old', async () => {
    let release!: () => void;
    mocks.pgDumpGate = new Promise((resolve) => {
      release = resolve;
    });
    try {
      const first = performBackup();
      await vi.waitFor(() => expect(tmpEntries()).toHaveLength(1));
      const [running] = tmpEntries();
      backdate(
        path.join(BACKUP_TEMP_DIR, running!),
        STALE_WORK_DIR_AGE_MS + HOUR
      );
      const second = performBackup();
      await vi.waitFor(() => expect(tmpEntries()).toHaveLength(2));
      release();

      expect((await first).success).toBe(true);
      expect((await second).success).toBe(true);
    } finally {
      mocks.pgDumpGate = null;
    }
  });
});

describe('retention', () => {
  function archive(name: string, ageDays: number) {
    const file = path.join(BACKUP_DIR, name);
    fs.writeFileSync(file, 'x');
    backdate(file, ageDays * 24 * HOUR);
    return file;
  }

  it('deletes only finished archives past the retention period', async () => {
    const old = archive(
      'sparkyfitness_full_backup_2026-10-01T02-00-00-000Z.tar.gz',
      10
    );
    const recent = archive(
      'sparkyfitness_full_backup_2026-10-14T02-00-00-000Z.tar.gz',
      1
    );
    const inProgress = path.join(
      BACKUP_TEMP_DIR,
      'run',
      'sparkyfitness_full_backup_2026-10-01T02-00-00-000Z.tar.gz'
    );
    fs.mkdirSync(path.dirname(inProgress), { recursive: true });
    fs.writeFileSync(inProgress, 'x');
    backdate(inProgress, 10 * 24 * HOUR);

    await applyRetentionPolicy();

    expect(fs.existsSync(old)).toBe(false);
    expect(fs.existsSync(recent)).toBe(true);
    expect(fs.existsSync(inProgress)).toBe(true);
  });

  it('carries on when an archive was already removed', async () => {
    const first = archive(
      'sparkyfitness_full_backup_2026-10-01T02-00-00-000Z.tar.gz',
      10
    );
    const second = archive(
      'sparkyfitness_full_backup_2026-10-02T02-00-00-000Z.tar.gz',
      10
    );
    const unlink = fs.promises.unlink;
    const spy = vi
      .spyOn(fs.promises, 'unlink')
      .mockImplementationOnce(async (target) => {
        await unlink(target);
        throw Object.assign(new Error('ENOENT: gone'), { code: 'ENOENT' });
      });
    const stat = fs.promises.stat;
    const statSpy = vi
      .spyOn(fs.promises, 'stat')
      .mockImplementationOnce(async (target) => {
        // Removed between readdir and stat.
        fs.rmSync(target);
        return stat(target);
      });
    try {
      await expect(applyRetentionPolicy()).resolves.toBeUndefined();
    } finally {
      spy.mockRestore();
      statSpy.mockRestore();
    }
    expect(fs.existsSync(first)).toBe(false);
    expect(fs.existsSync(second)).toBe(false);
  });

  it('still fails on other errors', async () => {
    archive('sparkyfitness_full_backup_2026-10-01T02-00-00-000Z.tar.gz', 10);
    const spy = vi
      .spyOn(fs.promises, 'unlink')
      .mockRejectedValueOnce(
        Object.assign(new Error('EACCES'), { code: 'EACCES' })
      );
    try {
      await expect(applyRetentionPolicy()).rejects.toThrow('EACCES');
    } finally {
      spy.mockRestore();
    }
  });

  it('lists archives without the ones removed while listing', async () => {
    archive('sparkyfitness_full_backup_2026-10-01T02-00-00-000Z.tar.gz', 1);
    const kept = archive(
      'sparkyfitness_full_backup_2026-10-02T02-00-00-000Z.tar.gz',
      1
    );
    const stat = fs.promises.stat;
    const statSpy = vi
      .spyOn(fs.promises, 'stat')
      .mockImplementation(async (target) => {
        if (String(target).includes('2026-10-01')) {
          throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        }
        return stat(target);
      });
    try {
      const listed = await listBackups(BACKUP_DIR);
      expect(listed.map((b) => path.join(BACKUP_DIR, b.fileName))).toEqual([
        kept,
      ]);
    } finally {
      statSpy.mockRestore();
    }
  });
});
