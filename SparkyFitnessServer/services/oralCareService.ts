import {
  addDays,
  computeOralCareStreak,
  oralCareSessionsCoveredBySync,
  summarizeOralCareDay,
  todayInZone,
  type CreateOralCareSessionBody,
  type OralCareDaySummaryResponse,
  type OralCareHistoryDay,
  type OralCareHistoryResponse,
  type OralCareSessionResponse,
  type OralCareSettings,
  type UpdateOralCareSessionBody,
} from '@workspace/shared';
import * as oralCareRepository from '../models/oralCareRepository.js';
import type { OralCareSessionRow } from '../models/oralCareRepository.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';

/** How far back the current streak is looked for. */
const STREAK_LOOKBACK_DAYS = 365;
/** Longest history range one request may ask for. */
export const MAX_HISTORY_DAYS = 366;

function withCoverage(rows: OralCareSessionRow[]): OralCareSessionResponse[] {
  const covered = oralCareSessionsCoveredBySync(rows);
  return rows.map((row) => ({ ...row, covered_by_sync: covered.has(row.id) }));
}

function groupByDay(
  rows: readonly OralCareSessionRow[]
): Map<string, OralCareSessionRow[]> {
  const byDay = new Map<string, OralCareSessionRow[]>();
  for (const row of rows) {
    const list = byDay.get(row.entry_date);
    if (list) list.push(row);
    else byDay.set(row.entry_date, [row]);
  }
  return byDay;
}

function brushingByDay(
  rows: readonly OralCareSessionRow[],
  settings: OralCareSettings
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const [day, sessions] of groupByDay(rows)) {
    counts.set(day, summarizeOralCareDay(sessions, settings).brushing_count);
  }
  return counts;
}

async function loadStreak(
  userId: string,
  actingUserId: string,
  settings: OralCareSettings
): Promise<{ current: number; best: number; today: string }> {
  const today = todayInZone(await loadUserTimezone(userId));
  const rows = await oralCareRepository.getOralCareSessionsRange(
    userId,
    addDays(today, -STREAK_LOOKBACK_DAYS),
    today,
    actingUserId
  );
  return {
    ...computeOralCareStreak(
      brushingByDay(rows, settings),
      settings.daily_target,
      today
    ),
    today,
  };
}

export async function getDaySummary(
  userId: string,
  actingUserId: string,
  date: string
): Promise<OralCareDaySummaryResponse> {
  const settings = await oralCareRepository.getOralCareSettings(
    userId,
    actingUserId
  );
  const [rows, streak] = await Promise.all([
    oralCareRepository.getOralCareSessionsRange(
      userId,
      date,
      date,
      actingUserId
    ),
    loadStreak(userId, actingUserId, settings),
  ]);
  return {
    entry_date: date,
    settings,
    ...summarizeOralCareDay(rows, settings),
    streak: streak.current,
    sessions: withCoverage(rows),
  };
}

export async function getHistory(
  userId: string,
  actingUserId: string,
  startDate: string,
  endDate: string
): Promise<OralCareHistoryResponse> {
  const settings = await oralCareRepository.getOralCareSettings(
    userId,
    actingUserId
  );
  const [rows, streak, recentLabels] = await Promise.all([
    oralCareRepository.getOralCareSessionsRange(
      userId,
      startDate,
      endDate,
      actingUserId
    ),
    loadStreak(userId, actingUserId, settings),
    oralCareRepository.getRecentOralCareLabels(userId, actingUserId),
  ]);
  const byDay = groupByDay(rows);
  const days: OralCareHistoryDay[] = [];
  for (let day = startDate; day <= endDate; day = addDays(day, 1)) {
    const totals = summarizeOralCareDay(byDay.get(day) ?? [], settings);
    days.push({
      date: day,
      brushing_count: totals.brushing_count,
      brushing_seconds: totals.brushing_seconds,
      goal_met: totals.goal_met,
      other_count:
        totals.counts_by_type.flossing +
        totals.counts_by_type.mouthwash +
        totals.counts_by_type.tongue_cleaning +
        totals.counts_by_type.other,
    });
  }
  return {
    settings,
    days,
    streak: streak.current,
    best_streak: streak.best,
    recent_custom_labels: recentLabels,
  };
}

/** Sessions of a range, each flagged when a synced brush already records it. */
export async function getSessions(
  userId: string,
  actingUserId: string,
  startDate: string,
  endDate: string
): Promise<OralCareSessionResponse[]> {
  const rows = await oralCareRepository.getOralCareSessionsRange(
    userId,
    startDate,
    endDate,
    actingUserId
  );
  // Coverage is decided within a day, as the day summary does.
  const flagged = new Map<string, OralCareSessionResponse>();
  for (const sessions of groupByDay(rows).values()) {
    for (const session of withCoverage(sessions)) {
      flagged.set(session.id, session);
    }
  }
  return rows.map((row) => flagged.get(row.id)!);
}

async function respondWithDayCoverage(
  userId: string,
  actingUserId: string,
  row: OralCareSessionRow
): Promise<OralCareSessionResponse> {
  const sameDay = await oralCareRepository.getOralCareSessionsRange(
    userId,
    row.entry_date,
    row.entry_date,
    actingUserId
  );
  const covered = oralCareSessionsCoveredBySync(sameDay);
  return { ...row, covered_by_sync: covered.has(row.id) };
}

export async function createSession(
  userId: string,
  actingUserId: string,
  body: CreateOralCareSessionBody
): Promise<OralCareSessionResponse> {
  const row = await oralCareRepository.upsertOralCareSession(
    userId,
    {
      entry_date: body.entry_date,
      start_time: body.start_time ?? null,
      end_time: body.end_time ?? null,
      duration_seconds: body.duration_seconds ?? null,
      care_type: body.care_type,
      custom_label:
        body.care_type === 'other' ? (body.custom_label ?? null) : null,
      provider: body.provider,
      external_id: null,
      notes: body.notes ?? null,
    },
    actingUserId
  );
  return respondWithDayCoverage(userId, actingUserId, row);
}

export async function updateSession(
  userId: string,
  actingUserId: string,
  sessionId: string,
  body: UpdateOralCareSessionBody
): Promise<OralCareSessionResponse | null> {
  const row = await oralCareRepository.updateOralCareSession(
    userId,
    sessionId,
    body,
    actingUserId
  );
  return row ? respondWithDayCoverage(userId, actingUserId, row) : null;
}

export async function deleteSession(
  userId: string,
  actingUserId: string,
  sessionId: string
): Promise<boolean> {
  return oralCareRepository.deleteOralCareSession(
    userId,
    sessionId,
    actingUserId
  );
}

export async function getSettings(
  userId: string,
  actingUserId: string
): Promise<OralCareSettings> {
  return oralCareRepository.getOralCareSettings(userId, actingUserId);
}

export async function saveSettings(
  userId: string,
  settings: OralCareSettings
): Promise<OralCareSettings> {
  return oralCareRepository.saveOralCareSettings(userId, settings);
}
