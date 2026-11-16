import type { PoolClient } from 'pg';
import { getClient, getSystemClient } from '../db/poolManager.js';

/**
 * Challenges storage. Two kinds of access, on purpose:
 *
 * - Reads a member makes go through `getClient(userId)`, so RLS
 *   (`is_challenge_member`) checks membership a second time after the service.
 * - Writes, invite-code lookups and the score job use the owner pool
 *   (`getSystemClient`), because challenge rows are written only by the
 *   server and the app role has no write policy on them. Every such call is
 *   made by `services/challengeService.ts` after it has checked membership or
 *   the host role in code.
 *
 * A member's own workouts and steps are read through `getClient(memberId)`,
 * never with the owner pool, so scoring sees exactly what that member could.
 */

export interface ChallengeRow {
  id: string;
  owner_user_id: string | null;
  name: string;
  description: string | null;
  emoji: string | null;
  template: string | null;
  rules: unknown;
  rules_version: number;
  start_date: string;
  end_date: string | null;
  time_zone: string;
  member_limit: number;
  late_join: boolean;
  invite_expires_at: Date | null;
  invite_active: boolean;
  ended_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface ChallengeListRow extends ChallengeRow {
  role: 'host' | 'member';
  member_count: number;
}

export interface ChallengeMemberRow {
  challenge_id: string;
  user_id: string;
  role: 'host' | 'member';
  display_name: string;
  goal_type: string;
  share_routes: boolean;
  joined_at: Date;
}

export interface ChallengeRuleChangeRow {
  id: string;
  /** Write order; pg returns the bigint as a string. */
  seq: string;
  challenge_id: string;
  changed_by_user_id: string | null;
  changed_by_display_name: string | null;
  effective_from: string;
  rules: unknown;
  previous_rules: unknown;
  created_at: Date;
}

export interface ChallengeDailyScoreRow {
  challenge_id: string;
  user_id: string;
  day: string;
  total: number;
  effort: number;
  step_points: number;
  pr_bonus: number;
  streak_bonus: number;
  beat_average_bonus: number;
  minutes: number;
  steps: number;
  workouts: number;
  eligible: boolean;
  detail: Record<string, unknown>;
}

export interface ChallengeResultRow {
  challenge_id: string;
  period_start: string;
  period_end: string;
  user_id: string;
  display_name: string;
  rank: number;
  total: number;
  minutes: number;
  is_winner: boolean;
  reached_on: string | null;
  detail: Record<string, unknown>;
  finalized_at: Date;
}

export interface ChallengeActivityCardInput {
  exercise_entry_id: string;
  day: string;
  activity_type: string;
  name: string | null;
  minutes: number;
  distance_meters: number | null;
  pace_seconds_per_km: number | null;
  avg_heart_rate: number | null;
  max_heart_rate: number | null;
  points: number;
}

/** One workout of a member, with what scoring needs from its sets and zones. */
export interface MemberEntryRow {
  id: string;
  entry_date: string;
  entry_time: string | null;
  duration_minutes: number | null;
  avg_heart_rate: number | null;
  max_heart_rate: number | null;
  exercise_name: string | null;
  category: string | null;
  source: string | null;
  exercise_id: string | null;
  distance: number | null;
  active_calories: number | null;
  calories_burned: number | null;
  elevation_gain_meters: number | null;
  zone_seconds: number[] | null;
  /** The row was changed after it was created (updated_at > created_at). */
  edited: boolean;
  sets: Array<{
    weight: number | null;
    reps: number | null;
    set_type: string | null;
    completed_at: string | null;
    started_at: string | null;
  }> | null;
  /** The grouped session the row belongs to, when it has one. */
  session: {
    source: string | null;
    finished_at: string | null;
    /** The session or one of its exercises was changed after it was created. */
    edited: boolean;
    /** Whether any exercise of the session is linked to a plan assignment. */
    has_plan_assignment: boolean;
    /** Every set of the session, for its lifecycle status. */
    sets: Array<{ completed_at: string | null; started_at?: string | null }>;
  } | null;
}

const CHALLENGE_COLUMNS = `
  c.id, c.owner_user_id, c.name, c.description, c.emoji, c.template, c.rules,
  c.rules_version, TO_CHAR(c.start_date, 'YYYY-MM-DD') AS start_date,
  TO_CHAR(c.end_date, 'YYYY-MM-DD') AS end_date, c.time_zone, c.member_limit,
  c.late_join, c.invite_expires_at,
  (c.invite_code_hash IS NOT NULL AND c.invite_expires_at > now()) AS invite_active,
  c.ended_at, c.created_at, c.updated_at`;

async function withSystem<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getSystemClient();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

async function transactionOn<T>(
  client: PoolClient,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  await client.query('BEGIN');
  try {
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function inTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  return withSystem((client) => transactionOn(client, fn));
}

async function asMember<T>(
  userId: string,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getClient(userId, userId);
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Member reads (RLS applies)
// ---------------------------------------------------------------------------

async function listForMember(userId: string): Promise<ChallengeListRow[]> {
  return asMember(userId, async (client) => {
    const { rows } = await client.query(
      `SELECT ${CHALLENGE_COLUMNS}, m.role,
              (SELECT COUNT(*)::int FROM challenge_members cm WHERE cm.challenge_id = c.id) AS member_count
         FROM challenges c
         JOIN challenge_members m ON m.challenge_id = c.id AND m.user_id = $1
        ORDER BY c.ended_at IS NOT NULL, c.start_date DESC, c.created_at DESC`,
      [userId]
    );
    return rows as ChallengeListRow[];
  });
}

async function getForMember(
  userId: string,
  challengeId: string
): Promise<ChallengeRow | null> {
  return asMember(userId, async (client) => {
    const { rows } = await client.query(
      `SELECT ${CHALLENGE_COLUMNS} FROM challenges c WHERE c.id = $1`,
      [challengeId]
    );
    return (rows[0] as ChallengeRow | undefined) ?? null;
  });
}

async function getMembersForMember(
  userId: string,
  challengeId: string
): Promise<ChallengeMemberRow[]> {
  return asMember(userId, async (client) => {
    const { rows } = await client.query(
      `SELECT challenge_id, user_id, role, display_name, goal_type, share_routes, joined_at
         FROM challenge_members WHERE challenge_id = $1
        ORDER BY joined_at, display_name`,
      [challengeId]
    );
    return rows as ChallengeMemberRow[];
  });
}

async function getDailyScoresForMember(
  userId: string,
  challengeId: string,
  from: string,
  to: string
): Promise<ChallengeDailyScoreRow[]> {
  return asMember(userId, async (client) => {
    const { rows } = await client.query(
      `SELECT challenge_id, user_id, TO_CHAR(day, 'YYYY-MM-DD') AS day, total, effort,
              step_points, pr_bonus, streak_bonus, beat_average_bonus, minutes, steps,
              workouts, eligible, detail
         FROM challenge_daily_scores
        WHERE challenge_id = $1 AND day BETWEEN $2 AND $3
        ORDER BY day`,
      [challengeId, from, to]
    );
    return rows as ChallengeDailyScoreRow[];
  });
}

async function getResultsForMember(
  userId: string,
  challengeId: string,
  periodStart: string
): Promise<ChallengeResultRow[]> {
  return asMember(userId, async (client) => {
    const { rows } = await client.query(
      `SELECT challenge_id, TO_CHAR(period_start, 'YYYY-MM-DD') AS period_start,
              TO_CHAR(period_end, 'YYYY-MM-DD') AS period_end, user_id, display_name, rank,
              total, minutes, is_winner, TO_CHAR(reached_on, 'YYYY-MM-DD') AS reached_on,
              detail, finalized_at
         FROM challenge_results
        WHERE challenge_id = $1 AND period_start = $2
        ORDER BY rank, display_name`,
      [challengeId, periodStart]
    );
    return rows as ChallengeResultRow[];
  });
}

async function getRuleChangesForMember(
  userId: string,
  challengeId: string
): Promise<ChallengeRuleChangeRow[]> {
  return asMember(userId, async (client) => {
    const { rows } = await client.query(
      `SELECT r.id, r.seq, r.challenge_id, r.changed_by_user_id, m.display_name AS changed_by_display_name,
              TO_CHAR(r.effective_from, 'YYYY-MM-DD') AS effective_from, r.rules,
              r.previous_rules, r.created_at
         FROM challenge_rule_changes r
         LEFT JOIN challenge_members m
           ON m.challenge_id = r.challenge_id AND m.user_id = r.changed_by_user_id
        WHERE r.challenge_id = $1
        ORDER BY r.effective_from, r.seq`,
      [challengeId]
    );
    return rows as ChallengeRuleChangeRow[];
  });
}

// ---------------------------------------------------------------------------
// Server-side lookups and writes (owner pool; the service checked access)
// ---------------------------------------------------------------------------

async function getMembership(
  challengeId: string,
  userId: string
): Promise<ChallengeMemberRow | null> {
  return withSystem(async (client) => {
    const { rows } = await client.query(
      `SELECT challenge_id, user_id, role, display_name, goal_type, share_routes, joined_at
         FROM challenge_members WHERE challenge_id = $1 AND user_id = $2`,
      [challengeId, userId]
    );
    return (rows[0] as ChallengeMemberRow | undefined) ?? null;
  });
}

async function getChallenge(challengeId: string): Promise<ChallengeRow | null> {
  return withSystem(async (client) => {
    const { rows } = await client.query(
      `SELECT ${CHALLENGE_COLUMNS} FROM challenges c WHERE c.id = $1`,
      [challengeId]
    );
    return (rows[0] as ChallengeRow | undefined) ?? null;
  });
}

async function getMembers(challengeId: string): Promise<ChallengeMemberRow[]> {
  return withSystem(async (client) => {
    const { rows } = await client.query(
      `SELECT challenge_id, user_id, role, display_name, goal_type, share_routes, joined_at
         FROM challenge_members WHERE challenge_id = $1 ORDER BY joined_at`,
      [challengeId]
    );
    return rows as ChallengeMemberRow[];
  });
}

async function getRuleChanges(
  challengeId: string
): Promise<ChallengeRuleChangeRow[]> {
  return withSystem(async (client) => {
    const { rows } = await client.query(
      `SELECT id, seq, challenge_id, changed_by_user_id, NULL AS changed_by_display_name,
              TO_CHAR(effective_from, 'YYYY-MM-DD') AS effective_from, rules,
              previous_rules, created_at
         FROM challenge_rule_changes WHERE challenge_id = $1
        ORDER BY effective_from, seq`,
      [challengeId]
    );
    return rows as ChallengeRuleChangeRow[];
  });
}

export interface NewChallenge {
  ownerUserId: string;
  name: string;
  description: string | null;
  emoji: string | null;
  template: string | null;
  rules: unknown;
  rulesVersion: number;
  startDate: string;
  endDate: string | null;
  timeZone: string;
  memberLimit: number;
  lateJoin: boolean;
  displayName: string;
  goalType: string;
}

/** Creates the challenge, its host membership and the first rules log row together. */
async function createWithHost(input: NewChallenge): Promise<string> {
  return inTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO challenges
         (owner_user_id, name, description, emoji, template, rules, rules_version,
          start_date, end_date, time_zone, member_limit, late_join)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [
        input.ownerUserId,
        input.name,
        input.description,
        input.emoji,
        input.template,
        JSON.stringify(input.rules),
        input.rulesVersion,
        input.startDate,
        input.endDate,
        input.timeZone,
        input.memberLimit,
        input.lateJoin,
      ]
    );
    const id = (rows[0] as { id: string }).id;
    await client.query(
      `INSERT INTO challenge_members (challenge_id, user_id, role, display_name, goal_type)
       VALUES ($1, $2, 'host', $3, $4)`,
      [id, input.ownerUserId, input.displayName, input.goalType]
    );
    await client.query(
      `INSERT INTO challenge_rule_changes (challenge_id, changed_by_user_id, effective_from, rules)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [id, input.ownerUserId, input.startDate, JSON.stringify(input.rules)]
    );
    return id;
  });
}

/**
 * Replaces the rules from `effectiveFrom` on and logs the change. Reading the
 * old rules locks the challenge row first, so the log's seq follows the order the
 * changes were really written in; the latest change for a day wins. The
 * first day it applies to is queued for every member in the same
 * transaction: a rescore runs from the earliest queued day to the member's
 * latest, so every day already scored from `effectiveFrom` on (a member's day
 * can run ahead of the challenge's zone) is scored again under the new rules.
 * A scoring run already under way when this commits keeps the day queued
 * (its claim no longer matches), so it cannot leave old-rules scores behind.
 */
async function updateRules(
  challengeId: string,
  changedBy: string,
  rules: unknown,
  effectiveFrom: string,
  rulesVersion: number
): Promise<boolean> {
  return inTransaction(async (client) => {
    // The rules being replaced, read under the row lock (the lock leaving and
    // passing on hosting take), so two overlapping changes log R0 -> R1 and
    // R1 -> R2, and a host who left meanwhile cannot write.
    const locked = await client.query(
      'SELECT rules FROM challenges WHERE id = $1 FOR UPDATE',
      [challengeId]
    );
    if (!locked.rowCount) return false;
    const host = await client.query(
      `SELECT 1 FROM challenge_members
        WHERE challenge_id = $1 AND user_id = $2 AND role = 'host'`,
      [challengeId, changedBy]
    );
    if (!host.rowCount) return false;
    const previous = (locked.rows[0] as { rules: unknown } | undefined)?.rules;
    await client.query(
      'UPDATE challenges SET rules = $2::jsonb, rules_version = $3, updated_at = now() WHERE id = $1',
      [challengeId, JSON.stringify(rules), rulesVersion]
    );
    await client.query(
      `INSERT INTO challenge_rule_changes
         (challenge_id, changed_by_user_id, effective_from, rules, previous_rules)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)`,
      [
        challengeId,
        changedBy,
        effectiveFrom,
        JSON.stringify(rules),
        previous === undefined ? null : JSON.stringify(previous),
      ]
    );
    await client.query(
      `INSERT INTO challenge_score_queue (challenge_id, user_id, day)
       SELECT challenge_id, user_id, $2::date FROM challenge_members
        WHERE challenge_id = $1
       ON CONFLICT (challenge_id, user_id, day) DO UPDATE SET queued_at = EXCLUDED.queued_at`,
      [challengeId, effectiveFrom]
    );
    return true;
  });
}

/**
 * Runs `write` only while `userId` is still the host. The challenge row is
 * locked first, the same lock leaving and passing on hosting take, so a host
 * who left (or was replaced) meanwhile can no longer set or clear the invite.
 * Returns false when they are not the host any more.
 */
async function asCurrentHost(
  challengeId: string,
  userId: string,
  write: (client: PoolClient) => Promise<unknown>
): Promise<boolean> {
  return inTransaction(async (client) => {
    await client.query('SELECT id FROM challenges WHERE id = $1 FOR UPDATE', [
      challengeId,
    ]);
    const host = await client.query(
      `SELECT 1 FROM challenge_members
        WHERE challenge_id = $1 AND user_id = $2 AND role = 'host'`,
      [challengeId, userId]
    );
    if (!host.rowCount) return false;
    await write(client);
    return true;
  });
}

async function setInvite(
  challengeId: string,
  hostUserId: string,
  codeHash: string,
  expiresAt: Date
): Promise<boolean> {
  return asCurrentHost(challengeId, hostUserId, (client) =>
    client.query(
      'UPDATE challenges SET invite_code_hash = $2, invite_expires_at = $3, updated_at = now() WHERE id = $1',
      [challengeId, codeHash, expiresAt]
    )
  );
}

async function clearInvite(
  challengeId: string,
  hostUserId: string
): Promise<boolean> {
  return asCurrentHost(challengeId, hostUserId, (client) =>
    client.query(
      'UPDATE challenges SET invite_code_hash = NULL, invite_expires_at = NULL, updated_at = now() WHERE id = $1',
      [challengeId]
    )
  );
}

export type JoinOutcome =
  | { status: 'joined'; challenge: ChallengeRow }
  | { status: 'already_member'; challenge: ChallengeRow }
  | { status: 'not_found' }
  | { status: 'ended' }
  | { status: 'late_join_closed' }
  | { status: 'full' };

/**
 * Joins by invite code hash. The challenge row is locked so two joins at once
 * cannot pass the member limit together.
 */
async function joinByInviteHash(
  codeHash: string,
  userId: string,
  displayName: string,
  goalType: string,
  today: (timeZone: string) => string
): Promise<JoinOutcome> {
  return inTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT ${CHALLENGE_COLUMNS} FROM challenges c
        WHERE c.invite_code_hash = $1 AND c.invite_expires_at > now()
        FOR UPDATE`,
      [codeHash]
    );
    const challenge = rows[0] as ChallengeRow | undefined;
    if (!challenge) return { status: 'not_found' };
    const existing = await client.query(
      'SELECT 1 FROM challenge_members WHERE challenge_id = $1 AND user_id = $2',
      [challenge.id, userId]
    );
    if (existing.rowCount) return { status: 'already_member', challenge };
    const day = today(challenge.time_zone);
    if (challenge.ended_at || (challenge.end_date && challenge.end_date < day))
      return { status: 'ended' };
    if (!challenge.late_join && challenge.start_date < day)
      return { status: 'late_join_closed' };
    const count = await client.query(
      'SELECT COUNT(*)::int AS n FROM challenge_members WHERE challenge_id = $1',
      [challenge.id]
    );
    if ((count.rows[0] as { n: number }).n >= challenge.member_limit)
      return { status: 'full' };
    await client.query(
      `INSERT INTO challenge_members (challenge_id, user_id, role, display_name, goal_type)
       VALUES ($1, $2, 'member', $3, $4)`,
      [challenge.id, userId, displayName, goalType]
    );
    return { status: 'joined', challenge };
  });
}

export type LeaveOutcome =
  'left' | 'host_passed' | 'challenge_deleted' | 'not_member';

/**
 * Removes a member and, with the membership, their scores, cards and queued
 * days. A host who leaves passes hosting to the longest-standing member; the
 * last member to leave deletes the challenge.
 */
async function removeMember(
  challengeId: string,
  userId: string
): Promise<LeaveOutcome> {
  return inTransaction(async (client) => {
    await client.query('SELECT id FROM challenges WHERE id = $1 FOR UPDATE', [
      challengeId,
    ]);
    const removed = await client.query(
      'DELETE FROM challenge_members WHERE challenge_id = $1 AND user_id = $2 RETURNING role',
      [challengeId, userId]
    );
    const role = (removed.rows[0] as { role: string } | undefined)?.role;
    if (!role) return 'not_member';
    const next = await client.query(
      `SELECT user_id FROM challenge_members WHERE challenge_id = $1
        ORDER BY joined_at, user_id LIMIT 1`,
      [challengeId]
    );
    const heir = (next.rows[0] as { user_id: string } | undefined)?.user_id;
    if (!heir) {
      await client.query('DELETE FROM challenges WHERE id = $1', [challengeId]);
      return 'challenge_deleted';
    }
    if (role !== 'host') return 'left';
    await client.query(
      "UPDATE challenge_members SET role = 'host' WHERE challenge_id = $1 AND user_id = $2",
      [challengeId, heir]
    );
    await client.query(
      'UPDATE challenges SET owner_user_id = $2, updated_at = now() WHERE id = $1',
      [challengeId, heir]
    );
    return 'host_passed';
  });
}

/**
 * Challenges whose host account was deleted (owner set to null): hosting
 * passes to the longest-standing member. Returns how many were fixed.
 */
async function rehostOrphans(): Promise<number> {
  return inTransaction(async (client) => {
    const { rows } = await client.query(
      'SELECT id FROM challenges WHERE owner_user_id IS NULL FOR UPDATE'
    );
    let fixed = 0;
    for (const { id } of rows as { id: string }[]) {
      const next = await client.query(
        `SELECT user_id FROM challenge_members WHERE challenge_id = $1
          ORDER BY joined_at, user_id LIMIT 1`,
        [id]
      );
      const heir = (next.rows[0] as { user_id: string } | undefined)?.user_id;
      if (!heir) {
        await client.query('DELETE FROM challenges WHERE id = $1', [id]);
        continue;
      }
      await client.query(
        `UPDATE challenge_members SET role = CASE WHEN user_id = $2 THEN 'host' ELSE 'member' END
          WHERE challenge_id = $1`,
        [id, heir]
      );
      await client.query(
        'UPDATE challenges SET owner_user_id = $2, updated_at = now() WHERE id = $1',
        [id, heir]
      );
      fixed += 1;
    }
    return fixed;
  });
}

async function enqueueDays(
  challengeId: string,
  userId: string,
  days: string[]
): Promise<void> {
  if (!days.length) return;
  await withSystem((client) =>
    client.query(
      `INSERT INTO challenge_score_queue (challenge_id, user_id, day)
       SELECT $1, $2, d::date FROM unnest($3::text[]) AS d
       ON CONFLICT (challenge_id, user_id, day) DO UPDATE SET queued_at = EXCLUDED.queued_at`,
      [challengeId, userId, days]
    )
  );
}

/**
 * Queues `days` for every member of one challenge. The nightly catch-up works
 * out each challenge's days in its own zone in JS, so one zone Postgres does
 * not know can never fail the statement for every other challenge.
 */
async function enqueueDaysForAllMembers(
  challengeId: string,
  days: string[]
): Promise<number> {
  if (!days.length) return 0;
  return withSystem(async (client) => {
    const result = await client.query(
      `INSERT INTO challenge_score_queue (challenge_id, user_id, day)
       SELECT m.challenge_id, m.user_id, d::date
         FROM challenge_members m
         CROSS JOIN unnest($2::text[]) AS d
        WHERE m.challenge_id = $1
       ON CONFLICT (challenge_id, user_id, day) DO NOTHING`,
      [challengeId, days]
    );
    return result.rowCount ?? 0;
  });
}

export interface QueuedMemberDays {
  challenge_id: string;
  user_id: string;
  days: string[];
  /** The lease stamp the rows were taken with; pass it back to ackQueuedDays. */
  claim: string;
}

/**
 * Takes up to `limit` member-days that have been quiet for `quietSeconds`.
 * The rows stay in the queue: their queued_at moves `leaseSeconds` into the
 * future, so no other run takes them meanwhile, and they are deleted by
 * ackQueuedDays once the scores are saved. A worker that dies mid-run leaves
 * them to come back when the lease runs out. SKIP LOCKED lets a second
 * instance take other rows at the same time. A day queued again while it is
 * being scored gets a new queued_at, so the ack leaves it for a later run.
 */
async function takeQueuedDays(
  limit: number,
  quietSeconds: number,
  leaseSeconds: number
): Promise<QueuedMemberDays[]> {
  return withSystem(async (client) => {
    const { rows } = await client.query(
      `WITH taken AS (
         SELECT challenge_id, user_id, day
           FROM challenge_score_queue
          WHERE queued_at <= now() - make_interval(secs => $2)
          ORDER BY queued_at
          LIMIT $1
          FOR UPDATE SKIP LOCKED
       )
       UPDATE challenge_score_queue q
          SET queued_at = now() + make_interval(secs => $3)
         FROM taken t
        WHERE q.challenge_id = t.challenge_id AND q.user_id = t.user_id AND q.day = t.day
       RETURNING q.challenge_id, q.user_id, TO_CHAR(q.day, 'YYYY-MM-DD') AS day,
                 q.queued_at::text AS claim`,
      [limit, quietSeconds, leaseSeconds]
    );
    const grouped = new Map<string, QueuedMemberDays>();
    for (const row of rows as {
      challenge_id: string;
      user_id: string;
      day: string;
      claim: string;
    }[]) {
      const key = `${row.challenge_id}:${row.user_id}`;
      const entry = grouped.get(key) ?? {
        challenge_id: row.challenge_id,
        user_id: row.user_id,
        days: [],
        claim: row.claim,
      };
      entry.days.push(row.day);
      grouped.set(key, entry);
    }
    return [...grouped.values()];
  });
}

/** Removes taken member-days once scored; a day queued again since keeps its row. */
async function ackQueuedDays(batch: QueuedMemberDays): Promise<void> {
  await withSystem((client) =>
    client.query(
      `DELETE FROM challenge_score_queue
        WHERE challenge_id = $1 AND user_id = $2 AND day = ANY($3::date[])
          AND queued_at = $4::timestamptz`,
      [batch.challenge_id, batch.user_id, batch.days, batch.claim]
    )
  );
}

/**
 * Runs one member's read-score-save cycle for one challenge while holding an
 * advisory lock on that pair, across instances. The queue job and the
 * finaliser both score through here, so a run that read older data can never
 * save over the scores of a run that started after it, and the finaliser
 * never freezes such a stale save.
 */
async function withScoringLock<T>(
  challengeId: string,
  userId: string,
  fn: (lock: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getSystemClient();
  const key = `challenge-score:${challengeId}:${userId}`;
  let unlocked = false;
  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [key]);
    try {
      return await fn(client);
    } finally {
      await client.query('SELECT pg_advisory_unlock(hashtext($1))', [key]);
      unlocked = true;
    }
  } finally {
    // A session lock that could not be released goes with the connection.
    client.release(unlocked ? undefined : true);
  }
}

export interface DailyScoreInput {
  day: string;
  total: number;
  effort: number;
  step_points: number;
  pr_bonus: number;
  streak_bonus: number;
  beat_average_bonus: number;
  minutes: number;
  steps: number;
  workouts: number;
  eligible: boolean;
  detail: Record<string, unknown>;
}

/**
 * Stores a member's scored days and the workout cards of those days. Only
 * runs while the member still belongs to the challenge (the insert's foreign
 * key fails otherwise), so a member who left mid-run leaves nothing behind.
 * A workout has one card: one moved here from a day outside [from, to] (a
 * frozen period included) takes its card along rather than leaving the old
 * one in place.
 */
async function saveMemberDays(
  challengeId: string,
  userId: string,
  from: string,
  to: string,
  scores: DailyScoreInput[],
  cards: ChallengeActivityCardInput[],
  lock?: PoolClient
): Promise<void> {
  // On the connection that holds the member's scoring lock: if it was lost
  // (and the lock with it) the save fails instead of landing after a newer
  // run's.
  const run = (fn: (client: PoolClient) => Promise<void>) =>
    lock ? transactionOn(lock, fn) : inTransaction(fn);
  await run(async (client) => {
    const member = await client.query(
      'SELECT 1 FROM challenge_members WHERE challenge_id = $1 AND user_id = $2 FOR SHARE',
      [challengeId, userId]
    );
    if (!member.rowCount) return;
    await client.query(
      `INSERT INTO challenge_daily_scores
         (challenge_id, user_id, day, total, effort, step_points, pr_bonus, streak_bonus,
          beat_average_bonus, minutes, steps, workouts, eligible, detail, updated_at)
       SELECT $1, $2, s.day, s.total, s.effort, s.step_points, s.pr_bonus, s.streak_bonus,
              s.beat_average_bonus, s.minutes, s.steps, s.workouts, s.eligible, s.detail, now()
         FROM jsonb_to_recordset($3::jsonb) AS s(
           day date, total float8, effort float8, step_points float8, pr_bonus float8,
           streak_bonus float8, beat_average_bonus float8, minutes float8, steps int,
           workouts int, eligible boolean, detail jsonb)
       ON CONFLICT (challenge_id, user_id, day) DO UPDATE SET
         total = EXCLUDED.total, effort = EXCLUDED.effort, step_points = EXCLUDED.step_points,
         pr_bonus = EXCLUDED.pr_bonus, streak_bonus = EXCLUDED.streak_bonus,
         beat_average_bonus = EXCLUDED.beat_average_bonus, minutes = EXCLUDED.minutes,
         steps = EXCLUDED.steps, workouts = EXCLUDED.workouts, eligible = EXCLUDED.eligible,
         detail = EXCLUDED.detail, updated_at = now()`,
      [challengeId, userId, JSON.stringify(scores)]
    );
    await client.query(
      `DELETE FROM challenge_activity_cards
        WHERE challenge_id = $1 AND user_id = $2 AND day BETWEEN $3 AND $4`,
      [challengeId, userId, from, to]
    );
    if (cards.length) {
      await client.query(
        `INSERT INTO challenge_activity_cards
           (challenge_id, user_id, exercise_entry_id, day, activity_type, name, minutes,
            distance_meters, pace_seconds_per_km, avg_heart_rate, max_heart_rate, points)
         SELECT $1, $2, c.exercise_entry_id, c.day, c.activity_type, c.name, c.minutes,
                c.distance_meters, c.pace_seconds_per_km, c.avg_heart_rate, c.max_heart_rate, c.points
           FROM jsonb_to_recordset($3::jsonb) AS c(
             exercise_entry_id uuid, day date, activity_type text, name text, minutes float8,
             distance_meters float8, pace_seconds_per_km float8, avg_heart_rate int,
             max_heart_rate int, points float8)
         ON CONFLICT (challenge_id, exercise_entry_id) DO UPDATE SET
           day = EXCLUDED.day, activity_type = EXCLUDED.activity_type, name = EXCLUDED.name,
           minutes = EXCLUDED.minutes, distance_meters = EXCLUDED.distance_meters,
           pace_seconds_per_km = EXCLUDED.pace_seconds_per_km,
           avg_heart_rate = EXCLUDED.avg_heart_rate, max_heart_rate = EXCLUDED.max_heart_rate,
           points = EXCLUDED.points
         WHERE challenge_activity_cards.user_id = EXCLUDED.user_id`,
        [challengeId, userId, JSON.stringify(cards)]
      );
    }
  });
}

/** Whether a period is already frozen. */
async function hasResults(
  challengeId: string,
  periodStart: string
): Promise<boolean> {
  return withSystem(async (client) => {
    const { rowCount } = await client.query(
      'SELECT 1 FROM challenge_results WHERE challenge_id = $1 AND period_start = $2 LIMIT 1',
      [challengeId, periodStart]
    );
    return (rowCount ?? 0) > 0;
  });
}

async function frozenPeriodStarts(challengeId: string): Promise<string[]> {
  return withSystem(async (client) => {
    const { rows } = await client.query(
      `SELECT DISTINCT TO_CHAR(period_start, 'YYYY-MM-DD') AS period_start
         FROM challenge_results WHERE challenge_id = $1`,
      [challengeId]
    );
    return (rows as { period_start: string }[]).map((r) => r.period_start);
  });
}

async function getDailyScores(
  challengeId: string,
  from: string,
  to: string
): Promise<ChallengeDailyScoreRow[]> {
  return withSystem(async (client) => {
    const { rows } = await client.query(
      `SELECT challenge_id, user_id, TO_CHAR(day, 'YYYY-MM-DD') AS day, total, effort,
              step_points, pr_bonus, streak_bonus, beat_average_bonus, minutes, steps,
              workouts, eligible, detail
         FROM challenge_daily_scores
        WHERE challenge_id = $1 AND day BETWEEN $2 AND $3`,
      [challengeId, from, to]
    );
    return rows as ChallengeDailyScoreRow[];
  });
}

export interface ResultInput {
  user_id: string;
  display_name: string;
  rank: number;
  total: number;
  minutes: number;
  is_winner: boolean;
  reached_on: string | null;
  detail: Record<string, unknown>;
}

/**
 * Freezes a period. The first writer wins: a second instance finalising the
 * same period at once inserts nothing, and a frozen row is never rewritten.
 */
async function insertResults(
  challengeId: string,
  periodStart: string,
  periodEnd: string,
  rows: ResultInput[]
): Promise<boolean> {
  return inTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `challenge-results:${challengeId}:${periodStart}`,
    ]);
    // Under the lock leaving and joining take: if the members are not the
    // ones the standings were worked out from (someone left or joined since),
    // nothing is frozen and the next run works them out again.
    await client.query('SELECT id FROM challenges WHERE id = $1 FOR UPDATE', [
      challengeId,
    ]);
    const current = await client.query(
      'SELECT user_id FROM challenge_members WHERE challenge_id = $1',
      [challengeId]
    );
    const members = new Set(
      (current.rows as { user_id: string }[]).map((r) => r.user_id)
    );
    if (
      members.size !== rows.length ||
      !rows.every((r) => members.has(r.user_id))
    )
      return false;
    const already = await client.query(
      'SELECT 1 FROM challenge_results WHERE challenge_id = $1 AND period_start = $2 LIMIT 1',
      [challengeId, periodStart]
    );
    if (already.rowCount) return false;
    if (!rows.length) return false;
    await client.query(
      `INSERT INTO challenge_results
         (challenge_id, period_start, period_end, user_id, display_name, rank, total,
          minutes, is_winner, reached_on, detail)
       SELECT $1, $2, $3, r.user_id, r.display_name, r.rank, r.total, r.minutes,
              r.is_winner, r.reached_on, r.detail
         FROM jsonb_to_recordset($4::jsonb) AS r(
           user_id uuid, display_name text, rank int, total float8, minutes float8,
           is_winner boolean, reached_on date, detail jsonb)
       ON CONFLICT (challenge_id, period_start, user_id) DO NOTHING`,
      [challengeId, periodStart, periodEnd, JSON.stringify(rows)]
    );
    return true;
  });
}

/** Challenges that are not ended, for the finalise job. */
async function listOpenChallenges(): Promise<ChallengeRow[]> {
  return withSystem(async (client) => {
    const { rows } = await client.query(
      `SELECT ${CHALLENGE_COLUMNS} FROM challenges c WHERE c.ended_at IS NULL`
    );
    return rows as ChallengeRow[];
  });
}

async function markEnded(challengeId: string): Promise<void> {
  await withSystem((client) =>
    client.query(
      'UPDATE challenges SET ended_at = now(), updated_at = now() WHERE id = $1 AND ended_at IS NULL',
      [challengeId]
    )
  );
}

// ---------------------------------------------------------------------------
// A member's own data, read as that member (RLS applies)
// ---------------------------------------------------------------------------

async function getMemberEntries(
  memberId: string,
  from: string,
  to: string
): Promise<MemberEntryRow[]> {
  return asMember(memberId, async (client) => {
    // Each session's status inputs are built once (not once per exercise
    // row), from the member's own rows only.
    const { rows } = await client.query(
      `WITH sessions AS (
         SELECT pe.id, json_build_object(
                  'source', pe.source,
                  'finished_at', pe.finished_at,
                  'edited', pe.updated_at > pe.created_at OR EXISTS (
                    SELECT 1 FROM exercise_entries pe_e
                     WHERE pe_e.exercise_preset_entry_id = pe.id
                       AND pe_e.user_id = pe.user_id
                       AND pe_e.updated_at > pe_e.created_at),
                  'has_plan_assignment', EXISTS (
                    SELECT 1 FROM exercise_entries pe_e
                     WHERE pe_e.exercise_preset_entry_id = pe.id
                       AND pe_e.user_id = pe.user_id
                       AND pe_e.workout_plan_assignment_id IS NOT NULL),
                  'sets', COALESCE((
                    SELECT json_agg(json_build_object(
                             'completed_at', pe_s.completed_at, 'started_at', pe_s.started_at))
                      FROM exercise_entry_sets pe_s
                      JOIN exercise_entries pe_e ON pe_e.id = pe_s.exercise_entry_id
                     WHERE pe_e.exercise_preset_entry_id = pe.id
                       AND pe_e.user_id = pe.user_id), '[]'::json)) AS session
           FROM exercise_preset_entries pe
          WHERE pe.user_id = $1
            AND pe.id IN (
              SELECT exercise_preset_entry_id FROM exercise_entries
               WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3
                 AND exercise_preset_entry_id IS NOT NULL)
       )
       SELECT e.id, TO_CHAR(e.entry_date, 'YYYY-MM-DD') AS entry_date,
              TO_CHAR(e.entry_time, 'HH24:MI') AS entry_time, e.duration_minutes,
              e.avg_heart_rate, e.max_heart_rate, e.exercise_name, e.category, e.source,
              e.exercise_id, e.distance, e.active_calories, e.calories_burned,
              e.elevation_gain_meters,
              (SELECT array_agg(COALESCE(z.seconds_in_zone, 0)::float8 ORDER BY zi)
                 FROM generate_series(1, 5) AS zi
                 LEFT JOIN exercise_entry_hr_zones z
                   ON z.exercise_entry_id = e.id AND z.zone_index = zi
                HAVING SUM(COALESCE(z.seconds_in_zone, 0)) > 0) AS zone_seconds,
              e.updated_at > e.created_at AS edited,
              (SELECT json_agg(json_build_object(
                        'weight', s.weight, 'reps', s.reps, 'set_type', s.set_type,
                        'completed_at', s.completed_at, 'started_at', s.started_at))
                 FROM exercise_entry_sets s WHERE s.exercise_entry_id = e.id) AS sets,
              sessions.session
         FROM exercise_entries e
         LEFT JOIN sessions ON sessions.id = e.exercise_preset_entry_id
        WHERE e.user_id = $1 AND e.entry_date BETWEEN $2 AND $3
        ORDER BY e.entry_date, e.entry_time NULLS LAST, e.id`,
      [memberId, from, to]
    );
    return rows as MemberEntryRow[];
  });
}

/** The highest step count any source recorded for each day. */
async function getMemberSteps(
  memberId: string,
  from: string,
  to: string
): Promise<Record<string, number>> {
  return asMember(memberId, async (client) => {
    const { rows } = await client.query(
      `SELECT TO_CHAR(entry_date, 'YYYY-MM-DD') AS day, MAX(steps)::int AS steps
         FROM (
           SELECT entry_date, steps FROM check_in_measurements
            WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3 AND steps IS NOT NULL
           UNION ALL
           SELECT entry_date, total_steps FROM daily_health_metrics
            WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3 AND total_steps IS NOT NULL
         ) s
        GROUP BY entry_date`,
      [memberId, from, to]
    );
    const out: Record<string, number> = {};
    for (const row of rows as { day: string; steps: number }[])
      out[row.day] = row.steps;
    return out;
  });
}

export default {
  listForMember,
  getForMember,
  getMembersForMember,
  getDailyScoresForMember,
  getResultsForMember,
  getRuleChangesForMember,
  getMembership,
  getChallenge,
  getMembers,
  getRuleChanges,
  createWithHost,
  updateRules,
  setInvite,
  clearInvite,
  joinByInviteHash,
  removeMember,
  rehostOrphans,
  enqueueDays,
  enqueueDaysForAllMembers,
  takeQueuedDays,
  ackQueuedDays,
  withScoringLock,
  saveMemberDays,
  hasResults,
  frozenPeriodStarts,
  getDailyScores,
  insertResults,
  listOpenChallenges,
  markEnded,
  getMemberEntries,
  getMemberSteps,
};
