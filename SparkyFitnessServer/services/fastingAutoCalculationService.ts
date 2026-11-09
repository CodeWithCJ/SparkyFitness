import { getClient } from '../db/poolManager.js';
import fastingRepository from '../models/fastingRepository.js';
import fastingPreferencesRepository, {
  type FastingPreferencesRecord,
} from '../models/fastingPreferencesRepository.js';
import { todayInZone, addDays, instantToDay } from '@workspace/shared';

export interface CalculatedFast {
  id: string;
  user_id: string;
  start_time: string; // ISO 8601
  end_time: string | null; // ISO 8601 or null if currently active
  target_end_time: string;
  duration_minutes: number;
  fasting_type: string;
  status: 'ACTIVE' | 'COMPLETED';
  is_auto_calculated: true;
  start_meal_name?: string;
  end_meal_name?: string;
  is_eating_window?: boolean;
  eating_window_remaining_minutes?: number;
}

export interface RawFoodMealPoint {
  id: string;
  entry_date: string;
  entry_time: string | null;
  meal_default_time: string | null;
  meal_timestamp: Date;
  calories: number;
  food_name: string;
  meal_type_name: string;
}

interface EatingEvent {
  start: Date;
  end: Date;
  calories: number;
  description: string;
}

const MIN_FAST_DURATION_MINUTES = 600; // 10 hours minimum to classify as an intermittent fast
const CLOCK_SKEW_TOLERANCE_MS = 15 * 60 * 1000; // 15-minute tolerance for client-server clock drift and minute rounding

export function classifyProtocol(durationMinutes: number): string {
  const hours = durationMinutes / 60;
  if (hours >= 23) return '23:1 OMAD';
  if (hours >= 20) return '20:4 Warrior';
  if (hours >= 18) return '18:6 Warrior';
  if (hours >= 16) return '16:8 Leangains';
  if (hours >= 14) return '14:10 Fast';
  if (hours >= 12) return '12:12 Circadian';
  return 'Custom Fast';
}

/**
 * Cluster contiguous food entries within 45 minutes of each other into discrete eating sessions.
 */
export function clusterEatingEvents(points: RawFoodMealPoint[]): EatingEvent[] {
  if (points.length === 0) return [];

  const sorted = [...points].sort(
    (a, b) => a.meal_timestamp.getTime() - b.meal_timestamp.getTime()
  );

  const events: EatingEvent[] = [];
  let currentCluster: RawFoodMealPoint[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const diffMs =
      curr.meal_timestamp.getTime() - prev.meal_timestamp.getTime();

    // Within 45 minutes -> same eating session
    if (diffMs <= 45 * 60 * 1000) {
      currentCluster.push(curr);
    } else {
      events.push(summarizeCluster(currentCluster));
      currentCluster = [curr];
    }
  }

  if (currentCluster.length > 0) {
    events.push(summarizeCluster(currentCluster));
  }

  return events;
}

function summarizeCluster(items: RawFoodMealPoint[]): EatingEvent {
  const start = items[0].meal_timestamp;
  const end = items[items.length - 1].meal_timestamp;
  const totalCalories = items.reduce(
    (sum, item) => sum + Number(item.calories || 0),
    0
  );
  const primaryName = items[0].meal_type_name || items[0].food_name || 'Meal';

  return {
    start,
    end,
    calories: totalCalories,
    description: primaryName,
  };
}

/**
 * Fetch raw caloric food entries within date range.
 */
async function fetchFoodPoints(
  userId: string,
  startDate: string,
  endDate: string,
  timezone: string,
  calorieThreshold: number
): Promise<RawFoodMealPoint[]> {
  const client = await getClient(userId);
  try {
    const query = `
      SELECT 
        fe.id,
        fe.entry_date::text AS entry_date,
        fe.entry_time::text AS entry_time,
        COALESCE(umv.default_time, mt.default_time)::text AS meal_default_time,
        ((fe.entry_date + CASE 
          WHEN fe.entry_time IS NOT NULL THEN fe.entry_time 
          WHEN fe.created_at IS NOT NULL AND fe.entry_date = (fe.created_at AT TIME ZONE $2)::date THEN (fe.created_at AT TIME ZONE $2)::time 
          ELSE COALESCE(umv.default_time, mt.default_time, '12:00'::time) 
        END) AT TIME ZONE $2) AS meal_timestamp,
        fe.calories,
        fe.food_name,
        COALESCE(mt.name, 'Meal') AS meal_type_name
      FROM food_entries fe
      LEFT JOIN meal_types mt ON mt.id = fe.meal_type_id
      LEFT JOIN user_meal_visibilities umv
        ON umv.meal_type_id = fe.meal_type_id AND umv.user_id = $1
      WHERE fe.user_id = $1
        AND fe.entry_date >= $3
        AND fe.entry_date <= $4
        AND fe.calories IS NOT NULL
        AND fe.calories >= $5
      ORDER BY meal_timestamp ASC;
    `;

    const result = await client.query(query, [
      userId,
      timezone,
      startDate,
      endDate,
      calorieThreshold,
    ]);

    return result.rows.map((row: Record<string, unknown>) => ({
      id: String(row.id),
      entry_date: String(row.entry_date),
      entry_time: row.entry_time ? String(row.entry_time) : null,
      meal_default_time: row.meal_default_time
        ? String(row.meal_default_time)
        : null,
      meal_timestamp: new Date(row.meal_timestamp as string | Date),
      calories: Number(row.calories),
      food_name: String(row.food_name || 'Food'),
      meal_type_name: String(row.meal_type_name || 'Meal'),
    }));
  } finally {
    client.release();
  }
}

/**
 * Returns the currently active auto-calculated fast (if any).
 */
export async function getCurrentAutoFast(
  userId: string,
  timezone: string,
  prefsOverride?: FastingPreferencesRecord
): Promise<CalculatedFast | null> {
  const prefs =
    prefsOverride ||
    (await fastingPreferencesRepository.getFastingPreferences(userId));
  if (!prefs.auto_calculate) {
    return null;
  }

  const today = todayInZone(timezone);
  const lookbackStart = addDays(today, -7); // look back up to 7 days for the most recent meal

  const points = await fetchFoodPoints(
    userId,
    lookbackStart,
    today,
    timezone,
    prefs.calorie_threshold
  );

  if (points.length === 0) {
    return null;
  }

  const now = new Date();
  const nowMs = now.getTime();
  const eatingEvents = clusterEatingEvents(points)
    .filter((e) => e.start.getTime() <= nowMs + CLOCK_SKEW_TOLERANCE_MS)
    .map((e) => {
      if (e.start.getTime() > nowMs) {
        return {
          ...e,
          start: new Date(nowMs),
          end: e.end.getTime() > nowMs ? new Date(nowMs) : e.end,
        };
      }
      return e;
    });
  if (eatingEvents.length === 0) {
    return null;
  }

  const targetFastHours = prefs.target_fasting_hours || 16.0;
  const targetEatingHours = prefs.target_eating_hours || 8.0;

  // Filter eating events that occurred on today's calendar date in user's timezone
  const todayEvents = eatingEvents.filter(
    (e) => instantToDay(e.start, timezone) === today
  );

  // If the user has logged meals today, check if they are in their eating window
  if (todayEvents.length > 0) {
    const firstMealToday = todayEvents[0];
    const lastMealToday = todayEvents[todayEvents.length - 1];

    // The eating window opened at the start of today's first meal and closes after targetEatingHours
    const eatingWindowEnd = new Date(
      firstMealToday.start.getTime() + targetEatingHours * 60 * 60 * 1000
    );

    // If current time is inside the eating window, user is NOT fasting yet — eating window is active
    if (now.getTime() < eatingWindowEnd.getTime()) {
      const remainingMinutes = Math.max(
        0,
        Math.floor((eatingWindowEnd.getTime() - now.getTime()) / 60000)
      );
      const elapsedMinutes = Math.floor(
        (now.getTime() - firstMealToday.start.getTime()) / 60000
      );

      return {
        id: `auto-eating-window-${firstMealToday.start.toISOString()}`,
        user_id: userId,
        start_time: firstMealToday.start.toISOString(),
        end_time: null,
        target_end_time: eatingWindowEnd.toISOString(),
        duration_minutes: elapsedMinutes,
        fasting_type: `${prefs.target_fasting_hours || 16}:${prefs.target_eating_hours || 8}`,
        status: 'ACTIVE',
        is_auto_calculated: true,
        is_eating_window: true,
        start_meal_name: lastMealToday.description,
        eating_window_remaining_minutes: remainingMinutes,
      };
    }

    // Once the eating window has closed, fasting begins from the end of today's last meal
    const fastStartTime = lastMealToday.end;
    if (now.getTime() <= fastStartTime.getTime()) {
      return null;
    }

    const existingFast = await fastingRepository.findFastNearStartTime(
      userId,
      fastStartTime,
      60
    );
    if (
      existingFast &&
      existingFast.status === 'COMPLETED' &&
      existingFast.end_time
    ) {
      const fastEndTime = new Date(existingFast.end_time);
      const eatingWindowEnd = new Date(
        fastEndTime.getTime() + targetEatingHours * 60 * 60 * 1000
      );
      if (
        now.getTime() >= fastEndTime.getTime() - CLOCK_SKEW_TOLERANCE_MS &&
        now.getTime() < eatingWindowEnd.getTime()
      ) {
        const remainingMinutes = Math.max(
          0,
          Math.floor((eatingWindowEnd.getTime() - now.getTime()) / 60000)
        );
        const elapsedMinutes = Math.max(
          0,
          Math.floor((now.getTime() - fastEndTime.getTime()) / 60000)
        );

        return {
          id: `auto-eating-window-${fastEndTime.toISOString()}`,
          user_id: userId,
          start_time: fastEndTime.toISOString(),
          end_time: null,
          target_end_time: eatingWindowEnd.toISOString(),
          duration_minutes: elapsedMinutes,
          fasting_type: `${prefs.target_fasting_hours || 16}:${prefs.target_eating_hours || 8}`,
          status: 'ACTIVE',
          is_auto_calculated: true,
          is_eating_window: true,
          start_meal_name: lastMealToday.description,
          eating_window_remaining_minutes: remainingMinutes,
        };
      }
      // The fast from fastStartTime was already completed; do not resurrect it as active.
      return null;
    }

    const elapsedMinutes = Math.floor(
      (now.getTime() - fastStartTime.getTime()) / (60 * 1000)
    );
    const targetEndTime = new Date(
      fastStartTime.getTime() + targetFastHours * 60 * 60 * 1000
    );

    return {
      id: `auto-${fastStartTime.toISOString()}`,
      user_id: userId,
      start_time: fastStartTime.toISOString(),
      end_time: null,
      target_end_time: targetEndTime.toISOString(),
      duration_minutes: elapsedMinutes,
      fasting_type: prefs.default_protocol || '16-8',
      status: 'ACTIVE',
      is_auto_calculated: true,
      start_meal_name: lastMealToday.description,
    };
  }

  // If no meals logged today yet, evaluate the fast ongoing since yesterday's last meal
  const lastEvent = eatingEvents[eatingEvents.length - 1];
  const fastStartTime = lastEvent.end;

  // If the last meal was logged in the future (or clock skew), no active fast yet
  if (now.getTime() <= fastStartTime.getTime()) {
    return null;
  }

  const existingFast = await fastingRepository.findFastNearStartTime(
    userId,
    fastStartTime,
    60
  );
  if (
    existingFast &&
    existingFast.status === 'COMPLETED' &&
    existingFast.end_time
  ) {
    const fastEndTime = new Date(existingFast.end_time);
    const eatingWindowEnd = new Date(
      fastEndTime.getTime() + targetEatingHours * 60 * 60 * 1000
    );

    if (
      now.getTime() >= fastEndTime.getTime() - CLOCK_SKEW_TOLERANCE_MS &&
      now.getTime() < eatingWindowEnd.getTime()
    ) {
      const remainingMinutes = Math.max(
        0,
        Math.floor((eatingWindowEnd.getTime() - now.getTime()) / 60000)
      );
      const elapsedMinutes = Math.max(
        0,
        Math.floor((now.getTime() - fastEndTime.getTime()) / 60000)
      );

      return {
        id: `auto-eating-window-${fastEndTime.toISOString()}`,
        user_id: userId,
        start_time: fastEndTime.toISOString(),
        end_time: null,
        target_end_time: eatingWindowEnd.toISOString(),
        duration_minutes: elapsedMinutes,
        fasting_type: `${prefs.target_fasting_hours || 16}:${prefs.target_eating_hours || 8}`,
        status: 'ACTIVE',
        is_auto_calculated: true,
        is_eating_window: true,
        start_meal_name: lastEvent.description,
        eating_window_remaining_minutes: remainingMinutes,
      };
    }
    // The fast from fastStartTime was already completed; do not resurrect it as active.
    return null;
  }

  const elapsedMinutes = Math.floor(
    (now.getTime() - fastStartTime.getTime()) / (60 * 1000)
  );
  const targetEndTime = new Date(
    fastStartTime.getTime() + targetFastHours * 60 * 60 * 1000
  );

  return {
    id: `auto-${fastStartTime.toISOString()}`,
    user_id: userId,
    start_time: fastStartTime.toISOString(),
    end_time: null,
    target_end_time: targetEndTime.toISOString(),
    duration_minutes: elapsedMinutes,
    fasting_type: prefs.default_protocol || '16-8',
    status: 'ACTIVE',
    is_auto_calculated: true,
    start_meal_name: lastEvent.description,
  };
}

/**
 * Computes historical completed and ongoing fasting intervals between two calendar days.
 */
async function getCalculatedFastingHistory(
  userId: string,
  startDate: string,
  endDate: string,
  timezone: string,
  prefsOverride?: FastingPreferencesRecord
): Promise<CalculatedFast[]> {
  const prefs =
    prefsOverride ||
    (await fastingPreferencesRepository.getFastingPreferences(userId));

  // Extend start date by 2 days prior to capture the fast that started the evening before startDate
  const extendedStart = addDays(startDate, -2);
  const points = await fetchFoodPoints(
    userId,
    extendedStart,
    endDate,
    timezone,
    prefs.calorie_threshold
  );

  const nowMs = Date.now();
  const eatingEvents = clusterEatingEvents(points)
    .filter((e) => e.start.getTime() <= nowMs + CLOCK_SKEW_TOLERANCE_MS)
    .map((e) => {
      if (e.start.getTime() > nowMs) {
        return {
          ...e,
          start: new Date(nowMs),
          end: e.end.getTime() > nowMs ? new Date(nowMs) : e.end,
        };
      }
      return e;
    });
  const results: CalculatedFast[] = [];
  const targetHours = prefs.target_fasting_hours || 16.0;

  for (let i = 0; i < eatingEvents.length - 1; i++) {
    const prev = eatingEvents[i];
    const next = eatingEvents[i + 1];

    const fastStart = prev.end;
    const fastEnd = next.start;
    const durationMinutes = Math.floor(
      (fastEnd.getTime() - fastStart.getTime()) / (60 * 1000)
    );

    // Only count intervals >= MIN_FAST_DURATION_MINUTES (10h)
    if (durationMinutes >= MIN_FAST_DURATION_MINUTES) {
      const targetEndTime = new Date(
        fastStart.getTime() + targetHours * 60 * 60 * 1000
      );
      results.push({
        id: `auto-${fastStart.toISOString()}-${fastEnd.toISOString()}`,
        user_id: userId,
        start_time: fastStart.toISOString(),
        end_time: fastEnd.toISOString(),
        target_end_time: targetEndTime.toISOString(),
        duration_minutes: durationMinutes,
        fasting_type: classifyProtocol(durationMinutes),
        status: 'COMPLETED',
        is_auto_calculated: true,
        start_meal_name: prev.description,
        end_meal_name: next.description,
      });
    }
  }

  // Check if there is an ongoing fast after the final eating event
  if (eatingEvents.length > 0) {
    const lastEvent = eatingEvents[eatingEvents.length - 1];
    const now = new Date();
    if (now.getTime() > lastEvent.end.getTime()) {
      const elapsedMinutes = Math.floor(
        (now.getTime() - lastEvent.end.getTime()) / (60 * 1000)
      );
      const targetEndTime = new Date(
        lastEvent.end.getTime() + targetHours * 60 * 60 * 1000
      );
      results.push({
        id: `auto-${lastEvent.end.toISOString()}`,
        user_id: userId,
        start_time: lastEvent.end.toISOString(),
        end_time: null,
        target_end_time: targetEndTime.toISOString(),
        duration_minutes: elapsedMinutes,
        fasting_type: prefs.default_protocol || '16-8',
        status: 'ACTIVE',
        is_auto_calculated: true,
        start_meal_name: lastEvent.description,
      });
    }
  }

  // Sort descending by start time (newest fast first)
  return results.sort(
    (a, b) =>
      new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
  );
}

/**
 * Synchronizes completed fasting intervals from food entries into the `fasting_logs` table.
 *
 * Rules:
 * 1. Only runs when user has `auto_calculate = true`.
 * 2. Scans food entries for the past 14 days up to today.
 * 3. Identifies inter-meal gaps between consecutive eating events.
 * 4. A gap qualifies as a completed fast if:
 *    - Duration is at least 12 hours (720 minutes).
 *    - It crosses overnight (different calendar day in user's timezone) OR reaches user's target fasting hours.
 * 5. Idempotent: checks if a fast near that start_time already exists in `fasting_logs`.
 *    - If an active fast exists near start_time, it is completed.
 *    - If no fast exists, creates a completed fast in `fasting_logs`.
 * 6. Returns the number of fasts synced.
 */
export async function syncCompletedAutoFasts(
  userId: string,
  timezone: string,
  prefsOverride?: FastingPreferencesRecord
): Promise<number> {
  const prefs =
    prefsOverride ||
    (await fastingPreferencesRepository.getFastingPreferences(userId));

  if (!prefs.auto_calculate) {
    return 0;
  }

  const today = todayInZone(timezone);
  const lookbackStart = addDays(today, -14);

  const points = await fetchFoodPoints(
    userId,
    lookbackStart,
    today,
    timezone,
    prefs.calorie_threshold
  );

  const syncNowMs = Date.now();
  const eatingEvents = clusterEatingEvents(points)
    .filter((e) => e.start.getTime() <= syncNowMs + CLOCK_SKEW_TOLERANCE_MS)
    .map((e) => {
      if (e.start.getTime() > syncNowMs) {
        return {
          ...e,
          start: new Date(syncNowMs),
          end: e.end.getTime() > syncNowMs ? new Date(syncNowMs) : e.end,
        };
      }
      return e;
    });
  if (eatingEvents.length === 0) {
    return 0;
  }

  const targetHours = prefs.target_fasting_hours || 16.0;
  const targetMinutes = targetHours * 60;
  let syncedCount = 0;

  const client = await getClient(userId);
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `sync_auto_fasts:${userId}`,
    ]);

    if (eatingEvents.length >= 2) {
      for (let i = 0; i < eatingEvents.length - 1; i++) {
        const prev = eatingEvents[i];
        const next = eatingEvents[i + 1];

        const fastStart = prev.end;
        const fastEnd = next.start;
        const durationMinutes = Math.floor(
          (fastEnd.getTime() - fastStart.getTime()) / (60 * 1000)
        );

        // Minimum clinical fasting threshold: 12 hours (720 minutes)
        if (durationMinutes < 720) {
          continue;
        }

        const startDayInTz = instantToDay(fastStart, timezone);
        const endDayInTz = instantToDay(fastEnd, timezone);
        const crossesDays = startDayInTz !== endDayInTz;

        // Overnight rule: Must cross days (overnight bridge) OR achieve target fasting hours
        if (!crossesDays && durationMinutes < targetMinutes) {
          continue;
        }

        const existing = await fastingRepository.findFastNearStartTime(
          userId,
          fastStart,
          60,
          client
        );

        if (existing) {
          if (existing.status === 'ACTIVE') {
            await fastingRepository.endFast(
              existing.id,
              userId,
              fastEnd.toISOString(),
              durationMinutes,
              existing.start_time,
              client
            );
            syncedCount++;
          }
          // If a completed fast already exists near this time (whether manually logged,
          // user-edited, or previously synced), leave it untouched to preserve user edits.
          continue;
        }

        // No existing fast found, create new completed fast entry
        const targetEndTime = new Date(
          fastStart.getTime() + targetHours * 60 * 60 * 1000
        );
        const protocol = classifyProtocol(durationMinutes);

        const created = await fastingRepository.createCompletedFast(
          userId,
          fastStart.toISOString(),
          fastEnd.toISOString(),
          targetEndTime.toISOString(),
          durationMinutes,
          protocol,
          client
        );
        if (created) {
          syncedCount++;
        }
      }
    }

    // Also check: if there is an active fast in fasting_logs whose start_time
    // is prior to the final eating event's start, that active fast was broken by the food.
    const activeFast = await fastingRepository.getCurrentFast(userId, client);
    if (activeFast && eatingEvents.length > 0) {
      const lastEvent = eatingEvents[eatingEvents.length - 1];
      const activeStartMs = new Date(activeFast.start_time).getTime();
      if (lastEvent.start.getTime() > activeStartMs) {
        const durationMinutes = Math.max(
          0,
          Math.floor((lastEvent.start.getTime() - activeStartMs) / 60000)
        );
        await fastingRepository.endFast(
          activeFast.id,
          userId,
          lastEvent.start.toISOString(),
          durationMinutes,
          activeFast.start_time,
          client
        );
        syncedCount++;
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Ignore rollback errors if transaction was already aborted
    }
    throw error;
  } finally {
    client.release();
  }

  return syncedCount;
}

export default {
  getCurrentAutoFast,
  getCalculatedFastingHistory,
  clusterEatingEvents,
  classifyProtocol,
  syncCompletedAutoFasts,
};
