import axios from 'axios';
import type { QueryResult } from 'pg';
import { addDays, instantToDay, todayInZone } from '@workspace/shared';
import { getClient } from '../../db/poolManager.js';
import { decrypt, ENCRYPTION_KEY } from '../../security/encryption.js';
import { log } from '../../config/logging.js';
import { loadRawBundle, logRawResponse } from '../../utils/diagnosticLogger.js';
import { setMockDataContext } from '../../utils/mockDataContext.js';
import { loadUserTimezone } from '../../utils/timezoneLoader.js';
import hevyDataProcessor from './hevyDataProcessor.js';
import type {
  HevyExerciseTemplate,
  HevyExerciseTemplatesResponse,
  HevyUserInfoResponse,
  HevyWorkout,
  HevyWorkoutsResponse,
} from './hevyTypes.js';

const HEVY_API_BASE_URL = 'https://api.hevyapp.com';

interface HevyProviderRow {
  id: string;
  encrypted_app_key: string | null;
  app_key_iv: string | null;
  app_key_tag: string | null;
}

interface HevyRawBundle {
  last_updated?: string;
  responses: Record<string, { data: unknown }>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Resolve one owned Hevy connection for the whole synchronization. */
async function getHevyProvider(userId: string, providerId?: string | null) {
  const client = await getClient(userId);
  try {
    let query = `SELECT id, encrypted_app_key, app_key_iv, app_key_tag
                 FROM external_data_providers
                 WHERE user_id = $1 AND provider_type = 'hevy'`;
    const params = [userId];
    if (providerId) {
      query += ' AND id = $2';
      params.push(providerId);
    } else {
      query += ' ORDER BY is_active DESC, created_at DESC LIMIT 1';
    }
    const result: QueryResult<HevyProviderRow> = await client.query(
      query,
      params
    );
    const provider = result.rows[0];
    if (!provider) throw new Error('Hevy provider not found.');
    return provider;
  } finally {
    client.release();
  }
}

async function getHevyApiKey(userId: string, providerId?: string | null) {
  const provider = await getHevyProvider(userId, providerId);
  if (!provider.encrypted_app_key) {
    throw new Error('Hevy API key is missing for this provider.');
  }
  return decrypt(
    provider.encrypted_app_key,
    provider.app_key_iv,
    provider.app_key_tag,
    ENCRYPTION_KEY!
  );
}

/** Every request to Hevy is read-only. */
async function getHevyResponse<T>(
  userId: string,
  providerId: string | null | undefined,
  endpoint: string,
  dataType: string,
  params?: { page: number; pageSize: number }
): Promise<T> {
  const apiKey = await getHevyApiKey(userId, providerId);
  try {
    const response = await axios.get<T>(`${HEVY_API_BASE_URL}${endpoint}`, {
      headers: { 'api-key': apiKey },
      ...(params ? { params } : {}),
    });
    logRawResponse('hevy', dataType, response.data);
    return response.data;
  } catch (error) {
    log(
      'error',
      `Error fetching Hevy ${dataType} for user ${userId}: ${errorMessage(error)}`
    );
    throw error;
  }
}

async function getUserInfo(userId: string, providerId?: string | null) {
  return getHevyResponse<HevyUserInfoResponse>(
    userId,
    providerId,
    '/v1/user/info',
    'raw_user_info'
  );
}

async function getWorkouts(
  userId: string,
  page = 1,
  pageSize = 10,
  providerId?: string | null
) {
  const data = await getHevyResponse<HevyWorkoutsResponse>(
    userId,
    providerId,
    '/v1/workouts',
    `raw_workouts_page_${page}`,
    { page, pageSize }
  );
  if (
    !data ||
    !Array.isArray(data.workouts) ||
    !Number.isInteger(data.page_count) ||
    data.page_count < 0
  ) {
    throw new Error('Invalid Hevy workouts page.');
  }
  return data;
}

async function getExerciseTemplates(
  userId: string,
  page = 1,
  pageSize = 100,
  providerId?: string | null
) {
  const data = await getHevyResponse<HevyExerciseTemplatesResponse>(
    userId,
    providerId,
    '/v1/exercise_templates',
    `raw_exercise_templates_page_${page}`,
    { page, pageSize }
  );
  if (
    !data ||
    !Array.isArray(data.exercise_templates) ||
    !Number.isInteger(data.page_count) ||
    data.page_count < 0
  ) {
    throw new Error('Invalid Hevy exercise templates page.');
  }
  return data;
}

/** Prefer numbered pages: older captures also saved the last page under a generic key. */
function replayItems<T>(
  responses: HevyRawBundle['responses'],
  prefix: string,
  field: string
): T[] {
  const numberedKeys = Object.keys(responses)
    .filter((key) => key.startsWith(`${prefix}_`))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  const keys =
    numberedKeys.length > 0 ? numberedKeys : responses[prefix] ? [prefix] : [];
  return keys.flatMap((key) => {
    const data = responses[key]?.data;
    if (!data || typeof data !== 'object' || !(field in data)) {
      throw new Error(`Invalid Hevy replay page: ${key}.`);
    }
    const items: unknown = Reflect.get(data, field);
    if (!Array.isArray(items))
      throw new Error(`Invalid Hevy replay page: ${key}.`);
    return items as T[];
  });
}

async function markProviderSynced(userId: string, providerId: string) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `UPDATE external_data_providers
       SET last_sync_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND user_id = $2 AND provider_type = 'hevy'`,
      [providerId, userId]
    );
    if (result.rowCount === 0) throw new Error('Hevy provider not found.');
  } finally {
    client.release();
  }
}

/** Fetch every required page before the processor replaces existing Hevy diary entries. */
async function syncHevyData(
  userId: string,
  createdByUserId: string,
  fullSync = false,
  providerId?: string | null,
  startDate: string | null = null,
  endDate: string | null = null,
  dataSource: string | null = null,
  saveMockData = false
) {
  const timezone = await loadUserTimezone(userId);
  setMockDataContext({ dataSource, saveMockData });
  try {
    const provider = await getHevyProvider(userId, providerId);
    const replay = dataSource === 'local';
    // A custom historical range must not inherit the incremental seven-day cutoff.
    const firstDay =
      startDate ||
      (!fullSync && !endDate ? addDays(todayInZone(timezone), -7) : null);
    let userInfo: HevyUserInfoResponse | null = null;
    const allWorkouts: HevyWorkout[] = [];
    const templates: HevyExerciseTemplate[] = [];
    let bundleUpdated: string | undefined;

    if (replay) {
      const bundle = loadRawBundle('hevy') as HevyRawBundle | null;
      if (!bundle || !bundle.responses) {
        throw new Error(
          'Raw diagnostic bundle not found. Run a sync with "Sync and save ' +
            'this sync\'s raw responses" selected first to capture one.'
        );
      }
      allWorkouts.push(
        ...replayItems<HevyWorkout>(
          bundle.responses,
          'raw_workouts_page',
          'workouts'
        )
      );
      templates.push(
        ...replayItems<HevyExerciseTemplate>(
          bundle.responses,
          'raw_exercise_templates_page',
          'exercise_templates'
        )
      );
      userInfo =
        (bundle.responses.raw_user_info?.data as
          HevyUserInfoResponse | undefined) ?? null;
      bundleUpdated = bundle.last_updated;
    } else {
      let page = 1;
      let moreWorkouts = true;
      while (moreWorkouts) {
        const data = await getWorkouts(userId, page, 10, provider.id);
        allWorkouts.push(...data.workouts);
        // Hevy returns newest workouts first; stop once an entire page precedes the range.
        const reachesRange =
          !firstDay ||
          data.workouts.length === 0 ||
          data.workouts.some(
            (workout) =>
              instantToDay(new Date(workout.start_time), timezone) >= firstDay
          );
        moreWorkouts = page < data.page_count && reachesRange;
        page++;
      }

      page = 1;
      let templatePageCount = 1;
      while (page <= templatePageCount) {
        const data = await getExerciseTemplates(userId, page, 100, provider.id);
        templates.push(...data.exercise_templates);
        templatePageCount = data.page_count;
        page++;
      }

      // Older Hevy accounts/API versions may not expose this optional endpoint.
      try {
        userInfo = await getUserInfo(userId, provider.id);
      } catch (error) {
        log(
          'warn',
          `Skipping optional Hevy user info for user ${userId}: ${errorMessage(error)}`
        );
      }
    }

    const workouts = allWorkouts.filter((workout) => {
      const day = instantToDay(new Date(workout.start_time), timezone);
      return (!firstDay || day >= firstDay) && (!endDate || day <= endDate);
    });
    if (userInfo) {
      await hevyDataProcessor.processHevyUserInfo(
        userId,
        createdByUserId,
        userInfo,
        timezone
      );
    }
    if (workouts.length > 0) {
      await hevyDataProcessor.processHevyWorkouts(
        userId,
        createdByUserId,
        workouts,
        timezone,
        templates
      );
    }
    // Replaying saved responses must not postpone the next live sync.
    if (!replay) await markProviderSynced(userId, provider.id);
    log(
      'info',
      `Hevy synchronization completed for user ${userId}. Total processed: ${workouts.length}`
    );
    return {
      success: true,
      processedCount: workouts.length,
      source: replay ? 'local_raw_replay' : 'live_api',
      ...(replay ? { bundle_updated: bundleUpdated } : {}),
    };
  } catch (error) {
    log(
      'error',
      `Hevy synchronization failed for user ${userId}: ${errorMessage(error)}`
    );
    throw error;
  }
}

async function getStatus(userId: string) {
  const client = await getClient(userId);
  try {
    const result: QueryResult<{
      is_active: boolean;
      last_sync_at: Date | string | null;
    }> = await client.query(
      `SELECT is_active, last_sync_at
       FROM external_data_providers
       WHERE user_id = $1 AND provider_type = 'hevy'
       ORDER BY is_active DESC, created_at DESC LIMIT 1`,
      [userId]
    );
    const provider = result.rows[0];
    return provider
      ? { connected: provider.is_active, lastSyncAt: provider.last_sync_at }
      : { connected: false, lastSyncAt: null };
  } finally {
    client.release();
  }
}

export {
  getUserInfo,
  getWorkouts,
  getExerciseTemplates,
  syncHevyData,
  getStatus,
};
export default {
  getUserInfo,
  getWorkouts,
  getExerciseTemplates,
  syncHevyData,
  getStatus,
};
