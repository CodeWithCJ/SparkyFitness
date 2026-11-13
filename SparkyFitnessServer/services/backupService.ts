import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { promises } from 'fs';
import zlib from 'zlib';
import { pipeline } from 'stream/promises';
import { randomBytes } from 'crypto';
import { StringDecoder } from 'string_decoder';
import { log } from '../config/logging.js';
import backupSettingsRepository from '../models/backupSettingsRepository.js';
import pg from 'pg';
import { resetPool } from '../db/poolManager.js';
import type { PoolClient } from 'pg';
import { applyMigrations } from '../utils/dbMigrations.js';
import { applyRlsPolicies } from '../utils/applyRlsPolicies.js';
import {
  liveDatabaseId,
  openOwnerClient,
  RESTORE_FENCE_MS,
  restoreInProgress,
  restoreLockKey,
  markRestoreRunning,
} from './restoreLock.js';
import { UPLOAD_STAGING_DIR } from '../utils/uploadsPath.js';
import { describeError } from '../utils/errors.js';
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
  if (await restoreInProgress()) {
    log('warn', 'A backup is being restored; this backup was skipped.');
    return {
      success: false,
      error: 'A backup is being restored; try again once it has finished.',
    };
  }
  const startedOn = liveDatabaseId();
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
    // A restore meanwhile would leave this archive with the old database and
    // the restored uploads.
    if ((await restoreInProgress()) || liveDatabaseId() !== startedOn) {
      throw new Error(
        'A backup was restored while this backup ran, so it was discarded.'
      );
    }
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
class RestoreInProgressError extends Error {}

// PostgreSQL silently truncates longer names, which could land on another
// database's name.
const MAX_DATABASE_NAME_BYTES = 63;

function databaseName(dbName: string, suffix: string): string {
  const name = `${dbName}_${suffix}`;
  if (Buffer.byteLength(name) > MAX_DATABASE_NAME_BYTES) {
    throw new Error(
      `Database name ${dbName} is too long to restore beside: ${name} exceeds ${MAX_DATABASE_NAME_BYTES} bytes.`
    );
  }
  return name;
}

/**
 * e.g. 20261031_201500 (UTC): digits only, so the kept database's name needs
 * no quoting when an operator drops or renames it.
 */
const restoreStamp = () =>
  new Date()
    .toISOString()
    .replace(/\.\d+Z$/, '')
    .replace(/[-:]/g, '')
    .replace('T', '_');

/**
 * The swap ends every session on the live database, which takes the right to
 * signal each role connected there. Checked before anything is loaded, so a
 * restore that could not finish never starts.
 */
async function assertCanEndSessions(client: pg.Client, dbName: string) {
  // pg_signal_backend does not reach a superuser's sessions; only a superuser
  // can end those.
  const { rows } = await client.query<{ role: string; superuser: boolean }>(
    `SELECT role, r.rolsuper AS superuser FROM (
       SELECT usename::text AS role FROM pg_stat_activity
        WHERE datname = $1 AND usename IS NOT NULL
       UNION SELECT $2::text WHERE $2::text IS NOT NULL
     ) roles
     JOIN pg_roles r ON r.rolname = role
     WHERE NOT (SELECT rolsuper FROM pg_roles WHERE rolname = current_user)
       AND (r.rolsuper
            OR (NOT pg_has_role(current_user, 'pg_signal_backend', 'USAGE')
                AND NOT pg_has_role(current_user, role, 'USAGE')))`,
    [dbName, process.env.SPARKY_FITNESS_APP_DB_USER ?? null]
  );
  const owner = process.env.SPARKY_FITNESS_DB_USER;
  const superusers = rows.filter((r) => r.superuser).map((r) => r.role);
  if (superusers.length > 0) {
    throw new Error(
      `Superuser ${superusers.join(', ')} has a session open on ${dbName} (for example psql or pgAdmin), which the database user ${owner} cannot end. Close it, then restore again. Nothing was changed.`
    );
  }
  if (rows.length > 0) {
    throw new Error(
      `The database user ${owner} cannot end sessions of ${rows.map((r) => r.role).join(', ')}, which a restore must do to swap the restored database in. Run GRANT pg_signal_backend TO "${owner}" as a superuser, then restore again. Nothing was changed.`
    );
  }
}

/**
 * Statements an older install's backup can hold that only a superuser may
 * run, and that a restore does without: the database it loads into already
 * has its own public schema, and pg_stat_statements only collects query
 * statistics.
 */
const SUPERUSER_ONLY_STATEMENTS = [
  /^COMMENT ON SCHEMA public IS /,
  /^CREATE EXTENSION IF NOT EXISTS pg_stat_statements /,
  /^COMMENT ON EXTENSION pg_stat_statements IS /,
];

/** "Name" or name, as PostgreSQL resolves it. */
function roleName(identifier: string): string {
  const name = identifier.trim();
  return name.startsWith('"')
    ? name.slice(1, -1).replaceAll('""', '"')
    : name.toLowerCase();
}

/** The roles a GRANT, REVOKE or ALTER DEFAULT PRIVILEGES line names. */
function rolesNamed(line: string): { actors: string[]; grantees: string[] } {
  const role = '("(?:[^"]|"")+"|[^\\s,;]+)';
  const actors = [
    line.match(new RegExp(`\\bFOR ROLE ${role}`)),
    line.match(new RegExp(`\\sGRANTED BY ${role};$`)),
  ].flatMap((match) => (match ? [roleName(match[1]!)] : []));
  const granteeList = line.match(
    /^.*\s(?:TO|FROM)\s+(.+?)(?:\s+WITH GRANT OPTION)?(?:\s+GRANTED BY\s+.+)?;$/
  );
  const grantees = (granteeList?.[1]?.split(',') ?? [])
    .map(roleName)
    .filter((name) => name !== 'public');
  return { actors, grantees };
}

/** Role names on this install, and those the restoring user can act as. */
interface InstallRoles {
  existing: ReadonlySet<string>;
  actAs: ReadonlySet<string>;
}

/**
 * Drops the statements of a plain dump this install cannot run, never
 * touching COPY data: ownership (every object stays with the owner running
 * the restore, as pg_dump --no-owner would leave it), grants and revokes
 * naming a role that does not exist here (a backup from an install with other
 * role names; the migrations run afterwards grant the app role) or acting for
 * a role the restoring user cannot act as (a backup taken as postgres,
 * restored by an owner that is not a superuser), and the superuser-only
 * statements above. The old restore ran on past their errors.
 */
function skipStatementsThisInstallCannotRun(roles: InstallRoles) {
  const unrunnable = (line: string) => {
    const { actors, grantees } = rolesNamed(line);
    return (
      actors.some((role) => !roles.actAs.has(role)) ||
      grantees.some((role) => !roles.existing.has(role))
    );
  };
  const skipped = (line: string) =>
    /^ALTER .* OWNER TO /.test(line) ||
    SUPERUSER_ONLY_STATEMENTS.some((pattern) => pattern.test(line)) ||
    (/^(?:GRANT|REVOKE|ALTER DEFAULT PRIVILEGES) /.test(line) &&
      unrunnable(line));
  return async function* (source: AsyncIterable<Buffer>) {
    const decoder = new StringDecoder('utf8');
    let partial = '';
    let inCopy = false;
    const keep = (line: string) => {
      if (inCopy) {
        if (line === '\\.') inCopy = false;
        return true;
      }
      if (line.startsWith('COPY ') && line.endsWith(' FROM stdin;')) {
        inCopy = true;
      }
      return !skipped(line);
    };
    for await (const chunk of source) {
      const lines = (partial + decoder.write(chunk)).split('\n');
      partial = lines.pop()!;
      const kept = lines.filter(keep);
      if (kept.length > 0) yield kept.join('\n') + '\n';
    }
    const last = partial + decoder.end();
    if (last && keep(last)) yield last;
  };
}

async function loadDump(
  dumpPath: string,
  database: string,
  roles: InstallRoles
) {
  const psql = spawn(
    'psql',
    [
      '-h',
      process.env.SPARKY_FITNESS_DB_HOST!,
      '-p',
      process.env.SPARKY_FITNESS_DB_PORT!,
      '-U',
      process.env.SPARKY_FITNESS_DB_USER!,
      '-d',
      database,
      // Without it psql skips a failing statement and exits 0, and a partly
      // loaded copy would replace the live database.
      '-v',
      'ON_ERROR_STOP=1',
    ],
    {
      env: {
        PGPASSWORD: process.env.SPARKY_FITNESS_DB_PASSWORD,
        ...process.env,
      },
      stdio: ['pipe', 'ignore', 'inherit'],
    }
  );
  const exited = new Promise<void>((resolve, reject) => {
    psql.on('close', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`psql process exited with code ${code}`))
    );
    psql.on('error', reject);
  });
  await Promise.all([
    pipeline(
      fs.createReadStream(dumpPath),
      zlib.createGunzip(),
      skipStatementsThisInstallCannotRun(roles),
      psql.stdin
    ),
    exited,
  ]);
}

/**
 * Brings the restored copy to this version's schema and policies the way a
 * boot does, so a backup from an older release serves at once, and so a
 * migration that fails on it fails before the swap.
 */
async function upgradeRestoredDatabase(database: string) {
  const client = await openOwnerClient(database);
  try {
    // Both only query through the client they are given.
    await applyMigrations(client as unknown as PoolClient);
    await applyRlsPolicies(client as unknown as PoolClient);
  } finally {
    await client.end().catch(() => {});
  }
}

const SESSION_END_TIMEOUT_MS = 15_000;

/**
 * Swaps the restored database in under the live name and keeps the live one
 * as `retired`. New sessions are refused first and the live ones ended, since
 * a database with sessions cannot be renamed; both renames then commit
 * together, so the live name is never missing and a failure leaves it as it
 * was.
 */
async function swapDatabases(
  client: pg.Client,
  dbName: string,
  restoredDb: string,
  retiredDb: string
) {
  const live = client.escapeIdentifier(dbName);
  await client.query(`ALTER DATABASE ${live} WITH ALLOW_CONNECTIONS false`);
  try {
    const deadline = Date.now() + SESSION_END_TIMEOUT_MS;
    for (;;) {
      const { rows } = await client.query<{ sessions: number }>(
        // Autovacuum workers have no role, and only a superuser may end them
        // before PostgreSQL 18; the rename below stops them itself.
        `SELECT count(pg_terminate_backend(pid))::int AS sessions
           FROM pg_stat_activity WHERE datname = $1 AND usename IS NOT NULL`,
        [dbName]
      );
      if (rows[0]!.sessions === 0) break;
      if (Date.now() > deadline) {
        throw new Error(
          `${rows[0]!.sessions} sessions on ${dbName} did not end within ${SESSION_END_TIMEOUT_MS / 1000} s.`
        );
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    await client.query('BEGIN');
    try {
      await client.query(
        `ALTER DATABASE ${live} RENAME TO ${client.escapeIdentifier(retiredDb)}`
      );
      await client.query(
        `ALTER DATABASE ${client.escapeIdentifier(restoredDb)} RENAME TO ${live}`
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    }
  } catch (error) {
    await client
      .query(`ALTER DATABASE ${live} WITH ALLOW_CONNECTIONS true`)
      .catch((reopenError) =>
        log('error', `Failed to reopen ${dbName} to connections:`, reopenError)
      );
    throw error;
  }
}

// Restore staging lives under the request staging directory: the same
// filesystem as the uploads, so the swap is a rename, and skipped by backups.
const UPLOADS_STAGING_PREFIX = 'restore-';
const uploadsStagingRoot = () =>
  path.join(UPLOADS_BASE_DIR, UPLOAD_STAGING_DIR);

/**
 * Drops the staging databases of restores whose process died during the load.
 * None can be in use: each belongs to a restore that held the lock this one
 * now holds.
 */
async function dropStaleStagingDatabases(client: pg.Client, dbName: string) {
  const prefix = `${dbName}_restore_`;
  const { rows } = await client.query<{ datname: string }>(
    `SELECT datname FROM pg_database
      WHERE left(datname, length($1)) = $1
        AND substr(datname, length($1) + 1) ~ '^[0-9a-f]{12}$'`,
    [prefix]
  );
  for (const { datname } of rows) {
    log('warn', `Dropping ${datname}, left by an interrupted restore.`);
    await client.query(
      `DROP DATABASE IF EXISTS ${client.escapeIdentifier(datname)} WITH (FORCE)`
    );
  }
}

async function removeStaleUploadStaging() {
  let entries: string[];
  try {
    entries = await fsp.readdir(uploadsStagingRoot());
  } catch (error) {
    if (isNotFound(error)) return;
    throw error;
  }
  for (const entry of entries) {
    if (entry.startsWith(UPLOADS_STAGING_PREFIX)) {
      await fsp.rm(path.join(uploadsStagingRoot(), entry), {
        recursive: true,
        force: true,
      });
    }
  }
}

/**
 * Moves the current uploads into `retired` and the restored ones into place,
 * entry by entry, leaving request staging alone.
 */
async function swapUploads(staged: string, retired: string) {
  await fsp.mkdir(retired, { recursive: true });
  const retire = async (entry: string) =>
    fsp.rename(
      path.join(UPLOADS_BASE_DIR, entry),
      path.join(retired, `${entry}-${randomBytes(4).toString('hex')}`)
    );
  for (const entry of await fsp.readdir(UPLOADS_BASE_DIR)) {
    if (entry !== UPLOAD_STAGING_DIR) await retire(entry);
  }
  for (const entry of await fsp.readdir(staged)) {
    // A request staging directory in the archive is never restored.
    if (entry === UPLOAD_STAGING_DIR) continue;
    const target = path.join(UPLOADS_BASE_DIR, entry);
    try {
      await fsp.rename(path.join(staged, entry), target);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST' && code !== 'ENOTEMPTY') throw error;
      await retire(entry);
      await fsp.rename(path.join(staged, entry), target);
    }
  }
  await fsp.rm(staged, { recursive: true, force: true });
}

/**
 * Restores a combined backup while the server keeps serving reads:
 * - one restore at a time, under a session-level advisory lock in the
 *   maintenance database (freed if this process dies); while it is held every
 *   instance refuses writes (middleware/restoreWriteFence.ts), since anything
 *   written now would be replaced;
 * - the database loads into a new database and the uploads into a staging
 *   folder, and the copy is upgraded to this version; a failure up to here
 *   leaves the live data untouched;
 * - the restored database is swapped in by rename, the live one kept as
 *   `<db>_pre_restore_<stamp>` and the current uploads as
 *   `uploads/_staging/pre-restore-<stamp>`, for an operator to roll back to or
 *   delete.
 * Throws RestoreInProgressError when another restore holds the lock.
 */
async function performRestore(backupFilePath: string) {
  log('info', `Starting restore process from ${backupFilePath}`);
  const dbName = process.env.SPARKY_FITNESS_DB_NAME!;
  const client = await openOwnerClient();
  try {
    const { rows } = await client.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked',
      [restoreLockKey(dbName)]
    );
    if (!rows[0]!.locked) {
      throw new RestoreInProgressError(
        'Another restore is already running; try again once it has finished.'
      );
    }
    // Instances trust their last look at the lock for RESTORE_FENCE_MS.
    const fenced = Date.now() + 2 * RESTORE_FENCE_MS;
    return await restoreHoldingLock(client, backupFilePath, dbName, fenced);
  } finally {
    await client.end().catch(() => {});
  }
}

async function restoreHoldingLock(
  client: pg.Client,
  backupFilePath: string,
  dbName: string,
  fenced: number
) {
  let tempRestoreDir: string | undefined;
  let stagingDb: string | undefined;
  let uploadsStaging: string | undefined;
  let endRestoreMark: (() => void) | undefined;
  try {
    await fsp.access(backupFilePath, fsp.constants.R_OK);
    await assertCanEndSessions(client, dbName);
    await dropStaleStagingDatabases(client, dbName);
    tempRestoreDir = path.join(BACKUP_DIR, `restore_temp_${Date.now()}`);
    await fsp.mkdir(tempRestoreDir, { recursive: true });
    log('info', `Extracting combined backup archive: ${backupFilePath}`);
    await executeCommand('tar', ['-xzf', backupFilePath, '-C', tempRestoreDir]);
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
    // A name no other database has: the staging database is dropped on
    // failure, so it must be one this restore created.
    stagingDb = databaseName(
      dbName,
      `restore_${randomBytes(6).toString('hex')}`
    );
    const stamp = restoreStamp();
    const retiredDb = databaseName(dbName, `pre_restore_${stamp}`);
    await client.query(`CREATE DATABASE ${client.escapeIdentifier(stagingDb)}`);
    log('info', `Loading the backup into ${stagingDb}...`);
    const { rows: roleRows } = await client.query<{
      rolname: string;
      act_as: boolean;
    }>(
      `SELECT rolname, pg_has_role(current_user, oid, 'MEMBER') AS act_as
         FROM pg_roles`
    );
    await loadDump(path.join(tempRestoreDir, dbDumpFile), stagingDb, {
      existing: new Set(roleRows.map((row) => row.rolname)),
      actAs: new Set(
        roleRows.filter((row) => row.act_as).map((row) => row.rolname)
      ),
    });
    await upgradeRestoredDatabase(stagingDb);
    await removeStaleUploadStaging();
    uploadsStaging = path.join(
      uploadsStagingRoot(),
      `${UPLOADS_STAGING_PREFIX}${randomBytes(6).toString('hex')}`
    );
    await fsp.mkdir(uploadsStaging, { recursive: true });
    await executeCommand('tar', [
      '-xzf',
      path.join(tempRestoreDir, uploadsTarFile),
      '-C',
      uploadsStaging,
    ]);
    const unfenced = fenced - Date.now();
    if (unfenced > 0) await new Promise((r) => setTimeout(r, unfenced));
    // Out of the restore- prefix before the database swap: if this process
    // dies before the uploads are moved, a later restore's cleanup must not
    // delete the uploads of a database already swapped in.
    const promoted = path.join(uploadsStagingRoot(), `restored-${stamp}`);
    await fsp.rename(uploadsStaging, promoted);
    uploadsStaging = promoted;
    log('warn', `Swapping the restored database in as ${dbName}...`);
    endRestoreMark = markRestoreRunning();
    await swapDatabases(client, dbName, stagingDb, retiredDb);
    stagingDb = undefined;
    log('info', `Database replaced; the previous one is kept as ${retiredDb}.`);
    const staged = uploadsStaging;
    // Past the database swap, a failure leaves the staged uploads for an
    // operator instead of removing them.
    uploadsStaging = undefined;
    const retiredUploads = path.join(
      uploadsStagingRoot(),
      `pre-restore-${stamp}`
    );
    try {
      // Clients this instance pooled were ended with the old database's
      // sessions.
      await resetPool();
    } catch (error) {
      throw new Error(
        `The database was restored, but resetting the connection pools failed, so the uploads were not moved. The restored uploads are in ${staged}; the previous ones are still in place.`,
        { cause: error }
      );
    }
    try {
      await swapUploads(staged, retiredUploads);
    } catch (error) {
      throw new Error(
        `The database was restored, but moving the uploads failed. The restored uploads are in ${staged}, the previous ones in ${retiredUploads}.`,
        { cause: error }
      );
    }
    log(
      'info',
      `Uploads replaced; the previous ones are kept in ${retiredUploads}.`
    );
    return { success: true };
  } catch (error) {
    log('error', 'Restore failed:', error);
    if (stagingDb) {
      const name = stagingDb;
      await client
        .query(
          `DROP DATABASE IF EXISTS ${client.escapeIdentifier(name)} WITH (FORCE)`
        )
        .catch((cleanupError) =>
          log('error', `Failed to drop staging database ${name}:`, cleanupError)
        );
    }
    if (uploadsStaging) {
      await fsp
        .rm(uploadsStaging, { recursive: true, force: true })
        .catch((cleanupError) =>
          log('error', `Failed to remove ${uploadsStaging}:`, cleanupError)
        );
    }
    return { success: false, error: describeError(error) };
  } finally {
    endRestoreMark?.();
    if (tempRestoreDir) {
      await fsp
        .rm(tempRestoreDir, { recursive: true, force: true })
        .catch((cleanupError) =>
          log('error', `Failed to remove ${tempRestoreDir}:`, cleanupError)
        );
    }
  }
}

export { performBackup };
export { applyRetentionPolicy };
export {
  performRestore,
  RestoreInProgressError,
  skipStatementsThisInstallCannotRun,
};
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
