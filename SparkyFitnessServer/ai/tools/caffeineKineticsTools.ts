import { tool } from 'ai';
import { todayInZone, type CaffeineActiveResponse } from '@workspace/shared';
import { log } from '../../config/logging.js';
import { getActiveCaffeineKinetics } from '../../services/caffeineKineticsService.js';
import goalService from '../../services/goalService.js';
import { ERRORS, formatZodError } from './errors.js';
import { formatJsonResult } from './formatting.js';
import { normalizeActionArgs, withLocalDateTime } from './dates.js';
import {
  CAFFEINE_KINETICS_ACTIONS,
  caffeineKineticsSchema,
  caffeineKineticsInput,
  type CaffeineKineticsInput,
} from './schemas/caffeineKinetics.js';

const VALID_ACTIONS = [...CAFFEINE_KINETICS_ACTIONS];

// The service computes on UTC instants (doses[].at, bedtime_at) so its own
// math stays timezone-agnostic — but hands a model a bare UTC instant, and
// it has no reliable way to convert that to the user's local time itself
// (it isn't told the offset, and doing UTC arithmetic in prose is exactly
// the kind of thing models get wrong, which is what produced the wrong
// times reported back to the user). Replace every instant with the same
// local date/time the web UI already renders via toLocaleTimeString().
//
// The lookback window is 48h (up to 2 calendar days before the requested
// date — see getActiveCaffeineKinetics), specifically so a dose from late
// yesterday that is still circulating counts toward "active now". A time
// alone reads as "today" by default, so a dose from yesterday evening
// looked like it was logged this morning; each dose carries its own local
// `date` precisely so a multi-day list can be read unambiguously.
interface CaffeineKineticsForChat extends Omit<
  CaffeineActiveResponse,
  'doses' | 'bedtime_at'
> {
  doses: Array<{
    date: string;
    time: string;
    mg: number;
    name?: string;
    is_estimated?: boolean;
  }>;
  // The service only ever answers "would a dose clear by bedtime" -- a sleep
  // question, orthogonal to the user's daily caffeine ceiling. Without these
  // two, the model reported a "safe to take more" cutoff time even once the
  // user was already over their own goal for the day, which read as
  // nonsensical: a dose can clear by bedtime and still not belong in the
  // day's budget. Null only if the goal fetch failed; a missing goals row
  // is 400 (DEFAULT_GOALS.caffeine_mg), not null.
  total_mg_for_date: number;
  daily_goal_mg: number | null;
}

function toLocalDisplayTimes(
  data: CaffeineActiveResponse,
  tz: string,
  date: string,
  dailyGoalMg: number | null
): CaffeineKineticsForChat {
  const { doses, bedtime_at: _bedtimeAt, ...rest } = data;
  const localDoses = doses.map((dose) => withLocalDateTime(dose, tz));
  const totalMgForDate = localDoses
    .filter((dose) => dose.date === date)
    .reduce((sum, dose) => sum + dose.mg, 0);
  return {
    ...rest,
    doses: localDoses,
    total_mg_for_date: totalMgForDate,
    daily_goal_mg: dailyGoalMg,
  };
}

export function buildCaffeineKineticsTools(userId: string, tz: string) {
  return {
    sparky_get_caffeine_kinetics: tool({
      description:
        "Estimates the user's active caffeine right now and at their target bedtime, from their logged caffeine intake plus their personal half-life and target-bedtime preferences (caffeine_half_life_hours, target_bedtime). Also reports the latest time a dose of a given size could still be taken and clear by bedtime. Defaults to today. Read-only. Every date/time in the result (doses[].date/time, latest_safe_dose_time, target_bedtime) is already in the user's local timezone — use them exactly as given, do not attempt to convert or recompute one yourself. doses can include entries from up to 2 days before the requested date (still-active caffeine from earlier carries into the estimate) — always state each dose's date (or 'yesterday'/'today' relative to the requested date) when listing them, never assume every dose happened today. latest_safe_dose_time/cutoff_state answer ONLY whether a dose would clear circulation by bedtime — a completely separate question from the daily caffeine goal. Compare total_mg_for_date against daily_goal_mg before suggesting the user could take more today: if total_mg_for_date already meets or exceeds daily_goal_mg, say so and do not frame the cutoff time as an invitation for another dose that day, even though it would still clear by bedtime. daily_goal_mg is the user's caffeine goal for the date (the same value sparky_manage_goals returns). A user with no personal goals row still receives 400 — the default FDA daily ceiling — so treat 400 as a real ceiling, not as 'no goal'. daily_goal_mg is null only if the goal could not be loaded; then skip the budget comparison and still answer the bedtime question.",
      inputSchema: caffeineKineticsInput,
      execute: async (rawArgs) => {
        const normalized = normalizeActionArgs(
          rawArgs as Record<string, unknown>,
          tz,
          VALID_ACTIONS,
          () => 'active_caffeine'
        );
        const parsed = caffeineKineticsSchema.safeParse(normalized);
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        const args: CaffeineKineticsInput = parsed.data;
        try {
          switch (args.action) {
            case 'active_caffeine': {
              const date = args.date ?? todayInZone(tz);
              // Goals are advisory for the model, not required for the
              // bedtime estimate. Keep them off the kinetics failure path
              // so a goals outage still returns active_mg / cutoff_state
              // with daily_goal_mg: null.
              const [data, goals] = await Promise.all([
                getActiveCaffeineKinetics(userId, {
                  date,
                  doseMg: args.dose_mg,
                }),
                goalService
                  .getUserGoals(userId, date, undefined, true)
                  .catch((error) => {
                    log(
                      'warn',
                      '[Caffeine Kinetics Tool] Failed to load daily caffeine goal:',
                      error
                    );
                    return null;
                  }) as Promise<Record<string, unknown> | null>,
              ]);
              const rawGoal = goals?.caffeine_mg;
              const dailyGoalMg =
                rawGoal !== null &&
                rawGoal !== undefined &&
                Number.isFinite(Number(rawGoal))
                  ? Number(rawGoal)
                  : null;
              return formatJsonResult(
                toLocalDisplayTimes(data, tz, date, dailyGoalMg)
              );
            }
            default:
              return ERRORS.INVALID_ACTION(
                String((args as CaffeineKineticsInput).action),
                VALID_ACTIONS
              );
          }
        } catch (error) {
          log('error', '[Caffeine Kinetics Tool] Error:', error);
          return ERRORS.DB_ERROR(error);
        }
      },
    }),
  };
}
