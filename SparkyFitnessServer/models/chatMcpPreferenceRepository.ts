import { getClient } from '../db/poolManager.js';

export async function getChatMcpServerIds(userId: string): Promise<string[]> {
  const client = await getClient(userId, userId);
  try {
    const result = (await client.query(
      'SELECT chat_mcp_server_ids FROM user_preferences WHERE user_id = $1',
      [userId]
    )) as { rows: { chat_mcp_server_ids: string[] }[] };
    return result.rows[0]?.chat_mcp_server_ids ?? [];
  } finally {
    client.release();
  }
}

export async function saveChatMcpServerChoice(
  userId: string,
  choice: { server_id: string; enabled: boolean; send_user_id: boolean }
): Promise<boolean> {
  const client = await getClient(userId, userId);
  try {
    await client.query(
      'INSERT INTO user_preferences (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
      [userId]
    );
    const result = await client.query(
      `UPDATE user_preferences SET
         chat_mcp_server_ids = CASE WHEN $3::boolean
           THEN array_append(array_remove(chat_mcp_server_ids, $2::uuid), $2::uuid)
           ELSE array_remove(chat_mcp_server_ids, $2::uuid) END,
         updated_at = now()
       WHERE user_id = $1 AND (NOT $3::boolean OR EXISTS (
         SELECT 1 FROM external_data_providers WHERE id = $2::uuid
           AND provider_type = 'mcp_server' AND is_public = TRUE AND is_active = TRUE
           AND base_url IS NOT NULL AND base_url <> ''
           AND jsonb_typeof(provider_options->'allowed_tools') = 'array'
           AND provider_options->'allowed_tools' <> '[]'::jsonb
           AND COALESCE(provider_options->'send_user_id' = 'true'::jsonb, FALSE) = $4::boolean
       )) RETURNING user_id`,
      [userId, choice.server_id, choice.enabled, choice.send_user_id]
    );
    return result.rowCount === 1;
  } finally {
    client.release();
  }
}
