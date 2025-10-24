const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const fsp = require('fs').promises; // Use fsp for promise-based fs operations
const zlib = require('zlib');
const { pipeline } = require('stream/promises');
const { log } = require('../config/logging');
const { getRawOwnerPool, endPool, resetPool } = require('../db/poolManager');
const backupSettingsRepository = require('../models/backupSettingsRepository');
const { configureSessionMiddleware } = require('../SparkyFitnessServer'); // Import the session configuration function

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '../backup');
const UPLOADS_BASE_DIR = path.join(__dirname, '../uploads');

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

async function executeCommand(command, options = {}) {
  return new Promise((resolve, reject) => {
    exec(command, { ...options, env: { ...process.env, ...options.env } }, (error, stdout, stderr) => {
      if (error) {
        log('error', `Command failed: ${command}`, error);
        log('error', `Stderr: ${stderr}`);
        return reject(new Error(`Command failed: ${command}\n${stderr}`));
      }
      if (stderr) {
        log('warn', `Command stderr: ${stderr}`);
      }
      log('info', `Command successful: ${command}`);
      log('debug', `Stdout: ${stdout}`);
      resolve(stdout);
    });
  });
}

async function performBackup(isManual = false) {
  await ensureBackupDirectory();


  const settings = await backupSettingsRepository.getBackupSettings();
  if (!isManual && !settings.backup_enabled) {
    log('info', 'Automated backup is disabled. Skipping backup.');
    return { success: true, message: 'Automated backup is disabled.' };
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dbBackupFileName = `sparkyfitness_db_backup_${timestamp}.sql.gz`;
  const uploadsBackupFileName = `sparkyfitness_uploads_backup_${timestamp}.tar.gz`;
  const fullBackupFileName = `sparkyfitness_full_backup_${timestamp}.tar.gz`;

  const dbBackupPath = path.join(BACKUP_DIR, dbBackupFileName);
  const uploadsBackupPath = path.join(BACKUP_DIR, uploadsBackupFileName);
  const fullBackupPath = path.join(BACKUP_DIR, fullBackupFileName);

  try {
    log('info', 'Starting database backup...');
    const pgDumpArgs = [
      '-h', process.env.SPARKY_FITNESS_DB_HOST,
      '-p', process.env.SPARKY_FITNESS_DB_PORT,
      '-U', process.env.SPARKY_FITNESS_DB_USER,
      '-d', process.env.SPARKY_FITNESS_DB_NAME,
    ];
    const pgDump = spawn('pg_dump', pgDumpArgs, {
      env: { PGPASSWORD: process.env.SPARKY_FITNESS_DB_PASSWORD, ...process.env },
    });
    const gzip = zlib.createGzip();
    const output = fs.createWriteStream(dbBackupPath);

    await Promise.all([
      pipeline(pgDump.stdout, gzip, output),
      new Promise((resolve, reject) => {
        pgDump.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`pg_dump process exited with code ${code}`));
          }
        });
        pgDump.on('error', (err) => reject(err));
      })]);

    log('info', `Database backup created: ${dbBackupPath}`);

    log('info', 'Starting uploads folder backup...');
    const tarCommand = `tar -czf ${uploadsBackupPath} -C ${UPLOADS_BASE_DIR} .`;
    await executeCommand(tarCommand);
    log('info', `Uploads folder backup created: ${uploadsBackupPath}`);

    log('info', 'Combining backups into a single archive...');
    const combineCommand = `tar -czf ${fullBackupPath} -C ${BACKUP_DIR} ${dbBackupFileName} ${uploadsBackupFileName}`;
    await executeCommand(combineCommand);
    log('info', `Combined backup created: ${fullBackupPath}`);

    log('info', 'Cleaning up individual backup files...');
    await fsp.unlink(dbBackupPath);
    await fsp.unlink(uploadsBackupPath);
    log('info', 'Individual backup files removed.');

    await backupSettingsRepository.updateLastBackupStatus('success', new Date());
    return { success: true, message: 'Backup completed successfully.', path: fullBackupPath, fileName: fullBackupFileName };
  } catch (error) {
    log('error', 'Backup failed:', error);
    await backupSettingsRepository.updateLastBackupStatus('failed', new Date());
    return { success: false, error: error.message };
  }
}

async function applyRetentionPolicy() {
  const settings = await backupSettingsRepository.getBackupSettings();
  const retentionDays = settings.retention_days;

  if (retentionDays <= 0) {
    log('info', 'Retention policy disabled or invalid days specified in settings.');
    return;
  }

  log('info', `Applying retention policy: keeping backups for ${retentionDays} days.`);
  const now = new Date();
  const files = await fsp.readdir(BACKUP_DIR);

  for (const file of files) {
    if (file.startsWith('sparkyfitness_full_backup_') && file.endsWith('.tar.gz')) {
      const filePath = path.join(BACKUP_DIR, file);
      const stats = await fsp.stat(filePath);
      const fileAgeMs = now.getTime() - stats.mtime.getTime();
      const fileAgeDays = fileAgeMs / (1000 * 60 * 60 * 24);

      if (fileAgeDays > retentionDays) {
        log('info', `Deleting old backup file: ${file} (age: ${fileAgeDays.toFixed(2)} days)`);
        await fsp.unlink(filePath);
      }
    }
  }
  log('info', 'Retention policy applied successfully.');
}

async function performRestore(backupFilePath) {
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
    await executeCommand(`tar -xzf ${backupFilePath} -C ${tempRestoreDir}`);
    log('info', 'Combined backup archive extracted.');

    const extractedFiles = await fsp.readdir(tempRestoreDir);
    const dbDumpFile = extractedFiles.find(f => f.startsWith('sparkyfitness_db_backup_') && f.endsWith('.sql.gz'));
    const uploadsTarFile = extractedFiles.find(f => f.startsWith('sparkyfitness_uploads_backup_') && f.endsWith('.tar.gz'));

    if (!dbDumpFile || !uploadsTarFile) {
      throw new Error('Combined backup archive does not contain expected database dump or uploads tar file.');
    }

    const extractedDbDumpPath = path.join(tempRestoreDir, dbDumpFile);
    const extractedUploadsTarPath = path.join(tempRestoreDir, uploadsTarFile);

    // 4. Wipe current database and uploads
    log('warn', 'Wiping current database...');
    // End all connections in the pool
    await endPool();
    log('info', 'Closed database connection pool.');

    // Terminate all other connections to the database
    const terminateConnectionsCommand = `SELECT pg_terminate_backend(pg_stat_activity.pid) FROM pg_stat_activity WHERE pg_stat_activity.datname = '${process.env.SPARKY_FITNESS_DB_NAME}' AND pid <> pg_backend_pid();`;
    await executeCommand(`psql -h ${process.env.SPARKY_FITNESS_DB_HOST} -p ${process.env.SPARKY_FITNESS_DB_PORT} -U ${process.env.SPARKY_FITNESS_DB_USER} -d postgres -c "${terminateConnectionsCommand}"`, { env: { PGPASSWORD: process.env.SPARKY_FITNESS_DB_PASSWORD, ...process.env } });
    log('info', 'Terminated active database connections.');

    // Drop and recreate database to ensure a clean state
    const dbEnv = { PGPASSWORD: process.env.SPARKY_FITNESS_DB_PASSWORD, ...process.env };
    const dropDbCommand = `dropdb -h ${process.env.SPARKY_FITNESS_DB_HOST} -p ${process.env.SPARKY_FITNESS_DB_PORT} -U ${process.env.SPARKY_FITNESS_DB_USER} ${process.env.SPARKY_FITNESS_DB_NAME}`;
    const createDbCommand = `createdb -h ${process.env.SPARKY_FITNESS_DB_HOST} -p ${process.env.SPARKY_FITNESS_DB_PORT} -U ${process.env.SPARKY_FITNESS_DB_USER} ${process.env.SPARKY_FITNESS_DB_NAME}`;
    await executeCommand(dropDbCommand, { env: dbEnv });
    await executeCommand(createDbCommand, { env: dbEnv });
    log('info', 'Database wiped and recreated.');

    // Reinitialize the pool after database recreation
    await resetPool();
    log('info', 'Reinitialized database connection pool.');

    // Reconfigure session middleware with the new pool
    const { configureSessionMiddleware } = require('../SparkyFitnessServer');
    configureSessionMiddleware(getRawOwnerPool());
    log('info', 'Reconfigured session middleware with new database pool.');

    log('warn', `Wiping current uploads directory: ${UPLOADS_BASE_DIR}...`);
    await fsp.rm(UPLOADS_BASE_DIR, { recursive: true, force: true });
    await fsp.mkdir(UPLOADS_BASE_DIR, { recursive: true });
    log('info', 'Uploads directory wiped.');

    // 5. Restore database
    log('info', 'Restoring database from dump...');
    const psqlArgs = [
      '-h', process.env.SPARKY_FITNESS_DB_HOST,
      '-p', process.env.SPARKY_FITNESS_DB_PORT,
      '-U', process.env.SPARKY_FITNESS_DB_USER,
      '-d', process.env.SPARKY_FITNESS_DB_NAME,
    ];
    const psql = spawn('psql', psqlArgs, { env: dbEnv });
    const gunzip = zlib.createGunzip();
    const input = fs.createReadStream(extractedDbDumpPath);

    await pipeline(input, gunzip, psql.stdin);

    await new Promise((resolve, reject) => {
      psql.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`psql process exited with code ${code}`));
        }
      });
      psql.on('error', (err) => reject(err));
    });
    log('info', 'Database restored successfully.');

    // 6. Restore uploads
    log('info', 'Restoring uploads folder...');
    await executeCommand(`tar -xzf ${extractedUploadsTarPath} -C ${UPLOADS_BASE_DIR}`);
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
        log('info', `Attempting to clean up temporary restore directory ${tempRestoreDir} after failure.`);
        await fsp.rm(tempRestoreDir, { recursive: true, force: true });
        log('info', `Temporary restore directory ${tempRestoreDir} cleaned up successfully after failure.`);
      } catch (cleanupError) {
        log('error', `Failed to clean up temporary restore directory ${tempRestoreDir}:`, cleanupError);
      }
    }
    return { success: false, error: error.message };
  }
}

module.exports = {
  performBackup,
  applyRetentionPolicy,
  performRestore,
  ensureBackupDirectory,
  BACKUP_DIR,
  UPLOADS_BASE_DIR,
};