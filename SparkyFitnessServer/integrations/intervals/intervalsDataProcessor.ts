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
import { mapSportTypeToCategory } from '../strava/stravaDataProcessor.js';

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
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
): Promise<{ imported: number; skipped: number; removed: number }> {
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
      await exerciseEntryRepository.createExerciseEntry(
        userId,
        {
          exercise_id: exercise.id,
          entry_date: activity.start_date_local.substring(0, 10),
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
          notes: `Synced from Intervals.icu. Type: ${sportType}.${activity.total_elevation_gain ? ` Elevation: ${activity.total_elevation_gain}m` : ''}`,
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
      imported += 1;
    } catch (error) {
      log(
        'error',
        `[intervalsDataProcessor] Error processing activity ${activity.id}: ${errorMessage(error)}`
      );
    }
  }
  return { imported, skipped, removed: stale.length };
}

async function processIntervalsWellness(
  userId: string,
  createdByUserId: string,
  records: IntervalsWellness[]
): Promise<number> {
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
    if (typeof r.restingHR !== 'number' && typeof r.vo2max !== 'number')
      continue;
    await genericHealthRepo.upsertDailyHealthMetrics(userId, createdByUserId, {
      user_id: userId,
      entry_date: r.id,
      source_provider: INTERVALS_PROVIDER,
      resting_heart_rate: r.restingHR ?? null,
      vo2_max: r.vo2max ?? null,
    });
  }

  // Intervals' `hrv` is the nightly rMSSD with no time of day; anchor it at
  // 05:00 UTC like Garmin's nightly summary.
  await upsertSamplesByDay(
    userId,
    createdByUserId,
    'hrv',
    INTERVALS_PROVIDER,
    records
      .filter((r) => typeof r.hrv === 'number')
      .map((r) => ({
        entry_date: r.id,
        timestamp: new Date(`${r.id}T05:00:00Z`),
        device_name: INTERVALS_SOURCE,
        rmssd_ms: r.hrv,
      }))
  );

  return records.length;
}

export { processIntervalsActivities, processIntervalsWellness };
export default { processIntervalsActivities, processIntervalsWellness };
