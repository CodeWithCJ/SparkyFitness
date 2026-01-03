const { log } = require('../../config/logging');
const axios = require('axios');
const externalProviderRepository = require('../../models/externalProviderRepository');
const exerciseEntryRepository = require('../../models/exerciseEntry');
const activityDetailsRepository = require('../../models/activityDetailsRepository');
const exerciseRepository = require('../../models/exercise');
const moment = require('moment');
const { encrypt, decrypt, ENCRYPTION_KEY } = require('../../security/encryption');

const GARMIN_MICROSERVICE_URL = process.env.GARMIN_MICROSERVICE_URL || 'http://localhost:8000'; // Default for local dev

async function garminLogin(userId, email, password) {
    try {
        const response = await axios.post(`${GARMIN_MICROSERVICE_URL}/auth/garmin/login`, {
            user_id: userId,
            email: email,
            password: password
        });
        return response.data; // Should contain tokens or MFA status
    } catch (error) {
        log('error', `Error during Garmin login for user ${userId}:`, error.response ? error.response.data : error.message);
        throw new Error(`Failed to login to Garmin: ${error.response ? error.response.data.detail : error.message}`);
    }
}

async function garminResumeLogin(userId, clientState, mfaCode) {
    try {
        const response = await axios.post(`${GARMIN_MICROSERVICE_URL}/auth/garmin/resume_login`, {
            user_id: userId,
            client_state: clientState,
            mfa_code: mfaCode
        });
        return response.data; // Should contain tokens
    } catch (error) {
        log('error', `Error during Garmin MFA for user ${userId}:`, error.response ? error.response.data : error.message);
        throw new Error(`Failed to complete Garmin MFA: ${error.response ? error.response.data.detail : error.message}`);
    }
}

async function handleGarminTokens(userId, tokensB64) {
    try {
        // Decode the base64 tokens string to get the actual tokens object
        // The tokensB64 is the full garth.dumps() output, which is a base64 encoded string of a JSON array.
        // The Python microservice returns the full garth.dumps() output directly.
        const garthDump = tokensB64;
        const parsedGarthDump = JSON.parse(Buffer.from(garthDump, 'base64').toString('utf8'));
        // The actual tokens are typically in the second element of the array returned by garth.dumps()
        const tokens = parsedGarthDump[1];
        log('debug', `handleGarminTokens: Parsed Garth Dump:`, parsedGarthDump);
        log('debug', `handleGarminTokens: Extracted Tokens:`, tokens);

        log('debug', `handleGarminTokens: Received Garth dump (masked):`, {
            garth_dump_masked: garthDump ? `${garthDump.substring(0, 30)}...` : 'N/A',
            access_token_masked: tokens.access_token ? `${tokens.access_token.substring(0, 8)}...` : 'N/A',
            refresh_token_masked: tokens.refresh_token ? `${tokens.refresh_token.substring(0, 8)}...` : 'N/A',
            expires_at: tokens.expires_at,
            external_user_id: tokens.external_user_id
        });

        // Encrypt the entire Garth dump
        const encryptedGarthDump = await encrypt(garthDump, ENCRYPTION_KEY);
        log('debug', 'handleGarminTokens: Encrypted Garth Dump:', {
            encrypted_garth_dump: encryptedGarthDump.encryptedText ? `${encryptedGarthDump.encryptedText.substring(0, 30)}...` : null,
            garth_dump_iv: encryptedGarthDump.iv,
            garth_dump_tag: encryptedGarthDump.tag
        });

        // Assuming 'external_user_id' is available in the tokens object or can be derived
        const externalUserId = tokens.external_user_id || `garmin_user_${userId}`; // Placeholder
        log('debug', `handleGarminTokens: externalUserId determined as: ${externalUserId}`);

        // Check if a Garmin provider entry already exists for this user
        let provider = await externalProviderRepository.getExternalDataProviderByUserIdAndProviderName(userId, 'garmin');

        const updateData = {
            provider_name: 'garmin',
            provider_type: 'garmin', // Changed to 'garmin' as per user's request
            user_id: userId,
            is_active: true,
            base_url: 'https://connect.garmin.com', // Garmin Connect base URL

            encrypted_garth_dump: encryptedGarthDump.encryptedText,
            garth_dump_iv: encryptedGarthDump.iv,
            garth_dump_tag: encryptedGarthDump.tag,

            // These fields are now derived from the garth dump if needed, or can be removed from the schema
            token_expires_at: tokens.refresh_token_expires_at ? new Date(tokens.refresh_token_expires_at * 1000) : null, // Convert Unix timestamp to Date object, handle null/undefined
            external_user_id: tokens.external_user_id || externalUserId // Use external_user_id from tokens if available
        };
        log('debug', `handleGarminTokens: Update data for provider (masked):`, {
            provider_name: updateData.provider_name,
            provider_type: updateData.provider_type,
            user_id: updateData.user_id,
            is_active: updateData.is_active,
            base_url: updateData.base_url,
            encrypted_garth_dump_masked: updateData.encrypted_garth_dump ? `${updateData.encrypted_garth_dump.substring(0, 30)}...` : 'N/A',
            token_expires_at: updateData.token_expires_at,
            external_user_id: updateData.external_user_id
        });
        
        let savedProvider;
        if (provider && provider.id) {
            // Update existing provider entry
            savedProvider = await externalProviderRepository.updateExternalDataProvider(provider.id, userId, updateData);
            log('info', `Updated Garmin provider entry for user ${userId}.`);
        } else {
            // Create new provider entry
            savedProvider = await externalProviderRepository.createExternalDataProvider(updateData);
            log('info', `Created new Garmin provider entry for user ${userId}.`);
        }

        return savedProvider; // Return the created or updated provider object
    } catch (error) {
        log('error', `Error handling Garmin tokens for user ${userId}:`, error.message);
        let errorMessage = `Failed to handle Garmin tokens: ${error.message}`;
        if (error.message.includes('Invalid key length')) {
            errorMessage = `Failed to handle Garmin tokens: Encryption key (SPARKY_FITNESS_API_ENCRYPTION_KEY) has an invalid length. Expected 64 hex characters or 44 Base64 characters. Update your environment variable and try again.`;
        }
        throw new Error(errorMessage);
    }
}


async function syncGarminHealthAndWellness(userId, startDate, endDate, metricTypes) {
    try {
        const provider = await externalProviderRepository.getExternalDataProviderByUserIdAndProviderName(userId, 'garmin');
        if (!provider || !provider.garth_dump) {
            throw new Error("Garmin tokens not found for this user.");
        }
        const decryptedGarthDump = provider.garth_dump; // This is already decrypted by the repository
        log('debug', `syncGarminHealthAndWellness: Sending decrypted Garth dump (masked) to microservice: ${decryptedGarthDump ? decryptedGarthDump.substring(0, 30) + '...' : 'N/A'}`);
        const response = await axios.post(`${GARMIN_MICROSERVICE_URL}/data/health_and_wellness`, {
            user_id: userId,
            tokens: decryptedGarthDump, // Decrypted, base64 encoded tokens string
            start_date: startDate,
            end_date: endDate,
            metric_types: metricTypes || [] // Pass an empty array if metricTypes is not provided
        }, {
            timeout: 120000 // 2 minutes timeout
        });
        return response.data;
    } catch (error) {
        log('error', `Error fetching Garmin health and wellness data for user ${userId} from ${startDate} to ${endDate}:`, error.response ? error.response.data : error.message);
        throw new Error(`Failed to fetch Garmin health and wellness data: ${error.response ? error.response.data.detail : error.message}`);
    }
}

module.exports = {
    garminLogin,
    garminResumeLogin,
    handleGarminTokens,
    syncGarminHealthAndWellness,
    fetchGarminActivitiesAndWorkouts
};

async function fetchGarminActivitiesAndWorkouts(userId, startDate, endDate, activityType) {
    try {
        const provider = await externalProviderRepository.getExternalDataProviderByUserIdAndProviderName(userId, 'garmin');
        if (!provider || !provider.garth_dump) {
            throw new Error("Garmin tokens not found for this user.");
        }
        const decryptedGarthDump = provider.garth_dump;
        log('debug', `fetchGarminActivitiesAndWorkouts: Sending decrypted Garth dump (masked) to microservice: ${decryptedGarthDump ? decryptedGarthDump.substring(0, 30) + '...' : 'N/A'}`);
        
        const payload = {
            user_id: userId,
            tokens: decryptedGarthDump,
            start_date: startDate,
            end_date: endDate
        };
        // Only include activity_type if it's a non-null string
        if (activityType) {
            payload.activity_type = activityType;
        }

        const response = await axios.post(`${GARMIN_MICROSERVICE_URL}/data/activities_and_workouts`, payload, {
            timeout: 120000 // 2 minutes timeout
        });

        log('debug', `Raw activities and workouts data from Garmin microservice for user ${userId} from ${startDate} to ${endDate}:`, response.data);
        return response.data;

    } catch (error) {
        log('error', `Error fetching Garmin activities and workouts for user ${userId} from ${startDate} to ${endDate}:`, error.response ? error.response.data : error.message);
        throw new Error(`Failed to fetch Garmin activities and workouts: ${error.response ? error.response.data.detail : error.message}`);
    }
}