import type { PoolClient } from 'pg';
import { getSystemClient } from '../db/poolManager.js';
import { log } from '../config/logging.js';
import type {
  AgreementResult,
  LiveMember,
  MembershipCount,
} from '../services/sharedSettingsService.js';

// Bounds every statement, including the wait for the lock, so a stuck check-in
// fails and the next heartbeat retries instead of the heartbeat stopping.
const CHECK_IN_STATEMENT_TIMEOUT = '10s';

export interface CheckInSnapshot {
  members: LiveMember[];
  membership: MembershipCount | null;
  accepted: Record<string, unknown>;
  now: Date;
}

/**
 * Runs membership work in a transaction holding the check-in lock, so joins,
 * withdrawals and agreement decisions never interleave. A client whose
 * rollback fails is discarded instead of returned to the pool.
 */
async function inCheckInTransaction<T>(
  work: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client: PoolClient = await getSystemClient();
  let rollbackFailed = false;
  try {
    await client.query('BEGIN');
    await client.query(
      `SET LOCAL statement_timeout = '${CHECK_IN_STATEMENT_TIMEOUT}'`
    );
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('shared_settings_check_in'))"
    );
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      rollbackFailed = true;
      log(
        'error',
        'Failed to roll back shared settings membership work:',
        rollbackError
      );
    }
    throw error;
  } finally {
    client.release(rollbackFailed);
  }
}

/** Enrolls this instance and returns its membership ID. Expiry uses database time. */
async function joinMembers(
  releaseVersion: string,
  proposals: Record<string, unknown>,
  expiryMs: number
): Promise<string> {
  return inCheckInTransaction(async (client) => {
    const result = await client.query<{ id: string }>(
      `INSERT INTO system.instance_members (release_version, proposals, expires_at)
       VALUES ($1, $2::jsonb, clock_timestamp() + $3 * interval '1 millisecond')
       RETURNING id`,
      [releaseVersion, JSON.stringify(proposals), expiryMs]
    );
    return result.rows[0].id;
  });
}

/** Removes this instance's membership on a clean shutdown. */
async function withdrawMember(id: string): Promise<void> {
  await inCheckInTransaction(async (client) => {
    await client.query('DELETE FROM system.instance_members WHERE id = $1', [
      id,
    ]);
  });
}

/** Reads the agreed settings for every group. */
async function getSharedSettings(): Promise<
  Record<string, { payload: unknown; releaseVersion: string }>
> {
  const client: PoolClient = await getSystemClient();
  try {
    const result = await client.query<{
      group_name: string;
      payload: unknown;
      release_version: string;
    }>(
      'SELECT group_name, payload, release_version FROM system.shared_settings'
    );
    return Object.fromEntries(
      result.rows.map((row) => [
        row.group_name,
        { payload: row.payload, releaseVersion: row.release_version },
      ])
    );
  } finally {
    client.release();
  }
}

/**
 * Renews this instance's membership and applies one agreement decision, all
 * inside a single transaction that concurrent check-ins wait for.
 *
 * Returns null when the membership has already expired: a member that missed
 * its renewals must rejoin under a new ID rather than keep acting on stale
 * membership. The clock is read once after the lock is held, so waiting for
 * another check-in cannot make expiry decisions use an earlier time.
 */
async function checkIn(
  id: string,
  proposals: Record<string, unknown>,
  releaseVersion: string,
  expiryMs: number,
  decide: (snapshot: CheckInSnapshot) => AgreementResult
): Promise<AgreementResult | null> {
  return inCheckInTransaction(async (client) => {
    const clock = await client.query<{ now: Date }>(
      'SELECT clock_timestamp() AS now'
    );
    const now = clock.rows[0].now;
    const renewed = await client.query(
      `UPDATE system.instance_members
       SET proposals = $2::jsonb, release_version = $3,
           expires_at = $4::timestamptz + $5 * interval '1 millisecond'
       WHERE id = $1 AND expires_at > $4`,
      [id, JSON.stringify(proposals), releaseVersion, now, expiryMs]
    );
    if (renewed.rowCount === 0) {
      return null;
    }
    await client.query(
      'DELETE FROM system.instance_members WHERE expires_at <= $1',
      [now]
    );
    const members = await client.query<LiveMember>(
      'SELECT id, proposals FROM system.instance_members ORDER BY id'
    );
    const counts = await client.query<{
      expected_count: number;
      pending_count: number | null;
      pending_since: Date | null;
    }>(
      'SELECT expected_count, pending_count, pending_since FROM system.instance_membership'
    );
    const settings = await client.query<{
      group_name: string;
      payload: unknown;
    }>('SELECT group_name, payload FROM system.shared_settings');

    const count = counts.rows[0];
    const result = decide({
      members: members.rows,
      membership: count
        ? {
            expectedCount: count.expected_count,
            pendingCount: count.pending_count,
            pendingSince: count.pending_since,
          }
        : null,
      accepted: Object.fromEntries(
        settings.rows.map((row) => [row.group_name, row.payload])
      ),
      now,
    });

    await client.query(
      `INSERT INTO system.instance_membership (id, expected_count, pending_count, pending_since)
       VALUES (true, $1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET expected_count = EXCLUDED.expected_count,
         pending_count = EXCLUDED.pending_count, pending_since = EXCLUDED.pending_since`,
      [
        result.membership.expectedCount,
        result.membership.pendingCount,
        result.membership.pendingSince,
      ]
    );
    for (const outcome of result.groups) {
      if (outcome.status !== 'save') continue;
      await client.query(
        `INSERT INTO system.shared_settings (group_name, payload, release_version, accepted_at)
         VALUES ($1, $2::jsonb, $3, $4)
         ON CONFLICT (group_name) DO UPDATE SET payload = EXCLUDED.payload,
           release_version = EXCLUDED.release_version, accepted_at = EXCLUDED.accepted_at`,
        [outcome.group, JSON.stringify(outcome.payload), releaseVersion, now]
      );
    }
    return result;
  });
}

export { joinMembers, withdrawMember, getSharedSettings, checkIn };
export default { joinMembers, withdrawMember, getSharedSettings, checkIn };
