import { z } from 'zod';
import type { PoolClient } from 'pg';
import { getClient } from '../db/poolManager.js';
import { FoodAssistantConflict } from './foodAssistantRepository.js';
const snapshot = z.record(z.string(), z.json());
export type AnalysisEntry = z.infer<typeof snapshot>;
/** Historical snapshots are the evidence. Library edits cannot change a
 * previous day's totals, and family/delegate context cannot widen this read. */
export async function readAnalysisEntries(
  userId: string,
  start: string,
  end: string,
  externalClient?: PoolClient
) {
  const client: PoolClient =
    externalClient ?? (await getClient(userId, userId));
  try {
    const result = await client.query<{ snapshot: unknown }>(
      'SELECT to_jsonb(fe) || jsonb_build_object($4::text,to_char(fe.entry_date,$5::text)) AS snapshot FROM food_entries fe WHERE fe.user_id=$1 AND fe.entry_date BETWEEN $2::date AND $3::date ORDER BY fe.entry_date,fe.id LIMIT 5001',
      [userId, start, end, 'entry_date', 'YYYY-MM-DD']
    );
    if (result.rows.length > 5000)
      throw new FoodAssistantConflict(
        'This analysis exceeds 5,000 entries. Select a shorter date range.'
      );
    return result.rows.map((row) => snapshot.parse(row.snapshot));
  } finally {
    if (!externalClient) client.release();
  }
}
