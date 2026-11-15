import { createHash, randomBytes } from 'node:crypto';
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
  challengeEntryClass,
  challengeMeasuredMinutes,
  challengePeriodTotal,
  challengePeriodWindow,
  challengePeriodsUpTo,
  challengePreset,
  challengeRulesEffectiveFrom,
  challengeWeekGoal,
  challengeWeekStart,
  challengeWeeksIn,
  daysBetween,
  daysInRange,
  effortAdjustedOneRepMaxKg,
  isValidTimeZone,
  parseChallengeRules,
  rankChallengeStandings,
  scoreChallengeDays,
  todayInZone,
  type ChallengeDayScore,
  type ChallengeDetail,
  type ChallengeEntry,
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

function toSummary(
  row: ChallengeRow,
  isHost: boolean,
  memberCount: number
): ChallengeSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    emoji: row.emoji,
    template: row.template,
    rules: parseStoredRules(row.rules),
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
  changes: readonly Pick<
    ChallengeRuleChangeRow,
    'effective_from' | 'rules' | 'seq'
  >[],
  day: string
): ChallengeRules {
  // seq is the write order; created_at is the transaction start and can be
  // out of order between two overlapping changes.
  const ordered = [...changes].sort(
    (a, b) =>
      a.effective_from.localeCompare(b.effective_from) ||
      Number(a.seq) - Number(b.seq)
  );
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
  const endDate =
    body.end_date ??
    (body.rules || preset.lengthDays === null
      ? null
      : addDays(body.start_date, preset.lengthDays - 1));
  validateDates(body.start_date, endDate, rules);
  const timeZone =
    body.time_zone && isValidTimeZone(body.time_zone)
      ? body.time_zone
      : await loadUserTimezone(userId);
  validateStartDate(body.start_date, todayInZone(timeZone));
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
  return rows.map((row) =>
    toSummary(row, row.role === 'host', row.member_count)
  );
}

export async function getChallenge(
  userId: string,
  challengeId: string
): Promise<ChallengeDetail> {
  const member = await requireMember(userId, challengeId);
  const [row, members] = await Promise.all([
    challengeRepository.getForMember(userId, challengeId),
    challengeRepository.getMembersForMember(userId, challengeId),
  ]);
  if (!row) throw notFound();
  return {
    ...toSummary(row, member.role === 'host', members.length),
    members: members.map((m) => ({
      user_id: m.user_id,
      display_name: m.display_name,
      role: m.role,
      joined_at: iso(m.joined_at) as string,
    })),
  };
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
  if (challenge.ended_at) {
    throw new ChallengeError(
      409,
      'CHALLENGE_ENDED',
      'This challenge has ended'
    );
  }
  const rules = parseStoredRules(input);
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
  await challengeRepository.updateRules(
    challengeId,
    userId,
    rules,
    current,
    effectiveFrom,
    CHALLENGE_RULES_VERSION
  );
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
  await challengeRepository.setInvite(
    challengeId,
    hashInviteCode(code),
    expiresAt
  );
  return { code, expires_at: expiresAt.toISOString() };
}

export async function revokeInvite(
  userId: string,
  challengeId: string
): Promise<void> {
  await requireHost(userId, challengeId);
  await challengeRepository.clearInvite(challengeId);
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
    case 'already_member':
      return getChallenge(userId, outcome.challenge.id);
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

/** The goal bonus of each week starting in the window, from the latest scored day of that week. */
function goalBonuses(
  rows: readonly ChallengeDailyScoreRow[],
  window: ChallengeWindow,
  upTo: string
): { rawBonus: number }[] {
  const out: { rawBonus: number }[] = [];
  for (const monday of challengeWeeksIn(window.start, window.end, upTo)) {
    const week = rows
      .filter((r) => challengeWeekStart(r.day) === monday && r.day <= upTo)
      .sort((a, b) => b.day.localeCompare(a.day));
    const goal = week[0]?.detail?.goal as { rawBonus?: unknown } | undefined;
    const raw = Number(goal?.rawBonus);
    if (Number.isFinite(raw) && raw > 0) out.push({ rawBonus: raw });
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
      rules.metric === 'points' && rules.points?.goal
        ? goalBonuses(own, window, upTo)
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

  const frozen = await challengeRepository.getResultsForMember(
    userId,
    challengeId,
    window.start
  );
  if (frozen.length) {
    const group = frozen.reduce((s, r) => s + Number(r.total), 0);
    return {
      challenge_id: challengeId,
      period_start: window.start,
      period_end: window.end,
      final: true,
      group_total: Math.round(group * 10) / 10,
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
    final: false,
    group_total: standings.groupTotal,
    group_reached: standings.groupReached,
    rows: standings.rows.map((r) => ({
      user_id: r.userId,
      display_name: r.name,
      rank: r.rank,
      total: r.total,
      minutes: r.minutes,
      winner: r.winner,
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

const isWarmup = (setType: string | null): boolean =>
  !!setType &&
  setType
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .startsWith('warmup');

/** A diary row as the scorer reads it. Distance is stored in km and scored in metres. */
export function toChallengeEntry(row: MemberEntryRow): ChallengeEntry {
  const bestE1rm = Math.max(
    0,
    ...(row.sets ?? [])
      .filter((s) => !isWarmup(s.set_type))
      .map((s) => effortAdjustedOneRepMaxKg(s.weight, s.reps, null))
  );
  const km = n(row.distance);
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
    activeCalories: n(row.active_calories) ?? n(row.calories_burned),
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
    (p.goal?.lookbackWeeks ?? 0) * 7 + 7
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
  await challengeRepository.withScoringLock(challenge.id, member.user_id, () =>
    recomputeMemberLocked(challenge, member, fromDay, toDay)
  );
}

async function recomputeMemberLocked(
  challenge: ChallengeRow,
  member: Pick<ChallengeMemberRow, 'user_id' | 'goal_type'>,
  fromDay: string,
  toDay: string | undefined
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
  for (const w of challengePeriodsUpTo(
    current.period,
    challenge.start_date,
    challenge.end_date,
    to
  )) {
    if (frozen.has(w.start) && w.end >= from) from = addDays(w.end, 1);
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
  const entries = rows.map(toChallengeEntry);
  const data = { entries, steps, zones };

  const scores: DailyScoreInput[] = [];
  const cards: ChallengeActivityCardInput[] = [];
  for (const run of runs) {
    const days = scoreChallengeDays(data, run.from, run.to, run.rules);
    const counted = challengeCountedEntries(entries, run.rules);
    const points = pointsRules(run.rules);
    for (const d of days) {
      // The goal counts the same workouts as the day scores (manual entries
      // ignored, duplicates merged, filters applied).
      const goal = points?.goal
        ? challengeWeekGoal(
            counted,
            member.goal_type,
            challengeWeekStart(d.date),
            d.date,
            points
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
        workouts: d.workouts,
        eligible: d.eligible,
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
        const km = e.distanceM ? e.distanceM / 1000 : 0;
        const measured = challengeMeasuredMinutes(e);
        const row = rows.find((r) => r.id === e.id);
        cards.push({
          exercise_entry_id: e.id,
          day: d.date,
          activity_type: challengeEntryClass(e),
          name: e.name ?? null,
          minutes: e.durationMin,
          distance_meters: e.distanceM ?? null,
          pace_seconds_per_km:
            km > 0 && measured > 0 ? (measured * 60) / km : null,
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
    cards
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
  for (const batch of batches) {
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

/** Nightly catch-up: re-scores the last few days (steps sync without a trigger) and re-hosts orphaned challenges. */
export async function nightlyCatchUp(): Promise<void> {
  if (!(await challengesEnabled())) return;
  const rehosted = await challengeRepository.rehostOrphans();
  if (rehosted > 0)
    log('info', `[CHALLENGES] Passed hosting on for ${rehosted} challenge(s).`);
  await challengeRepository.enqueueRecentDaysForRunningChallenges(
    LATE_SYNC_DAYS + 1
  );
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
    if (frozen.has(window.start)) continue;
    if (addDays(window.end, LATE_SYNC_DAYS + 1) > today) break;
    const members = await challengeRepository.getMembers(challenge.id);
    // Only this period: later days are scored by the queue and by their own
    // period's finalising, so overdue periods do not rescore the same days.
    for (const member of members) {
      await recomputeMember(challenge, member, window.start, window.end);
    }
    const rules = rulesForDay(changes, window.start);
    const scores = await challengeRepository.getDailyScores(
      challenge.id,
      window.start,
      window.end
    );
    const standings = standingsFromScores(
      members,
      scores,
      rules,
      window,
      window.end
    );
    const stored = await challengeRepository.insertResults(
      challenge.id,
      window.start,
      window.end,
      standings.rows.map((r) => ({
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
    if (stored) {
      count += 1;
      frozen.add(window.start);
    }
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
