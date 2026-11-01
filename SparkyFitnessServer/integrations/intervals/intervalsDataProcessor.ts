/**
 * Intervals.icu data processor. Maps Intervals activities to exercise entries
 * and wellness records to check-in measurements, daily health metrics and HRV
 * samples, through the same repositories the Strava and Garmin processors use.
 */
import { log } from '../../config/logging.js';
import exerciseRepository from '../../models/exercise.js';
import exerciseEntryRepository from '../../models/exerciseEntry.js';
import * as genericHealthRepo from '../../models/genericHealthRepository.js';
import measurementService from '../../services/measurementService.js';
import { upsertSamplesByDay } from '../../services/healthMetricSampleWriter.js';
import { replaceExerciseEntryHrZones } from '../../models/workoutTelemetryRepository.js';
import { mapSportTypeToCategory } from '../strava/stravaDataProcessor.js';
import { isDayString, mapRawSportValue } from '@workspace/shared';

export const INTERVALS_SOURCE = 'Intervals.icu';
// source_provider for daily_health_metrics / health_metric_samples rows.
export const INTERVALS_PROVIDER = 'intervals';

/** The Activity fields we read (Intervals OpenAPI `Activity`). */
export interface IntervalsActivity {
  id: string;
  start_date_local?: string;
  name?: string;
  type?: string;
  moving_time?: number;
  distance?: number;
  calories?: number;
  average_heartrate?: number;
  total_elevation_gain?: number;
  source?: string;
  external_id?: string;
  timezone?: string;
  max_heartrate?: number;
  average_speed?: number;
  max_speed?: number;
  pace?: number;
  average_cadence?: number;
  icu_average_watts?: number;
  icu_weighted_avg_watts?: number;
  icu_intensity?: number;
  icu_training_load?: number;
  total_elevation_loss?: number;
  min_altitude?: number;
  max_altitude?: number;
  elapsed_time?: number;
  average_temp?: number;
  max_temp?: number;
  has_weather?: boolean;
  average_weather_temp?: number;
  average_stance_time?: number;
  average_vertical_oscillation?: number;
  average_stride?: number;
  icu_rpe?: number;
  icu_hr_zones?: number[];
  icu_hr_zone_times?: number[];
}

/** The Wellness fields we read (Intervals OpenAPI `Wellness`); `id` is the day. */
export interface IntervalsWellness {
  id: string;
  weight?: number | null;
  bodyFat?: number | null;
  steps?: number | null;
  restingHR?: number | null;
  vo2max?: number | null;
  hrv?: number | null;
  hrvSDNN?: number | null;
  floorsClimbed?: number | null;
  ctl?: number | null;
  atl?: number | null;
  spO2?: number | null;
  respiration?: number | null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;
const round = (v: number | null, decimals = 0): number | null =>
  v === null ? null : Math.round(v * 10 ** decimals) / 10 ** decimals;

/**
 * Telemetry columns from an Intervals activity, written with the entry the way
 * Garmin's import does (so a re-sync keeps fields the user edited by hand).
 */
function activityTelemetry(a: IntervalsActivity) {
  const sport = mapRawSportValue(a.type);
  // Intervals counts one foot; SparkyFitness and Garmin store steps per minute.
  const onFoot = ['running', 'walking', 'hiking'].includes(sport);
  const running = sport === 'running';
  const effort = num(a.icu_rpe);
  const cadence = num(a.average_cadence);
  const maxHr = round(num(a.max_heartrate));
  const loss = num(a.total_elevation_loss);
  const intensity = num(a.icu_intensity);
  const stride = num(a.average_stride);
  return {
    // The column only accepts 100-250 bpm; anything else would reject the entry.
    max_heart_rate:
      maxHr !== null && maxHr >= 100 && maxHr <= 250 ? maxHr : null,
    avg_speed_mps: num(a.average_speed),
    max_speed_mps: num(a.max_speed),
    avg_moving_speed_mps: num(a.pace),
    avg_cadence:
      cadence === null ? null : Math.round(cadence * (onFoot ? 2 : 1)),
    avg_power_watts: num(a.icu_average_watts),
    normalized_power_watts: num(a.icu_weighted_avg_watts),
    // icu_intensity is a percentage of FTP.
    intensity_factor: round(intensity === null ? null : intensity / 100, 3),
    training_load: num(a.icu_training_load),
    elevation_gain_meters: num(a.total_elevation_gain),
    // Virtual rides report 0 loss on a climbing course; treat 0 as unknown.
    elevation_loss_meters: loss ? loss : null,
    min_elevation_meters: num(a.min_altitude),
    max_elevation_meters: num(a.max_altitude),
    moving_time_seconds: round(num(a.moving_time)),
    elapsed_time_seconds: round(num(a.elapsed_time)),
    avg_temperature_celsius: num(a.average_temp),
    max_temperature_celsius: num(a.max_temp),
    weather_temp_celsius: a.has_weather ? num(a.average_weather_temp) : null,
    ground_contact_time_ms: running
      ? round(num(a.average_stance_time), 1)
      : null,
    vertical_oscillation_mm: running
      ? round(num(a.average_vertical_oscillation), 1)
      : null,
    stride_length_cm:
      running && stride !== null ? round(stride * 100, 1) : null,
    workout_effort:
      effort !== null && Number.isInteger(effort) && effort >= 1 && effort <= 10
        ? effort
        : null,
    active_calories: num(a.calories),
  };
}

/**
 * Intervals' HR zones as stored rows: `icu_hr_zones` holds each zone's top bpm,
 * `icu_hr_zone_times` the seconds in it. Bounds follow Garmin's convention
 * (zone 1 has no floor, each later zone starts one above the previous top).
 * shortcut: only 5-zone setups are imported, matching SparkyFitness's 5-zone
 * charts; other zone counts are skipped until those support more zones.
 */
function hrZoneRows(a: IntervalsActivity) {
  const tops = a.icu_hr_zones;
  const times = a.icu_hr_zone_times;
  if (
    !Array.isArray(tops) ||
    !Array.isArray(times) ||
    tops.length !== 5 ||
    times.length !== 5 ||
    ![...tops, ...times].every((v) => num(v) !== null)
  ) {
    return null;
  }
  return tops.map((top, i) => ({
    zone_index: i + 1,
    zone_lower_bpm: i === 0 ? null : tops[i - 1]! + 1,
    zone_upper_bpm: top,
    seconds_in_zone: Math.round(times[i]!),
    zone_method: 'device' as const,
  }));
}

/**
 * The Garmin activity id behind an Intervals activity: its external_id when it
 * came from Garmin Connect, or the id in a Garmin file's name (`<id>_ACTIVITY.fit`)
 * when it was uploaded by hand. Empty for a Garmin Connect activity without an
 * external_id, null when the activity is not from Garmin.
 */
function garminActivityId(a: IntervalsActivity): string | null {
  if (a.source === 'GARMIN_CONNECT') return a.external_id ?? '';
  if (a.source === 'UPLOAD') {
    return /^(\d+)_ACTIVITY\.fit$/i.exec(a.external_id ?? '')?.[1] ?? null;
  }
  return null;
}

/**
 * Activities the user also syncs from Garmin directly are skipped:
 * - Garmin-sourced ones while a Garmin provider is active;
 * - Garmin-sourced ones the Garmin import already holds (cardio entries use the
 *   Garmin activity id as source_id, strength sessions `<id>_0`);
 * - any activity starting in the same local minute as a stored Garmin entry.
 *   Apps such as Zwift send each ride to both Garmin and Intervals under
 *   different ids, but the start time is the same to the second.
 * `stale` lists Intervals entries imported before their Garmin copy arrived;
 * only a stored Garmin match counts, so nothing is removed on the
 * "Garmin is active" rule alone, before Garmin has backfilled those days.
 */
async function findGarminDuplicates(
  userId: string,
  activities: IntervalsActivity[],
  garminActive: boolean
): Promise<{ skip: Set<string>; stale: string[] }> {
  const fromGarmin = activities.flatMap((a) => {
    const garminId = garminActivityId(a);
    return garminId === null ? [] : [{ id: a.id, garminId }];
  });
  const withIds = fromGarmin.filter((a) => a.garminId !== '');
  const existing = await exerciseEntryRepository.getExistingSourceIds(
    userId,
    'garmin',
    withIds.flatMap((a) => [a.garminId, `${a.garminId}_0`])
  );
  const matched = new Set(
    withIds
      .filter(
        (a) => existing.has(a.garminId) || existing.has(`${a.garminId}_0`)
      )
      .map((a) => a.id)
  );

  const days = activities
    .map((a) => a.start_date_local?.slice(0, 10))
    .filter((d): d is string => !!d)
    .sort();
  const entries = (
    days.length === 0
      ? []
      : (
          await exerciseEntryRepository.getExerciseDiaryRange(
            userId,
            days[0]!,
            days[days.length - 1]!
          )
        ).entries
  ) as {
    id: string;
    source: string | null;
    source_id: string | null;
    entry_date: string;
    entry_time: string | null;
  }[];
  const garminStarts = new Set(
    entries
      .filter((e) => e.source === 'garmin' && e.entry_time)
      .map((e) => `${e.entry_date}T${e.entry_time!.slice(0, 5)}`)
  );
  activities
    .filter((a) => garminStarts.has(a.start_date_local?.slice(0, 16) ?? ''))
    .forEach((a) => matched.add(a.id));

  const skip = new Set(matched);
  if (garminActive) fromGarmin.forEach((a) => skip.add(a.id));
  const stale = entries
    .filter(
      (e) =>
        e.source === INTERVALS_SOURCE &&
        e.source_id !== null &&
        matched.has(e.source_id)
    )
    .map((e) => e.id);
  return { skip, stale };
}

async function processIntervalsActivities(
  userId: string,
  createdByUserId: string,
  activities: IntervalsActivity[],
  garminActive: boolean
): Promise<{
  imported: number;
  skipped: number;
  failed: number;
  removed: number;
}> {
  const { skip: duplicates, stale } = await findGarminDuplicates(
    userId,
    activities,
    garminActive
  );
  // Self-heal: drop our earlier copy of an activity Garmin has since imported.
  for (const entryId of stale) {
    await exerciseEntryRepository.deleteExerciseEntry(entryId, userId);
  }
  let imported = 0;
  let skipped = 0;
  let failed = 0;
  for (const activity of activities) {
    // Strava-sourced activities come back as empty stubs (Strava's API terms).
    if (
      activity.source === 'STRAVA' ||
      !activity.start_date_local ||
      duplicates.has(activity.id)
    ) {
      skipped += 1;
      continue;
    }
    try {
      const sportType = activity.type || 'Workout';
      const exerciseName = activity.name || `Intervals.icu ${sportType}`;
      let exercise = await exerciseRepository.findExerciseByNameAndUserId(
        exerciseName,
        userId
      );
      if (!exercise) {
        exercise = await exerciseRepository.createExercise({
          user_id: userId,
          name: exerciseName,
          category: mapSportTypeToCategory(sportType),
          source: INTERVALS_SOURCE,
          is_custom: true,
          shared_with_public: false,
        });
      }
      const entryDate = activity.start_date_local.substring(0, 10);
      const entry = await exerciseEntryRepository.createExerciseEntry(
        userId,
        {
          exercise_id: exercise.id,
          entry_date: entryDate,
          entry_time: activity.start_date_local.substring(11, 16) || null,
          record_timezone: activity.timezone ?? null,
          duration_minutes: Math.round((activity.moving_time ?? 0) / 60),
          calories_burned: activity.calories,
          distance:
            typeof activity.distance === 'number'
              ? parseFloat((activity.distance / 1000).toFixed(2))
              : null,
          avg_heart_rate:
            typeof activity.average_heartrate === 'number'
              ? Math.round(activity.average_heartrate)
              : null,
          // shared activitySport parses "Type: X." back out of the notes.
          notes: `Synced from Intervals.icu. Type: ${sportType}.`,
          ...activityTelemetry(activity),
          source_id: activity.id,
          // No sets, like Garmin's cardio import; an empty list also clears the
          // placeholder set earlier versions stored on re-sync.
          sets: [],
        },
        createdByUserId,
        INTERVALS_SOURCE,
        null,
        {
          activityDetail: {
            provider_name: INTERVALS_SOURCE,
            detail_type: 'full_activity_data',
            detail_data: activity,
            created_by_user_id: createdByUserId,
            updated_by_user_id: createdByUserId,
          },
        }
      );
      const zones = hrZoneRows(activity);
      if (zones && entry?.id) {
        await replaceExerciseEntryHrZones(
          userId,
          createdByUserId,
          entry.id,
          zones.map((zone) => ({
            ...zone,
            user_id: userId,
            exercise_entry_id: entry.id,
            entry_date: entryDate,
          }))
        );
      }
      imported += 1;
    } catch (error) {
      failed += 1;
      log(
        'error',
        `[intervalsDataProcessor] Error processing activity ${activity.id}: ${errorMessage(error)}`
      );
    }
  }
  return { imported, skipped, failed, removed: stale.length };
}

async function processIntervalsWellness(
  userId: string,
  createdByUserId: string,
  allRecords: IntervalsWellness[]
): Promise<number> {
  // The record id is the day; a malformed one would throw in the HRV writer and
  // stop the rest of the sync, so skip it before any writer sees it.
  const records = allRecords.filter((r) => {
    if (typeof r.id === 'string' && isDayString(r.id)) return true;
    log(
      'warn',
      `[intervalsDataProcessor] Skipping wellness record with invalid date ${String(r.id)}`
    );
    return false;
  });
  const checkIns = records.flatMap((r) =>
    (
      [
        ['weight', r.weight, 'kg'],
        ['body_fat_percentage', r.bodyFat, '%'],
        ['steps', r.steps, 'count'],
      ] as const
    )
      .filter(([, value]) => typeof value === 'number')
      .map(([type, value, unit]) => ({
        type,
        value,
        date: r.id,
        source: INTERVALS_SOURCE,
        dataType: 'numeric',
        measurementType: unit,
      }))
  );
  if (checkIns.length > 0) {
    await measurementService.processHealthData(
      checkIns,
      userId,
      createdByUserId
    );
  }

  for (const r of records) {
    const daily = {
      resting_heart_rate: num(r.restingHR),
      vo2_max: num(r.vo2max),
      floors_ascended: round(num(r.floorsClimbed)),
      // Intervals shows fitness (CTL) and fatigue (ATL) as whole numbers.
      chronic_training_load: round(num(r.ctl)),
      acute_training_load: round(num(r.atl)),
      acwr_ratio:
        num(r.atl) !== null && (num(r.ctl) ?? 0) > 0
          ? round(num(r.atl)! / num(r.ctl)!, 2)
          : null,
    };
    if (Object.values(daily).every((v) => v === null)) continue;
    await genericHealthRepo.upsertDailyHealthMetrics(userId, createdByUserId, {
      user_id: userId,
      entry_date: r.id,
      source_provider: INTERVALS_PROVIDER,
      ...daily,
    });
  }

  // Wellness values have no time of day; anchor them at 05:00 UTC like
  // Garmin's nightly summary.
  const samples = (pick: (r: IntervalsWellness) => object | null) =>
    records.flatMap((r) => {
      const fields = pick(r);
      return fields
        ? [
            {
              entry_date: r.id,
              timestamp: new Date(`${r.id}T05:00:00Z`),
              device_name: INTERVALS_SOURCE,
              ...fields,
            },
          ]
        : [];
    });
  await upsertSamplesByDay(
    userId,
    createdByUserId,
    'hrv',
    INTERVALS_PROVIDER,
    samples((r) => {
      const rmssd = num(r.hrv);
      const sdnn = num(r.hrvSDNN);
      if (rmssd === null && sdnn === null) return null;
      return {
        ...(rmssd !== null && { rmssd_ms: rmssd }),
        ...(sdnn !== null && { sdnn_ms: sdnn }),
      };
    })
  );
  await upsertSamplesByDay(
    userId,
    createdByUserId,
    'spo2',
    INTERVALS_PROVIDER,
    samples((r) => (num(r.spO2) === null ? null : { percentage: num(r.spO2) }))
  );
  await upsertSamplesByDay(
    userId,
    createdByUserId,
    'respiration',
    INTERVALS_PROVIDER,
    samples((r) =>
      num(r.respiration) === null ? null : { brpm: num(r.respiration) }
    )
  );

  return records.length;
}

export { processIntervalsActivities, processIntervalsWellness };
export default { processIntervalsActivities, processIntervalsWellness };
