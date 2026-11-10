/**
 * Pushes daily nutrition totals to Intervals.icu wellness (kcalConsumed,
 * protein, carbohydrates, fatTotal) and removes them again on request.
 *
 * intervals_nutrition_pushes records what Intervals accepted for each day, so
 * clearing only touches a field that still holds what SparkyFitness wrote;
 * anything another app wrote since is left alone.
 *
 * Clearing writes -1. That is undocumented Intervals behaviour (null and blank
 * values are ignored, 0 is stored as a real zero, and there is no DELETE for
 * wellness), confirmed live on PUT /wellness-bulk.
 */
import { addDays, todayInZone } from '@workspace/shared';
import { getDailyNutritionTotalsRange } from '../../models/reportRepository.js';
import * as pushRepo from '../../models/intervalsNutritionPushRepository.js';
import type { PushRow } from '../../models/intervalsNutritionPushRepository.js';
import { loadUserTimezone } from '../../utils/timezoneLoader.js';
import { log } from '../../config/logging.js';
import {
  getIntervalsCredentials,
  intervalsGet,
  intervalsPut,
} from './intervalsService.js';
import type { IntervalsCredentials } from './intervalsService.js';
import { startProviderSync } from '../../services/providerSyncClaim.js';

const FIELDS = [
  'kcalConsumed',
  'protein',
  'carbohydrates',
  'fatTotal',
] as const;
type Field = (typeof FIELDS)[number];
type DayValues = Record<Field, number>;
type WellnessDay = { id: string } & Partial<Record<Field, number | null>>;

const COLUMN: Record<Field, keyof Omit<PushRow, 'entry_date'>> = {
  kcalConsumed: 'kcal_consumed',
  protein: 'protein',
  carbohydrates: 'carbohydrates',
  fatTotal: 'fat_total',
};
const CLEAR = -1;
const PUSH_DAYS = 3;

export interface RemoveResult {
  cleared: number;
  kept: number;
  failed: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function sameValue(a: number | null | undefined, b: number | null | undefined) {
  return (
    typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 0.05
  );
}

/** Fields Intervals still holds exactly as SparkyFitness last wrote them. */
function fieldsStillOurs(logged: PushRow, current?: WellnessDay): Field[] {
  return FIELDS.filter((f) => sameValue(logged[COLUMN[f]], current?.[f]));
}

function toRow(day: string, v: DayValues) {
  return {
    entry_date: day,
    kcal_consumed: v.kcalConsumed,
    protein: v.protein,
    carbohydrates: v.carbohydrates,
    fat_total: v.fatTotal,
  };
}

async function readWellness(
  creds: IntervalsCredentials,
  oldest: string,
  newest: string
): Promise<Map<string, WellnessDay>> {
  const days = await intervalsGet<WellnessDay[]>(creds, '/wellness', {
    oldest,
    newest,
    fields: `id,${FIELDS.join(',')}`,
  });
  return new Map((days ?? []).map((d) => [d.id, d]));
}

/**
 * Pushes the totals for the three days ending on `endDate` (default today in
 * the user's timezone) in one bulk PUT, and only when something changed. A day
 * with nothing logged clears the fields that still hold our last push.
 */
export async function pushNutrition(
  userId: string,
  providerId?: string,
  endDate?: string
): Promise<{ daysPushed: number }> {
  const creds = await getIntervalsCredentials(userId, providerId);
  const end = endDate ?? todayInZone(await loadUserTimezone(userId));
  const start = addDays(end, -(PUSH_DAYS - 1));

  const totals = new Map<string, DayValues>(
    (
      (await getDailyNutritionTotalsRange(userId, start, end)) as {
        entry_date: string;
        calories: number;
        protein: number;
        carbs: number;
        fat: number;
      }[]
    ).map((r) => [
      r.entry_date,
      {
        // kcalConsumed is an integer in Intervals; macros are grams.
        kcalConsumed: Math.round(r.calories),
        protein: round1(r.protein),
        carbohydrates: round1(r.carbs),
        fatTotal: round1(r.fat),
      },
    ])
  );
  const logged = new Map(
    (await pushRepo.getPushes(userId, { start, end })).map((r) => [
      r.entry_date,
      r,
    ])
  );
  const current = await readWellness(creds, start, end);

  const records: WellnessDay[] = [];
  const cleared: string[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) {
    const want = totals.get(day);
    if (want) {
      const changed = FIELDS.filter(
        (f) => !sameValue(want[f], current.get(day)?.[f])
      );
      if (changed.length > 0) {
        records.push({
          id: day,
          ...Object.fromEntries(changed.map((f) => [f, want[f]])),
        });
      }
    } else if (logged.has(day)) {
      const ours = fieldsStillOurs(logged.get(day)!, current.get(day));
      if (ours.length > 0) {
        records.push({
          id: day,
          ...Object.fromEntries(ours.map((f) => [f, CLEAR])),
        });
      }
      cleared.push(day);
    }
  }

  if (records.length > 0) {
    await intervalsPut(creds, '/wellness-bulk', records);
  }
  // Logged only after Intervals accepted the push.
  await pushRepo.upsertPushes(
    userId,
    [...totals].map(([day, v]) => toRow(day, v))
  );
  await pushRepo.deletePushes(userId, cleared);
  log(
    'info',
    `[intervalsNutritionPush] User ${userId}: ${records.length} day(s) written to Intervals.icu for ${start} to ${end}.`
  );
  return { daysPushed: records.length };
}

/**
 * Clears every pushed field that still holds what SparkyFitness wrote, in one
 * bulk PUT, then re-reads to see what actually cleared. Rows that failed stay
 * logged so the user can retry; days another app has since rewritten are
 * left alone and forgotten.
 */
export async function removePushedData(
  userId: string,
  providerId?: string
): Promise<RemoveResult> {
  const rows = await pushRepo.getPushes(userId);
  if (rows.length === 0) return { cleared: 0, kept: 0, failed: 0 };
  const creds = await getIntervalsCredentials(userId, providerId);
  const oldest = rows[0]!.entry_date;
  const newest = rows[rows.length - 1]!.entry_date;
  const before = await readWellness(creds, oldest, newest);

  const attempts = rows
    .map((row) => ({
      row,
      ours: fieldsStillOurs(row, before.get(row.entry_date)),
    }))
    .filter((a) => a.ours.length > 0);
  const keptDays = rows
    .filter((r) => !attempts.some((a) => a.row === r))
    .map((r) => r.entry_date);

  let clearedDays: string[] = [];
  if (attempts.length > 0) {
    try {
      await intervalsPut(
        creds,
        '/wellness-bulk',
        attempts.map((a) => ({
          id: a.row.entry_date,
          ...Object.fromEntries(a.ours.map((f) => [f, CLEAR])),
        }))
      );
      const after = await readWellness(creds, oldest, newest);
      clearedDays = attempts
        .filter((a) =>
          a.ours.every(
            (f) => typeof after.get(a.row.entry_date)?.[f] !== 'number'
          )
        )
        .map((a) => a.row.entry_date);
    } catch (error) {
      log(
        'warn',
        `[intervalsNutritionPush] Removing pushed data failed for user ${userId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  await pushRepo.deletePushes(userId, [...clearedDays, ...keptDays]);
  return {
    cleared: clearedDays.length,
    kept: keptDays.length,
    failed: attempts.length - clearedDays.length,
  };
}

export function setPushEnabled(
  userId: string,
  enabled: boolean
): Promise<boolean> {
  return pushRepo.setPushSetting(userId, enabled);
}

export async function getPushStatus(userId: string): Promise<{
  pushNutrition: boolean;
  pushedDays: number;
  pushedSince: string | null;
}> {
  const [pushNutrition, summary] = await Promise.all([
    pushRepo.getPushSetting(userId),
    pushRepo.getPushSummary(userId),
  ]);
  return {
    pushNutrition,
    pushedDays: summary.days,
    pushedSince: summary.since,
  };
}

/** Nightly job: push every opted-in user's last three days. Never throws. */
export async function runNightlyNutritionPush(): Promise<void> {
  let users: { user_id: string; provider_id: string }[];
  try {
    users = await pushRepo.getUsersWithPushEnabled();
  } catch (error) {
    log('error', '[CRON] Intervals.icu nutrition push failed to start:', error);
    return;
  }
  for (const { user_id, provider_id } of users) {
    try {
      const started = await startProviderSync(
        { userId: user_id, providerId: provider_id },
        () => pushNutrition(user_id, provider_id)
      );
      if (started) await started.running;
    } catch (error) {
      log(
        'error',
        `[CRON] Intervals.icu nutrition push failed for user ${user_id}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

export default {
  pushNutrition,
  removePushedData,
  runNightlyNutritionPush,
  getPushStatus,
  setPushEnabled,
};
