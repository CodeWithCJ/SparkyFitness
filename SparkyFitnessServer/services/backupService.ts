import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { promises } from 'fs';
import zlib from 'zlib';
import { pipeline } from 'stream/promises';
import { randomBytes } from 'crypto';
import { log } from '../config/logging.js';
import backupSettingsRepository from '../models/backupSettingsRepository.js';
import { endPool, resetPool } from '../db/poolManager.js';
import { UPLOAD_STAGING_DIR } from '../utils/uploadsPath.js';
import { describeError } from '../utils/errors.js';
import {
  assertRestoreAllowed,
  RestoreRefusedError,
} from './onlineRestoreGuard.js';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fsp = { promises }.promises; // Use fsp for promise-based fs operations
// const { configureSessionMiddleware } = require('../SparkyFitnessServer'); // Removed to fix circular dependency
const BACKUP_DIR = process.env.SPARKY_FITNESS_CUSTOM_BACKUP_DIRECTORY
  ? path.resolve(process.env.SPARKY_FITNESS_CUSTOM_BACKUP_DIRECTORY)
  : process.env.BACKUP_DIR || path.join(__dirname, '../backup');

const UPLOADS_BASE_DIR = process.env.SPARKY_FITNESS_CUSTOM_UPLOADS_DIRECTORY
  ? path.resolve(process.env.SPARKY_FITNESS_CUSTOM_UPLOADS_DIRECTORY)
  : path.join(__dirname, '../uploads');
// Ensure backup directory exists
async function ensureBackupDirectory() {
  try {
    await fsp.mkdir(BACKUP_DIR, { recursive: true });
    log('info', `Ensured backup directory exists: ${BACKUP_DIR}`);
  } catch (error) {
    log('error', `Failed to create backup directory ${BACKUP_DIR}:`, error);
    throw error;
  }
}
// Unfinished runs work under here; only a complete archive is renamed out.
const BACKUP_TEMP_DIR = path.join(BACKUP_DIR, '.tmp');
// Well past any real run, so only the leftovers of a killed process qualify.
const STALE_WORK_DIR_AGE_MS = 24 * 60 * 60 * 1000;
// Work directories of runs in this process that have not finished yet.
const activeWorkDirNames = new Set<string>();

const execFileAsync = promisify(execFile);
interface ExecuteCommandOptions {
  env?: NodeJS.ProcessEnv;
  /** Non-zero exit codes that still count as success (logged as a warning). */
  allowedExitCodes?: number[];
}
async function executeCommand(
  file: string,
  args: string[] = [],
  options: ExecuteCommandOptions = {}
) {
  const { allowedExitCodes = [], env } = options;
  try {
    const { stdout, stderr } = await execFileAsync(file, args, {
      env: { ...process.env, ...(env || {}) },
    });
    if (stderr) {
      log('warn', `Command stderr: ${stderr}`);
    }
    log('info', `Command successful: ${file} ${args.join(' ')}`);
    log('debug', `Stdout: ${stdout}`);
    return stdout;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    if (
      typeof error.code === 'number' &&
      allowedExitCodes.includes(error.code)
    ) {
      log(
        'warn',
        `Command finished with exit code ${error.code}: ${file} ${args.join(' ')}\n${error.stderr || ''}`
      );
      return error.stdout as string;
    }
    log('error', `Command failed: ${file} ${args.join(' ')}`, error);
    // `||` not `??`: stderr can be an empty string; `??` would emit a blank detail.
    throw new Error(
      `Command failed: ${file} ${args.join(' ')}\n${error.stderr || error.message}`,
      { cause: error }
    );
  }
}
let gnuTar: Promise<boolean> | null = null;

/** Whether `tar` is GNU tar (the server image installs it; busybox and bsdtar lack its flags). */
function isGnuTar(): Promise<boolean> {
  gnuTar ??= execFileAsync('tar', ['--version']).then(
    ({ stdout }) => stdout.includes('GNU tar'),
    () => false
  );
  return gnuTar;
}

/**
 * Archives the uploads tree while the server keeps writing to it. Request
 * staging directories are skipped (their files are moved out or deleted within
 * the request). GNU tar exits 1 when a file changed or vanished while it was
 * read; the archive is still complete for everything else, so that counts as
 * success. Exit 2 (an unreadable file, no space) still fails the backup.
 */
async function archiveUploads(destination: string) {
  const gnu = await isGnuTar();
  await executeCommand(
    'tar',
    [
      '-czf',
      destination,
      ...(gnu
        ? [
            '--warning=no-file-changed',
            '--warning=no-file-removed',
            '--anchored',
          ]
        : []),
      `--exclude=./${UPLOAD_STAGING_DIR}`,
      '-C',
      UPLOADS_BASE_DIR,
      '.',
    ],
    { allowedExitCodes: gnu ? [1] : [] }
  );
}

function isNotFound(error: unknown) {
  return (error as NodeJS.ErrnoException)?.code === 'ENOENT';
}

/** Flushes a finished file to disk, so the rename never publishes a short one. */
async function syncFile(filePath: string) {
  const handle = await fsp.open(filePath, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

/**
 * Flushes a directory entry to disk, so a renamed archive survives a power
 * loss. Best effort: some platforms and network filesystems cannot sync a
 * directory.
 */
async function syncDirectory(dirPath: string) {
  try {
    const handle = await fsp.open(dirPath, 'r');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch (error) {
    log('debug', `Could not sync directory ${dirPath}:`, error);
  }
}

async function dumpDatabase(destination: string) {
  const pgDumpArgs = [
    '-h',
    process.env.SPARKY_FITNESS_DB_HOST!,
    '-p',
    process.env.SPARKY_FITNESS_DB_PORT!,
    '-U',
    process.env.SPARKY_FITNESS_DB_USER!,
    '-d',
    process.env.SPARKY_FITNESS_DB_NAME!,
  ];
  const pgDump = spawn('pg_dump', pgDumpArgs, {
    env: {
      PGPASSWORD: process.env.SPARKY_FITNESS_DB_PASSWORD,
      ...process.env,
    },
  });
  // allSettled, not all: on a failure both the pipeline and pg_dump must have
  // stopped writing before the caller removes the work directory.
  const results = await Promise.allSettled([
    pipeline(
      pgDump.stdout,
      zlib.createGzip(),
      fs.createWriteStream(destination)
    ),
    new Promise<void>((resolve, reject) => {
      pgDump.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`pg_dump process exited with code ${code}`));
        }
      });
      pgDump.on('error', reject);
    }),
  ]);
  const failure = results.find((result) => result.status === 'rejected');
  if (failure) throw failure.reason;
}

// Writing to a file leaves its directory's mtime alone, so a run another
// process still has going is recognised by its newest file instead.
async function lastWriteMs(entry: string) {
  const stats = await fsp.lstat(entry);
  if (!stats.isDirectory()) return stats.mtimeMs;
  let newest = stats.mtimeMs;
  for (const child of await fsp.readdir(entry)) {
    const childStats = await fsp.lstat(path.join(entry, child));
    newest = Math.max(newest, childStats.mtimeMs);
  }
  return newest;
}

// A killed process (SIGKILL, OOM, container stop) never reaches its own
// cleanup, so each run clears what earlier ones left behind. lstat keeps a
// symlink from being followed; rm on it removes the link, not its target.
// A run still in progress is skipped whatever its age, since a slow dump can
// outlast the cutoff.
async function sweepStaleWorkDirs() {
  let names: string[];
  try {
    // A .tmp that is itself a symlink would point the sweep at whatever it
    // targets, so only a real directory is swept.
    if (!(await fsp.lstat(BACKUP_TEMP_DIR)).isDirectory()) {
      log('warn', `${BACKUP_TEMP_DIR} is not a directory; skipping sweep.`);
      return;
    }
    names = await fsp.readdir(BACKUP_TEMP_DIR);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      log('warn', `Could not list ${BACKUP_TEMP_DIR}:`, error);
    }
    return;
  }
  const cutoff = Date.now() - STALE_WORK_DIR_AGE_MS;
  for (const name of names) {
    if (activeWorkDirNames.has(name)) continue;
    const entry = path.join(BACKUP_TEMP_DIR, name);
    try {
      if ((await lastWriteMs(entry)) < cutoff) {
        await fsp.rm(entry, { recursive: true, force: true });
        log('info', `Removed stale backup work directory ${entry}`);
      }
    } catch (error) {
      log(
        'warn',
        `Could not remove stale backup work directory ${entry}:`,
        error
      );
    }
  }
}

/**
 * Writes one full backup archive. Every piece is written under
 * BACKUP_DIR/.tmp/<run>/ and the finished archive is renamed into BACKUP_DIR
 * last, so a run that dies leaves nothing the listing, download or retention
 * would treat as a backup. A failed run removes its own work directory; one
 * killed outright leaves it under .tmp, where nothing reads it.
 */
async function performBackup(isManual = false) {
  await ensureBackupDirectory();
  const settings = await backupSettingsRepository.getBackupSettings();
  if (!isManual && !settings.backup_enabled) {
    log('info', 'Automated backup is disabled. Skipping backup.');
    return { success: true, message: 'Automated backup is disabled.' };
  }
  await sweepStaleWorkDirs();
  const startedAt = new Date();
  const timestamp = startedAt.toISOString().replace(/[:.]/g, '-');
  const dbBackupFileName = `sparkyfitness_db_backup_${timestamp}.sql.gz`;
  const uploadsBackupFileName = `sparkyfitness_uploads_backup_${timestamp}.tar.gz`;
  const fullBackupFileName = `sparkyfitness_full_backup_${timestamp}.tar.gz`;
  const workDirName = `${timestamp}-${randomBytes(4).toString('hex')}`;
  const workDir = path.join(BACKUP_TEMP_DIR, workDirName);
  const fullBackupPath = path.join(BACKUP_DIR, fullBackupFileName);
  activeWorkDirNames.add(workDirName);
  try {
    await fsp.mkdir(workDir, { recursive: true });
    log('info', 'Starting database backup...');
    const dbBackupPath = path.join(workDir, dbBackupFileName);
    await dumpDatabase(dbBackupPath);
    log('info', `Database backup created: ${dbBackupPath}`);
    log('info', 'Starting uploads folder backup...');
    const uploadsBackupPath = path.join(workDir, uploadsBackupFileName);
    await archiveUploads(uploadsBackupPath);
    log('info', `Uploads folder backup created: ${uploadsBackupPath}`);
    log('info', 'Combining backups into a single archive...');
    const workArchivePath = path.join(workDir, fullBackupFileName);
    await executeCommand('tar', [
      '-czf',
      workArchivePath,
      '-C',
      workDir,
      dbBackupFileName,
      uploadsBackupFileName,
    ]);
    await syncFile(workArchivePath);
    await fsp.rename(workArchivePath, fullBackupPath);
    await syncDirectory(BACKUP_DIR);
    log('info', `Combined backup created: ${fullBackupPath}`);
    await backupSettingsRepository.updateLastBackupStatus(
      'success',
      new Date()
    );
    return {
      success: true,
      message: 'Backup completed successfully.',
      path: fullBackupPath,
      fileName: fullBackupFileName,
    };
  } catch (error) {
    log('error', 'Backup failed:', error);
    await backupSettingsRepository.updateLastBackupStatus('failed', new Date());
    return { success: false, error: describeError(error) };
  } finally {
    await fsp.rm(workDir, { recursive: true, force: true }).catch((error) => {
      log('warn', `Could not remove backup work directory ${workDir}:`, error);
    });
    activeWorkDirNames.delete(workDirName);
  }
}
// Restricts any filename reaching the filesystem to the backup naming shape,
// blocking path traversal (`..`, `/`) from the URL param in the download route.
const BACKUP_FILE_PATTERN = /^sparkyfitness_full_backup_[\w.-]+\.tar\.gz$/;
// Parses the timestamp out of the filename rather than trusting mtime, which
// resets if a backup is copied or moved elsewhere.
const BACKUP_TIMESTAMP_PATTERN =
  /^sparkyfitness_full_backup_(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.tar\.gz$/;

function parseBackupDate(fileName: string): Date | null {
  const match = fileName.match(BACKUP_TIMESTAMP_PATTERN);
  if (!match) {
    return null;
  }
  const [, year, month, day, hour, minute, second, ms] = match;
  const date = new Date(
    `${year}-${month}-${day}T${hour}:${minute}:${second}.${ms}Z`
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

interface BackupFileStats {
  fileName: string;
  size: number;
  createdAt: Date;
  completedAt: Date;
}

async function listBackups(backupDir: string): Promise<BackupFileStats[]> {
  let files: string[];
  try {
    files = await fsp.readdir(backupDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
  const backupFiles = files.filter((file) => BACKUP_FILE_PATTERN.test(file));

  const backupFilesWithStats = (
    await Promise.all(
      backupFiles.map(async (file) => {
        const filePath = path.join(backupDir, file);
        let stats;
        try {
          stats = await fsp.stat(filePath);
        } catch (error) {
          // Deleted since the readdir (a retention run alongside this one).
          if (isNotFound(error)) return null;
          throw error;
        }
        const createdAt = parseBackupDate(file) ?? stats.mtime;
        // The archive's mtime is the moment its last byte was written, i.e. when
        // the backup run finished.
        return {
          fileName: file,
          size: stats.size,
          createdAt,
          completedAt: stats.mtime,
        };
      })
    )
  ).filter((backup): backup is BackupFileStats => backup !== null);

  backupFilesWithStats.sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
  return backupFilesWithStats;
}

async function applyRetentionPolicy() {
  const settings = await backupSettingsRepository.getBackupSettings();
  const retentionDays = settings.retention_days;
  if (retentionDays <= 0) {
    log(
      'info',
      'Retention policy disabled or invalid days specified in settings.'
    );
    return;
  }
  log(
    'info',
    `Applying retention policy: keeping backups for ${retentionDays} days.`
  );
  const now = new Date();
  // Only finished archives match the pattern; runs in progress live in .tmp.
  // A file that vanished meanwhile was removed by a retention run alongside.
  const files = await fsp.readdir(BACKUP_DIR);
  for (const file of files) {
    if (BACKUP_FILE_PATTERN.test(file)) {
      const filePath = path.join(BACKUP_DIR, file);
      try {
        const stats = await fsp.stat(filePath);
        const fileAgeMs = now.getTime() - stats.mtime.getTime();
        const fileAgeDays = fileAgeMs / (1000 * 60 * 60 * 24);
        if (fileAgeDays > retentionDays) {
          log(
            'info',
            `Deleting old backup file: ${file} (age: ${fileAgeDays.toFixed(2)} days)`
          );
          await fsp.unlink(filePath);
        }
      } catch (error) {
        if (!isNotFound(error)) throw error;
      }
    }
  }
  log('info', 'Retention policy applied successfully.');
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function performRestore(backupFilePath: any) {
  // Also checked by the route before the upload; repeated here so no caller
  // starts a restore without it.
  await assertRestoreAllowed();
  log('info', `Starting restore process from ${backupFilePath}`);
  let tempRestoreDir; // Declare tempRestoreDir outside the try block
  try {
    // 1. Validate backup file
    await fsp.access(backupFilePath, fsp.constants.R_OK);
    log('info', `Backup file ${backupFilePath} is accessible.`);
    // 2. Create a temporary directory for extraction
    tempRestoreDir = path.join(BACKUP_DIR, `restore_temp_${Date.now()}`);
    await fsp.mkdir(tempRestoreDir, { recursive: true });
    log('info', `Created temporary restore directory: ${tempRestoreDir}`);
    // 3. Extract the combined archive
    log('info', `Extracting combined backup archive: ${backupFilePath}`);
    await executeCommand('tar', ['-xzf', backupFilePath, '-C', tempRestoreDir]);
    log('info', 'Combined backup archive extracted.');
    const extractedFiles = await fsp.readdir(tempRestoreDir);
    const dbDumpFile = extractedFiles.find(
      (f) => f.startsWith('sparkyfitness_db_backup_') && f.endsWith('.sql.gz')
    );
    const uploadsTarFile = extractedFiles.find(
      (f) =>
        f.startsWith('sparkyfitness_uploads_backup_') && f.endsWith('.tar.gz')
    );
    if (!dbDumpFile || !uploadsTarFile) {
      throw new Error(
        'Combined backup archive does not contain expected database dump or uploads tar file.'
      );
    }
    const extractedDbDumpPath = path.join(tempRestoreDir, dbDumpFile);
    const extractedUploadsTarPath = path.join(tempRestoreDir, uploadsTarFile);
    // 4. Wipe current database and uploads
    // Extracting a large archive takes a while; another instance may have
    // started meanwhile.
    await assertRestoreAllowed();
    log('warn', 'Wiping current database...');
    // End all connections in the pool
    await endPool();
    log('info', 'Closed database connection pool.');
    // Terminate all other connections to the database
    const terminateConnectionsCommand = `SELECT pg_terminate_backend(pg_stat_activity.pid) FROM pg_stat_activity WHERE pg_stat_activity.datname = '${process.env.SPARKY_FITNESS_DB_NAME}' AND pid <> pg_backend_pid();`;
    await executeCommand(
      'psql',
      [
        '-h',
        process.env.SPARKY_FITNESS_DB_HOST!,
        '-p',
        process.env.SPARKY_FITNESS_DB_PORT!,
        '-U',
        process.env.SPARKY_FITNESS_DB_USER!,
        '-d',
        'postgres',
        '-c',
        terminateConnectionsCommand,
      ],
      {
        env: {
          PGPASSWORD: process.env.SPARKY_FITNESS_DB_PASSWORD,
          ...process.env,
        },
      }
    );
    log('info', 'Terminated active database connections.');
    // Drop and recreate database to ensure a clean state
    const dbEnv = {
      PGPASSWORD: process.env.SPARKY_FITNESS_DB_PASSWORD,
      ...process.env,
    };
    const dbConnectionArgs = [
      '-h',
      process.env.SPARKY_FITNESS_DB_HOST!,
      '-p',
      process.env.SPARKY_FITNESS_DB_PORT!,
      '-U',
      process.env.SPARKY_FITNESS_DB_USER!,
      process.env.SPARKY_FITNESS_DB_NAME!,
    ];
    await executeCommand('dropdb', ['--if-exists', ...dbConnectionArgs], {
      env: dbEnv,
    });
    await executeCommand('createdb', dbConnectionArgs, { env: dbEnv });
    log('info', 'Database wiped and recreated.');
    // Reinitialize the pool after database recreation
    await resetPool();
    log('info', 'Reinitialized database connection pool.');
    // Reconfigure session middleware with the new pool
    // const { configureSessionMiddleware } = require('../SparkyFitnessServer');
    // configureSessionMiddleware(getRawOwnerPool());
    // log('info', 'Reconfigured session middleware with new database pool.');
    log('warn', `Wiping current uploads directory: ${UPLOADS_BASE_DIR}...`);
    await fsp.rm(UPLOADS_BASE_DIR, { recursive: true, force: true });
    await fsp.mkdir(UPLOADS_BASE_DIR, { recursive: true });
    log('info', 'Uploads directory wiped.');
    // 5. Restore database
    log('info', 'Restoring database from dump...');
    const psqlArgs = [
      '-h',
      process.env.SPARKY_FITNESS_DB_HOST,
      '-p',
      process.env.SPARKY_FITNESS_DB_PORT,
      '-U',
      process.env.SPARKY_FITNESS_DB_USER,
      '-d',
      process.env.SPARKY_FITNESS_DB_NAME,
    ];
    // @ts-expect-error TS(2769): No overload matches this call.
    const psql = spawn('psql', psqlArgs, { env: dbEnv });
    const gunzip = zlib.createGunzip();
    const input = fs.createReadStream(extractedDbDumpPath);
    // @ts-expect-error TS(2339): Property 'stdin' does not exist on type 'never'.
    await pipeline(input, gunzip, psql.stdin);
    await new Promise((resolve, reject) => {
      // @ts-expect-error TS(2339): Property 'on' does not exist on type 'never'.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      psql.on('close', (code: any) => {
        if (code === 0) {
          // @ts-expect-error TS(2794): Expected 1 arguments, but got 0. Did you forget to... Remove this comment to see the full error message
          resolve();
        } else {
          reject(new Error(`psql process exited with code ${code}`));
        }
      });
      // @ts-expect-error TS(2339): Property 'on' does not exist on type 'never'.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      psql.on('error', (err: any) => reject(err));
    });
    log('info', 'Database restored successfully.');
    // 6. Restore uploads
    log('info', 'Restoring uploads folder...');
    await executeCommand('tar', [
      '-xzf',
      extractedUploadsTarPath,
      '-C',
      UPLOADS_BASE_DIR,
    ]);
    log('info', 'Uploads folder restored successfully.');
    // 7. Clean up temporary directory
    log('info', `Cleaning up temporary restore directory: ${tempRestoreDir}`);
    await fsp.rm(tempRestoreDir, { recursive: true, force: true });
    log('info', 'Temporary restore directory removed.');
    return { success: true };
  } catch (error) {
    log('error', 'Restore failed:', error);
    // Attempt to clean up temp directory even if restore fails
    if (tempRestoreDir) {
      try {
        log(
          'info',
          `Attempting to clean up temporary restore directory ${tempRestoreDir} after failure.`
        );
        await fsp.rm(tempRestoreDir, { recursive: true, force: true });
        log(
          'info',
          `Temporary restore directory ${tempRestoreDir} cleaned up successfully after failure.`
        );
      } catch (cleanupError) {
        log(
          'error',
          `Failed to clean up temporary restore directory ${tempRestoreDir}:`,
          cleanupError
        );
      }
    }
    if (error instanceof RestoreRefusedError) throw error;
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    return { success: false, error: error.message };
  }
}
export { performBackup };
export { applyRetentionPolicy };
export { performRestore };
export { ensureBackupDirectory };
export { executeCommand };
export { BACKUP_DIR };
export { UPLOADS_BASE_DIR };
export { BACKUP_FILE_PATTERN };
export { BACKUP_TEMP_DIR };
export { STALE_WORK_DIR_AGE_MS };
export { listBackups };
export type { BackupFileStats };
export default {
  performBackup,
  applyRetentionPolicy,
  performRestore,
  ensureBackupDirectory,
  executeCommand,
  BACKUP_DIR,
  UPLOADS_BASE_DIR,
  BACKUP_FILE_PATTERN,
  listBackups,
};
