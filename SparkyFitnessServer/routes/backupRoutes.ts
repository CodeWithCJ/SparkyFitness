import express from 'express';
import { z } from 'zod';
import { log } from '../config/logging.js';
import {
  performBackup,
  performRestore,
  BACKUP_DIR,
} from '../services/backupService.js';
import { rescheduleBackups } from '../services/backupScheduler.js';
import { authenticate, isAdmin } from '../middleware/authMiddleware.js';
import backupSettingsRepository from '../models/backupSettingsRepository.js';
import { requireServerBackupsEnabled } from '../middleware/deploymentModeMiddleware.js';
import { areServerBackupsEnabled } from '../utils/runtimeConfig.js';

const backupSettingsBodySchema = z.object({
  backupEnabled: z.boolean(),
  backupDays: z.array(
    z.enum([
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ])
  ),
  backupTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  retentionDays: z.number().int().positive(),
});
// @ts-expect-error TS(7016): Could not find a declaration file for module 'mult... Remove this comment to see the full error message
import multer from 'multer';
import os from 'os';
import path from 'path';
import { promises } from 'fs';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const fs = { promises }.promises;
// Temporary directory for uploaded backup files. Resolved from an env var so
// the path can live on writable storage (the application directory may be
// read-only, e.g. when installed into the Nix store).
const useRuntimeTempDirectory =
  process.env.VERCEL === '1' || !areServerBackupsEnabled();
const TEMP_UPLOAD_DIR = process.env.SPARKY_FITNESS_CUSTOM_TEMP_DIRECTORY
  ? path.resolve(process.env.SPARKY_FITNESS_CUSTOM_TEMP_DIRECTORY)
  : useRuntimeTempDirectory
    ? path.join(os.tmpdir(), 'sparkyfitness-temp-uploads')
    : path.join(__dirname, '../temp_uploads/');
// Configure multer for file uploads (for restore)
const upload = multer({
  dest: TEMP_UPLOAD_DIR,
  limits: { fileSize: 1024 * 1024 * 500 }, // 500 MB limit, adjust as needed
});
// Ensure temporary upload directory exists
async function ensureTempUploadDirectory() {
  const tempUploadDir = TEMP_UPLOAD_DIR;
  try {
    await fs.mkdir(tempUploadDir, { recursive: true });
    log('info', `Ensured temporary upload directory exists: ${tempUploadDir}`);
  } catch (error) {
    log(
      'error',
      `Failed to create temporary upload directory ${tempUploadDir}:`,
      error
    );
    throw error;
  }
}
if (areServerBackupsEnabled()) {
  ensureTempUploadDirectory(); // Call once on startup
}
/**
 * @swagger
 * tags:
 *   name: System & Admin
 *   description: System configuration, administrative tasks, backups, and audits.
 */
/**
 * @swagger
 * /admin/backup/manual:
 *   post:
 *     summary: Trigger a manual backup
 *     tags: [System & Admin]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Backup completed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 path:
 *                   type: string
 *                 fileName:
 *                   type: string
 *       500:
 *         description: Server error during backup.
 */
router.post(
  '/manual',
  authenticate,
  isAdmin,
  requireServerBackupsEnabled,
  async (req, res) => {
    log('info', 'Manual backup initiated by admin.');
    try {
      const result = await performBackup(true); // Pass true for manual backup
      if (result.success) {
        res.status(200).json({
          message: result.message || 'Backup completed successfully.',
          path: result.path,
          fileName: result.fileName,
        });
      } else {
        const errorMessage = result.error
          ? result.error.message || result.error
          : 'Unknown backup error.';
        res
          .status(500)
          .json({ message: 'Backup failed.', error: errorMessage });
      }
    } catch (error) {
      log('error', 'Error during manual backup:', error);
      const errorMessage = error
        ? // @ts-expect-error TS(2571): Object is of type 'unknown'.
          error.message || error
        : 'Unknown internal server error.';
      res.status(500).json({
        message: 'Internal server error during backup.',
        error: errorMessage,
      });
    }
  }
);
/**
 * @swagger
 * /admin/backup/restore:
 *   post:
 *     summary: Upload and restore a backup
 *     tags: [System & Admin]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               backupFile:
 *                 type: string
 *                 format: binary
 *                 description: The backup file to upload.
 *     responses:
 *       200:
 *         description: Restore completed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: No backup file uploaded.
 *       500:
 *         description: Server error during restore.
 */
router.post(
  '/restore',
  authenticate,
  isAdmin,
  requireServerBackupsEnabled,
  upload.single('backupFile'),
  async (req, res) => {
    log('info', 'Restore initiated by admin.');
    // @ts-expect-error TS(2339): Property 'file' does not exist on type 'Request<{}... Remove this comment to see the full error message
    if (!req.file) {
      return res.status(400).json({ message: 'No backup file uploaded.' });
    }
    // @ts-expect-error TS(2339): Property 'file' does not exist on type 'Request<{}... Remove this comment to see the full error message
    const uploadedFilePath = req.file.path;
    // @ts-expect-error TS(2339): Property 'file' does not exist on type 'Request<{}... Remove this comment to see the full error message
    const originalFileName = req.file.originalname;
    // Never derive the on-disk path from the uploaded filename. A server-generated
    // name keeps shell metacharacters and `..` traversal sequences out of the path
    // entirely; tar reads the archive by content, so the name does not matter.
    const safeFileName = `restore_${randomUUID()}.tar.gz`;
    log(
      'info',
      `Uploaded backup file: ${originalFileName} -> ${safeFileName} at ${uploadedFilePath}`
    );
    try {
      // Move the uploaded file to the designated backup directory for processing
      const finalBackupPath = path.join(BACKUP_DIR, safeFileName);
      await fs.copyFile(uploadedFilePath, finalBackupPath);
      await fs.unlink(uploadedFilePath);
      log('info', `Moved uploaded file to: ${finalBackupPath}`);
      // Perform restore
      const result = await performRestore(finalBackupPath);
      if (result.success) {
        res.status(200).json({ message: 'Restore completed successfully.' });
      } else {
        res
          .status(500)
          .json({ message: 'Restore failed.', error: result.error });
      }
    } catch (error) {
      log('error', 'Error during restore:', error);
      res.status(500).json({
        message: 'Internal server error during restore.',
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        error: error.message,
      });
    } finally {
      // Clean up the uploaded file from temp_uploads if it still exists there
      try {
        await fs.unlink(uploadedFilePath);
        log('info', `Cleaned up temporary uploaded file: ${uploadedFilePath}`);
      } catch (cleanupError) {
        log(
          'warn',
          `Failed to clean up temporary uploaded file ${uploadedFilePath}:`,
          cleanupError
        );
      }
    }
  }
);
/**
 * @swagger
 * components:
 *   schemas:
 *     BackupSettings:
 *       type: object
 *       properties:
 *         backupEnabled:
 *           type: boolean
 *         backupDays:
 *           type: array
 *           items:
 *             type: string
 *         backupTime:
 *           type: string
 *         retentionDays:
 *           type: integer
 *         lastBackupStatus:
 *           type: string
 *         lastBackupTimestamp:
 *           type: string
 *           format: date-time
 *         backupLocation:
 *           type: string
 */
/**
 * @swagger
 * /admin/backup/settings:
 *   get:
 *     summary: Get backup settings
 *     tags: [System & Admin]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Backup settings retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BackupSettings'
 *       500:
 *         description: Server error.
 */
router.get(
  '/settings',
  authenticate,
  isAdmin,
  requireServerBackupsEnabled,
  async (req, res) => {
    try {
      const backupSettings = await backupSettingsRepository.getBackupSettings();
      res.status(200).json({
        backupEnabled: backupSettings.backup_enabled,
        backupDays: backupSettings.backup_days,
        backupTime: backupSettings.backup_time,
        retentionDays: backupSettings.retention_days,
        lastBackupStatus: backupSettings.last_backup_status,
        lastBackupTimestamp: backupSettings.last_backup_timestamp,
        backupLocation: BACKUP_DIR, // From backupService
      });
    } catch (error) {
      log('error', 'Error fetching backup settings:', error);
      res.status(500).json({
        message: 'Internal server error fetching backup settings.',
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        error: error.message,
      });
    }
  }
);
/**
 * @swagger
 * /admin/backup/settings:
 *   post:
 *     summary: Update backup settings
 *     tags: [System & Admin]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               backupEnabled:
 *                 type: boolean
 *               backupDays:
 *                 type: array
 *                 items:
 *                   type: string
 *               backupTime:
 *                 type: string
 *               retentionDays:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Backup settings saved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 settings:
 *                   $ref: '#/components/schemas/BackupSettings'
 *       500:
 *         description: Server error.
 */
router.post(
  '/settings',
  authenticate,
  isAdmin,
  requireServerBackupsEnabled,
  async (req, res) => {
    const parsed = backupSettingsBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        message: 'Invalid backup settings.',
        errors: parsed.error.flatten(),
      });
      return;
    }
    const { backupEnabled, backupDays, backupTime, retentionDays } =
      parsed.data;
    try {
      const updatedSettings =
        await backupSettingsRepository.updateBackupSettings({
          backup_enabled: backupEnabled,
          backup_days: backupDays,
          backup_time: backupTime,
          retention_days: retentionDays,
        });

      let schedulerFailed = false;
      try {
        await rescheduleBackups();
      } catch (schedErr) {
        log(
          'error',
          '[CRON] Settings saved but live reschedule failed:',
          schedErr
        );
        schedulerFailed = true;
      }

      res.status(200).json({
        message: 'Backup settings saved successfully.',
        settings: updatedSettings,
        ...(schedulerFailed ? { schedulerFailed: true } : {}),
      });
    } catch (error) {
      log('error', 'Error saving backup settings:', error);
      res.status(500).json({
        message: 'Internal server error saving backup settings.',
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        error: error.message,
      });
    }
  }
);
export default router;
