const { getClient, getSystemClient } = require('../db/poolManager');
const { encrypt, decrypt, ENCRYPTION_KEY } = require('../security/encryption');
import { log } from '../config/logging';

export interface AiServiceSetting {
  id?: string;
  user_id?: string;
  service_name: string;
  service_type: string;
  custom_url?: string;
  system_prompt?: string;
  is_active: boolean;
  model_name?: string;
  is_public?: boolean;
  api_key?: string;
  encrypted_api_key?: string;
  api_key_iv?: string;
  api_key_tag?: string;
  source?: string;
}

export interface ChatHistoryEntry {
  id?: string;
  user_id: string;
  content: string;
  message_type: string;
  metadata?: any;
  session_id?: string;
  message?: string;
  response?: string;
  created_at?: Date;
  updated_at?: Date;
}

export async function upsertAiServiceSetting(
  settingData: AiServiceSetting
): Promise<AiServiceSetting> {
  const client = await getClient(settingData.user_id);
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
      const result = await client.query(
        `UPDATE ai_service_settings SET
          service_name = COALESCE($1, service_name), service_type = COALESCE($2, service_type), custom_url = $3,
          system_prompt = $4, is_active = $5, model_name = $6,
          encrypted_api_key = COALESCE($7, encrypted_api_key),
          api_key_iv = COALESCE($8, api_key_iv),
          api_key_tag = COALESCE($9, api_key_tag),
          updated_at = now()
        WHERE id = $10 RETURNING *`,
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
          settingData.id,
        ]
      );
      return result.rows[0];
    } else {
      const result = await client.query(
        `INSERT INTO ai_service_settings (
          user_id, service_name, service_type, custom_url, system_prompt,
          is_active, model_name, encrypted_api_key, api_key_iv, api_key_tag, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now(), now()) RETURNING *`,
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
        ]
      );
      return result.rows[0];
    }
  } finally {
    client.release();
  }
}

export async function getAiServiceSettingForBackend(
  id: string,
  userId: string
): Promise<AiServiceSetting | null> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      'SELECT * FROM ai_service_settings WHERE id = $1',
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

export async function getAiServiceSettingById(
  id: string,
  userId: string
): Promise<any> {
  const client = await getClient(userId);
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

export async function deleteAiServiceSetting(
  id: string,
  userId: string
): Promise<boolean> {
  const client = await getClient(userId);
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

export async function getAiServiceSettingsByUserId(
  userId: string
): Promise<AiServiceSetting[]> {
  const client = await getClient(userId);
  try {
    const userResult = await client.query(
      'SELECT id, service_name, service_type, custom_url, is_active, model_name, is_public, system_prompt FROM ai_service_settings WHERE is_public = FALSE AND user_id = $1 ORDER BY created_at DESC',
      [userId]
    );

    const globalResult = await client.query(
      'SELECT id, service_name, service_type, custom_url, is_active, model_name, is_public, system_prompt FROM ai_service_settings WHERE is_public = TRUE ORDER BY created_at DESC',
      []
    );

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

export async function getActiveAiServiceSetting(
  userId: string
): Promise<AiServiceSetting | null> {
  const client = await getClient(userId);
  try {
    const userResult = await client.query(
      'SELECT id, service_name, service_type, custom_url, is_active, model_name, is_public, system_prompt FROM ai_service_settings WHERE is_active = TRUE AND is_public = FALSE AND user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [userId]
    );

    if (userResult.rows.length > 0) {
      const setting = userResult.rows[0];
      log(
        'debug',
        `Using user-specific AI service setting for user ${userId}: ${setting.id}`
      );
      return { ...setting, source: 'user' };
    }

    const globalResult = await client.query(
      'SELECT id, service_name, service_type, custom_url, is_active, model_name, is_public, system_prompt FROM ai_service_settings WHERE is_active = TRUE AND is_public = TRUE ORDER BY created_at DESC LIMIT 1',
      []
    );

    if (globalResult.rows.length > 0) {
      const setting = globalResult.rows[0];
      log(
        'debug',
        `Using global database AI service setting for user ${userId}: ${setting.id}`
      );
      return { ...setting, source: 'global' };
    }

    log('debug', `No active AI service setting found for user ${userId}`);
    return null;
  } finally {
    client.release();
  }
}

export async function clearOldChatHistory(userId: string): Promise<boolean> {
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

export async function getChatHistoryByUserId(userId: string): Promise<any[]> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      'SELECT content, message_type, metadata, created_at FROM sparky_chat_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10',
      [userId]
    );
    return result.rows.reverse();
  } finally {
    client.release();
  }
}

export async function getChatHistoryEntryById(
  id: string,
  userId: string
): Promise<any> {
  const client = await getClient(userId);
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

export async function getChatHistoryEntryOwnerId(
  id: string,
  userId: string
): Promise<string | undefined> {
  const client = await getClient(userId);
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

export async function updateChatHistoryEntry(
  id: string,
  userId: string,
  updateData: any
): Promise<any> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `UPDATE sparky_chat_history SET
        content = COALESCE($1, content),
        message_type = COALESCE($2, message_type),
        metadata = COALESCE($3, metadata),
        session_id = COALESCE($4, session_id),
        message = COALESCE($5, message),
        response = COALESCE($6, response),
        updated_at = now()
      WHERE id = $7
      RETURNING *`,
      [
        updateData.content,
        updateData.message_type,
        updateData.metadata,
        updateData.session_id,
        updateData.message,
        updateData.response,
        id,
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

export async function deleteChatHistoryEntry(
  id: string,
  userId: string
): Promise<boolean> {
  const client = await getClient(userId);
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

export async function clearAllChatHistory(userId: string): Promise<boolean> {
  const client = await getClient(userId);
  try {
    await client.query('DELETE FROM sparky_chat_history', []);
    return true;
  } finally {
    client.release();
  }
}

export async function saveChatMessage(
  userId: string,
  content: string,
  messageType: string,
  metadata: any = null
): Promise<boolean> {
  const client = await getClient(userId);
  try {
    await client.query(
      `INSERT INTO sparky_chat_history (user_id, content, message_type, metadata, created_at)
       VALUES ($1, $2, $3, $4, now())`,
      [userId, content, messageType, metadata]
    );
    return true;
  } finally {
    client.release();
  }
}

export async function upsertGlobalAiServiceSetting(
  settingData: any
): Promise<any> {
  const client = await getSystemClient();
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
      const result = await client.query(
        `UPDATE ai_service_settings SET
          service_name = $1, service_type = $2, custom_url = $3,
          system_prompt = $4, is_active = $5, model_name = $6,
          encrypted_api_key = COALESCE($7, encrypted_api_key),
          api_key_iv = COALESCE($8, api_key_iv),
          api_key_tag = COALESCE($9, api_key_tag),
          updated_at = now()
        WHERE id = $10 AND is_public = TRUE RETURNING *`,
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
          settingData.id,
        ]
      );
      return result.rows[0];
    } else {
      const result = await client.query(
        `INSERT INTO ai_service_settings (
          user_id, is_public, service_name, service_type, custom_url, system_prompt,
          is_active, model_name, encrypted_api_key, api_key_iv, api_key_tag, created_at, updated_at
        ) VALUES (NULL, TRUE, $1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now()) RETURNING *`,
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
        ]
      );
      return result.rows[0];
    }
  } finally {
    client.release();
  }
}

export async function getGlobalAiServiceSettings(): Promise<any[]> {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      'SELECT id, service_name, service_type, custom_url, is_active, model_name, is_public, system_prompt, created_at, updated_at FROM ai_service_settings WHERE is_public = TRUE ORDER BY created_at DESC',
      []
    );
    return result.rows;
  } finally {
    client.release();
  }
}

export async function getGlobalAiServiceSettingById(id: string): Promise<any> {
  const client = await getSystemClient();
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

export async function deleteGlobalAiServiceSetting(
  id: string
): Promise<boolean> {
  const client = await getSystemClient();
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
