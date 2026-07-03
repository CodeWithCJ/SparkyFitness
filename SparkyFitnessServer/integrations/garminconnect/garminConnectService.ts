import { log } from '../../config/logging.js';
import axios from 'axios';
import externalProviderRepository from '../../models/externalProviderRepository.js';
import { encrypt, ENCRYPTION_KEY } from '../../security/encryption.js';
import { GarminJwtPayload, GarminTokenPayload } from 'types/garmin.ts';
import { addDays } from '@workspace/shared';
const GARMIN_MICROSERVICE_URL =
  process.env.GARMIN_MICROSERVICE_URL || 'http://localhost:8000'; // Default for local dev

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

async function garminLogin(userId: string, email: string, password: string) {
  try {
    const response = await axios.post(
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
) {
  try {
    const response = await axios.post(
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
async function syncGarminHealthAndWellness(
  userId: string,
  startDate: string,
  endDate: string,
  metricTypes?: string[]
) {
  try {
    const chunks: { start: string; end: string }[] = [];
    let currentStart = startDate;
    const endLimit = endDate;

    while (currentStart <= endLimit) {
      const nextEndCandidate = addDays(currentStart, 6);
      const nextEnd =
        nextEndCandidate <= endLimit ? nextEndCandidate : endLimit;
      chunks.push({
        start: currentStart,
        end: nextEnd,
      });
      currentStart = addDays(nextEnd, 1);
    }

    log(
      'info',
      `syncGarminHealthAndWellness: Split range ${startDate} to ${endDate} into ${chunks.length} chunks of max 7 days.`
    );

    const provider =
      await externalProviderRepository.getExternalDataProviderByUserIdAndProviderName(
        userId,
        'garmin'
      );
    if (!provider || !provider.garth_dump) {
      throw new Error('Garmin tokens not found for this user.');
    }
    let decryptedGarthDump = provider.garth_dump;

    const aggregatedResult: any = {
      data: {},
    };

    for (const chunk of chunks) {
      log(
        'info',
        `syncGarminHealthAndWellness: Fetching chunk ${chunk.start} to ${chunk.end} for user ${userId}`
      );

      const response = await axios.post(
        `${GARMIN_MICROSERVICE_URL}/data/health_and_wellness`,
        {
          user_id: userId,
          tokens: decryptedGarthDump,
          start_date: chunk.start,
          end_date: chunk.end,
          metric_types: metricTypes || [],
        },
        {
          timeout: 120000,
        }
      );
      const result = response.data;

      if (result.new_tokens) {
        log(
          'info',
          `Detected token refresh during health sync chunk for user ${userId}. Updating...`
        );
        await handleGarminTokens(userId, result.new_tokens);
        decryptedGarthDump = JSON.stringify(result.new_tokens);
      }

      if (result.data) {
        for (const metric in result.data) {
          if (!aggregatedResult.data[metric]) {
            aggregatedResult.data[metric] = [];
          }
          if (Array.isArray(result.data[metric])) {
            aggregatedResult.data[metric].push(...result.data[metric]);
          }
        }
      }
    }

    return aggregatedResult;
  } catch (error: unknown) {
    const { detail, errorData } = formatGarminMicroserviceError(error);
    log(
      'error',
      `Error fetching Garmin health and wellness data for user ${userId} from ${startDate} to ${endDate}:`,
      errorData
    );
    throw new Error(
      `Failed to fetch Garmin health and wellness data: ${detail}`,
      { cause: error }
    );
  }
}
async function fetchGarminActivitiesAndWorkouts(
  userId: string,
  startDate: string,
  endDate: string,
  activityType?: string
) {
  try {
    const chunks: { start: string; end: string }[] = [];
    let currentStart = startDate;
    const endLimit = endDate;

    while (currentStart <= endLimit) {
      const nextEndCandidate = addDays(currentStart, 6);
      const nextEnd =
        nextEndCandidate <= endLimit ? nextEndCandidate : endLimit;
      chunks.push({
        start: currentStart,
        end: nextEnd,
      });
      currentStart = addDays(nextEnd, 1);
    }

    log(
      'info',
      `fetchGarminActivitiesAndWorkouts: Split range ${startDate} to ${endDate} into ${chunks.length} chunks of max 7 days.`
    );

    const provider =
      await externalProviderRepository.getExternalDataProviderByUserIdAndProviderName(
        userId,
        'garmin'
      );
    if (!provider || !provider.garth_dump) {
      throw new Error('Garmin tokens not found for this user.');
    }
    let decryptedGarthDump = provider.garth_dump;

    const aggregatedResult: any = {
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

      const response = await axios.post(
        `${GARMIN_MICROSERVICE_URL}/data/activities_and_workouts`,
        {
          user_id: userId,
          tokens: decryptedGarthDump,
          start_date: chunk.start,
          end_date: chunk.end,
          activity_type: activityType,
        },
        {
          timeout: 120000,
        }
      );
      const result = response.data;

      if (result.new_tokens) {
        log(
          'info',
          `Detected token refresh during activity sync chunk for user ${userId}. Updating...`
        );
        await handleGarminTokens(userId, result.new_tokens);
        decryptedGarthDump = JSON.stringify(result.new_tokens);
      }

      if (result.activities && Array.isArray(result.activities)) {
        aggregatedResult.activities.push(...result.activities);
      }
      if (result.workouts && Array.isArray(result.workouts)) {
        aggregatedResult.workouts.push(...result.workouts);
      }
    }

    return aggregatedResult;
  } catch (error: unknown) {
    const { detail, errorData } = formatGarminMicroserviceError(error);
    log(
      'error',
      `Error fetching Garmin activities and workouts for user ${userId} from ${startDate} to ${endDate}:`,
      errorData
    );
    throw new Error(
      `Failed to fetch Garmin activities and workouts: ${detail}`,
      { cause: error }
    );
  }
}
async function fetchGarminNutritionDiary(
  userId: string,
  startDate: string,
  endDate: string
) {
  try {
    const chunks: { start: string; end: string }[] = [];
    let currentStart = startDate;
    const endLimit = endDate;

    while (currentStart <= endLimit) {
      const nextEndCandidate = addDays(currentStart, 6);
      const nextEnd =
        nextEndCandidate <= endLimit ? nextEndCandidate : endLimit;
      chunks.push({
        start: currentStart,
        end: nextEnd,
      });
      currentStart = addDays(nextEnd, 1);
    }

    log(
      'info',
      `fetchGarminNutritionDiary: Split range ${startDate} to ${endDate} into ${chunks.length} chunks of max 7 days.`
    );

    const provider =
      await externalProviderRepository.getExternalDataProviderByUserIdAndProviderName(
        userId,
        'garmin'
      );
    if (!provider || !provider.garth_dump) {
      throw new Error('Garmin tokens not found for this user.');
    }
    let decryptedGarthDump = provider.garth_dump;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const aggregatedResult: any = {
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

      const response = await axios.post(
        `${GARMIN_MICROSERVICE_URL}/data/nutrition_diary`,
        {
          user_id: userId,
          tokens: decryptedGarthDump,
          start_date: chunk.start,
          end_date: chunk.end,
        },
        {
          timeout: 120000,
        }
      );
      const result = response.data;

      if (result.new_tokens) {
        log(
          'info',
          `Detected token refresh during nutrition sync chunk for user ${userId}. Updating...`
        );
        await handleGarminTokens(userId, result.new_tokens);
        decryptedGarthDump = JSON.stringify(result.new_tokens);
      }

      if (result.nutrition_data && Array.isArray(result.nutrition_data)) {
        aggregatedResult.nutrition_data.push(...result.nutrition_data);
      }
    }

    return aggregatedResult;
  } catch (error: unknown) {
    const { detail, errorData } = formatGarminMicroserviceError(error);
    log(
      'error',
      `Error fetching Garmin nutrition diary for user ${userId} from ${startDate} to ${endDate}:`,
      errorData
    );
    throw new Error(`Failed to fetch Garmin nutrition diary: ${detail}`, {
      cause: error,
    });
  }
}

export { garminLogin };
export { garminResumeLogin };
export { handleGarminTokens };
export { syncGarminHealthAndWellness };
export { fetchGarminActivitiesAndWorkouts };
export { fetchGarminNutritionDiary };
export { formatGarminMicroserviceError };
export default {
  garminLogin,
  garminResumeLogin,
  handleGarminTokens,
  syncGarminHealthAndWellness,
  fetchGarminActivitiesAndWorkouts,
  fetchGarminNutritionDiary,
};
