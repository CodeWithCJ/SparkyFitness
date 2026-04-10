import { log } from '../../config/logging';
import axios from 'axios';
const externalProviderRepository = require('../../models/externalProviderRepository');
const exerciseEntryRepository = require('../../models/exerciseEntry');
const activityDetailsRepository = require('../../models/activityDetailsRepository');
const exerciseRepository = require('../../models/exercise');
import moment from 'moment';
import { encrypt, ENCRYPTION_KEY } from '../../security/encryption';

const GARMIN_MICROSERVICE_URL =
  process.env.GARMIN_MICROSERVICE_URL || 'http://localhost:8000'; // Default for local dev

export async function garminLogin(
  userId: string,
  email: string,
  password: string
): Promise<any> {
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
  } catch (error: any) {
    log(
      'error',
      `Error during Garmin login for user ${userId}:`,
      error.response ? error.response.data : error.message
    );
    throw new Error(
      `Failed to login to Garmin: ${error.response ? error.response.data.detail : error.message}`,
      { cause: error }
    );
  }
}

export async function garminResumeLogin(
  userId: string,
  clientState: string,
  mfaCode: string
): Promise<any> {
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
  } catch (error: any) {
    log(
      'error',
      `Error during Garmin MFA for user ${userId}:`,
      error.response ? error.response.data : error.message
    );
    throw new Error(
      `Failed to complete Garmin MFA: ${error.response ? error.response.data.detail : error.message}`,
      { cause: error }
    );
  }
}

export async function handleGarminTokens(
  userId: string,
  tokensB64: string
): Promise<any> {
  try {
    const garthDump = tokensB64;
    const parsedGarthDump = JSON.parse(
      Buffer.from(garthDump, 'base64').toString('utf8')
    );
    if (
      !Array.isArray(parsedGarthDump) ||
      parsedGarthDump.length < 2 ||
      !parsedGarthDump[1]
    ) {
      throw new Error(
        'Unexpected garth dump structure: expected a 2-element array [OAuth1Token, OAuth2Token], ' +
          `received ${Array.isArray(parsedGarthDump) ? `array of length ${parsedGarthDump.length}` : typeof parsedGarthDump}`
      );
    }
    const tokens = parsedGarthDump[1];
    log('debug', 'handleGarminTokens: Extracted Tokens (masked):', {
      access_token: tokens.access_token
        ? tokens.access_token.substring(0, 10) + '...'
        : null,
      refresh_token: tokens.refresh_token
        ? tokens.refresh_token.substring(0, 10) + '...'
        : null,
      external_user_id: tokens.external_user_id,
    });

    log('debug', 'handleGarminTokens: Received Garth dump (masked):', {
      garth_dump_masked: garthDump ? `${garthDump.substring(0, 30)}...` : 'N/A',
      access_token_masked: tokens.access_token
        ? `${tokens.access_token.substring(0, 8)}...`
        : 'N/A',
      refresh_token_masked: tokens.refresh_token
        ? `${tokens.refresh_token.substring(0, 8)}...`
        : 'N/A',
      expires_at: tokens.expires_at,
      external_user_id: tokens.external_user_id,
    });

    // Encrypt the entire Garth dump
    const encryptedGarthDump = await encrypt(garthDump, ENCRYPTION_KEY);
    log('debug', 'handleGarminTokens: Encrypted Garth Dump:', {
      encrypted_garth_dump: encryptedGarthDump.encryptedText
        ? `${encryptedGarthDump.encryptedText.substring(0, 30)}...`
        : null,
      garth_dump_iv: encryptedGarthDump.iv,
      garth_dump_tag: encryptedGarthDump.tag,
    });

    const externalUserId = tokens.external_user_id || `garmin_user_${userId}`;
    log(
      'debug',
      `handleGarminTokens: externalUserId determined as: ${externalUserId}`
    );

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

      token_expires_at: (() => {
        const expiryTimestamp =
          tokens.expires_at || tokens.refresh_token_expires_at;
        return expiryTimestamp ? new Date(expiryTimestamp * 1000) : null;
      })(),
      external_user_id: tokens.external_user_id || externalUserId,
    };

    log('debug', 'handleGarminTokens: Update data for provider (masked):', {
      provider_name: updateData.provider_name,
      provider_type: updateData.provider_type,
      user_id: updateData.user_id,
      is_active: updateData.is_active,
      base_url: updateData.base_url,
      encrypted_garth_dump_masked: updateData.encrypted_garth_dump
        ? `${updateData.encrypted_garth_dump.substring(0, 30)}...`
        : 'N/A',
      token_expires_at: updateData.token_expires_at,
      external_user_id: updateData.external_user_id,
    });

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
  } catch (error: any) {
    log(
      'error',
      `Error handling Garmin tokens for user ${userId}:`,
      error.message
    );
    let errorMessage = `Failed to handle Garmin tokens: ${error.message}`;
    if (error.message.includes('Invalid key length')) {
      errorMessage =
        'Failed to handle Garmin tokens: Encryption key (SPARKY_FITNESS_API_ENCRYPTION_KEY) has an invalid length. Expected 64 hex characters or 44 Base64 characters. Update your environment variable and try again.';
    }
    throw new Error(errorMessage, { cause: error });
  }
}

export async function syncGarminHealthAndWellness(
  userId: string,
  startDate: string,
  endDate: string,
  metricTypes?: string[]
): Promise<any> {
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
      `syncGarminHealthAndWellness: Sending decrypted Garth dump (masked) to microservice: ${decryptedGarthDump ? decryptedGarthDump.substring(0, 30) + '...' : 'N/A'}`
    );
    const response = await axios.post(
      `${GARMIN_MICROSERVICE_URL}/data/health_and_wellness`,
      {
        user_id: userId,
        tokens: decryptedGarthDump,
        start_date: startDate,
        end_date: endDate,
        metric_types: metricTypes || [],
      },
      {
        timeout: 120000, // 2 minutes timeout
      }
    );
    return response.data;
  } catch (error: any) {
    log(
      'error',
      `Error fetching Garmin health and wellness data for user ${userId} from ${startDate} to ${endDate}:`,
      error.response ? error.response.data : error.message
    );
    throw new Error(
      `Failed to fetch Garmin health and wellness data: ${error.response ? error.response.data.detail : error.message}`,
      { cause: error }
    );
  }
}

export async function fetchGarminActivitiesAndWorkouts(
  userId: string,
  startDate: string,
  endDate: string,
  activityType?: string
): Promise<any> {
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
        timeout: 120000,
      }
    );

    log(
      'debug',
      `Received activities and workouts data from Garmin microservice for user ${userId} (${Array.isArray(response.data) ? response.data.length : 'non-array'} items).`
    );
    return response.data;
  } catch (error: any) {
    log(
      'error',
      `Error fetching Garmin activities and workouts for user ${userId} from ${startDate} to ${endDate}:`,
      error.response ? error.response.data : error.message
    );
    throw new Error(
      `Failed to fetch Garmin activities and workouts: ${error.response ? error.response.data.detail : error.message}`,
      { cause: error }
    );
  }
}
