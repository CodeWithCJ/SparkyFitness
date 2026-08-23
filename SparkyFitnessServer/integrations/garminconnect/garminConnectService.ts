import http from 'http';
import https from 'https';
import { log } from '../../config/logging.js';
import axios from 'axios';
import type { AxiosResponse } from 'axios';
import externalProviderRepository from '../../models/externalProviderRepository.js';
import { encrypt, ENCRYPTION_KEY } from '../../security/encryption.js';
import {
  GarminJwtPayload,
  GarminTokenPayload,
  GarminLoginResponseDto,
} from 'types/garmin.ts';
import { addDays } from '@workspace/shared';

const GARMIN_MICROSERVICE_URL =
  process.env.GARMIN_MICROSERVICE_URL || 'http://localhost:8000'; // Default for local dev

const httpAgent = new http.Agent({ keepAlive: true, timeout: 60000 });
const httpsAgent = new https.Agent({ keepAlive: true, timeout: 60000 });

const garminAxios = axios.create({
  httpAgent,
  httpsAgent,
  timeout: 120000,
});

/**
 * Execute a POST request to the Garmin microservice with automatic retries on transient connection errors.
 */
async function postWithRetry<T = unknown>(
  url: string,
  data: unknown,
  retries = 2
): Promise<AxiosResponse<T>> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await garminAxios.post<T>(url, data);
    } catch (err: unknown) {
      const isTransient =
        axios.isAxiosError(err) &&
        (err.code === 'ECONNRESET' ||
          err.code === 'ETIMEDOUT' ||
          err.code === 'ECONNREFUSED' ||
          err.code === 'ECONNABORTED' ||
          err.code === 'EAI_AGAIN' ||
          Boolean(
            err.message && err.message.toLowerCase().includes('timeout')
          ) ||
          (err.response?.status !== undefined && err.response.status >= 500));
      if (attempt < retries && isTransient) {
        const delayMs = (attempt + 1) * 1000;
        log(
          'warn',
          `[garminConnectService] Transient error calling ${url} (${err instanceof Error ? err.message : String(err)}). Retrying in ${delayMs}ms (attempt ${attempt + 1}/${retries})...`
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Failed after ${retries} retries`);
}

/**
 * Extract a human-meaningful detail string from any error thrown by an
 * axios call to the Garmin microservice. Handles three failure shapes:
 *
 *   1. The microservice returned an HTTPException with `detail` (most cases).
 *   2. axios threw a connection-level error before any response (e.g. the
 *      microservice container isn't running) — surface `error.code`
 *      (ECONNREFUSED / ETIMEDOUT / ENOTFOUND) so the operator can diagnose.
 *   3. Any other Error — fall back to `.message`, then `String(error)`,
 *      then a literal placeholder.
 *
 * Previously the four catch blocks in this file deduplicated this logic
 * inline, and when axios produced an error with empty `.message` (which
 * happens for some connection failures), the resulting toast read
 * "Failed to login to Garmin: " with nothing after.
 */
function formatGarminMicroserviceError(error: unknown): {
  detail: string;
  errorData: unknown;
} {
  const isAxiosError = axios.isAxiosError(error);
  const errorData = isAxiosError ? (error.response?.data ?? null) : null;
  const responseDetail =
    errorData && typeof errorData === 'object' && 'detail' in errorData
      ? String((errorData as { detail: unknown }).detail)
      : null;
  const messageDetail =
    error instanceof Error && error.message ? error.message : null;
  const codeDetail = isAxiosError && error.code ? error.code : null;
  const detail =
    responseDetail ||
    messageDetail ||
    codeDetail ||
    String(error) ||
    'Unknown error';
  return { detail, errorData: errorData ?? codeDetail ?? detail };
}

async function garminLogin(
  userId: string,
  email: string,
  password: string
): Promise<GarminLoginResponseDto> {
  try {
    const response = await postWithRetry<GarminLoginResponseDto>(
      `${GARMIN_MICROSERVICE_URL}/auth/garmin/login`,
      {
        user_id: userId,
        email: email,
        password: password,
      }
    );
    return response.data; // Should contain tokens or MFA status
  } catch (error: unknown) {
    const { detail, errorData } = formatGarminMicroserviceError(error);
    log('error', `Error during Garmin login for user ${userId}:`, errorData);
    throw new Error(`Failed to login to Garmin: ${detail}`, { cause: error });
  }
}

async function garminResumeLogin(
  userId: string,
  clientState: string,
  mfaCode: string
): Promise<GarminLoginResponseDto> {
  try {
    const response = await postWithRetry<GarminLoginResponseDto>(
      `${GARMIN_MICROSERVICE_URL}/auth/garmin/resume_login`,
      {
        user_id: userId,
        client_state: clientState,
        mfa_code: mfaCode,
      }
    );
    return response.data; // Should contain tokens
  } catch (error: unknown) {
    const { detail, errorData } = formatGarminMicroserviceError(error);
    log('error', `Error during Garmin MFA for user ${userId}:`, errorData);
    throw new Error(`Failed to complete Garmin MFA: ${detail}`, {
      cause: error,
    });
  }
}

async function handleGarminTokens(
  userId: string,
  tokensObj: GarminTokenPayload
) {
  try {
    if (!tokensObj.di_token) {
      throw new Error('Unexpected token structure: missing di_token.');
    }

    let expiresAt: Date | null = null;
    let externalUserId: string = `garmin_user_${userId}`;

    try {
      // JWTs themselves are always base64 encoded, so this split/decode stays
      const payloadBase64 = tokensObj.di_token.split('.')[1];
      const payloadJson = JSON.parse(
        Buffer.from(payloadBase64, 'base64').toString('utf8')
      ) as GarminJwtPayload;

      if (payloadJson.exp) {
        expiresAt = new Date(payloadJson.exp * 1000);
      }
      if (payloadJson.garmin_guid) {
        externalUserId = payloadJson.garmin_guid;
      }
    } catch {
      log(
        'warn',
        `Failed to decode JWT payload from di_token for user ${userId}`
      );
    }

    log('debug', 'handleGarminTokens: Extracted Tokens', {
      di_client_id: tokensObj.di_client_id,
      expires_at: expiresAt,
      external_user_id: externalUserId,
    });

    // Stringify the pure JSON object for encryption/storage
    const tokensString = JSON.stringify(tokensObj);
    const encryptedGarthDump = await encrypt(tokensString, ENCRYPTION_KEY);

    const provider =
      await externalProviderRepository.getExternalDataProviderByUserIdAndProviderName(
        userId,
        'garmin'
      );

    const updateData = {
      provider_name: 'garmin',
      provider_type: 'garmin',
      user_id: userId,
      is_active: true,
      base_url: 'https://connect.garmin.com',
      encrypted_garth_dump: encryptedGarthDump.encryptedText,
      garth_dump_iv: encryptedGarthDump.iv,
      garth_dump_tag: encryptedGarthDump.tag,
      token_expires_at: expiresAt,
      external_user_id: externalUserId,
    };

    let savedProvider;
    if (provider && provider.id) {
      savedProvider =
        await externalProviderRepository.updateExternalDataProvider(
          provider.id,
          userId,
          updateData
        );
      log('info', `Updated Garmin provider entry for user ${userId}.`);
    } else {
      savedProvider =
        await externalProviderRepository.createExternalDataProvider(updateData);
      log('info', `Created new Garmin provider entry for user ${userId}.`);
    }
    return savedProvider;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log(
      'error',
      `Error handling Garmin tokens for user ${userId}:`,
      errorMessage
    );
    throw new Error(`Failed to handle Garmin tokens: ${errorMessage}`, {
      cause: error,
    });
  }
}

/**
 * Splits a calendar day range [startDate, endDate] into consecutive chunks of maximum chunkSizeDays days.
 */
function getGarminDateChunks(
  startDate: string,
  endDate: string,
  chunkSizeDays = 7
): Array<{ start: string; end: string }> {
  const chunks: Array<{ start: string; end: string }> = [];
  let currentStart = startDate;
  const endLimit = endDate;
  const daysOffset = Math.max(1, chunkSizeDays) - 1;

  while (currentStart <= endLimit) {
    const nextEndCandidate = addDays(currentStart, daysOffset);
    const nextEnd = nextEndCandidate <= endLimit ? nextEndCandidate : endLimit;
    chunks.push({
      start: currentStart,
      end: nextEnd,
    });
    currentStart = addDays(nextEnd, 1);
  }
  return chunks;
}

async function getDecryptedGarminTokens(userId: string): Promise<string> {
  const provider =
    await externalProviderRepository.getExternalDataProviderByUserIdAndProviderName(
      userId,
      'garmin'
    );
  if (!provider || !provider.garth_dump) {
    throw new Error('Garmin tokens not found for this user.');
  }
  return provider.garth_dump;
}

/**
 * Fetches a single chunk of Health and Wellness data from the Garmin microservice.
 */
async function fetchGarminHealthAndWellnessChunk(
  userId: string,
  startDate: string,
  endDate: string,
  metricTypes?: string[]
): Promise<{
  data: Record<string, Array<Record<string, unknown>>>;
  new_tokens?: GarminTokenPayload;
}> {
  try {
    const tokens = await getDecryptedGarminTokens(userId);
    const response = await postWithRetry<{
      data?: Record<string, Array<Record<string, unknown>>>;
      new_tokens?: GarminTokenPayload;
    }>(`${GARMIN_MICROSERVICE_URL}/data/health_and_wellness`, {
      user_id: userId,
      tokens,
      start_date: startDate,
      end_date: endDate,
      metric_types: metricTypes || [],
    });

    const result = response.data;
    if (result.new_tokens) {
      log(
        'info',
        `Detected token refresh during health sync chunk for user ${userId}. Updating...`
      );
      await handleGarminTokens(userId, result.new_tokens);
    }
    return {
      data: result.data || {},
      new_tokens: result.new_tokens,
    };
  } catch (error: unknown) {
    const { detail, errorData } = formatGarminMicroserviceError(error);
    log(
      'error',
      `Error fetching Garmin health and wellness chunk for user ${userId} from ${startDate} to ${endDate}:`,
      errorData
    );
    throw new Error(
      `Failed to fetch Garmin health and wellness chunk (${startDate} to ${endDate}): ${detail}`,
      { cause: error }
    );
  }
}

/**
 * Fetches a single chunk of Activities and Workouts from the Garmin microservice.
 */
async function fetchGarminActivitiesAndWorkoutsChunk(
  userId: string,
  startDate: string,
  endDate: string,
  activityType?: string
): Promise<{
  activities: unknown[];
  workouts: unknown[];
  new_tokens?: GarminTokenPayload;
}> {
  try {
    const tokens = await getDecryptedGarminTokens(userId);
    const response = await postWithRetry<{
      activities?: unknown[];
      workouts?: unknown[];
      new_tokens?: GarminTokenPayload;
    }>(`${GARMIN_MICROSERVICE_URL}/data/activities_and_workouts`, {
      user_id: userId,
      tokens,
      start_date: startDate,
      end_date: endDate,
      activity_type: activityType,
    });

    const result = response.data;
    if (result.new_tokens) {
      log(
        'info',
        `Detected token refresh during activity sync chunk for user ${userId}. Updating...`
      );
      await handleGarminTokens(userId, result.new_tokens);
    }
    return {
      activities: Array.isArray(result.activities) ? result.activities : [],
      workouts: Array.isArray(result.workouts) ? result.workouts : [],
      new_tokens: result.new_tokens,
    };
  } catch (error: unknown) {
    const { detail, errorData } = formatGarminMicroserviceError(error);
    log(
      'error',
      `Error fetching Garmin activities chunk for user ${userId} from ${startDate} to ${endDate}:`,
      errorData
    );
    throw new Error(
      `Failed to fetch Garmin activities chunk (${startDate} to ${endDate}): ${detail}`,
      { cause: error }
    );
  }
}

/**
 * Fetches a single chunk of Nutrition Diary data from the Garmin microservice.
 */
async function fetchGarminNutritionDiaryChunk(
  userId: string,
  startDate: string,
  endDate: string
): Promise<{
  nutrition_data: Array<Record<string, unknown>>;
  new_tokens?: GarminTokenPayload;
}> {
  try {
    const tokens = await getDecryptedGarminTokens(userId);
    const response = await postWithRetry<{
      nutrition_data?: Array<Record<string, unknown>>;
      new_tokens?: GarminTokenPayload;
    }>(`${GARMIN_MICROSERVICE_URL}/data/nutrition_diary`, {
      user_id: userId,
      tokens,
      start_date: startDate,
      end_date: endDate,
    });

    const result = response.data;
    if (result.new_tokens) {
      log(
        'info',
        `Detected token refresh during nutrition sync chunk for user ${userId}. Updating...`
      );
      await handleGarminTokens(userId, result.new_tokens);
    }
    return {
      nutrition_data: Array.isArray(result.nutrition_data)
        ? result.nutrition_data
        : [],
      new_tokens: result.new_tokens,
    };
  } catch (error: unknown) {
    const { detail, errorData } = formatGarminMicroserviceError(error);
    log(
      'error',
      `Error fetching Garmin nutrition diary chunk for user ${userId} from ${startDate} to ${endDate}:`,
      errorData
    );
    throw new Error(
      `Failed to fetch Garmin nutrition diary chunk (${startDate} to ${endDate}): ${detail}`,
      { cause: error }
    );
  }
}

async function syncGarminHealthAndWellness(
  userId: string,
  startDate: string,
  endDate: string,
  metricTypes?: string[]
): Promise<{ data: Record<string, Array<Record<string, unknown>>> }> {
  const chunks = getGarminDateChunks(startDate, endDate, 7);
  log(
    'info',
    `syncGarminHealthAndWellness: Split range ${startDate} to ${endDate} into ${chunks.length} chunks of max 7 days.`
  );

  const aggregatedResult: {
    data: Record<string, Array<Record<string, unknown>>>;
  } = {
    data: {},
  };

  for (const chunk of chunks) {
    log(
      'info',
      `syncGarminHealthAndWellness: Fetching chunk ${chunk.start} to ${chunk.end} for user ${userId}`
    );
    const chunkResult = await fetchGarminHealthAndWellnessChunk(
      userId,
      chunk.start,
      chunk.end,
      metricTypes
    );
    if (chunkResult.data) {
      for (const metric in chunkResult.data) {
        if (!aggregatedResult.data[metric]) {
          aggregatedResult.data[metric] = [];
        }
        if (Array.isArray(chunkResult.data[metric])) {
          aggregatedResult.data[metric].push(...chunkResult.data[metric]);
        }
      }
    }
  }
  return aggregatedResult;
}

async function fetchGarminActivitiesAndWorkouts(
  userId: string,
  startDate: string,
  endDate: string,
  activityType?: string
) {
  const chunks = getGarminDateChunks(startDate, endDate, 7);
  log(
    'info',
    `fetchGarminActivitiesAndWorkouts: Split range ${startDate} to ${endDate} into ${chunks.length} chunks of max 7 days.`
  );

  const aggregatedResult: {
    user_id: string;
    start_date: string;
    end_date: string;
    activities: unknown[];
    workouts: unknown[];
  } = {
    user_id: userId,
    start_date: startDate,
    end_date: endDate,
    activities: [],
    workouts: [],
  };

  for (const chunk of chunks) {
    log(
      'info',
      `fetchGarminActivitiesAndWorkouts: Fetching chunk ${chunk.start} to ${chunk.end} for user ${userId}`
    );
    const chunkResult = await fetchGarminActivitiesAndWorkoutsChunk(
      userId,
      chunk.start,
      chunk.end,
      activityType
    );
    if (chunkResult.activities && Array.isArray(chunkResult.activities)) {
      aggregatedResult.activities.push(...chunkResult.activities);
    }
    if (chunkResult.workouts && Array.isArray(chunkResult.workouts)) {
      aggregatedResult.workouts.push(...chunkResult.workouts);
    }
  }

  return aggregatedResult;
}

async function fetchGarminNutritionDiary(
  userId: string,
  startDate: string,
  endDate: string
): Promise<{
  user_id: string;
  start_date: string;
  end_date: string;
  nutrition_data: Array<Record<string, unknown>>;
}> {
  const chunks = getGarminDateChunks(startDate, endDate, 7);
  log(
    'info',
    `fetchGarminNutritionDiary: Split range ${startDate} to ${endDate} into ${chunks.length} chunks of max 7 days.`
  );

  const aggregatedResult: {
    user_id: string;
    start_date: string;
    end_date: string;
    nutrition_data: Array<Record<string, unknown>>;
  } = {
    user_id: userId,
    start_date: startDate,
    end_date: endDate,
    nutrition_data: [],
  };

  for (const chunk of chunks) {
    log(
      'info',
      `fetchGarminNutritionDiary: Fetching chunk ${chunk.start} to ${chunk.end} for user ${userId}`
    );
    const chunkResult = await fetchGarminNutritionDiaryChunk(
      userId,
      chunk.start,
      chunk.end
    );
    if (
      chunkResult.nutrition_data &&
      Array.isArray(chunkResult.nutrition_data)
    ) {
      aggregatedResult.nutrition_data.push(...chunkResult.nutrition_data);
    }
  }

  return aggregatedResult;
}

export {
  garminLogin,
  garminResumeLogin,
  handleGarminTokens,
  getGarminDateChunks,
  fetchGarminHealthAndWellnessChunk,
  fetchGarminActivitiesAndWorkoutsChunk,
  fetchGarminNutritionDiaryChunk,
  syncGarminHealthAndWellness,
  fetchGarminActivitiesAndWorkouts,
  fetchGarminNutritionDiary,
  formatGarminMicroserviceError,
};

export default {
  garminLogin,
  garminResumeLogin,
  handleGarminTokens,
  getGarminDateChunks,
  fetchGarminHealthAndWellnessChunk,
  fetchGarminActivitiesAndWorkoutsChunk,
  fetchGarminNutritionDiaryChunk,
  syncGarminHealthAndWellness,
  fetchGarminActivitiesAndWorkouts,
  fetchGarminNutritionDiary,
  formatGarminMicroserviceError,
};
