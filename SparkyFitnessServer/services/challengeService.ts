import { createHash, randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';
import {
  CHALLENGE_DEFAULT_MEMBER_LIMIT,
  CHALLENGE_MAX_BACKDATE_DAYS,
  CHALLENGE_MAX_LENGTH_DAYS,
  CHALLENGE_MAX_START_AHEAD_DAYS,
  CHALLENGE_RULES_VERSION,
  DEFAULT_CHALLENGE_GOAL_TYPE,
  DEFAULT_CHALLENGE_PRESET_ID,
  addDays,
  challengeCountedEntries,
  challengeDailyCalories,
  challengeEntryClass,
  challengePace,
  challengePeriodTotal,
  challengePeriodWindow,
  challengePeriodsUpTo,
  challengePreset,
  challengePresetEndDate,
  challengeRulesEffectiveFrom,
  challengeWeekGoal,
  daysBetween,
  daysInRange,
  deriveWorkoutSessionStatus,
  effortAdjustedOneRepMaxKg,
  entryCaloriesCounted,
  isValidTimeZone,
  isWarmupSetType,
  isoWeekday,
  isWorkoutPlanGeneratedSource,
  parseChallengeRules,
  rankChallengeStandings,
  scoreChallengeDays,
  todayInZone,
  weekStartOf,
  type ChallengeDayScore,
  type ChallengeDetail,
  type ChallengeEntry,
  type ChallengeGoalBonusInput,
  type ChallengeInviteResponse,
  type ChallengeMemberZones,
  type ChallengeRuleChange,
  type ChallengeRules,
  type ChallengeStandingInput,
  type ChallengeStandingsResponse,
  type ChallengeSummary,
  type ChallengeWindow,
  type CreateChallengeBody,
  type JoinChallengeBody,
} from '@workspace/shared';
import challengeRepository, {
  type ChallengeDailyScoreRow,
  type ChallengeListRow,
  type ChallengeMemberRow,
  type ChallengeRow,
  type ChallengeRuleChangeRow,
  type DailyScoreInput,
  type ChallengeActivityCardInput,
  type MemberEntryRow,
} from '../models/challengeRepository.js';
import rateLimitWindowRepository from '../models/rateLimitWindowRepository.js';
import { isChallengesEnabled } from '../models/globalSettingsRepository.js';
import heartRateZoneService from './heartRateZoneService.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import { log } from '../config/logging.js';
import { isShuttingDown } from '../utils/shutdownHooks.js';

/** An error the routes answer with its own status and code. */
export class ChallengeError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ChallengeError';
    this.status = status;
    this.code = code;
  }
}

const notFound = () =>
  new ChallengeError(404, 'CHALLENGE_NOT_FOUND', 'Challenge not found');
const hostOnly = () =>
  new ChallengeError(403, 'CHALLENGE_HOST_ONLY', 'Only the host can do this');

/** Joins tried per person (a wrong code included) in a window, across all instances. */
export const JOIN_ATTEMPTS_PER_WINDOW = 10;
export const JOIN_WINDOW_MS = 15 * 60 * 1000;
/** Invite codes made per person in a window. */
export const INVITES_PER_WINDOW = 20;
export const INVITE_WINDOW_MS = 60 * 60 * 1000;
/** Challenges a person creates in a window. */
export const CREATES_PER_WINDOW = 10;
export const CREATE_WINDOW_MS = 60 * 60 * 1000;
/** Rules changes a host makes to one challenge in a window. */
export const RULE_CHANGES_PER_WINDOW = 10;
export const RULE_CHANGE_WINDOW_MS = 24 * 60 * 60 * 1000;
/** A finished period stays open this long for workouts that sync late. */
export const LATE_SYNC_DAYS = 2;
/** Score-queue rows wait this long after the last change before being scored. */
export const SCORE_QUIET_SECONDS = 30;
/** Taken queue rows are hidden this long; if the run dies they come back after it. */
export const SCORE_LEASE_SECONDS = 10 * 60;
const SCORE_BATCH = 500;
/** History read before the first scored day, for PRs, averages and goals. */
const MIN_LOOKBACK_DAYS = 35;

export async function challengesEnabled(): Promise<boolean> {
  return isChallengesEnabled();
}

export function hashInviteCode(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex');
}

/** A 128-bit random invite code, base64url (22 characters). */
export function newInviteCode(): string {
  return randomBytes(16).toString('base64url');
}

async function rateLimit(
  key: string,
  max: number,
  windowMs: number
): Promise<void> {
  const { count, resetInMs } = await rateLimitWindowRepository.hit(
    key,
    windowMs
  );
  if (count > max) {
    const error = new ChallengeError(
      429,
      'CHALLENGE_RATE_LIMITED',
      `Too many attempts. Try again in ${Math.max(1, Math.ceil(resetInMs / 1000))} seconds.`
    );
    throw error;
  }
}

function parseStoredRules(value: unknown): ChallengeRules {
  const parsed = parseChallengeRules(value);
  if (!parsed.success) {
    throw new Error('Stored challenge rules do not parse');
  }
  return parsed.data;
}

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

type RuleLogRow = Pick<
  ChallengeRuleChangeRow,
  'effective_from' | 'rules' | 'seq'
>;

/** The rules log in write order: by effective day, then by seq. */
function orderedLog(changes: readonly RuleLogRow[]): RuleLogRow[] {
  // seq is the write order; created_at is the transaction start and can be
  // out of order between two overlapping changes.
  return [...changes].sort(
    (a, b) =>
      a.effective_from.localeCompare(b.effective_from) ||
      Number(a.seq) - Number(b.seq)
  );
}

/**
 * The rules scoring a challenge today (its first day before it starts, its
 * last once it is over) and the saved change still waiting for its first
 * day, if any. `challenges.rules` holds the newest save, which applies only
 * from the next period, so it is not what scores the running one.
 */
export function rulesInForce(
  row: Pick<ChallengeRow, 'rules' | 'start_date' | 'end_date' | 'time_zone'>,
  changes: readonly RuleLogRow[]
): Pick<ChallengeSummary, 'rules' | 'pending_rules'> {
  if (!changes.length) {
    return { rules: parseStoredRules(row.rules), pending_rules: null };
  }
  let day = todayInZone(row.time_zone);
  if (day < row.start_date) day = row.start_date;
  if (row.end_date && day > row.end_date) day = row.end_date;
  const last = orderedLog(changes).at(-1)!;
  return {
    rules: rulesForDay(changes, day),
    // A change dated after the end never scores (the host is refused one).
    pending_rules:
      last.effective_from > day &&
      (!row.end_date || last.effective_from <= row.end_date)
        ? {
            rules: parseStoredRules(last.rules),
            effective_from: last.effective_from,
          }
        : null,
  };
}

function toSummary(
  row: ChallengeRow,
  isHost: boolean,
  memberCount: number,
  changes: readonly RuleLogRow[]
): ChallengeSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    emoji: row.emoji,
    template: row.template,
    ...rulesInForce(row, changes),
    start_date: row.start_date,
    end_date: row.end_date,
    time_zone: row.time_zone,
    member_limit: row.member_limit,
    late_join: row.late_join,
    ended_at: iso(row.ended_at),
    is_host: isHost,
    member_count: memberCount,
    invite_active: row.invite_active,
    invite_expires_at: row.invite_active ? iso(row.invite_expires_at) : null,
  };
}

/** The member's own row, checked in code before any read or write. */
async function requireMember(
  userId: string,
  challengeId: string
): Promise<ChallengeMemberRow> {
  const member = await challengeRepository.getMembership(challengeId, userId);
  if (!member) throw notFound();
  return member;
}

async function requireHost(
  userId: string,
  challengeId: string
): Promise<ChallengeMemberRow> {
  const member = await requireMember(userId, challengeId);
  if (member.role !== 'host') throw hostOnly();
  return member;
}

/** The rules in force on `day`: the latest change effective on or before it. */
export function rulesForDay(
  changes: readonly RuleLogRow[],
  day: string
): ChallengeRules {
  const ordered = orderedLog(changes);
  let chosen = ordered[0];
  for (const change of ordered) {
    if (change.effective_from <= day) chosen = change;
  }
  if (!chosen) throw new Error('Challenge has no rules');
  return parseStoredRules(chosen.rules);
}

function validateDates(
  startDate: string,
  endDate: string | null,
  rules: ChallengeRules
): void {
  if (endDate && endDate < startDate) {
    throw new ChallengeError(
      400,
      'CHALLENGE_INVALID_DATES',
      'end_date must not be before start_date'
    );
  }
  if (endDate && daysBetween(startDate, endDate) >= CHALLENGE_MAX_LENGTH_DAYS) {
    throw new ChallengeError(
      400,
      'CHALLENGE_INVALID_DATES',
      `A challenge lasts at most ${CHALLENGE_MAX_LENGTH_DAYS} days`
    );
  }
  if (rules.period === 'challenge' && !endDate) {
    throw new ChallengeError(
      400,
      'CHALLENGE_INVALID_DATES',
      'A challenge scored as one period needs an end_date'
    );
  }
}

/**
 * A new challenge starts at most CHALLENGE_MAX_BACKDATE_DAYS before today and
 * CHALLENGE_MAX_START_AHEAD_DAYS after it, in the challenge's zone. Scoring,
 * the backfill and finalising all walk the days from the start, so a start
 * date far in the past would make them walk years.
 */
function validateStartDate(startDate: string, today: string): void {
  if (
    startDate < addDays(today, -CHALLENGE_MAX_BACKDATE_DAYS) ||
    startDate > addDays(today, CHALLENGE_MAX_START_AHEAD_DAYS)
  ) {
    throw new ChallengeError(
      400,
      'CHALLENGE_INVALID_DATES',
      `start_date must be within ${CHALLENGE_MAX_BACKDATE_DAYS} days before and ${CHALLENGE_MAX_START_AHEAD_DAYS} days after today`
    );
  }
}

// ---------------------------------------------------------------------------
// Owner-only actions (the routes refuse a delegated or switched context)
// ---------------------------------------------------------------------------

export async function createChallenge(
  userId: string,
  body: CreateChallengeBody & { member_limit: number; late_join: boolean }
): Promise<ChallengeDetail> {
  const preset = challengePreset(body.preset ?? DEFAULT_CHALLENGE_PRESET_ID);
  const rules = body.rules ? parseStoredRules(body.rules) : preset.rules;
  // An explicit null means open-ended; only a missing end_date takes the
  // preset's length.
  const endDate =
    body.end_date !== undefined
      ? body.end_date
      : body.rules
        ? null
        : challengePresetEndDate(preset.id, body.start_date);
  validateDates(body.start_date, endDate, rules);
  const timeZone =
    body.time_zone && isValidTimeZone(body.time_zone)
      ? body.time_zone
      : await loadUserTimezone(userId);
  validateStartDate(body.start_date, todayInZone(timeZone));
  // Counted only for a challenge that would be made, so a refused attempt
  // does not use up the allowance.
  await rateLimit(
    `challenge-create:${userId}`,
    CREATES_PER_WINDOW,
    CREATE_WINDOW_MS
  );
  const id = await challengeRepository.createWithHost({
    ownerUserId: userId,
    name: body.name,
    description: body.description ?? null,
    emoji: body.emoji ?? null,
    template: body.rules ? null : preset.id,
    rules,
    rulesVersion: CHALLENGE_RULES_VERSION,
    startDate: body.start_date,
    endDate,
    timeZone,
    memberLimit: body.member_limit ?? CHALLENGE_DEFAULT_MEMBER_LIMIT,
    lateJoin: body.late_join ?? true,
    displayName: body.display_name,
    goalType: body.goal_type ?? DEFAULT_CHALLENGE_GOAL_TYPE,
  });
  await queueBackfill(id, userId, body.start_date, endDate, timeZone);
  return getChallenge(userId, id);
}

export async function listChallenges(
  userId: string
): Promise<ChallengeSummary[]> {
  const rows: ChallengeListRow[] =
    await challengeRepository.listForMember(userId);
  const logs = new Map<string, RuleLogRow[]>();
  for (const log of await challengeRepository.getRuleLogsForMember(
    userId,
    rows.map((row) => row.id)
  )) {
    const list = logs.get(log.challenge_id);
    if (list) list.push(log);
    else logs.set(log.challenge_id, [log]);
  }
  return rows.map((row) =>
    toSummary(
      row,
      row.role === 'host',
      row.member_count,
      logs.get(row.id) ?? []
    )
  );
}

export async function getChallenge(
  userId: string,
  challengeId: string
): Promise<ChallengeDetail> {
  const member = await requireMember(userId, challengeId);
  const [row, members, changes] = await Promise.all([
    challengeRepository.getForMember(userId, challengeId),
    challengeRepository.getMembersForMember(userId, challengeId),
    challengeRepository.getRuleChangesForMember(userId, challengeId),
  ]);
  if (!row) throw notFound();
  return {
    ...toSummary(row, member.role === 'host', members.length, changes),
    members: members.map((m) => ({
      user_id: m.user_id,
      display_name: m.display_name,
      role: m.role,
      joined_at: iso(m.joined_at) as string,
    })),
  };
}

/**
 * The day a rules change takes effect on this challenge as it stands, or the
 * reason it is refused: ended, a period change once started, dates the rules
 * don't allow, or no period left.
 */
function ruleChangeEffectiveFrom(
  challenge: ChallengeRow,
  rules: ChallengeRules
): string {
  if (challenge.ended_at) {
    throw new ChallengeError(
      409,
      'CHALLENGE_ENDED',
      'This challenge has ended'
    );
  }
  const current = parseStoredRules(challenge.rules);
  const today = todayInZone(challenge.time_zone);
  const started = today >= challenge.start_date;
  if (started && rules.period !== current.period) {
    throw new ChallengeError(
      400,
      'CHALLENGE_PERIOD_LOCKED',
      'The period cannot change once the challenge has started'
    );
  }
  validateDates(challenge.start_date, challenge.end_date, rules);
  const effectiveFrom = challengeRulesEffectiveFrom(
    current.period,
    today,
    challenge.start_date,
    challenge.end_date
  );
  if (challenge.end_date && effectiveFrom > challenge.end_date) {
    throw new ChallengeError(
      409,
      'CHALLENGE_NO_PERIOD_LEFT',
      'No period is left for a rules change to apply to'
    );
  }
  return effectiveFrom;
}

/**
 * Changes the rules. Before the start the change applies from the start;
 * after it, from the next period (next day for a daily challenge), so a
 * running period keeps its rules. Every change is logged for all members.
 */
export async function updateRules(
  userId: string,
  challengeId: string,
  input: unknown
): Promise<ChallengeDetail> {
  await requireHost(userId, challengeId);
  const challenge = await challengeRepository.getChallenge(challengeId);
  if (!challenge) throw notFound();
  const rules = parseStoredRules(input);
  // Checked here so a refused change costs no rate-limit slot, and again
  // under the row lock, where the day it takes effect is decided
  const effectiveFrom = ruleChangeEffectiveFrom(challenge, rules);
  // Per challenge, and only for a change that will be saved: each change is
  // one more rules run in every member's rescore.
  await rateLimit(
    `challenge-rules:${challengeId}`,
    RULE_CHANGES_PER_WINDOW,
    RULE_CHANGE_WINDOW_MS
  );
  const saved = await challengeRepository.updateRules(
    challengeId,
    userId,
    rules,
    effectiveFrom,
    CHALLENGE_RULES_VERSION,
    (locked) => ruleChangeEffectiveFrom(locked, rules)
  );
  // Hosting passed on while this request was on its way
  if (!saved) throw hostOnly();
  return getChallenge(userId, challengeId);
}

export async function getRuleChanges(
  userId: string,
  challengeId: string
): Promise<ChallengeRuleChange[]> {
  await requireMember(userId, challengeId);
  const rows = await challengeRepository.getRuleChangesForMember(
    userId,
    challengeId
  );
  return rows.map((row) => ({
    id: row.id,
    changed_by_display_name: row.changed_by_display_name,
    effective_from: row.effective_from,
    rules: parseStoredRules(row.rules),
    previous_rules: row.previous_rules
      ? parseStoredRules(row.previous_rules)
      : null,
    created_at: iso(row.created_at) as string,
  }));
}

/** Makes a new invite code (replacing any live one). The code is returned once. */
export async function createInvite(
  userId: string,
  challengeId: string,
  expiresInDays: number
): Promise<ChallengeInviteResponse> {
  await requireHost(userId, challengeId);
  await rateLimit(
    `challenge-invite:${userId}`,
    INVITES_PER_WINDOW,
    INVITE_WINDOW_MS
  );
  const challenge = await challengeRepository.getChallenge(challengeId);
  if (!challenge) throw notFound();
  if (challenge.ended_at) {
    throw new ChallengeError(
      409,
      'CHALLENGE_ENDED',
      'This challenge has ended'
    );
  }
  const code = newInviteCode();
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
  const saved = await challengeRepository.setInvite(
    challengeId,
    userId,
    hashInviteCode(code),
    expiresAt
  );
  if (!saved) throw hostOnly();
  return { code, expires_at: expiresAt.toISOString() };
}

export async function revokeInvite(
  userId: string,
  challengeId: string
): Promise<void> {
  await requireHost(userId, challengeId);
  if (!(await challengeRepository.clearInvite(challengeId, userId))) {
    throw hostOnly();
  }
}

export async function joinChallenge(
  userId: string,
  body: JoinChallengeBody
): Promise<ChallengeDetail> {
  // Counted before the lookup, so wrong codes count too.
  await rateLimit(
    `challenge-join:${userId}`,
    JOIN_ATTEMPTS_PER_WINDOW,
    JOIN_WINDOW_MS
  );
  const outcome = await challengeRepository.joinByInviteHash(
    hashInviteCode(body.code.trim()),
    userId,
    body.display_name,
    body.goal_type ?? DEFAULT_CHALLENGE_GOAL_TYPE,
    todayInZone
  );
  switch (outcome.status) {
    case 'not_found':
      throw new ChallengeError(
        404,
        'CHALLENGE_INVITE_INVALID',
        'This invite code is not valid or has expired'
      );
    case 'ended':
      throw new ChallengeError(
        409,
        'CHALLENGE_ENDED',
        'This challenge has ended'
      );
    case 'late_join_closed':
      throw new ChallengeError(
        409,
        'CHALLENGE_LATE_JOIN_CLOSED',
        'This challenge has started and does not take late joiners'
      );
    case 'full':
      throw new ChallengeError(409, 'CHALLENGE_FULL', 'This challenge is full');
    // A repeated join queues the backfill again (an upsert), so a join whose
    // first backfill failed after the membership was saved is completed.
    case 'already_member':
    default: {
      const c = outcome.challenge;
      await queueBackfill(c.id, userId, c.start_date, c.end_date, c.time_zone);
      return getChallenge(userId, c.id);
    }
  }
}

/** Leaves the challenge; the member's scores and cards in it go with them. */
export async function leaveChallenge(
  userId: string,
  challengeId: string
): Promise<void> {
  await requireMember(userId, challengeId);
  const outcome = await challengeRepository.removeMember(challengeId, userId);
  if (outcome === 'not_member') throw notFound();
}

async function queueBackfill(
  challengeId: string,
  userId: string,
  startDate: string,
  endDate: string | null,
  timeZone: string
): Promise<void> {
  const today = todayInZone(timeZone);
  const last = endDate && endDate < today ? endDate : today;
  if (last < startDate) return;
  // One backfill queues at most one maximum-length span, whatever the start
  // (an open-ended challenge can run longer than that). Scoring runs from
  // the earliest queued day on, and frozen periods are skipped anyway.
  const first =
    daysBetween(startDate, last) >= CHALLENGE_MAX_LENGTH_DAYS
      ? addDays(last, -(CHALLENGE_MAX_LENGTH_DAYS - 1))
      : startDate;
  await challengeRepository.enqueueDays(
    challengeId,
    userId,
    daysInRange(first, last)
  );
}

// ---------------------------------------------------------------------------
// Standings
// ---------------------------------------------------------------------------

function storedDay(row: ChallengeDailyScoreRow): ChallengeDayScore {
  return {
    date: row.day,
    eligible: row.eligible,
    counted: row.eligible,
    total: Number(row.total),
    rawTotal: Number(row.total),
    effort: Number(row.effort),
    rawEffort: Number(row.effort),
    minutes: Number(row.minutes),
    unpaidMinutes: 0,
    steps: Number(row.steps),
    stepPoints: Number(row.step_points),
    streakDays: 0,
    streakBonus: Number(row.streak_bonus),
    average: 0,
    averageActiveDays: 0,
    beatAverageBonus: Number(row.beat_average_bonus),
    prs: [],
    prBonus: Number(row.pr_bonus),
    workouts: Number(row.workouts),
    entries: [],
  };
}

/**
 * The goal bonus of each week in the window, a week cut by the window's start
 * or end included (its days were scored against its share of the target), as
 * it stood on each scored day: the latest day of a week gives its bonus; the
 * earlier days let a race finish on the day the bonus got there.
 */
function goalBonuses(
  rows: readonly ChallengeDailyScoreRow[],
  upTo: string
): ChallengeGoalBonusInput[] {
  const out: ChallengeGoalBonusInput[] = [];
  for (const r of rows) {
    if (r.day > upTo) continue;
    const goal = r.detail?.goal as { rawBonus?: unknown } | undefined;
    const raw = Number(goal?.rawBonus);
    if (goal && Number.isFinite(raw)) {
      out.push({
        weekStart: weekStartOf(r.day, 1),
        asOf: r.day,
        rawBonus: Math.max(0, raw),
      });
    }
  }
  return out;
}

export function standingsFromScores(
  members: readonly Pick<ChallengeMemberRow, 'user_id' | 'display_name'>[],
  scores: readonly ChallengeDailyScoreRow[],
  rules: ChallengeRules,
  window: ChallengeWindow,
  upTo: string
) {
  const input: ChallengeStandingInput[] = members.map((m) => {
    const own = scores.filter(
      (s) =>
        s.user_id === m.user_id && s.day >= window.start && s.day <= window.end
    );
    const goals =
      rules.metric === 'points' && rules.points?.goal && rules.period !== 'day'
        ? goalBonuses(own, upTo)
        : [];
    const total = challengePeriodTotal(own.map(storedDay), rules, upTo, goals);
    return {
      userId: m.user_id,
      name: m.display_name,
      total: total.total,
      minutes: total.minutes,
      reachedOn: total.reachedOn,
      daysEligible: total.daysEligible,
      daysHit: total.daysHit,
      goalBonus: total.goalBonus,
    };
  });
  return rankChallengeStandings(input, rules);
}

export async function getStandings(
  userId: string,
  challengeId: string,
  date?: string
): Promise<ChallengeStandingsResponse> {
  await requireMember(userId, challengeId);
  const challenge = await challengeRepository.getForMember(userId, challengeId);
  if (!challenge) throw notFound();
  const today = todayInZone(challenge.time_zone);
  let day = date ?? today;
  if (day < challenge.start_date) day = challenge.start_date;
  if (challenge.end_date && day > challenge.end_date) day = challenge.end_date;
  const changes = await challengeRepository.getRuleChangesForMember(
    userId,
    challengeId
  );
  const current = rulesForDay(changes, day);
  const window = challengePeriodWindow(
    current.period,
    day,
    challenge.start_date,
    challenge.end_date
  );
  const rules = rulesForDay(changes, window.start);

  // The marker first, then the rows: both are committed together, so read
  // in this order a frozen period always comes with its stored rows. A
  // period whose rows all went with deleted accounts is still final, and is
  // never rescored.
  const frozenStarts =
    await challengeRepository.frozenPeriodStarts(challengeId);
  const frozen = await challengeRepository.getResultsForMember(
    userId,
    challengeId,
    window.start
  );
  if (frozenStarts.includes(window.start) || frozen.length) {
    // Rounded once, as the shared ranking does, for both fields
    const group =
      Math.round(frozen.reduce((s, r) => s + Number(r.total), 0) * 10) / 10;
    return {
      challenge_id: challengeId,
      period_start: window.start,
      period_end: window.end,
      rules,
      final: true,
      group_total: group,
      group_reached:
        rules.format === 'group_goal' &&
        rules.target !== null &&
        group >= rules.target,
      rows: frozen.map((r) => ({
        user_id: r.user_id,
        display_name: r.display_name,
        rank: r.rank,
        total: Number(r.total),
        minutes: Number(r.minutes),
        winner: r.is_winner,
        me: r.user_id === userId,
        reached_on: r.reached_on,
        days_hit:
          typeof r.detail?.daysHit === 'number' ? r.detail.daysHit : undefined,
        days_eligible:
          typeof r.detail?.daysEligible === 'number'
            ? r.detail.daysEligible
            : undefined,
        goal_bonus:
          typeof r.detail?.goalBonus === 'number'
            ? r.detail.goalBonus
            : undefined,
      })),
    };
  }

  const [members, scores] = await Promise.all([
    challengeRepository.getMembersForMember(userId, challengeId),
    challengeRepository.getDailyScoresForMember(
      userId,
      challengeId,
      window.start,
      window.end
    ),
  ]);
  // A member's own day can run ahead of the challenge's zone; count it.
  const upTo = addDays(today, 1) < window.end ? addDays(today, 1) : window.end;
  const standings = standingsFromScores(members, scores, rules, window, upTo);
  return {
    challenge_id: challengeId,
    period_start: window.start,
    period_end: window.end,
    rules,
    final: false,
    group_total: standings.groupTotal,
    group_reached: standings.groupReached,
    rows: standings.rows.map((r) => ({
      user_id: r.userId,
      display_name: r.name,
      rank: r.rank,
      total: r.total,
      minutes: r.minutes,
      // Nobody has won a period that is still open: a later workout or a
      // late sync can change it until it is frozen.
      winner: false,
      me: r.userId === userId,
      reached_on: r.reachedOn ?? null,
      days_hit: r.daysHit,
      days_eligible: r.daysEligible,
      goal_bonus: r.goalBonus,
    })),
  };
}

// ---------------------------------------------------------------------------
// Scoring (background jobs)
// ---------------------------------------------------------------------------

const n = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

/**
 * The name upsertExerciseEntryData gives a synced daily active-calorie total.
 * Those rows hold the day's calories, not a workout.
 */
const DAILY_SUMMARY_EXERCISE_NAME = 'Active Calories';

/**
 * A diary row that is only planned, so it earns nothing yet: what a prefill
 * plan generated and nobody has touched. A row in a grouped session is
 * planned while the session's lifecycle status is 'planned' (no set checked
 * off, not finished) and neither the session nor any of its exercises was
 * edited. A single generated row is planned until the member edits it or
 * starts or checks off a set. "Edited" is the test the plan regeneration
 * uses before it removes generated rows (updated_at after created_at), so a
 * workout the plan keeps as the member's own also counts here.
 */
export function isPlannedEntryRow(row: MemberEntryRow): boolean {
  if (row.session) {
    return (
      !row.session.edited &&
      // A started set means the session is under way, though not checked off
      !row.session.sets.some((s) => (s.started_at ?? null) !== null) &&
      deriveWorkoutSessionStatus({
        source: row.session.source,
        finishedAt: row.session.finished_at,
        hasPlanAssignment: row.session.has_plan_assignment,
        sets: row.session.sets ?? [],
      }) === 'planned'
    );
  }
  return (
    isWorkoutPlanGeneratedSource(row.source) &&
    !row.edited &&
    !(row.sets ?? []).some(
      (s) => s.completed_at !== null || s.started_at !== null
    )
  );
}

/** A diary row as the scorer reads it. Distance is stored in km and scored in metres. */
export function toChallengeEntry(row: MemberEntryRow): ChallengeEntry {
  const bestE1rm = Math.max(
    0,
    ...(row.sets ?? [])
      .filter((s) => !isWarmupSetType(s.set_type))
      .map((s) => effortAdjustedOneRepMaxKg(s.weight, s.reps, null))
  );
  const km = n(row.distance);
  // The workout's own figure: the measured active part when the row has one
  // (a Garmin FIT file's calories_burned includes resting energy), else the
  // estimate. The Diary's override (calories_applied) wins over it, through
  // the Diary's own entryCaloriesCounted.
  const estimate = n(row.active_calories) ?? n(row.calories_burned);
  const applied = n(row.calories_applied);
  return {
    id: row.id,
    date: row.entry_date,
    time: row.entry_time,
    durationMin: n(row.duration_minutes) ?? 0,
    avgHr: n(row.avg_heart_rate),
    zoneSeconds: row.zone_seconds
      ? row.zone_seconds.map((s) => Number(s) || 0)
      : null,
    name: row.exercise_name,
    category: row.category,
    source: row.source,
    distanceM: km !== null ? km * 1000 : null,
    bestE1rm: bestE1rm > 0 ? bestE1rm : null,
    exerciseKey: row.exercise_id,
    activeCalories: entryCaloriesCounted({
      calories_applied: applied,
      calories_burned: estimate,
    }),
    ...(applied !== null ? { caloriesEstimate: estimate } : {}),
    calorieLinkId: row.calorie_link_id ?? null,
    calorieLinkResolution: row.calorie_link_resolution ?? null,
    calorieLinkSources: row.calorie_link_sources ?? null,
    elevationM: n(row.elevation_gain_meters),
  };
}

/** The points builder, when the challenge scores points; other metrics ignore it. */
const pointsRules = (rules: ChallengeRules) =>
  rules.metric === 'points' ? rules.points : null;

function lookbackDays(rules: ChallengeRules): number {
  const p = pointsRules(rules);
  if (!p) return 0;
  return Math.max(
    MIN_LOOKBACK_DAYS,
    p.pr?.lookbackDays ?? 0,
    p.beatAverage?.lookbackDays ?? 0,
    (p.goal?.lookbackWeeks ?? 0) * 7 + 7,
    // A streak counts back through history up to its threshold
    (p.streak?.fromDay ?? 0) + 1
  );
}

async function memberZones(memberId: string): Promise<ChallengeMemberZones> {
  const zones = await heartRateZoneService.resolveZonesForUser(memberId);
  return { maxHr: zones.maxHr, floors: zones.floors };
}

/** Splits [from, to] into runs that share the same rules. */
function rulesRuns(
  changes: readonly ChallengeRuleChangeRow[],
  from: string,
  to: string
): { from: string; to: string; rules: ChallengeRules }[] {
  const runs: {
    from: string;
    to: string;
    rules: ChallengeRules;
    key: string;
  }[] = [];
  for (const day of daysInRange(from, to)) {
    const rules = rulesForDay(changes, day);
    const key = JSON.stringify(rules);
    const last = runs[runs.length - 1];
    if (last && last.key === key) last.to = day;
    else runs.push({ from: day, to: day, rules, key });
  }
  return runs.map(({ key: _key, ...run }) => run);
}

/**
 * Scores one member of one challenge from `fromDay` to their latest day (or
 * to `toDay`), reading only that member's own data, and stores the days and
 * cards. Days in frozen periods are left alone. The whole read-score-save
 * cycle holds the member's scoring lock, so overlapping runs (the queue job
 * and the finaliser) save in the order they read.
 */
export async function recomputeMember(
  challenge: ChallengeRow,
  member: Pick<ChallengeMemberRow, 'user_id' | 'goal_type'>,
  fromDay: string,
  toDay?: string
): Promise<void> {
  await challengeRepository.withScoringLock(
    challenge.id,
    member.user_id,
    (lock) => recomputeMemberLocked(challenge, member, fromDay, toDay, lock)
  );
}

async function recomputeMemberLocked(
  challenge: ChallengeRow,
  member: Pick<ChallengeMemberRow, 'user_id' | 'goal_type'>,
  fromDay: string,
  toDay: string | undefined,
  lock: PoolClient
): Promise<void> {
  const changes = await challengeRepository.getRuleChanges(challenge.id);
  if (!changes.length) return;
  const today = todayInZone(challenge.time_zone);
  let to = addDays(today, 1);
  if (challenge.end_date && challenge.end_date < to) to = challenge.end_date;
  if (toDay && toDay < to) to = toDay;
  let from = fromDay < challenge.start_date ? challenge.start_date : fromDay;
  const current = parseStoredRules(challenge.rules);
  const frozen = new Set(
    await challengeRepository.frozenPeriodStarts(challenge.id)
  );
  // Periods freeze in order, so the frozen ones are the first few: skip
  // only those that hold `from`. A frozen period after an open one would
  // mean the open one is skipped and later frozen from stale scores.
  for (const w of challengePeriodsUpTo(
    current.period,
    challenge.start_date,
    challenge.end_date,
    to
  )) {
    if (frozen.has(w.start) && w.start <= from && w.end >= from)
      from = addDays(w.end, 1);
  }
  if (from > to) return;

  const runs = rulesRuns(changes, from, to);
  const lookback = Math.max(0, ...runs.map((r) => lookbackDays(r.rules)));
  const historyFrom = addDays(from, -lookback);
  const [rows, steps, zones] = await Promise.all([
    challengeRepository.getMemberEntries(member.user_id, historyFrom, to),
    challengeRepository.getMemberSteps(member.user_id, from, to),
    memberZones(member.user_id),
  ]);
  const done = rows.filter((row) => !isPlannedEntryRow(row));
  const doneById = new Map(done.map((row) => [row.id, row]));
  // A synced daily calorie total is stored as an entry but is no workout: it
  // is never a workout, a streak day, the goal or a card. An active-calories
  // challenge scores each day against it the way the Diary does (the larger
  // of it and the counted workouts), so it is kept per day, apart.
  const entries: ChallengeEntry[] = [];
  const dailyCalories: ChallengeEntry[] = [];
  for (const row of done) {
    (row.exercise_name === DAILY_SUMMARY_EXERCISE_NAME
      ? dailyCalories
      : entries
    ).push(toChallengeEntry(row));
  }

  const scores: DailyScoreInput[] = [];
  const cards: ChallengeActivityCardInput[] = [];
  for (const run of runs) {
    const days = scoreChallengeDays(
      { entries, steps, dailyCalories, zones },
      run.from,
      run.to,
      run.rules
    );
    const counted = challengeCountedEntries(entries, run.rules);
    const dailyKcal = challengeDailyCalories(dailyCalories, run.rules);
    // Workouts of each day, from the counted workouts.
    const workoutsOn = new Map<string, number>();
    for (const e of counted)
      workoutsOn.set(e.date, (workoutsOn.get(e.date) ?? 0) + 1);
    // The goal counts the same workouts as the day scores: manual entries
    // ignored, duplicates merged, filters applied, and only on the weekdays
    // the challenge counts (its own baseline weeks included).
    const goalEntries = counted.filter((e) =>
      run.rules.days.includes(isoWeekday(e.date))
    );
    const points = pointsRules(run.rules);
    // A daily period has no weekly goal (the rules refuse one).
    const weekly = points?.goal && run.rules.period !== 'day' ? points : null;
    for (const d of days) {
      // The week as far as the day's period holds it, so a week cut by the
      // challenge's start or end, or a month's, earns its share.
      const part = weekly
        ? challengePeriodWindow(
            run.rules.period,
            d.date,
            challenge.start_date,
            challenge.end_date
          )
        : null;
      const goal =
        weekly && part
          ? challengeWeekGoal(
              goalEntries,
              member.goal_type,
              weekStartOf(d.date, 1),
              d.date,
              weekly,
              { ...part, days: run.rules.days }
            )
          : null;
      scores.push({
        day: d.date,
        total: d.rawTotal,
        effort: d.effort,
        step_points: d.stepPoints,
        pr_bonus: d.prBonus,
        streak_bonus: d.streakBonus,
        beat_average_bonus: d.beatAverageBonus,
        minutes: d.minutes,
        steps: d.steps,
        workouts: workoutsOn.get(d.date) ?? 0,
        // Tomorrow in the challenge's zone is scored for members whose own
        // day is already there; until it holds a workout, steps or a daily
        // calorie total the challenge counts it is not an eligible day, so
        // it never counts as a missed one.
        eligible:
          d.eligible &&
          (d.date <= today ||
            workoutsOn.has(d.date) ||
            d.steps > 0 ||
            dailyKcal.has(d.date)),
        detail: {
          prs: d.prs,
          entries: d.entries,
          streakDays: d.streakDays,
          average: d.average,
          goal,
        },
      });
      const pointsById = new Map(d.entries.map((e) => [e.id, e.points]));
      for (const e of counted.filter((x) => x.date === d.date)) {
        const pace = challengePace(e);
        const row = doneById.get(e.id);
        cards.push({
          exercise_entry_id: e.id,
          day: d.date,
          activity_type: challengeEntryClass(e),
          name: e.name ?? null,
          minutes: e.durationMin,
          distance_meters: e.distanceM ?? null,
          pace_seconds_per_km: pace !== null ? pace * 60 : null,
          avg_heart_rate: e.avgHr ? Math.round(e.avgHr) : null,
          max_heart_rate:
            row && n(row.max_heart_rate)
              ? Math.round(n(row.max_heart_rate) as number)
              : null,
          points: pointsById.get(e.id) ?? 0,
        });
      }
    }
  }
  await challengeRepository.saveMemberDays(
    challenge.id,
    member.user_id,
    from,
    to,
    scores,
    cards,
    lock
  );
}

/** Scores the member-days waiting in the queue. Returns how many member runs it did. */
export async function processScoreQueue(): Promise<number> {
  if (!(await challengesEnabled())) return 0;
  const batches = await challengeRepository.takeQueuedDays(
    SCORE_BATCH,
    SCORE_QUIET_SECONDS,
    SCORE_LEASE_SECONDS
  );
  let done = 0;
  const challenges = new Map<string, ChallengeRow | null>();
  for (const [i, batch] of batches.entries()) {
    if (isShuttingDown()) {
      // Hand the days not started back now rather than when the lease runs out.
      for (const left of batches.slice(i)) {
        try {
          await challengeRepository.enqueueDays(
            left.challenge_id,
            left.user_id,
            left.days
          );
        } catch {
          // The lease runs out and the days come back on their own.
        }
      }
      break;
    }
    try {
      if (!challenges.has(batch.challenge_id)) {
        challenges.set(
          batch.challenge_id,
          await challengeRepository.getChallenge(batch.challenge_id)
        );
      }
      const challenge = challenges.get(batch.challenge_id);
      const member = challenge
        ? await challengeRepository.getMembership(
            batch.challenge_id,
            batch.user_id
          )
        : null;
      if (challenge && member) {
        const fromDay = [...batch.days].sort()[0]!;
        await recomputeMember(challenge, member, fromDay);
        done += 1;
      }
      // Only now, with the scores saved, do the days leave the queue.
      await challengeRepository.ackQueuedDays(batch);
    } catch (error) {
      // Put the days back now rather than when the lease runs out.
      try {
        await challengeRepository.enqueueDays(
          batch.challenge_id,
          batch.user_id,
          batch.days
        );
      } catch {
        // The lease runs out and the days come back on their own.
      }
      log(
        'error',
        `[CHALLENGES] Scoring ${batch.challenge_id} for a member failed:`,
        error
      );
    }
  }
  return done;
}

/**
 * Nightly catch-up: re-scores the last few days of every running challenge
 * (a late sync the triggers missed, the day rolling over) and re-hosts
 * orphaned challenges. Each challenge's days are worked out in its own zone
 * here, one challenge at a time, so one bad challenge never stops the rest.
 */
export async function nightlyCatchUp(): Promise<void> {
  if (!(await challengesEnabled())) return;
  const rehosted = await challengeRepository.rehostOrphans();
  if (rehosted > 0)
    log('info', `[CHALLENGES] Passed hosting on for ${rehosted} challenge(s).`);
  for (const challenge of await challengeRepository.listOpenChallenges()) {
    if (isShuttingDown()) break;
    try {
      const today = todayInZone(challenge.time_zone);
      const back = addDays(today, -(LATE_SYNC_DAYS + 1));
      const first = back > challenge.start_date ? back : challenge.start_date;
      const last =
        challenge.end_date && challenge.end_date < today
          ? challenge.end_date
          : today;
      if (first > last) continue;
      await challengeRepository.enqueueDaysForAllMembers(
        challenge.id,
        daysInRange(first, last)
      );
    } catch (error) {
      log(
        'error',
        `[CHALLENGES] Nightly catch-up for ${challenge.id} failed:`,
        error
      );
    }
  }
}

/**
 * Freezes every period whose late-sync window has passed: the period's last
 * day plus LATE_SYNC_DAYS full days, in the challenge's zone. Members are
 * scored once more first, then the standings are stored and never rewritten.
 */
export async function finalizePeriods(): Promise<number> {
  if (!(await challengesEnabled())) return 0;
  let frozenCount = 0;
  for (const challenge of await challengeRepository.listOpenChallenges()) {
    if (isShuttingDown()) break;
    try {
      frozenCount += await finalizeChallenge(challenge);
    } catch (error) {
      log('error', `[CHALLENGES] Finalising ${challenge.id} failed:`, error);
    }
  }
  return frozenCount;
}

export async function finalizeChallenge(
  challenge: ChallengeRow
): Promise<number> {
  const today = todayInZone(challenge.time_zone);
  const current = parseStoredRules(challenge.rules);
  const changes = await challengeRepository.getRuleChanges(challenge.id);
  const frozen = new Set(
    await challengeRepository.frozenPeriodStarts(challenge.id)
  );
  const windows = challengePeriodsUpTo(
    current.period,
    challenge.start_date,
    challenge.end_date,
    today
  );
  let count = 0;
  for (const window of windows) {
    if (isShuttingDown()) break;
    if (frozen.has(window.start)) continue;
    if (addDays(window.end, LATE_SYNC_DAYS + 1) > today) break;
    const members = await challengeRepository.getMembers(challenge.id);
    // Only this period: later days are scored by the queue and by their own
    // period's finalising, so overdue periods do not rescore the same days.
    for (const member of members) {
      await recomputeMember(challenge, member, window.start, window.end);
    }
    const rules = rulesForDay(changes, window.start);
    // The standings are worked out from the scores the freeze reads under its
    // lock, so a rescore saved after these runs is never frozen over.
    const stored = await challengeRepository.insertResults(
      challenge.id,
      window.start,
      window.end,
      (scores) =>
        standingsFromScores(
          members,
          scores,
          rules,
          window,
          window.end
        ).rows.map((r) => ({
          user_id: r.userId,
          display_name: r.name,
          rank: r.rank,
          total: r.total,
          minutes: r.minutes,
          is_winner: r.winner,
          reached_on: r.reachedOn ?? null,
          detail: {
            daysHit: r.daysHit,
            daysEligible: r.daysEligible,
            goalBonus: r.goalBonus,
          },
        }))
    );
    // A period that was not frozen (someone joined or left meanwhile) stops
    // the run: later periods wait, so periods always freeze in order and a
    // rescore never skips an open one.
    if (!stored) break;
    count += 1;
    frozen.add(window.start);
  }
  const allFrozen = windows.every((w) => frozen.has(w.start));
  if (
    challenge.end_date &&
    addDays(challenge.end_date, LATE_SYNC_DAYS + 1) <= today &&
    allFrozen
  ) {
    await challengeRepository.markEnded(challenge.id);
  }
  return count;
}

export default {
  challengesEnabled,
  createChallenge,
  listChallenges,
  getChallenge,
  updateRules,
  getRuleChanges,
  createInvite,
  revokeInvite,
  joinChallenge,
  leaveChallenge,
  getStandings,
  processScoreQueue,
  nightlyCatchUp,
  finalizePeriods,
};
