import { getCaffeineDosesForWindow } from '../models/foodMisc.js';
import { getUserPreferences } from '../models/preferenceRepository.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import {
  addDays,
  localDateTimeToUtc,
  utcToLocalDateTimeInput,
  activeCaffeineAt,
  caffeineAtBedtime,
  caffeineCutoff,
  bedtimeHeadroomMg,
  CAFFEINE_BEDTIME_THRESHOLD_MG,
  DEFAULT_CAFFEINE_HALF_LIFE_HOURS,
} from '@workspace/shared';
import type { CaffeineActiveResponse, CaffeineDose } from '@workspace/shared';

export interface CaffeineKineticsOptions {
  date: string;
  now?: string | number | Date;
  doseMg?: number;
}

export async function getActiveCaffeineKinetics(
  userId: string,
  options: CaffeineKineticsOptions
): Promise<CaffeineActiveResponse> {
  const { date, now = new Date(), doseMg = 200 } = options;

  const [tz, prefs] = await Promise.all([
    loadUserTimezone(userId),
    getUserPreferences(userId),
  ]);

  const halfLifeHours =
    Number(prefs?.caffeine_half_life_hours) || DEFAULT_CAFFEINE_HALF_LIFE_HOURS;
  const targetBedtime =
    typeof prefs?.target_bedtime === 'string' && prefs.target_bedtime
      ? prefs.target_bedtime.slice(0, 5)
      : '22:30';

  // 48h lookback window (3 calendar days: date - 2 days to date)
  const startDate = addDays(date, -2);
  const endDate = date;

  const rawDoses = await getCaffeineDosesForWindow(userId, startDate, endDate);

  let hasEstimatedTimes = false;
  const doses: CaffeineDose[] = rawDoses.map((raw) => {
    let atInstant: string;
    let isEstimated: boolean;

    if (raw.source === 'supplement' && raw.taken_at) {
      atInstant = new Date(raw.taken_at).toISOString();
      isEstimated = false;
    } else {
      let timeStr: string;
      if (raw.entry_time) {
        timeStr = raw.entry_time.slice(0, 5);
        isEstimated = false;
      } else if (raw.meal_default_time) {
        timeStr = raw.meal_default_time.slice(0, 5);
        isEstimated = true;
      } else {
        timeStr = '12:00';
        isEstimated = true;
      }

      if (isEstimated) {
        hasEstimatedTimes = true;
      }

      const utcDate = localDateTimeToUtc(`${raw.entry_date}T${timeStr}`, tz);
      atInstant = utcDate.toISOString();
    }

    return {
      at: atInstant,
      mg: raw.caffeine_mg,
      name: raw.name,
      is_estimated: isEstimated,
    };
  });

  // Calculate bedtime instant in user's timezone for target date
  const bedtimeDate = localDateTimeToUtc(`${date}T${targetBedtime}`, tz);
  const bedtimeAt = bedtimeDate.toISOString();

  const activeMgNow = activeCaffeineAt(doses, now, halfLifeHours);
  const atBedtimeMg = caffeineAtBedtime(doses, bedtimeAt, halfLifeHours);

  // Latest safe dose cutoff, counting what is already circulating: a dose
  // lands on top of the projected residual, so the room available is
  // threshold - residual rather than the whole threshold.
  const cutoff = caffeineCutoff({
    doses,
    bedtimeInstant: bedtimeAt,
    nowInstant: now,
    halfLifeHours,
    thresholdMg: CAFFEINE_BEDTIME_THRESHOLD_MG,
    doseMg,
  });

  let latestSafeDoseTimeLocal: string | null = null;
  if (cutoff.kind === 'by' || cutoff.kind === 'passed') {
    const localStr = utcToLocalDateTimeInput(cutoff.at, tz);
    if (localStr && localStr.includes('T')) {
      latestSafeDoseTimeLocal = localStr.split('T')[1]?.slice(0, 5) || null;
    }
  }

  return {
    half_life_hours: halfLifeHours,
    target_bedtime: targetBedtime,
    bedtime_at: bedtimeAt,
    doses,
    active_mg_now: activeMgNow,
    at_bedtime_mg: atBedtimeMg,
    latest_safe_dose_time: latestSafeDoseTimeLocal,
    cutoff_state: cutoff.kind,
    bedtime_headroom_mg: bedtimeHeadroomMg(
      doses,
      bedtimeAt,
      halfLifeHours,
      CAFFEINE_BEDTIME_THRESHOLD_MG
    ),
    cutoff_dose_mg: doseMg,
    threshold_mg: CAFFEINE_BEDTIME_THRESHOLD_MG,
    has_estimated_times: hasEstimatedTimes,
  };
}

export default {
  getActiveCaffeineKinetics,
};
