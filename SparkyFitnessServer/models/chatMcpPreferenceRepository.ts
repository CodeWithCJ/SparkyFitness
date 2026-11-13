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

export async function saveChatMcpServerIds(
  userId: string,
  ids: string[]
): Promise<void> {
  const client = await getClient(userId, userId);
  try {
    await client.query(
      `INSERT INTO user_preferences (user_id, chat_mcp_server_ids)
       VALUES ($1, $2::uuid[])
       ON CONFLICT (user_id) DO UPDATE SET
         chat_mcp_server_ids = EXCLUDED.chat_mcp_server_ids,
         updated_at = now()`,
      [userId, ids]
    );
  } finally {
    client.release();
  }
}
