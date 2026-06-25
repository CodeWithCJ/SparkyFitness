import { getClient, getSystemClient } from '../db/poolManager.js';
import { encrypt, decrypt, ENCRYPTION_KEY } from '../security/encryption.js';
import { log } from '../config/logging.js';
import {
  AiServiceSettings,
  SparkyChatHistory,
  SparkyChatHistoryMutator,
} from '@workspace/shared';

async function upsertAiServiceSetting(
  settingData: Partial<AiServiceSettings> & { api_key?: string | null }
) {
  const client = await getClient(settingData.user_id); // User-specific operation
  try {
    let encryptedApiKey = settingData.encrypted_api_key || null;
    let apiKeyIv = settingData.api_key_iv || null;
    let apiKeyTag = settingData.api_key_tag || null;
    if (settingData.api_key) {
      const { encryptedText, iv, tag } = await encrypt(
        settingData.api_key,
        ENCRYPTION_KEY
      );
      encryptedApiKey = encryptedText;
      apiKeyIv = iv;
      apiKeyTag = tag;
    }
    if (settingData.id) {
      // Update existing service
      const result = await client.query(
        `UPDATE ai_service_settings SET
          service_name = COALESCE($1, service_name), service_type = COALESCE($2, service_type), custom_url = $3,
          system_prompt = $4, is_active = $5, model_name = $6,
          encrypted_api_key = COALESCE($7, encrypted_api_key),
          api_key_iv = COALESCE($8, api_key_iv),
          api_key_tag = COALESCE($9, api_key_tag),
          chat_tool_profile = COALESCE($10, chat_tool_profile),
          updated_at = now()
        WHERE id = $11 RETURNING *`,
        [
          settingData.service_name,
          settingData.service_type,
          settingData.custom_url,
          settingData.system_prompt,
          settingData.is_active,
          settingData.model_name,
          encryptedApiKey,
          apiKeyIv,
          apiKeyTag,
          settingData.chat_tool_profile ?? null,
          settingData.id,
        ]
      );
      return result.rows[0];
    } else {
      // Insert new service
      const result = await client.query(
        `INSERT INTO ai_service_settings (
          user_id, service_name, service_type, custom_url, system_prompt,
          is_active, model_name, encrypted_api_key, api_key_iv, api_key_tag, chat_tool_profile, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now(), now()) RETURNING *`,
        [
          settingData.user_id,
          settingData.service_name,
          settingData.service_type,
          settingData.custom_url,
          settingData.system_prompt,
          settingData.is_active,
          settingData.model_name,
          encryptedApiKey,
          apiKeyIv,
          apiKeyTag,
          settingData.chat_tool_profile ?? 'full',
        ]
      );
      return result.rows[0];
    }
  } finally {
    client.release();
  }
}
async function getAiServiceSettingForBackend(id: string, userId: string) {
  const client = await getClient(userId); // User-specific operation
  try {
    // Try to get setting (can be user-specific or global)
    const result = await client.query(
      'SELECT * FROM ai_service_settings WHERE id = $1 AND is_active = TRUE',
      [id]
    );
    const setting = result.rows[0];
    if (!setting) return null;
    let decryptedApiKey = null;
    if (
      setting.encrypted_api_key &&
      setting.api_key_iv &&
      setting.api_key_tag
    ) {
      try {
        decryptedApiKey = await decrypt(
          setting.encrypted_api_key,
          setting.api_key_iv,
          setting.api_key_tag,
          ENCRYPTION_KEY
        );
      } catch (e) {
        log('error', 'Error decrypting API key for AI service setting:', id, e);
      }
    }
    const source = setting.is_public ? 'global' : 'user';
    log(
      'debug',
      `Retrieved AI service setting ${id} (source: ${source}) for user ${userId}`
    );
    return { ...setting, api_key: decryptedApiKey, source };
  } finally {
    client.release();
  }
}
async function getAiServiceSettingById(id: string, userId: string) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      'SELECT id, service_name, service_type, custom_url, is_active, model_name FROM ai_service_settings WHERE id = $1',
      [id]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}
async function deleteAiServiceSetting(id: string, userId: string) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      'DELETE FROM ai_service_settings WHERE id = $1 RETURNING id',
      [id]
    );
    return result.rowCount > 0;
  } finally {
    client.release();
  }
}
async function getAiServiceSettingsByUserId(userId: string) {
  const client = await getClient(userId); // User-specific operation
  try {
    // Get user-specific settings
    const userResult = await client.query(
      'SELECT id, service_name, service_type, custom_url, is_active, model_name, is_public, system_prompt, user_id, chat_tool_profile FROM ai_service_settings WHERE is_public = FALSE AND user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    // Get global settings (admin-created, all authenticated users can read)
    const globalResult = await client.query(
      'SELECT id, service_name, service_type, custom_url, is_active, model_name, is_public, system_prompt, user_id, chat_tool_profile FROM ai_service_settings WHERE is_public = TRUE ORDER BY created_at DESC',
      []
    );
    // Combine results: user settings first, then global settings
    const userSettings = userResult.rows.map((row: any) => ({
      ...row,
      is_public: false,
    }));
    const publicSettings = globalResult.rows.map((row: any) => ({
      ...row,
      is_public: true,
    }));
    return [...userSettings, ...publicSettings];
  } finally {
    client.release();
  }
}
async function getActiveAiServiceSetting(userId: string) {
  const client = await getClient(userId); // User-specific operation
  try {
    // Priority 0: check if user has active_ai_service_id in user_preferences
    const prefResult = await client.query(
      'SELECT active_ai_service_id FROM user_preferences WHERE user_id = $1',
      [userId]
    );
    if (prefResult.rows.length > 0 && prefResult.rows[0].active_ai_service_id) {
      const activeId = prefResult.rows[0].active_ai_service_id;
      const settingResult = await client.query(
        `SELECT ai.id, ai.service_name, ai.service_type, ai.custom_url, ai.is_active, ai.model_name, ai.is_public, ai.system_prompt, ai.user_id, u.name as creator_name
         FROM ai_service_settings ai
         LEFT JOIN public."user" u ON ai.user_id = u.id
         WHERE ai.id = $1 AND ai.is_active = TRUE`,
        [activeId]
      );
      if (settingResult.rows.length > 0) {
        const setting = settingResult.rows[0];
        const source = setting.is_public ? 'global' : 'user';
        log(
          'debug',
          `Using preferred AI service setting for user ${userId}: ${setting.id} (source: ${source})`
        );
        return { ...setting, source };
      }
    }

    // Priority 1: User-specific active setting
    const userResult = await client.query(
      'SELECT id, service_name, service_type, custom_url, is_active, model_name, is_public, system_prompt, user_id FROM ai_service_settings WHERE is_active = TRUE AND is_public = FALSE AND user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [userId]
    );
    if (userResult.rows.length > 0) {
      const setting = userResult.rows[0];
      log(
        'debug',
        `Using user-specific AI service setting fallback for user ${userId}: ${setting.id}`
      );
      return { ...setting, source: 'user' };
    }
    // Priority 2: Database global active setting
    const globalResult = await client.query(
      'SELECT id, service_name, service_type, custom_url, is_active, model_name, is_public, system_prompt, user_id FROM ai_service_settings WHERE is_active = TRUE AND is_public = TRUE ORDER BY created_at DESC LIMIT 1',
      []
    );
    if (globalResult.rows.length > 0) {
      const setting = globalResult.rows[0];
      log(
        'debug',
        `Using global database AI service setting fallback for user ${userId}: ${setting.id}`
      );
      return { ...setting, source: 'global' };
    }
    log('debug', `No active AI service setting found for user ${userId}`);
    return null;
  } finally {
    client.release();
  }
}
async function clearOldChatHistory(userId: string) {
  const client = await getClient(userId);
  try {
    await client.query(
      `
      DELETE FROM sparky_chat_history
      WHERE created_at < NOW() - INTERVAL '7 days'
    `,
      []
    );
    return true;
  } finally {
    client.release();
  }
}
async function getChatHistoryByUserId(userId: string) {
  const client = await getClient(userId); // User-specific operation
  try {
    // Fetch the 50 most recent messages (ORDER BY created_at DESC LIMIT 50)
    // and sort them chronologically (ORDER BY created_at ASC) in the outer query
    // so that the AI context and UI display them in the correct chronological order.
    const result = await client.query(
      'SELECT id, content, message_type, created_at, metadata, parts FROM (SELECT id, content, message_type, created_at, metadata, parts FROM sparky_chat_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50) sub ORDER BY created_at ASC',
      [userId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}
async function getChatHistoryEntryById(id: string, userId: string) {
  const client = await getClient(userId); // User-specific operation (RLS will handle access)
  try {
    const result = await client.query(
      'SELECT * FROM sparky_chat_history WHERE id = $1',
      [id]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}
async function getChatHistoryEntryOwnerId(id: string, userId: string) {
  const client = await getClient(userId); // User-specific operation (RLS will handle access)
  try {
    const result = await client.query(
      'SELECT user_id FROM sparky_chat_history WHERE id = $1',
      [id]
    );
    return result.rows[0]?.user_id;
  } finally {
    client.release();
  }
}
async function updateChatHistoryEntry(
  id: string,
  userId: string,
  updateData: SparkyChatHistoryMutator
) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `UPDATE sparky_chat_history SET
        content = COALESCE($1, content),
        message_type = COALESCE($2, message_type),
        metadata = COALESCE($3, metadata),
        session_id = COALESCE($4, session_id),
        message = COALESCE($5, message),
        response = COALESCE($6, response),
        parts = COALESCE($7, parts),
        updated_at = now()
      WHERE id = $8
      RETURNING *`,
      [
        updateData.content,
        updateData.message_type,
        updateData.metadata,
        updateData.session_id,
        updateData.message,
        updateData.response,
        updateData.parts ? JSON.stringify(updateData.parts) : null,
        id,
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}
async function deleteChatHistoryEntry(id: string, userId: string) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      'DELETE FROM sparky_chat_history WHERE id = $1 RETURNING id',
      [id]
    );
    return result.rowCount > 0;
  } finally {
    client.release();
  }
}
async function clearAllChatHistory(userId: string) {
  const client = await getClient(userId); // User-specific operation
  try {
    await client.query('DELETE FROM sparky_chat_history', []);
    return true;
  } finally {
    client.release();
  }
}
async function saveChatHistory(
  historyData: Partial<SparkyChatHistory> & {
    messageType?: 'user' | 'assistant';
  }
) {
  const client = await getClient(historyData.user_id); // User-specific operation
  try {
    await client.query(
      `INSERT INTO sparky_chat_history (user_id, content, message_type, metadata, parts, created_at)
       VALUES ($1, $2, $3, $4, $5, now())`,
      [
        historyData.user_id,
        historyData.content,
        historyData.messageType,
        historyData.metadata,
        historyData.parts ? JSON.stringify(historyData.parts) : null,
      ]
    );
    return true;
  } finally {
    client.release();
  }
}
async function upsertGlobalAiServiceSetting(
  settingData: Partial<AiServiceSettings> & { api_key?: string | null }
) {
  const client = await getSystemClient(); // Use system client for global operations
  try {
    let encryptedApiKey = settingData.encrypted_api_key || null;
    let apiKeyIv = settingData.api_key_iv || null;
    let apiKeyTag = settingData.api_key_tag || null;
    if (settingData.api_key) {
      const { encryptedText, iv, tag } = await encrypt(
        settingData.api_key,
        ENCRYPTION_KEY
      );
      encryptedApiKey = encryptedText;
      apiKeyIv = iv;
      apiKeyTag = tag;
    }
    if (settingData.id) {
      // Update existing global service
      const result = await client.query(
        `UPDATE ai_service_settings SET
          service_name = $1, service_type = $2, custom_url = $3,
          system_prompt = $4, is_active = $5, model_name = $6,
          encrypted_api_key = COALESCE($7, encrypted_api_key),
          api_key_iv = COALESCE($8, api_key_iv),
          api_key_tag = COALESCE($9, api_key_tag),
          chat_tool_profile = COALESCE($10, chat_tool_profile),
          updated_at = now()
        WHERE id = $11 AND is_public = TRUE RETURNING *`,
        [
          settingData.service_name,
          settingData.service_type,
          settingData.custom_url,
          settingData.system_prompt,
          settingData.is_active,
          settingData.model_name,
          encryptedApiKey,
          apiKeyIv,
          apiKeyTag,
          settingData.chat_tool_profile ?? null,
          settingData.id,
        ]
      );
      return result.rows[0];
    } else {
      // Insert new global service
      const result = await client.query(
        `INSERT INTO ai_service_settings (
          user_id, is_public, service_name, service_type, custom_url, system_prompt,
          is_active, model_name, encrypted_api_key, api_key_iv, api_key_tag, chat_tool_profile, created_at, updated_at
        ) VALUES (NULL, TRUE, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now(), now()) RETURNING *`,
        [
          settingData.service_name,
          settingData.service_type,
          settingData.custom_url,
          settingData.system_prompt,
          settingData.is_active,
          settingData.model_name,
          encryptedApiKey,
          apiKeyIv,
          apiKeyTag,
          settingData.chat_tool_profile ?? 'full',
        ]
      );
      return result.rows[0];
    }
  } finally {
    client.release();
  }
}
async function getGlobalAiServiceSettings() {
  const client = await getSystemClient(); // Use system client for global operations
  try {
    const result = await client.query(
      'SELECT id, service_name, service_type, custom_url, is_active, model_name, is_public, system_prompt, created_at, updated_at, chat_tool_profile FROM ai_service_settings WHERE is_public = TRUE ORDER BY created_at DESC',
      []
    );
    return result.rows;
  } finally {
    client.release();
  }
}
async function getGlobalAiServiceSettingById(id: string) {
  const client = await getSystemClient(); // Use system client for global operations
  try {
    const result = await client.query(
      'SELECT id, service_name, service_type, custom_url, is_active, model_name, is_public FROM ai_service_settings WHERE id = $1 AND is_public = TRUE',
      [id]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}
async function deleteGlobalAiServiceSetting(id: string) {
  const client = await getSystemClient(); // Use system client for global operations
  try {
    const result = await client.query(
      'DELETE FROM ai_service_settings WHERE id = $1 AND is_public = TRUE RETURNING id',
      [id]
    );
    return result.rowCount > 0;
  } finally {
    client.release();
  }
}
export { upsertAiServiceSetting };
export { getAiServiceSettingById };
export { getAiServiceSettingForBackend };
export { deleteAiServiceSetting };
export { getAiServiceSettingsByUserId };
export { getActiveAiServiceSetting };
export { clearOldChatHistory };
export { getChatHistoryByUserId };
export { getChatHistoryEntryById };
export { getChatHistoryEntryOwnerId };
export { updateChatHistoryEntry };
export { deleteChatHistoryEntry };
export { clearAllChatHistory };
export { saveChatHistory };
export { upsertGlobalAiServiceSetting };
export { getGlobalAiServiceSettings };
export { getGlobalAiServiceSettingById };
export { deleteGlobalAiServiceSetting };
export default {
  upsertAiServiceSetting,
  getAiServiceSettingById,
  getAiServiceSettingForBackend,
  deleteAiServiceSetting,
  getAiServiceSettingsByUserId,
  getActiveAiServiceSetting,
  clearOldChatHistory,
  getChatHistoryByUserId,
  getChatHistoryEntryById,
  getChatHistoryEntryOwnerId,
  updateChatHistoryEntry,
  deleteChatHistoryEntry,
  clearAllChatHistory,
  saveChatHistory,
  upsertGlobalAiServiceSetting,
  getGlobalAiServiceSettings,
  getGlobalAiServiceSettingById,
  deleteGlobalAiServiceSetting,
};
