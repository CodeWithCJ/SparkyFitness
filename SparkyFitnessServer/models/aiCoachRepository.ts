import { randomUUID } from 'node:crypto';
import { getClient, getSystemClient } from '../db/poolManager.js';
import type {
  CoachBecause,
  CoachProfileBody,
  CoachRuleOverrides,
  CoachQuestion,
  CoachRules,
  CoachSuggestion,
  CoachSuggestionStatus,
  FeatureChoices,
} from '@workspace/shared';

export interface CoachProfileRow {
  user_id: string;
  diet_type: CoachProfileBody['diet_type'];
  foods_avoid: string | null;
  foods_prefer: string | null;
  tone: CoachProfileBody['tone'];
  notes: string | null;
  /** `HH:MM`, ascending. */
  checkin_times: string[];
  max_messages_per_day: number;
  /** `YYYY-MM-DD` or null. */
  paused_until: string | null;
  pause_reason: CoachProfileBody['pause_reason'];
  /** When the job last ran this person's check-in; null before the first. */
  last_checkin_at?: Date | null;
}

export interface UserCoachRow {
  id: string;
  user_id: string;
  builtin_key: string | null;
  name: string | null;
  instructions: string | null;
  tool_categories: string[];
  mode: 'rules' | 'ai_judge';
  /** Overrides for a built-in coach; the full rules of a custom one. */
  rules: CoachRuleOverrides | CoachRules;
  ai_rule: string | null;
  settings: Record<string, unknown>;
  enabled: boolean;
  sort_order: number;
}

export interface CheckinCandidate {
  user_id: string;
  checkin_times: string[];
  max_messages_per_day: number;
  paused_until: string | null;
  last_checkin_at: Date | null;
  feature_choices: FeatureChoices | null;
}

export type CoachNudgeSource = 'ai' | 'template' | 'template_fallback';

export type CoachNudgeKind = 'gap' | 'win' | 'outlook';

export interface NewCoachNudge {
  kind?: CoachNudgeKind;
  suggestion?: CoachSuggestion | null;
  question?: CoachQuestion | null;
  questionRef?: string | null;
  exerciseEntryId?: string | null;
  id: string;
  coachId: string;
  localDay: string;
  checkinSlot: string;
  ruleKey: string;
  because: CoachBecause[];
  source: CoachNudgeSource;
  templateKey: string | null;
  templateParams: Record<string, number | string> | null;
}

const PROFILE_COLUMNS = `user_id, diet_type, foods_avoid, foods_prefer, tone, notes,
  checkin_times::text[] AS checkin_times, max_messages_per_day,
  paused_until::text AS paused_until, pause_reason, last_checkin_at`;

const COACH_COLUMNS = `id, user_id, builtin_key, name, instructions, tool_categories,
  mode, rules, ai_rule, settings, enabled, sort_order`;

/** Postgres prints a time as `08:00:00`; the app speaks `HH:MM`. */
function toHourMinute(time: string): string {
  return time.slice(0, 5);
}

function toProfileRow(row: Record<string, unknown>): CoachProfileRow {
  const times = (row.checkin_times as string[]).map(toHourMinute).sort();
  return { ...(row as unknown as CoachProfileRow), checkin_times: times };
}

async function getProfile(userId: string): Promise<CoachProfileRow | null> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT ${PROFILE_COLUMNS} FROM coach_profile WHERE user_id = $1`,
      [userId]
    );
    const row = result.rows[0];
    return row ? toProfileRow(row) : null;
  } finally {
    client.release();
  }
}

/** Creates the row with its defaults when missing, then applies the patch. */
async function upsertProfile(
  userId: string,
  patch: Partial<Omit<CoachProfileRow, 'user_id'>>
): Promise<CoachProfileRow> {
  const columns = Object.keys(patch) as (keyof typeof patch)[];
  const client = await getClient(userId);
  try {
    await client.query(
      'INSERT INTO coach_profile (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
      [userId]
    );
    if (columns.length > 0) {
      const assignments = columns.map((column, index) =>
        column === 'checkin_times'
          ? `${column} = $${index + 2}::time[]`
          : `${column} = $${index + 2}`
      );
      await client.query(
        `UPDATE coach_profile SET ${assignments.join(', ')}, updated_at = now()
         WHERE user_id = $1`,
        [userId, ...columns.map((column) => patch[column])]
      );
    }
    const result = await client.query(
      `SELECT ${PROFILE_COLUMNS} FROM coach_profile WHERE user_id = $1`,
      [userId]
    );
    return toProfileRow(result.rows[0]);
  } finally {
    client.release();
  }
}

async function listCoaches(userId: string): Promise<UserCoachRow[]> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT ${COACH_COLUMNS} FROM user_coaches WHERE user_id = $1
       ORDER BY sort_order, created_at`,
      [userId]
    );
    return result.rows as UserCoachRow[];
  } finally {
    client.release();
  }
}

/** Saves a built-in coach's switch and rule changes, creating its row on the
 * first save (no row means off, with the catalog's rules). */
async function upsertBuiltinCoach(
  userId: string,
  key: string,
  catalog: { toolCategories: readonly string[]; sortOrder: number },
  patch: {
    enabled?: boolean;
    rules?: CoachRuleOverrides;
    settings?: Record<string, unknown>;
  }
): Promise<UserCoachRow> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `INSERT INTO user_coaches (user_id, builtin_key, tool_categories, sort_order, enabled, rules, settings)
       VALUES ($1, $2, $3, $4, COALESCE($5, false), COALESCE($6::jsonb, '{"version":1,"rules":[]}'::jsonb),
               COALESCE($7::jsonb, '{}'::jsonb))
       ON CONFLICT (user_id, builtin_key) WHERE builtin_key IS NOT NULL DO UPDATE SET
         enabled = COALESCE($5, user_coaches.enabled),
         rules = COALESCE($6::jsonb, user_coaches.rules),
         settings = user_coaches.settings || COALESCE($7::jsonb, '{}'::jsonb),
         updated_at = now()
       RETURNING ${COACH_COLUMNS}`,
      [
        userId,
        key,
        catalog.toolCategories,
        catalog.sortOrder,
        patch.enabled ?? null,
        patch.rules ? JSON.stringify(patch.rules) : null,
        patch.settings ? JSON.stringify(patch.settings) : null,
      ]
    );
    return result.rows[0] as UserCoachRow;
  } finally {
    client.release();
  }
}

/** People with at least one coach on, for the check-in job. System client:
 * only the scheduler calls this. */
async function listCheckinCandidates(): Promise<CheckinCandidate[]> {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      `SELECT p.user_id, p.checkin_times::text[] AS checkin_times,
              p.max_messages_per_day, p.paused_until::text AS paused_until,
              p.last_checkin_at, up.feature_choices
       FROM coach_profile p
       LEFT JOIN user_preferences up ON up.user_id = p.user_id
       WHERE EXISTS (
         SELECT 1 FROM user_coaches c WHERE c.user_id = p.user_id AND c.enabled
       )`
    );
    return (
      result.rows as (CheckinCandidate & { checkin_times: string[] })[]
    ).map((row) => ({
      ...row,
      checkin_times: row.checkin_times.map(toHourMinute).sort(),
    }));
  } finally {
    client.release();
  }
}

/** Claims a check-in slot for a person: true for exactly one caller, across
 * server instances. */
async function claimCheckin(userId: string, slot: Date): Promise<boolean> {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      `UPDATE coach_profile SET last_checkin_at = $2
       WHERE user_id = $1 AND (last_checkin_at IS NULL OR last_checkin_at < $2)
       RETURNING user_id`,
      [userId, slot]
    );
    return result.rowCount === 1;
  } finally {
    client.release();
  }
}

async function countNudgesForDay(
  userId: string,
  localDay: string
): Promise<number> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT count(*)::int AS count FROM coach_nudges
       WHERE user_id = $1 AND local_day = $2`,
      [userId, localDay]
    );
    return result.rows[0].count as number;
  } finally {
    client.release();
  }
}

async function clearNudgesForDay(
  userId: string,
  localDay: string
): Promise<number> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `DELETE FROM coach_nudges
       WHERE user_id = $1 AND local_day = $2`,
      [userId, localDay]
    );
    return result.rowCount ?? 0;
  } finally {
    client.release();
  }
}

/** Rules that already spoke on this local day, as `coachId:ruleKey`. */
async function getNudgeKeysForDay(
  userId: string,
  localDay: string
): Promise<Set<string>> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT coach_id, rule_key FROM coach_nudges
       WHERE user_id = $1 AND local_day = $2`,
      [userId, localDay]
    );
    return new Set(
      result.rows.map(
        (row: { coach_id: string; rule_key: string }) =>
          `${row.coach_id}:${row.rule_key}`
      )
    );
  } finally {
    client.release();
  }
}

/** Saves the nudge and the chat message that shows it, in one transaction.
 * Returns false (nothing saved) when the same rule already spoke that day. */
async function insertNudgeWithChatMessage(
  userId: string,
  nudge: NewCoachNudge,
  chat: { text: string; metadata: Record<string, unknown> }
): Promise<{ chatMessageId: string } | null> {
  const chatMessageId = randomUUID();
  const client = await getClient(userId);
  try {
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO coach_nudges
         (id, user_id, coach_id, local_day, checkin_slot, rule_key, because,
          source, template_key, template_params, chat_message_id,
          kind, suggestion, suggestion_status, question, question_ref, exercise_entry_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
               $12, $13, $14, $15, $16, $17)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [
        nudge.id,
        userId,
        nudge.coachId,
        nudge.localDay,
        nudge.checkinSlot,
        nudge.ruleKey,
        JSON.stringify(nudge.because),
        nudge.source,
        nudge.templateKey,
        nudge.templateParams ? JSON.stringify(nudge.templateParams) : null,
        chatMessageId,
        nudge.kind ?? 'gap',
        nudge.suggestion ? JSON.stringify(nudge.suggestion) : null,
        nudge.suggestion ? 'pending' : null,
        nudge.question ?? null,
        nudge.questionRef ?? null,
        nudge.exerciseEntryId ?? null,
      ]
    );
    if (inserted.rowCount !== 1) {
      await client.query('ROLLBACK');
      return null;
    }
    await client.query(
      `INSERT INTO sparky_chat_history (id, user_id, content, message_type, metadata, parts, created_at)
       VALUES ($1, $2, $3, 'assistant', $4, $5, now())`,
      [
        chatMessageId,
        userId,
        chat.text,
        JSON.stringify(chat.metadata),
        JSON.stringify([{ type: 'text', text: chat.text }]),
      ]
    );
    await client.query('COMMIT');
    return { chatMessageId };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Unread messages per coach. A message whose chat row was deleted (history
 * auto-clear) no longer counts. */
async function getUnreadCounts(
  userId: string
): Promise<{ coach_id: string; count: number; latest_at: string }[]> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT n.coach_id, count(*)::int AS count, max(n.created_at) AS latest_at
       FROM coach_nudges n
       WHERE n.user_id = $1 AND n.read_at IS NULL
         AND EXISTS (SELECT 1 FROM sparky_chat_history h
                     WHERE h.id = n.chat_message_id AND h.user_id = $1)
       GROUP BY n.coach_id`,
      [userId]
    );
    return result.rows.map(
      (row: { coach_id: string; count: number; latest_at: Date }) => ({
        coach_id: row.coach_id,
        count: row.count,
        latest_at: row.latest_at.toISOString(),
      })
    );
  } finally {
    client.release();
  }
}

/** Unread messages with their text, newest first, for notifications. */
async function listUnreadMessages(userId: string, since: Date | null) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT n.id AS nudge_id, n.coach_id, c.name AS coach_name, c.builtin_key,
              h.content AS text, n.template_key, n.template_params,
              n.created_at
       FROM coach_nudges n
       JOIN user_coaches c ON c.id = n.coach_id AND c.user_id = n.user_id
       JOIN sparky_chat_history h ON h.id = n.chat_message_id AND h.user_id = n.user_id
       WHERE n.user_id = $1 AND n.read_at IS NULL
         AND ($2::timestamptz IS NULL OR n.created_at > $2)
       ORDER BY n.created_at DESC LIMIT 20`,
      [userId, since]
    );
    return result.rows.map(
      (row: { created_at: Date } & Record<string, unknown>) => ({
        ...row,
        created_at: row.created_at.toISOString(),
      })
    );
  } finally {
    client.release();
  }
}

async function markRead(userId: string, coachId: string): Promise<void> {
  const client = await getClient(userId);
  try {
    await client.query(
      `UPDATE coach_nudges SET read_at = now()
       WHERE user_id = $1 AND coach_id = $2 AND read_at IS NULL`,
      [userId, coachId]
    );
  } finally {
    client.release();
  }
}

async function markAllRead(userId: string): Promise<void> {
  const client = await getClient(userId);
  try {
    await client.query(
      `UPDATE coach_nudges SET read_at = now()
       WHERE user_id = $1 AND read_at IS NULL`,
      [userId]
    );
  } finally {
    client.release();
  }
}

export interface CustomCoachInput {
  name: string;
  instructions: string | null;
  toolCategories: string[];
  mode: 'rules' | 'ai_judge';
  rules: CoachRules;
  aiRule: string | null;
  enabled: boolean;
}

async function countCustomCoaches(userId: string): Promise<number> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      'SELECT count(*)::int AS count FROM user_coaches WHERE user_id = $1 AND builtin_key IS NULL',
      [userId]
    );
    return result.rows[0].count as number;
  } finally {
    client.release();
  }
}

async function createCustomCoach(
  userId: string,
  input: CustomCoachInput
): Promise<UserCoachRow> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `INSERT INTO user_coaches
         (user_id, name, instructions, tool_categories, mode, rules, ai_rule, enabled, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 100)
       RETURNING ${COACH_COLUMNS}`,
      [
        userId,
        input.name,
        input.instructions,
        input.toolCategories,
        input.mode,
        JSON.stringify(input.rules),
        input.aiRule,
        input.enabled,
      ]
    );
    return result.rows[0] as UserCoachRow;
  } finally {
    client.release();
  }
}

/** Replaces a custom coach's settings; null when it is not the person's. */
async function updateCustomCoach(
  userId: string,
  id: string,
  input: CustomCoachInput
): Promise<UserCoachRow | null> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `UPDATE user_coaches SET name = $3, instructions = $4, tool_categories = $5,
         mode = $6, rules = $7, ai_rule = $8, enabled = $9, updated_at = now()
       WHERE user_id = $1 AND id = $2 AND builtin_key IS NULL
       RETURNING ${COACH_COLUMNS}`,
      [
        userId,
        id,
        input.name,
        input.instructions,
        input.toolCategories,
        input.mode,
        JSON.stringify(input.rules),
        input.aiRule,
        input.enabled,
      ]
    );
    return (result.rows[0] as UserCoachRow | undefined) ?? null;
  } finally {
    client.release();
  }
}

async function deleteCustomCoach(userId: string, id: string): Promise<boolean> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      'DELETE FROM user_coaches WHERE user_id = $1 AND id = $2 AND builtin_key IS NULL',
      [userId, id]
    );
    return result.rowCount === 1;
  } finally {
    client.release();
  }
}

export interface CoachNudgeRow {
  id: string;
  user_id: string;
  coach_id: string;
  local_day: string;
  rule_key: string;
  kind: CoachNudgeKind;
  reaction: number | null;
  suggestion: CoachSuggestion | null;
  suggestion_status: CoachSuggestionStatus | null;
  question: CoachQuestion | null;
  question_ref: string | null;
  answered_at: Date | null;
  chat_message_id: string;
}

const NUDGE_COLUMNS = `id, user_id, coach_id, local_day::text AS local_day, rule_key, kind,
  reaction, suggestion, suggestion_status, question, question_ref, answered_at, chat_message_id`;

async function getNudge(
  userId: string,
  nudgeId: string
): Promise<CoachNudgeRow | null> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT ${NUDGE_COLUMNS} FROM coach_nudges WHERE user_id = $1 AND id = $2`,
      [userId, nudgeId]
    );
    if (result.rows[0]) return result.rows[0] as CoachNudgeRow;

    // Fallback: recover nudge from sparky_chat_history if it was deleted or cleared
    const chatResult = await client.query(
      `SELECT id, metadata, created_at FROM sparky_chat_history
       WHERE user_id = $1 AND (metadata->'custom'->'coach'->>'nudgeId' = $2 OR id::text = $2)
       LIMIT 1`,
      [userId, nudgeId]
    );
    const chatRow = chatResult.rows[0];
    if (chatRow && chatRow.metadata?.custom?.coach) {
      const coachMeta = chatRow.metadata.custom.coach;
      const coachId = coachMeta.coachId;
      const ruleKey =
        coachMeta.ruleId ??
        coachMeta.rule_key ??
        (Array.isArray(coachMeta.because) && coachMeta.because[0]?.signal
          ? coachMeta.because[0].signal
          : 'general');
      const createdAt = new Date(chatRow.created_at);
      const localDay = createdAt.toISOString().slice(0, 10);
      const slot = createdAt.toISOString().slice(11, 19);
      const insertResult = await client.query(
        `INSERT INTO coach_nudges (
          id, user_id, coach_id, local_day, checkin_slot, rule_key, because, source, chat_message_id, kind, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
        ) ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id
        RETURNING ${NUDGE_COLUMNS}`,
        [
          nudgeId,
          userId,
          coachId,
          localDay,
          slot,
          ruleKey,
          JSON.stringify(coachMeta.because ?? []),
          coachMeta.source ?? 'ai',
          chatRow.id,
          coachMeta.kind ?? 'gap',
          createdAt,
        ]
      );
      return (insertResult.rows[0] as CoachNudgeRow | undefined) ?? null;
    }
    return null;
  } finally {
    client.release();
  }
}

/** The current state of a thread's recent messages: thumbs, suggestions and
 * answers, which the stored chat message does not carry. */
async function listNudgeStates(userId: string, coachId: string) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT id, reaction, suggestion_status, question, answer
       FROM coach_nudges WHERE user_id = $1 AND coach_id = $2
       ORDER BY created_at DESC LIMIT 50`,
      [userId, coachId]
    );
    return result.rows as {
      id: string;
      reaction: 1 | -1 | null;
      suggestion_status: CoachSuggestionStatus | null;
      question: CoachQuestion | null;
      answer: string | number | null;
    }[];
  } finally {
    client.release();
  }
}

/** Wins already sent today, so there is at most one a day. */
async function countWinsForDay(
  userId: string,
  localDay: string
): Promise<number> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT count(*)::int AS count FROM coach_nudges
       WHERE user_id = $1 AND local_day = $2 AND kind = 'win'`,
      [userId, localDay]
    );
    return result.rows[0].count as number;
  } finally {
    client.release();
  }
}

/** Sets or clears the person's thumb on a message. */
async function setReaction(
  userId: string,
  nudgeId: string,
  reaction: 1 | -1 | null
): Promise<boolean> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `UPDATE coach_nudges SET reaction = $3,
         reaction_at = CASE WHEN $3::smallint IS NULL THEN NULL ELSE now() END
       WHERE user_id = $1 AND id = $2`,
      [userId, nudgeId, reaction]
    );
    return result.rowCount === 1;
  } finally {
    client.release();
  }
}

/** Thumbs-down on one rule of one coach in the last 30 days. */
async function countRecentDownvotes(
  userId: string,
  coachId: string,
  ruleKey: string
): Promise<number> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT count(*)::int AS count FROM coach_nudges
       WHERE user_id = $1 AND coach_id = $2 AND rule_key = $3
         AND reaction = -1 AND reaction_at >= now() - interval '30 days'`,
      [userId, coachId, ruleKey]
    );
    return result.rows[0].count as number;
  } finally {
    client.release();
  }
}

/** Moves a pending suggestion on; false when it was not pending. */
async function resolveSuggestion(
  userId: string,
  nudgeId: string,
  status: Exclude<CoachSuggestionStatus, 'pending'>,
  fromStatus: CoachSuggestionStatus = 'pending'
): Promise<boolean> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `UPDATE coach_nudges SET suggestion_status = $3, suggestion_resolved_at = now()
       WHERE user_id = $1 AND id = $2 AND suggestion_status = $4`,
      [userId, nudgeId, status, fromStatus]
    );
    return result.rowCount === 1;
  } finally {
    client.release();
  }
}

/** Conditionally claims a pending suggestion for applying so concurrent dismissals cannot race. */
async function claimSuggestion(
  userId: string,
  nudgeId: string
): Promise<boolean> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `UPDATE coach_nudges SET suggestion_status = 'applied', suggestion_resolved_at = now()
       WHERE user_id = $1 AND id = $2 AND suggestion_status = 'pending'`,
      [userId, nudgeId]
    );
    return result.rowCount === 1;
  } finally {
    client.release();
  }
}

/** Reverts an applied claim back to pending if the domain write failed. */
async function unclaimSuggestion(
  userId: string,
  nudgeId: string
): Promise<void> {
  const client = await getClient(userId);
  try {
    await client.query(
      `UPDATE coach_nudges SET suggestion_status = 'pending', suggestion_resolved_at = NULL
       WHERE user_id = $1 AND id = $2 AND suggestion_status = 'applied'`,
      [userId, nudgeId]
    );
  } finally {
    client.release();
  }
}

/** Clears the recorded answer if the accompanying diary entry write failed. */
async function clearAnswer(userId: string, nudgeId: string): Promise<void> {
  const client = await getClient(userId);
  try {
    await client.query(
      `UPDATE coach_nudges SET answer = NULL, answered_at = NULL
       WHERE user_id = $1 AND id = $2`,
      [userId, nudgeId]
    );
  } finally {
    client.release();
  }
}

/** Stores the answer to a question; false when it was already answered. */
async function recordAnswer(
  userId: string,
  nudgeId: string,
  answer: string | number
): Promise<boolean> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `UPDATE coach_nudges SET answer = $3, answered_at = now(), read_at = COALESCE(read_at, now())
       WHERE user_id = $1 AND id = $2 AND question IS NOT NULL AND answered_at IS NULL`,
      [userId, nudgeId, JSON.stringify(answer)]
    );
    return result.rowCount === 1;
  } finally {
    client.release();
  }
}

/** Claims the event scan, returning the time it last ran (null the first
 * time); null result when another instance already took this scan. */
async function claimEventScan(
  userId: string,
  now: Date
): Promise<{ since: Date | null } | null> {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      `UPDATE coach_profile cp SET last_event_scan_at = $2
       FROM (SELECT user_id, last_event_scan_at FROM coach_profile WHERE user_id = $1 FOR UPDATE) old
       WHERE cp.user_id = old.user_id
         AND (old.last_event_scan_at IS NULL OR old.last_event_scan_at < $2)
       RETURNING old.last_event_scan_at AS since`,
      [userId, now]
    );
    const row = result.rows[0] as { since: Date | null } | undefined;
    return row ? { since: row.since } : null;
  } finally {
    client.release();
  }
}

/** Rules a person's thumbs-down switched off, with the coach they belong to. */
async function listNudgesForKnowledge(userId: string) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT coach_id, rule_key, count(*)::int AS downvotes
       FROM coach_nudges WHERE user_id = $1 AND reaction = -1
       GROUP BY coach_id, rule_key`,
      [userId]
    );
    return result.rows as {
      coach_id: string;
      rule_key: string;
      downvotes: number;
    }[];
  } finally {
    client.release();
  }
}

/** The coach (if any) that owns this id, for validating a chat `coachId`. */
async function getCoachById(
  userId: string,
  coachId: string
): Promise<UserCoachRow | null> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT ${COACH_COLUMNS} FROM user_coaches WHERE user_id = $1 AND id = $2`,
      [userId, coachId]
    );
    return (result.rows[0] as UserCoachRow | undefined) ?? null;
  } finally {
    client.release();
  }
}

export default {
  getProfile,
  upsertProfile,
  listCoaches,
  upsertBuiltinCoach,
  listCheckinCandidates,
  claimCheckin,
  countNudgesForDay,
  clearNudgesForDay,
  getNudgeKeysForDay,
  getNudge,
  listNudgeStates,
  countWinsForDay,
  setReaction,
  countRecentDownvotes,
  resolveSuggestion,
  claimSuggestion,
  unclaimSuggestion,
  recordAnswer,
  clearAnswer,
  claimEventScan,
  listNudgesForKnowledge,
  insertNudgeWithChatMessage,
  getUnreadCounts,
  listUnreadMessages,
  markRead,
  markAllRead,
  getCoachById,
  countCustomCoaches,
  createCustomCoach,
  updateCustomCoach,
  deleteCustomCoach,
};
