const express = require('express');
const router = express.Router();
const { log } = require('../config/logging');
const { performBackup, performRestore, applyRetentionPolicy, ensureBackupDirectory, BACKUP_DIR } = require('../services/backupService');
const { authenticate, isAdmin } = require('../middleware/authMiddleware');
const backupSettingsRepository = require('../models/backupSettingsRepository');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

// Configure multer for file uploads (for restore)
const upload = multer({
  dest: path.join(__dirname, '../temp_uploads/'), // Temporary directory for uploaded backup files
  limits: { fileSize: 1024 * 1024 * 500 } // 500 MB limit, adjust as needed
});

// Ensure temporary upload directory exists
async function ensureTempUploadDirectory() {
  const tempUploadDir = path.join(__dirname, '../temp_uploads/');
  try {
    await fs.mkdir(tempUploadDir, { recursive: true });
    log('info', `Ensured temporary upload directory exists: ${tempUploadDir}`);
  } catch (error) {
    log('error', `Failed to create temporary upload directory ${tempUploadDir}:`, error);
    throw error;
  }
}
ensureTempUploadDirectory(); // Call once on startup

/**
 * @swagger
 * tags:
 *   name: System & Admin
 *   description: System configuration, administrative tasks, backups, and audits.
 */

/**
 * @swagger
 * /backup/manual:
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
router.post('/manual', authenticate, isAdmin, async (req, res) => {
  log('info', 'Manual backup initiated by admin.');
  try {
    const result = await performBackup(true); // Pass true for manual backup
    if (result.success) {
      res.status(200).json({ message: result.message || 'Backup completed successfully.', path: result.path, fileName: result.fileName });
    } else {
      const errorMessage = result.error ? result.error.message || result.error : 'Unknown backup error.';
      res.status(500).json({ message: 'Backup failed.', error: errorMessage });
    }
  } catch (error) {
    log('error', 'Error during manual backup:', error);
    const errorMessage = error ? error.message || error : 'Unknown internal server error.';
    res.status(500).json({ message: 'Internal server error during backup.', error: errorMessage });
  }
});

/**
 * @swagger
 * /backup/restore:
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
router.post('/restore', authenticate, isAdmin, upload.single('backupFile'), async (req, res) => {
  log('info', 'Restore initiated by admin.');
  if (!req.file) {
    return res.status(400).json({ message: 'No backup file uploaded.' });
  }

  const uploadedFilePath = req.file.path;
  const originalFileName = req.file.originalname;
  log('info', `Uploaded backup file: ${originalFileName} to ${uploadedFilePath}`);

  try {
    // Move the uploaded file to the designated backup directory for processing
    const finalBackupPath = path.join(BACKUP_DIR, originalFileName);
    await fs.copyFile(uploadedFilePath, finalBackupPath);
    await fs.unlink(uploadedFilePath);
    log('info', `Moved uploaded file to: ${finalBackupPath}`);

    // Perform restore
    const result = await performRestore(finalBackupPath);
    if (result.success) {
      res.status(200).json({ message: 'Restore completed successfully.' });
    } else {
      res.status(500).json({ message: 'Restore failed.', error: result.error });
    }
  } catch (error) {
    log('error', 'Error during restore:', error);
    res.status(500).json({ message: 'Internal server error during restore.', error: error.message });
  } finally {
    // Clean up the uploaded file from temp_uploads if it still exists there
    try {
      await fs.unlink(uploadedFilePath);
      log('info', `Cleaned up temporary uploaded file: ${uploadedFilePath}`);
    } catch (cleanupError) {
      log('warn', `Failed to clean up temporary uploaded file ${uploadedFilePath}:`, cleanupError);
    }
  }
});

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
 * /backup/settings:
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
router.get('/settings', authenticate, isAdmin, async (req, res) => {
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
    res.status(500).json({ message: 'Internal server error fetching backup settings.', error: error.message });
  }
});

/**
 * @swagger
 * /backup/settings:
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
router.post('/settings', authenticate, isAdmin, async (req, res) => {
  try {
    const { backupEnabled, backupDays, backupTime, retentionDays } = req.body;

    const updatedSettings = await backupSettingsRepository.updateBackupSettings({
      backup_enabled: backupEnabled,
      backup_days: backupDays,
      backup_time: backupTime,
      retention_days: retentionDays,
    });

    // TODO: Re-schedule cron jobs based on new settings

    res.status(200).json({ message: 'Backup settings saved successfully.', settings: updatedSettings });
  } catch (error) {
    log('error', 'Error saving backup settings:', error);
    res.status(500).json({ message: 'Internal server error saving backup settings.', error: error.message });
  }
});

module.exports = router;