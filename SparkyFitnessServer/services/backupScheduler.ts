import cron, { type ScheduledTask } from 'node-cron';
import backupSettingsRepository from '../models/backupSettingsRepository.js';
import { performBackup, applyRetentionPolicy } from './backupService.js';
import { log } from '../config/logging.js';
import { areServerBackupsEnabled } from '../utils/runtimeConfig.js';

let scheduledTask: ScheduledTask | null = null;

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

const buildNewTask = async (): Promise<ScheduledTask | null> => {
  if (!areServerBackupsEnabled()) {
    log('info', '[CRON] Server-managed backups disabled — skipping schedule');
    return null;
  }
  const settings = await backupSettingsRepository.getBackupSettings();
  if (!settings?.backup_enabled) {
    log('info', '[CRON] Scheduled backups disabled — skipping schedule');
    return null;
  }
  const expr = buildCronExpression(
    settings.backup_time ?? '02:00',
    settings.backup_days ?? []
  );
  if (!cron.validate(expr)) {
    throw new Error(
      `[CRON] Invalid backup cron expression: ${expr} — cannot schedule`
    );
  }
  log('info', `[CRON] Scheduling backup with expression: ${expr}`);
  return cron.schedule(
    expr,
    async () => {
      const result = await performBackup();
      if (result.success) await applyRetentionPolicy();
    },
    { timezone: 'UTC' }
  );
};

export const scheduleBackups = async (): Promise<void> => {
  const newTask = await buildNewTask();
  clearScheduledTask();
  scheduledTask = newTask;
};

export const scheduleBackupsOnStartup = async (): Promise<void> => {
  try {
    await scheduleBackups();
  } catch (err) {
    log('error', '[CRON] Failed to schedule backups at startup:', err);
  }
};

export const rescheduleBackups = async (): Promise<void> => {
  await scheduleBackups();
};
