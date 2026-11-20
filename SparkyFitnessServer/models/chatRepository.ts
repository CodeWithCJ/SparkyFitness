import {
  getClient,
  getSystemClient,
  signedInUserIdOr,
} from '../db/poolManager.js';
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
          reasoning_effort = COALESCE($11, reasoning_effort),
          supports_audio_input = COALESCE($12, supports_audio_input),
          updated_at = now()
        WHERE id = $13 RETURNING *`,
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
          settingData.reasoning_effort ?? null,
          settingData.supports_audio_input,
          settingData.id,
        ]
      );
      return result.rows[0];
    } else {
      // Insert new service
      const result = await client.query(
        `INSERT INTO ai_service_settings (
          user_id, service_name, service_type, custom_url, system_prompt,
          is_active, model_name, encrypted_api_key, api_key_iv, api_key_tag,
          chat_tool_profile, reasoning_effort, supports_audio_input, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now(), now()) RETURNING *`,
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
          settingData.reasoning_effort ?? 'medium',
          settingData.supports_audio_input ?? false,
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
// Decrypt-and-return a single setting WITHOUT the `is_active = TRUE` filter that
// getAiServiceSettingForBackend applies — the connection test must work for an
// inactive service too. The user-scoped client preserves RLS: a user reads only
// their own private rows plus `is_public` global rows, so this serves both the
// per-user and admin/global test contexts without leaking other users' keys.
async function getDecryptedAiServiceSettingById(
  id: string,
  userId: string
): Promise<
  | (Pick<
      AiServiceSettings,
      | 'service_type'
      | 'custom_url'
      | 'model_name'
      | 'reasoning_effort'
      | 'is_public'
    > & { api_key: string | null })
  | null
> {
  const client = await getClient(userId); // User-specific operation (RLS-scoped)
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
    return {
      service_type: setting.service_type,
      api_key: decryptedApiKey,
      custom_url: setting.custom_url,
      model_name: setting.model_name,
      reasoning_effort: setting.reasoning_effort ?? 'medium',
      is_public: setting.is_public,
    };
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
// AI services and the choice between them belong to the signed-in person, so
// after a Profile Switcher switch these three resolve theirs, not the account's.
// The account's own are private to it (RLS), so asking for them would come back
// empty or fall through to the admin's global service.
async function getAiServiceSettingsByUserId(accountUserId: string) {
  const userId = signedInUserIdOr(accountUserId);
  const client = await getClient(userId); // User-specific operation
  try {
    // Get user-specific settings
    const userResult = await client.query(
      'SELECT id, service_name, service_type, custom_url, is_active, model_name, is_public, system_prompt, user_id, chat_tool_profile, reasoning_effort, supports_audio_input FROM ai_service_settings WHERE is_public = FALSE AND user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    // Get global settings (admin-created, all authenticated users can read)
    const globalResult = await client.query(
      'SELECT id, service_name, service_type, custom_url, is_active, model_name, is_public, system_prompt, user_id, chat_tool_profile, reasoning_effort, supports_audio_input FROM ai_service_settings WHERE is_public = TRUE ORDER BY created_at DESC',
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
async function getActiveAiServiceSetting(accountUserId: string) {
  const userId = signedInUserIdOr(accountUserId);
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
        `SELECT ai.id, ai.service_name, ai.service_type, ai.custom_url, ai.is_active, ai.model_name, ai.is_public, ai.system_prompt, ai.user_id, ai.chat_tool_profile, ai.reasoning_effort, ai.supports_audio_input, u.name as creator_name
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
      'SELECT id, service_name, service_type, custom_url, is_active, model_name, is_public, system_prompt, user_id, chat_tool_profile, reasoning_effort, supports_audio_input FROM ai_service_settings WHERE is_active = TRUE AND is_public = FALSE AND user_id = $1 ORDER BY created_at DESC LIMIT 1',
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
      'SELECT id, service_name, service_type, custom_url, is_active, model_name, is_public, system_prompt, user_id, chat_tool_profile, reasoning_effort, supports_audio_input FROM ai_service_settings WHERE is_active = TRUE AND is_public = TRUE ORDER BY created_at DESC LIMIT 1',
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
// Resolves the AI service to use for vision tasks (food-photo, label scan).
// The existing active/default service is the text default; vision falls back to
// it unless the user (or admin, for defaulted users) points vision elsewhere.
// See models/chatRepository getActiveAiServiceSetting for the text counterpart.
async function getActiveVisionAiServiceSetting(accountUserId: string) {
  const userId = signedInUserIdOr(accountUserId);
  const client = await getClient(userId); // User-specific operation
  try {
    // Read both pointers up front: step 1 needs the vision pointer, and step 3
    // compares active_ai_service_id against the resolved base to tell a
    // genuinely-defaulted user apart from one whose explicit text pick is live.
    const prefResult = await client.query(
      'SELECT active_ai_service_id, active_vision_ai_service_id FROM user_preferences WHERE user_id = $1',
      [userId]
    );
    const prefs = prefResult.rows[0];

    // 1. Explicit per-user vision override (mirrors Priority-0 of the text
    //    resolver) — honored only while the pointed-to service is active.
    if (prefs && prefs.active_vision_ai_service_id) {
      const visionId = prefs.active_vision_ai_service_id;
      const settingResult = await client.query(
        `SELECT ai.id, ai.service_name, ai.service_type, ai.custom_url, ai.is_active, ai.model_name, ai.is_public, ai.system_prompt, ai.user_id, ai.chat_tool_profile, ai.reasoning_effort, ai.supports_audio_input, u.name as creator_name
         FROM ai_service_settings ai
         LEFT JOIN public."user" u ON ai.user_id = u.id
         WHERE ai.id = $1 AND ai.is_active = TRUE`,
        [visionId]
      );
      if (settingResult.rows.length > 0) {
        const setting = settingResult.rows[0];
        const source = setting.is_public ? 'global' : 'user';
        log(
          'debug',
          `Using preferred vision AI service setting for user ${userId}: ${setting.id} (source: ${source})`
        );
        return { ...setting, source };
      }
    }

    // 2. No usable vision override → the text/default service is the baseline.
    const base = await getActiveAiServiceSetting(userId);
    if (!base) return null;

    // 3. Apply the admin global vision default only to users effectively on the
    //    global default: the base resolved as a global service AND the user's
    //    explicit text pointer did not resolve to it. Keying off whether the
    //    pointer actually resolved (active_ai_service_id === base.id) — rather
    //    than merely whether it is set — means a user whose explicitly-chosen
    //    service was later deactivated (and who has fallen through to the global
    //    default) still gets the configured vision default, while a live explicit
    //    pick is never silently redirected. We read global_settings with the
    //    user-scoped client (the table has no RLS and grants SELECT to the app
    //    role) to avoid the system-client read in globalSettingsRepository that
    //    logs every field.
    if (base.source === 'global' && prefs?.active_ai_service_id !== base.id) {
      const globalResult = await client.query(
        'SELECT default_vision_ai_service_id FROM global_settings WHERE id = 1',
        []
      );
      const defaultVisionId =
        globalResult.rows[0]?.default_vision_ai_service_id;
      if (defaultVisionId) {
        // Enforce is_public in the query so the repository upholds the
        // global-only invariant even though the admin UI only lists globals.
        const visionResult = await client.query(
          'SELECT id, service_name, service_type, custom_url, is_active, model_name, is_public, system_prompt, user_id FROM ai_service_settings WHERE id = $1 AND is_active = TRUE AND is_public = TRUE',
          [defaultVisionId]
        );
        if (visionResult.rows.length > 0) {
          const setting = visionResult.rows[0];
          log(
            'debug',
            `Using global vision AI service default for user ${userId}: ${setting.id}`
          );
          return { ...setting, source: 'global' };
        }
      }
    }

    // 4. Otherwise reuse the text service for vision.
    return base;
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
// Chat history belongs to the signed-in person. A message sent after a Profile
// Switcher switch records the family member's account in
// metadata.account_user_id, so each account's conversation is restored and
// cleared on its own: tools follow the account, and a turn from one account
// must not reach the model as context in another.
const IN_ACCOUNT = "COALESCE(metadata->>'account_user_id', user_id::text) = $2";

async function getChatHistoryByUserId(
  userId: string,
  accountUserId: string = userId
) {
  const client = await getClient(userId); // User-specific operation
  try {
    // Fetch the 50 most recent messages (ORDER BY created_at DESC LIMIT 50)
    // and sort them chronologically (ORDER BY created_at ASC) in the outer query
    // so that the AI context and UI display them in the correct chronological order.
    const result = await client.query(
      `SELECT m.id, m.content, m.message_type, m.created_at, m.parts,
              CASE WHEN checkpoint.turn_id IS NULL THEN m.metadata
                   ELSE COALESCE(m.metadata, '{}'::jsonb) || jsonb_build_object('pendingTurnId', checkpoint.turn_id) END AS metadata
       FROM (
         SELECT * FROM sparky_chat_history WHERE user_id = $1 AND ${IN_ACCOUNT}
           AND metadata->>'turnHidden' IS DISTINCT FROM 'true'
         ORDER BY created_at DESC LIMIT 50
       ) m
       LEFT JOIN LATERAL (
         SELECT metadata->>'turnId' AS turn_id, metadata->>'turnState' AS state
         FROM sparky_chat_history
         WHERE user_id = $1 AND ${IN_ACCOUNT} AND message_type = 'user'
           AND metadata->>'continuationOf' = m.id::text
           AND metadata->>'continuationFrom' IS NOT DISTINCT FROM m.metadata->>'turnId'
         ORDER BY created_at DESC LIMIT 1
       ) checkpoint ON m.message_type = 'assistant'
                  AND checkpoint.state IS DISTINCT FROM 'complete'
                  AND checkpoint.state IS DISTINCT FROM 'cancelled'
       ORDER BY m.created_at ASC`,
      [userId, accountUserId]
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
        parts = COALESCE($7, parts)
      WHERE id = $8
        -- Approval state is the server's record of what the person allowed,
        -- so an edit may neither change a row that holds it nor write it.
        AND NOT (COALESCE(parts, '[]'::jsonb) @? '$[*].approval')
        AND NOT (COALESCE($7::jsonb, '[]'::jsonb) @? '$[*].approval')
      RETURNING *`,
      [
        updateData.content,
        updateData.message_type,
        metadataParam(updateData.metadata),
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
// The server's own save of a reply continued after an approval. The public
// edit above refuses rows holding approval state, so this one is not exposed to
// any route.
async function saveApprovalContinuation(
  id: string,
  userId: string,
  update: { content: string; parts: unknown[]; metadata?: unknown }
) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `UPDATE sparky_chat_history SET
        content = $1,
        parts = $2,
        metadata = COALESCE($3, metadata)
      WHERE id = $4
      RETURNING id`,
      [
        update.content,
        JSON.stringify(update.parts),
        metadataParam(update.metadata),
        id,
      ]
    );
    return result.rowCount > 0;
  } finally {
    client.release();
  }
}
async function deleteChatHistoryEntry(id: string, userId: string) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      'DELETE FROM sparky_chat_history WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    return result.rowCount > 0;
  } finally {
    client.release();
  }
}
async function clearAllChatHistory(
  userId: string,
  accountUserId: string = userId
) {
  const client = await getClient(userId); // User-specific operation
  try {
    await client.query(
      `DELETE FROM sparky_chat_history WHERE user_id = $1 AND ${IN_ACCOUNT}`,
      [userId, accountUserId]
    );
    return true;
  } finally {
    client.release();
  }
}
// Bound JSON-encoded, so PostgreSQL stores a string as a JSON string instead of
// parsing it into an object that could carry its own account_user_id.
function metadataParam(metadata: unknown): string | null {
  return metadata === undefined || metadata === null
    ? null
    : JSON.stringify(metadata);
}
async function saveChatHistory(
  historyData: Partial<SparkyChatHistory> & {
    messageType?: 'user' | 'assistant';
  }
) {
  const client = await getClient(historyData.user_id); // User-specific operation
  try {
    await client.query(
      `INSERT INTO sparky_chat_history (user_id, content, message_type, metadata, parts, id, created_at)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6::uuid, gen_random_uuid()), now())`,
      [
        historyData.user_id,
        historyData.content,
        historyData.messageType,
        metadataParam(historyData.metadata),
        historyData.parts ? JSON.stringify(historyData.parts) : null,
        historyData.id ?? null,
      ]
    );
    return true;
  } finally {
    client.release();
  }
}
// Chat history has no unique constraint on id. Serialize competing claims,
// including requests handled by separate server processes.
async function withTurnLock<T>(
  id: string,
  userId: string,
  action: (client: Awaited<ReturnType<typeof getClient>>) => Promise<T>
) {
  const client = await getClient(userId);
  let discard = false;
  try {
    await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [id]
    );
    const result = await action(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      discard = true;
    }
    throw error;
  } finally {
    client.release(discard);
  }
}
export async function claimChatTurnPrompt(
  id: string,
  userId: string,
  content: string,
  parts: unknown[],
  metadata: object
) {
  return withTurnLock(id, userId, async (client) => {
    const result = await client.query(
      `INSERT INTO sparky_chat_history (id, user_id, content, message_type, metadata, parts, created_at)
       SELECT $1, $2, $3, 'user', CASE WHEN $4::jsonb ? 'continuationOf' THEN
         $4::jsonb || jsonb_build_object('continuationFrom', (
           SELECT metadata->>'turnId' FROM sparky_chat_history
           WHERE id = ($4::jsonb->>'continuationOf')::uuid AND user_id = $2
             AND message_type = 'assistant'
             AND metadata->>'account_user_id' IS NOT DISTINCT FROM ($4::jsonb->>'account_user_id')
           LIMIT 1
         )) ELSE $4::jsonb END, $5, now()
       WHERE NOT EXISTS (SELECT 1 FROM sparky_chat_history WHERE id = $1 AND user_id = $2)`,
      [id, userId, content, JSON.stringify(metadata), JSON.stringify(parts)]
    );
    return result.rowCount === 1;
  });
}

export async function cancelChatTurn(
  id: string,
  actor: string,
  account: string,
  turnId: string
) {
  await withTurnLock(id, actor, async (client) => {
    const result = await client.query(
      `UPDATE sparky_chat_history SET metadata = metadata || '{"turnState":"cancelled"}'::jsonb
       WHERE id = $1 AND user_id = $2 AND message_type = 'user'
         AND metadata->>'turnState' IS NULL RETURNING id`,
      [id, actor]
    );
    if (result.rowCount) return;
    // Stop may win the race with the original POST. Keep an invisible claim
    // so a delayed or retried POST can never start its producer.
    await client.query(
      `INSERT INTO sparky_chat_history (id, user_id, content, message_type, metadata, parts)
       SELECT $1, $2, '', 'user', $3, '[]'::jsonb
       WHERE NOT EXISTS (SELECT 1 FROM sparky_chat_history WHERE id = $1 AND user_id = $2)`,
      [
        id,
        actor,
        JSON.stringify({
          turnId,
          account_user_id: account,
          turnState: 'cancelled',
          turnHidden: true,
        }),
      ]
    );
  });
}

export async function markChatTurnFailed(
  id: string,
  actor: string,
  errorText: string
) {
  const client = await getClient(actor);
  try {
    await client.query(
      `UPDATE sparky_chat_history SET metadata = metadata || jsonb_build_object('turnState','failed','turnError',$3::text)
       WHERE id = $1 AND user_id = $2 AND message_type = 'user' AND metadata->>'turnState' IS NULL`,
      [id, actor, errorText]
    );
  } finally {
    client.release();
  }
}

// Commit the terminal checkpoint and assistant row together. Cancellation or a
// deadline that won the race must prevent even a late provider completion.
export async function completeChatTurn(
  id: string,
  actor: string,
  answer: {
    id: string;
    content: string;
    parts: unknown[];
    metadata: object;
  },
  continuation: boolean
) {
  return withTurnLock(id, actor, async (client) => {
    const updated = await client.query(
      `UPDATE sparky_chat_history SET metadata = metadata || '{"turnState":"complete"}'::jsonb
       WHERE id = $1 AND user_id = $2 AND message_type = 'user' AND metadata->>'turnState' IS NULL
         AND (metadata->>'turnDeadline' IS NULL OR (metadata->>'turnDeadline')::bigint > EXTRACT(EPOCH FROM clock_timestamp()) * 1000)`,
      [id, actor]
    );
    if (!updated.rowCount) return false;
    const args = [
      answer.id,
      actor,
      answer.content,
      JSON.stringify(answer.parts),
      JSON.stringify(answer.metadata),
    ];
    if (continuation) {
      const saved = await client.query(
        `UPDATE sparky_chat_history SET content=$3, parts=$4, metadata=$5
        WHERE id=$1 AND user_id=$2 AND message_type='assistant'`,
        args
      );
      if (!saved.rowCount)
        throw new Error('Approval continuation disappeared.');
    } else {
      await client.query(
        `INSERT INTO sparky_chat_history (id,user_id,content,parts,metadata,message_type,created_at)
        VALUES ($1,$2,$3,$4,$5,'assistant',now())`,
        args
      );
    }
    return true;
  });
}

export async function getChatTurnStatus(
  id: string,
  userId: string,
  timeoutMs: number
): Promise<'pending' | 'gone' | 'cancelled' | { error: string } | undefined> {
  const client = await getClient(userId);
  try {
    const { rows } = await client.query(
      `SELECT prompt.metadata->>'turnState' AS state, prompt.metadata->>'turnError' AS error,
         COALESCE(to_timestamp((prompt.metadata->>'turnDeadline')::bigint / 1000.0),
                  prompt.created_at + $3::int * interval '1 millisecond') > clock_timestamp() AS active,
         EXISTS (
           SELECT 1 FROM sparky_chat_history answer
           WHERE answer.user_id = prompt.user_id AND answer.message_type = 'assistant'
             AND answer.metadata->>'account_user_id' IS NOT DISTINCT FROM prompt.metadata->>'account_user_id'
             AND answer.metadata->>'turnId' = prompt.metadata->>'turnId'
         ) AS answered
       FROM sparky_chat_history prompt WHERE prompt.id = $1 AND prompt.user_id = $2 AND prompt.message_type='user'`,
      [id, userId, timeoutMs]
    );
    const row = rows[0];
    if (!row) return undefined;
    if (row.state === 'failed') return { error: row.error };
    if (row.state === 'cancelled') return 'cancelled';
    if (row.state === 'complete' || row.answered) return 'gone';
    return row.active ? 'pending' : { error: 'The chat request timed out.' };
  } finally {
    client.release();
  }
}
async function cancelChatApprovals(
  userId: string,
  accountUserId: string,
  conversationId?: string
) {
  const client = await getClient(userId);
  try {
    await client.query(
      `UPDATE sparky_chat_history SET parts = (
         SELECT jsonb_agg(CASE WHEN part->>'state' = 'approval-requested'
           THEN part || jsonb_build_object('state', 'output-denied', 'approval',
             (part->'approval') || '{"approved":false,"reason":"A new user message cancelled this call."}'::jsonb)
           ELSE part END ORDER BY ordinal)
         FROM jsonb_array_elements(parts) WITH ORDINALITY AS item(part, ordinal)
       ) WHERE user_id = $1 AND ${IN_ACCOUNT}
         AND metadata->>'chat_conversation_id' IS NOT DISTINCT FROM $3::text
         AND parts @> '[{"state":"approval-requested"}]'::jsonb`,
      [userId, accountUserId, conversationId ?? null]
    );
  } finally {
    client.release();
  }
}

async function claimChatApproval(
  id: string,
  userId: string,
  expectedParts: unknown[],
  parts: unknown[]
) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `UPDATE sparky_chat_history SET parts = $1::jsonb
       WHERE id = $2 AND user_id = $3 AND message_type = 'assistant' AND parts = $4::jsonb
       RETURNING id`,
      [JSON.stringify(parts), id, userId, JSON.stringify(expectedParts)]
    );
    return result.rowCount === 1;
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
          reasoning_effort = COALESCE($11, reasoning_effort),
          supports_audio_input = COALESCE($12, supports_audio_input),
          updated_at = now()
        WHERE id = $13 AND is_public = TRUE RETURNING *`,
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
          settingData.reasoning_effort ?? null,
          settingData.supports_audio_input,
          settingData.id,
        ]
      );
      return result.rows[0];
    } else {
      // Insert new global service
      const result = await client.query(
        `INSERT INTO ai_service_settings (
          user_id, is_public, service_name, service_type, custom_url, system_prompt,
          is_active, model_name, encrypted_api_key, api_key_iv, api_key_tag,
          chat_tool_profile, reasoning_effort, supports_audio_input, created_at, updated_at
        ) VALUES (NULL, TRUE, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now(), now()) RETURNING *`,
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
          settingData.reasoning_effort ?? 'medium',
          settingData.supports_audio_input ?? false,
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
      'SELECT id, service_name, service_type, custom_url, is_active, model_name, is_public, system_prompt, created_at, updated_at, chat_tool_profile, reasoning_effort, supports_audio_input FROM ai_service_settings WHERE is_public = TRUE ORDER BY created_at DESC',
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
export { getDecryptedAiServiceSettingById };
export { deleteAiServiceSetting };
export { getAiServiceSettingsByUserId };
export { getActiveAiServiceSetting };
export { getActiveVisionAiServiceSetting };
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
  cancelChatApprovals,
  claimChatApproval,
  upsertAiServiceSetting,
  getAiServiceSettingById,
  getAiServiceSettingForBackend,
  getDecryptedAiServiceSettingById,
  deleteAiServiceSetting,
  getAiServiceSettingsByUserId,
  getActiveAiServiceSetting,
  getActiveVisionAiServiceSetting,
  clearOldChatHistory,
  getChatHistoryByUserId,
  getChatHistoryEntryById,
  getChatHistoryEntryOwnerId,
  updateChatHistoryEntry,
  saveApprovalContinuation,
  deleteChatHistoryEntry,
  clearAllChatHistory,
  saveChatHistory,
  upsertGlobalAiServiceSetting,
  getGlobalAiServiceSettings,
  getGlobalAiServiceSettingById,
  deleteGlobalAiServiceSetting,
};
