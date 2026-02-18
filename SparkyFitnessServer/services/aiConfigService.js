const { encrypt, ENCRYPTION_KEY } = require('../security/encryption');
const { log } = require('../config/logging');
const { getClient, getSystemClient } = require('../db/poolManager');
const { getBooleanEnv } = require('../utils/env');

/**
 * Get AI service configuration from environment variables
 * @returns {Object|null} Configuration object or null if not available
 */
function getAiServiceFromEnv() {
  const serviceType = process.env.SPARKY_FITNESS_AI_SERVICE_TYPE;
  const serviceName = process.env.SPARKY_FITNESS_AI_SERVICE_NAME;
  const apiKey = process.env.SPARKY_FITNESS_AI_API_KEY;
  const modelName = process.env.SPARKY_FITNESS_AI_MODEL_NAME;
  const customUrl = process.env.SPARKY_FITNESS_AI_CUSTOM_URL;
  const systemPrompt = process.env.SPARKY_FITNESS_AI_SYSTEM_PROMPT;
  const isActive = getBooleanEnv('SPARKY_FITNESS_AI_IS_ACTIVE', true);

  // Check if env var config is available (at minimum, we need service_type and service_name)
  if (!serviceType || !serviceName) {
    return null;
  }

  // Validate required fields based on service type
  if (serviceType !== 'ollama' && !apiKey) {
    log('warn', 'AI service configuration from env vars is incomplete: API key missing for non-Ollama service');
    return null;
  }

  return {
    service_type: serviceType,
    service_name: serviceName,
    api_key: apiKey || null,
    model_name: modelName || null,
    custom_url: customUrl || null,
    system_prompt: systemPrompt || null,
    is_active: isActive,
    source: 'environment' // Indicate this came from environment variables
  };
}

/**
 * Sync environment variable configuration to database as global setting
 * Creates or updates the global AI service setting from environment variables
 * @returns {Promise<Object|null>} The created/updated setting or null if sync failed
 */
async function syncEnvToDatabase() {
  try {
    const envConfig = getAiServiceFromEnv();
    if (!envConfig) {
      log('info', 'No valid AI service configuration found in environment variables, skipping sync');
      return null;
    }

    const client = await getSystemClient(); // Use system client for global operations
    try {
      // Encrypt API key if provided
      let encryptedApiKey = null;
      let apiKeyIv = null;
      let apiKeyTag = null;

      if (envConfig.api_key) {
        const { encryptedText, iv, tag } = await encrypt(envConfig.api_key, ENCRYPTION_KEY);
        encryptedApiKey = encryptedText;
        apiKeyIv = iv;
        apiKeyTag = tag;
      }

      // Check if a global setting already exists
      const existingResult = await client.query(
        'SELECT id FROM ai_service_settings WHERE is_global = TRUE LIMIT 1',
        []
      );

      if (existingResult.rows.length > 0) {
        // Update existing global setting
        const result = await client.query(
          `UPDATE ai_service_settings SET
            service_name = $1, service_type = $2, custom_url = $3,
            system_prompt = $4, is_active = $5, model_name = $6,
            encrypted_api_key = COALESCE($7, encrypted_api_key),
            api_key_iv = COALESCE($8, api_key_iv),
            api_key_tag = COALESCE($9, api_key_tag),
            updated_at = now()
          WHERE is_global = TRUE RETURNING *`,
          [
            envConfig.service_name,
            envConfig.service_type,
            envConfig.custom_url,
            envConfig.system_prompt,
            envConfig.is_active,
            envConfig.model_name,
            encryptedApiKey,
            apiKeyIv,
            apiKeyTag
          ]
        );
        log('info', 'Updated global AI service setting from environment variables');
        return result.rows[0];
      } else {
        // Create new global setting
        const result = await client.query(
          `INSERT INTO ai_service_settings (
            user_id, is_global, service_name, service_type, custom_url, system_prompt,
            is_active, model_name, encrypted_api_key, api_key_iv, api_key_tag, created_at, updated_at
          ) VALUES (NULL, TRUE, $1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now()) RETURNING *`,
          [
            envConfig.service_name,
            envConfig.service_type,
            envConfig.custom_url,
            envConfig.system_prompt,
            envConfig.is_active,
            envConfig.model_name,
            encryptedApiKey,
            apiKeyIv,
            apiKeyTag
          ]
        );
        log('info', 'Created global AI service setting from environment variables');
        return result.rows[0];
      }
    } finally {
      client.release();
    }
  } catch (error) {
    log('error', 'Error syncing AI service configuration from environment variables to database:', error);
    throw error;
  }
}

module.exports = {
  getAiServiceFromEnv,
  syncEnvToDatabase,
};
