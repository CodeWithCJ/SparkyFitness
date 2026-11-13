import { getSystemClient } from '../db/poolManager.js';

const UTC_TODAY = "(now() AT TIME ZONE 'UTC')::date";

/**
 * Takes one FIT download from the COROS account's daily budget. Returns the
 * UTC day it was counted against and the account's count including it, or
 * null when today's budget is already spent.
 *
 * COROS limits the account, and one COROS account can be linked through more
 * than one provider row (several connections, or several Sparky users), so
 * the budget is the sum over every row linked to it. Each row keeps its own
 * count so a failed download can be given back to the row that took it. An
 * advisory lock per account makes the check and the count one step, so two
 * servers syncing the same account can never both take the last download.
 */
export async function reserveFitDownload(
  providerId: string,
  dailyLimit: number
): Promise<{ day: string; used: number } | null> {
  const client = await getSystemClient();
  try {
    await client.query('BEGIN');
    const provider = await client.query(
      `SELECT provider_type, external_user_id FROM external_data_providers
       WHERE id = $1`,
      [providerId]
    );
    const row = provider.rows[0] as
      { provider_type: string; external_user_id: string | null } | undefined;
    if (!row) {
      await client.query('ROLLBACK');
      return null;
    }
    // Before the account is linked, the row is the only one that can count.
    const account = row.external_user_id || `provider:${providerId}`;
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `sparkyfitness:coros-fit-budget:${account}`,
    ]);

    const spent = await client.query(
      `SELECT COALESCE(SUM(fit_downloads_used), 0)::int AS used
       FROM external_data_providers
       WHERE fit_downloads_day = ${UTC_TODAY}
         AND (id = $1 OR (provider_type = $2 AND external_user_id = $3))`,
      [providerId, row.provider_type, row.external_user_id]
    );
    const usedToday = spent.rows[0].used as number;
    if (usedToday >= dailyLimit) {
      await client.query('ROLLBACK');
      return null;
    }

    const result = await client.query(
      `UPDATE external_data_providers
       SET fit_downloads_used = CASE
             WHEN fit_downloads_day = ${UTC_TODAY} THEN fit_downloads_used + 1
             ELSE 1
           END,
           fit_downloads_day = ${UTC_TODAY}
       WHERE id = $1
       RETURNING fit_downloads_day::text AS day`,
      [providerId]
    );
    await client.query('COMMIT');
    return { day: result.rows[0].day as string, used: usedToday + 1 };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Gives back a download whose request failed before COROS returned anything.
 * Only on the day it was taken: after midnight UTC the budget has started over.
 */
export async function releaseFitDownload(
  providerId: string,
  day: string
): Promise<void> {
  const client = await getSystemClient();
  try {
    await client.query(
      `UPDATE external_data_providers
       SET fit_downloads_used = fit_downloads_used - 1
       WHERE id = $1 AND fit_downloads_day = $2::date AND fit_downloads_used > 0`,
      [providerId, day]
    );
  } finally {
    client.release();
  }
}
