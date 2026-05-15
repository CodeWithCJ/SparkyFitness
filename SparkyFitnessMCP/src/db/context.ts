import type pg from "pg";
import pool from "./pool.js";

/**
 * Acquires a client from the pool with RLS context set.
 * Calls set_app_context(user_id, user_id) to enable Row-Level Security.
 * MUST be released after use via client.release().
 */
export async function getClient(userId: string): Promise<pg.PoolClient> {
  const client = await pool.connect();
  try {
    // Set RLS context using the existing PostgreSQL function
    await client.query("SELECT public.set_app_context($1, $2)", [userId, userId]);
    return client;
  } catch (error) {
    client.release();
    throw error;
  }
}

/**
 * Executes a callback with a properly-contextualized client.
 * Automatically releases the client after execution (success or failure).
 */
export async function withClient<T>(
  userId: string,
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await getClient(userId);
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}
