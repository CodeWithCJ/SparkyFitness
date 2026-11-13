import {
  isValidCronExpression,
  scheduleJob,
  type ScheduledTask,
} from './scheduledJobs.js';
import backupSettingsRepository from '../models/backupSettingsRepository.js';
import { performBackup, applyRetentionPolicy } from './backupService.js';
import { log } from '../config/logging.js';
import { scheduledJobsDisabled } from '../utils/scheduledJobs.js';

let scheduledTask: ScheduledTask | null = null;
// The expression scheduledTask runs on, or null when backups are disabled.
let scheduledExpression: string | null = null;
let settingsRecheckTask: ScheduledTask | null = null;

const SETTINGS_RECHECK_CRON = '*/5 * * * *';

const clearScheduledTask = (): void => {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask.destroy();
    scheduledTask = null;
  }
};

const DOW_MAP: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

export const buildCronExpression = (
  backupTime: string,
  backupDays: string[]
): string => {
  let [hour, minute] = backupTime.split(':').map(Number);
  if (
    isNaN(hour) ||
    isNaN(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    hour = 2;
    minute = 0;
  }
  const days = backupDays
    .map((d) => DOW_MAP[d])
    .filter((n) => n !== undefined && !isNaN(n));
  const dowField = days.length > 0 ? days.join(',') : '*';
  return `${minute} ${hour} * * ${dowField}`;
};

const readBackupExpression = async (): Promise<string | null> => {
  const settings = await backupSettingsRepository.getBackupSettings();
  if (!settings?.backup_enabled) return null;
  const expr = buildCronExpression(
    settings.backup_time ?? '02:00',
    settings.backup_days ?? []
  );
  if (!isValidCronExpression(expr)) {
    throw new Error(
      `[CRON] Invalid backup cron expression: ${expr} — cannot schedule`
    );
  }
  return expr;
};

const applyBackupExpression = (expr: string | null): void => {
  if (expr === null) {
    log('info', '[CRON] Scheduled backups disabled — skipping schedule');
  } else {
    log('info', `[CRON] Scheduling backup with expression: ${expr}`);
  }
  const newTask =
    expr === null
      ? null
      : scheduleJob(
          'backup',
          expr,
          async () => {
            const result = await performBackup();
            if (result.success) await applyRetentionPolicy();
          },
          { timezone: 'UTC' }
        );
  clearScheduledTask();
  scheduledTask = newTask;
  scheduledExpression = expr;
};

export const scheduleBackups = async (): Promise<void> => {
  applyBackupExpression(await readBackupExpression());
};

/** Rebuilds the backup task only when the enabled flag or schedule changed. */
const refreshBackupSchedule = async (): Promise<void> => {
  const expr = await readBackupExpression();
  if (expr !== scheduledExpression) applyBackupExpression(expr);
};

export const scheduleBackupsOnStartup = async (): Promise<void> => {
  try {
    await scheduleBackups();
  } catch (err) {
    log('error', '[CRON] Failed to schedule backups at startup:', err);
  }
  // When the web instances leave jobs to this one, a schedule saved there only
  // reaches this instance through this re-check.
  if (!settingsRecheckTask) {
    settingsRecheckTask = scheduleJob(
      'backup-settings-recheck',
      SETTINGS_RECHECK_CRON,
      async () => {
        try {
          await refreshBackupSchedule();
        } catch (err) {
          log('error', '[CRON] Failed to re-check backup settings:', err);
        }
      },
      { noOverlap: true, timezone: 'UTC', local: true }
    );
  }
};

export const rescheduleBackups = async (): Promise<void> => {
  if (scheduledJobsDisabled()) {
    log(
      'info',
      '[CRON] Backup settings saved; the scheduled-jobs instance applies them within 5 minutes.'
    );
    return;
  }
  await scheduleBackups();
};
