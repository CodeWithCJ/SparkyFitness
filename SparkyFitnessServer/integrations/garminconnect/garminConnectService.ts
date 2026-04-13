import { log } from '../../config/logging.js';
import axios from 'axios';
import externalProviderRepository from '../../models/externalProviderRepository.js';
import { encrypt, ENCRYPTION_KEY } from '../../security/encryption.js';
import { GarminJwtPayload, GarminTokenPayload } from 'types/garmin.ts';
const GARMIN_MICROSERVICE_URL =
  process.env.GARMIN_MICROSERVICE_URL || 'http://localhost:8000'; // Default for local dev

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
    const isAxiosError = axios.isAxiosError(error);
    const errorData = isAxiosError ? error.response?.data : null;
    const detail =
      errorData?.detail ||
      (error instanceof Error ? error.message : String(error));

    log(
      'error',
      `Error during Garmin login for user ${userId}:`,
      errorData || detail
    );
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
    const isAxiosError = axios.isAxiosError(error);
    const errorData = isAxiosError ? error.response?.data : null;
    const detail =
      errorData?.detail ||
      (error instanceof Error ? error.message : String(error));

    log(
      'error',
      `Error during Garmin MFA for user ${userId}:`,
      errorData || detail
    );
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
    const provider =
      await externalProviderRepository.getExternalDataProviderByUserIdAndProviderName(
        userId,
        'garmin'
      );
    if (!provider || !provider.garth_dump) {
      throw new Error('Garmin tokens not found for this user.');
    }
    const decryptedGarthDump = provider.garth_dump; // This is already decrypted by the repository
    log(
      'debug',
      `syncGarminHealthAndWellness: Sending decrypted Garth dump (masked) to microservice: ${decryptedGarthDump ? decryptedGarthDump.substring(0, 30) + '...' : 'N/A'}`
    );
    const response = await axios.post(
      `${GARMIN_MICROSERVICE_URL}/data/health_and_wellness`,
      {
        user_id: userId,
        tokens: decryptedGarthDump, // Decrypted, base64 encoded tokens string
        start_date: startDate,
        end_date: endDate,
        metric_types: metricTypes || [], // Pass an empty array if metricTypes is not provided
      },
      {
        timeout: 120000, // 2 minutes timeout
      }
    );
    const result = response.data;

    if (result.new_tokens) {
      log(
        'info',
        `Detected token refresh during health sync for user ${userId}. Updating...`
      );
      await handleGarminTokens(userId, result.new_tokens);
    }

    return result;
  } catch (error: unknown) {
    const isAxiosError = axios.isAxiosError(error);
    const errorData = isAxiosError ? error.response?.data : null;
    const detail =
      errorData?.detail ||
      (error instanceof Error ? error.message : String(error));

    log(
      'error',
      `Error fetching Garmin health and wellness data for user ${userId} from ${startDate} to ${endDate}:`,
      errorData || detail
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
    const provider =
      await externalProviderRepository.getExternalDataProviderByUserIdAndProviderName(
        userId,
        'garmin'
      );
    if (!provider || !provider.garth_dump) {
      throw new Error('Garmin tokens not found for this user.');
    }
    const decryptedGarthDump = provider.garth_dump;
    log(
      'debug',
      `fetchGarminActivitiesAndWorkouts: Sending decrypted Garth dump (masked) to microservice: ${decryptedGarthDump ? decryptedGarthDump.substring(0, 30) + '...' : 'N/A'}`
    );
    const response = await axios.post(
      `${GARMIN_MICROSERVICE_URL}/data/activities_and_workouts`,
      {
        user_id: userId,
        tokens: decryptedGarthDump,
        start_date: startDate,
        end_date: endDate,
        activity_type: activityType,
      },
      {
        timeout: 120000, // 2 minutes timeout
      }
    );
    log(
      'debug',
      `Raw activities and workouts data from Garmin microservice for user ${userId} from ${startDate} to ${endDate}:`,
      response.data
    );
    return response.data;
  } catch (error: unknown) {
    const isAxiosError = axios.isAxiosError(error);
    const errorData = isAxiosError ? error.response?.data : null;
    const detail =
      errorData?.detail ||
      (error instanceof Error ? error.message : String(error));

    log(
      'error',
      `Error fetching Garmin activities and workouts for user ${userId} from ${startDate} to ${endDate}:`,
      errorData || detail
    );
    throw new Error(
      `Failed to fetch Garmin activities and workouts: ${detail}`,
      { cause: error }
    );
  }
}
export { garminLogin };
export { garminResumeLogin };
export { handleGarminTokens };
export { syncGarminHealthAndWellness };
export { fetchGarminActivitiesAndWorkouts };
export default {
  garminLogin,
  garminResumeLogin,
  handleGarminTokens,
  syncGarminHealthAndWellness,
  fetchGarminActivitiesAndWorkouts,
};
