import { log } from '../config/logging.js';
import intervalsIcuIntegration from '../integrations/intervalsicu/intervalsicuService.js';
import intervalsIcuDataProcessor from '../integrations/intervalsicu/intervalsicuDataProcessor.js';
import { getSystemClient } from '../db/poolManager.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import { todayInZone, addDays } from '@workspace/shared';

/**
 * Orchestrate a full Intervals.ICU data sync for a user
 */
async function syncIntervalsIcuData(
  userId: number,
  syncType = 'manual',
  customStartDate: string | null = null,
  customEndDate: string | null = null
) {
  let startDate: string, endDate: string;
  const tz = await loadUserTimezone(userId);
  const today = todayInZone(tz);

  if (customStartDate) {
    startDate = customStartDate;
    endDate = customEndDate || today;
  } else if (syncType === 'manual') {
    endDate = today;
    startDate = addDays(today, -7);
  } else {
    endDate = today;
    startDate = today;
  }

  log(
    'info',
    `[intervalsicuService] Starting Intervals.ICU sync (${syncType}) for user ${userId} from ${startDate} to ${endDate}`
  );

  try {
    // 1. Verify connection
    await intervalsIcuIntegration.fetchAthlete(userId);
    log('debug', '[intervalsicuService] Connection verified, fetching data...');

    // 2. Fetch activities
    const activities = await intervalsIcuIntegration.fetchActivities(
      userId,
      startDate
    );

    // 3. Fetch wellness data (weight, steps, sleep, resting HR, etc.)
    let wellness: any[] = [];
    try {
      wellness = await intervalsIcuIntegration.fetchWellness(
        userId,
        startDate,
        endDate
      );
    } catch (err) {
      log(
        'warn',
        `[intervalsicuService] Wellness fetch failed (optional): ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // 4. Process activities
    if (activities && activities.length > 0) {
      await intervalsIcuDataProcessor.processIntervalsActivities(
        userId,
        userId,
        activities,
        startDate,
        tz
      );
    }

    // 5. Process wellness
    if (wellness && wellness.length > 0) {
      await intervalsIcuDataProcessor.processWellnessData(
        userId,
        userId,
        wellness,
        tz
      );
    }

    // 6. Update last_sync_at
    const client = await getSystemClient();
    try {
      await client.query(
        `UPDATE external_data_providers SET last_sync_at = NOW() WHERE user_id = $1 AND provider_type = 'intervalsicu'`,
        [userId]
      );
    } finally {
      client.release();
    }

    log(
      'info',
      `[intervalsicuService] Full Intervals.ICU sync completed for user ${userId}. ${activities?.length || 0} activities, ${wellness?.length || 0} wellness days processed.`
    );

    return {
      success: true,
      source: 'live_api',
      activitiesProcessed: activities?.length || 0,
      wellnessDays: wellness?.length || 0,
    };
  } catch (error) {
    log(
      'error',
      `[intervalsicuService] Error during Intervals.ICU sync for user ${userId}: ${error instanceof Error ? error.message : String(error)}`
    );
    throw error;
  }
}

const getStatus = (userId: number) =>
  intervalsIcuIntegration.getStatus(userId);
const disconnectIntervalsIcu = (userId: number) =>
  intervalsIcuIntegration.disconnectIntervalsIcu(userId);

export { syncIntervalsIcuData };
export { getStatus };
export { disconnectIntervalsIcu };
export default {
  syncIntervalsIcuData,
  getStatus,
  disconnectIntervalsIcu,
};
