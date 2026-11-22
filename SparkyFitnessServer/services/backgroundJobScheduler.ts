import { scheduleJob } from './scheduledJobs.js';
import { scheduleBackupsOnStartup } from './backupScheduler.js';
import { scheduleOpenFoodFactsAutoSyncOnStartup } from './openFoodFactsAutoSyncScheduler.js';
import { startProviderSyncSchedulers } from './providerSyncScheduler.js';
import { cleanupSessions } from '../auth.js';
import { deleteExpiredTickets } from './passkeyTicketService.js';
import { scheduleDemoMidnightReset } from './demoSeedService.js';
import { log } from '../config/logging.js';
import { scheduledJobsDisabled } from '../utils/scheduledJobs.js';
import { runNightlyNutritionPush } from '../integrations/intervals/intervalsNutritionPush.js';
import {
  finalizePeriods,
  nightlyCatchUp,
  processScoreQueue,
} from './challengeService.js';

// Backup scheduling is handled by services/backupScheduler.ts
// Session cleanup scheduling
const scheduleSessionCleanup = async () => {
  // Run every day at 3 AM
  scheduleJob('session-cleanup', '0 3 * * *', async () => {
    try {
      await cleanupSessions();
    } catch (error) {
      log('error', '[CRON] Session cleanup failed:', error);
    }
    try {
      const removed = await deleteExpiredTickets();
      if (removed > 0) {
        log(
          'info',
          `[CRON] Removed ${removed} used/expired passkey ticket(s).`
        );
      }
    } catch (error) {
      log('error', '[CRON] Passkey ticket cleanup failed:', error);
    }
  });
};

// Challenges: score queued member-days every minute (a day is scored once it
// has been quiet for 30 s, so a burst of edits is scored once), re-score the
// last days nightly for steps and late syncs, and freeze finished periods
// hourly once their 48 h late-sync window has passed. Each tick runs on one
// instance; every step is safe to run twice.
const scheduleChallengeJobs = () => {
  scheduleJob(
    'challenge-score-queue',
    '* * * * *',
    async () => {
      try {
        await processScoreQueue();
      } catch (error) {
        log('error', '[CRON] Challenge scoring failed:', error);
      }
    },
    { noOverlap: true }
  );
  scheduleJob('challenge-catch-up', '30 2 * * *', async () => {
    try {
      await nightlyCatchUp();
    } catch (error) {
      log('error', '[CRON] Challenge catch-up failed:', error);
    }
  });
  scheduleJob('challenge-finalize', '15 * * * *', async () => {
    try {
      await finalizePeriods();
    } catch (error) {
      log('error', '[CRON] Challenge finalise failed:', error);
    }
  });
};

/** Registers every scheduled background job after the database is initialized. */
export async function scheduleBackgroundJobs(): Promise<void> {
  if (scheduledJobsDisabled()) {
    log(
      'info',
      '[CRON] Scheduled jobs disabled on this instance (SPARKY_FITNESS_DISABLE_SCHEDULED_JOBS=true).'
    );
    return;
  }
  scheduleBackupsOnStartup();
  await scheduleOpenFoodFactsAutoSyncOnStartup();
  scheduleSessionCleanup();
  startProviderSyncSchedulers();
  scheduleJob(
    'intervals-nutrition-push',
    '45 23 * * *',
    runNightlyNutritionPush,
    {
      noOverlap: true,
    }
  );
  scheduleDemoMidnightReset();
  scheduleChallengeJobs();
}
