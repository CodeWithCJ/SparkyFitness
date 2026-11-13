import { instantToDay } from '@workspace/shared';
import type { ImportFitFileResult, ImportFitResponse } from '@workspace/shared';
import { log } from '../config/logging.js';
import { getClient } from '../db/poolManager.js';
import { decodeFitBuffer } from '../integrations/garminfit/fitDecoder.js';
import { transformFitActivity } from '../integrations/garminfit/fitActivityTransform.js';
import type {
  FitDetailData,
  FitEntryData,
  FitTransformResult,
} from '../integrations/garminfit/fitActivityTransform.js';
import exerciseEntryRepository from '../models/exerciseEntry.js';
import exercisePresetEntryRepository from '../models/exercisePresetEntryRepository.js';
import workoutPresetRepository from '../models/workoutPresetRepository.js';
import activityDetailsRepository from '../models/activityDetailsRepository.js';
import * as workoutTelemetryRepo from '../models/workoutTelemetryRepository.js';
import { getOrCreateGarminExercise } from './garminService.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import {
  extractGarminLaps,
  extractGarminGpsPoints,
  extractGarminHrZones,
  extractGarminTelemetryFields,
  findGroupForTimestamp,
} from './garmin/garminTelemetryExtractors.js';

// Distinct from the Connect sync's 'garmin' so its range-delete-and-recreate
// re-sync never wipes FIT imports.
const FIT_SOURCE = 'garmin_fit';

interface UploadedFitFile {
  originalname: string;
  buffer: Buffer;
}

interface PersistedFitEntry {
  entry: { id: string; [key: string]: unknown };
  operation: 'created' | 'updated';
}

export interface FitBufferImportOptions {
  source?: string; // 'garmin_fit' (default) | 'coros_mcp'
  sourceIdOverride?: string; // COROS: the labelId
  notesLabel?: string; // COROS: 'Logged from COROS'
}

/**
 * Writes the exercise entry and its activity detail in one transaction so a
 * detail failure can never leave an entry without report data.
 */
async function persistFitEntry(
  targetUserId: string,
  actingUserId: string,
  entryData: FitEntryData & { exercise_id: string; entry_date: string },
  detailData: FitDetailData,
  entryDate: string,
  source = FIT_SOURCE
): Promise<PersistedFitEntry> {
  const client = await getClient(targetUserId, actingUserId);
  try {
    await client.query('BEGIN');
    const { entry, operation } =
      await exerciseEntryRepository._createExerciseEntryWithClient(
        client,
        targetUserId,
        entryData,
        actingUserId,
        source
      );
    await activityDetailsRepository._deleteActivityDetailsByEntryIdAndProviderWithClient(
      client,
      targetUserId,
      entry.id,
      source
    );
    await activityDetailsRepository._createActivityDetailWithClient(client, {
      exercise_entry_id: entry.id,
      provider_name: source,
      detail_type: 'full_activity_data',
      detail_data: detailData,
      created_by_user_id: actingUserId,
      updated_by_user_id: actingUserId,
    });
    // Telemetry belongs to the same unit of work as the entry itself. These
    // used to run after COMMIT on their own connections, so a failure part-way
    // left a committed activity with only some of its laps/GPS/zones attached.
    const detailRecord = detailData as unknown as Record<string, unknown>;
    await exerciseEntryRepository._updateExerciseEntryTelemetryOnlyWithClient(
      client,
      entry.id,
      targetUserId,
      extractGarminTelemetryFields(detailRecord)
    );
    const laps = extractGarminLaps(detailRecord);
    if (laps.length > 0) {
      await workoutTelemetryRepo._bulkInsertExerciseEntryLapsWithClient(
        client,
        targetUserId,
        laps.map(({ startMs: _s, endMs: _e, ...lap }) => ({
          user_id: targetUserId,
          exercise_entry_id: entry.id,
          entry_date: entryDate,
          ...lap,
        }))
      );
    }
    const gpsPoints = extractGarminGpsPoints(detailRecord);
    if (gpsPoints.length > 0) {
      await workoutTelemetryRepo._bulkInsertExerciseEntryGpsPointsWithClient(
        client,
        targetUserId,
        gpsPoints.map(({ timestampMs: _t, ...pt }) => ({
          user_id: targetUserId,
          exercise_entry_id: entry.id,
          entry_date: entryDate,
          ...pt,
        }))
      );
    }
    const hrZones = extractGarminHrZones(detailRecord);
    if (hrZones.length > 0) {
      await workoutTelemetryRepo._bulkInsertExerciseEntryHrZonesWithClient(
        client,
        targetUserId,
        hrZones.map((zone) => ({
          user_id: targetUserId,
          exercise_entry_id: entry.id,
          entry_date: entryDate,
          ...zone,
          zone_method: 'device',
        }))
      );
    }

    await client.query('COMMIT');
    return { entry, operation };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Persists a strength workout from a FIT file as an exercise preset entry (workout session),
 * distinct exercise entries with their sets, reps, and weights, full activity detail, and full workout detail.
 */
async function persistFitStrengthWorkout(
  targetUserId: string,
  actingUserId: string,
  transformed: Extract<FitTransformResult, { ok: true }>,
  entryDate: string,
  source = FIT_SOURCE,
  sourceId = transformed.sourceId
): Promise<PersistedFitEntry> {
  // Resolve exercises, template preset, and preset exercise templates outside
  // the transaction. getOrCreateGarminExercise and workoutPresetRepository each
  // check out connections from the pool, so executing them before acquiring a client
  // prevents concurrent imports from exhausting the pool and deadlocking.
  const exercisesByGroupName = new Map<string, { id: string; name: string }>();
  for (const group of transformed.strengthWorkout?.groupedExercises || []) {
    if (!exercisesByGroupName.has(group.name)) {
      exercisesByGroupName.set(
        group.name,
        await getOrCreateGarminExercise(
          targetUserId,
          group.name,
          group.category
        )
      );
    }
  }

  const workoutName =
    transformed.strengthWorkout?.workoutName ||
    transformed.activityName ||
    'Garmin Workout Session';
  let workoutPreset = await workoutPresetRepository.getWorkoutPresetByName(
    targetUserId,
    workoutName
  );
  if (!workoutPreset) {
    workoutPreset = await workoutPresetRepository.createWorkoutPreset({
      user_id: targetUserId,
      name: workoutName,
      description: `Imported Garmin FIT workout: ${workoutName}`,
      is_public: false,
    });
  }
  let presetSortOrder = 0;
  for (const group of transformed.strengthWorkout?.groupedExercises || []) {
    const presetExercise = exercisesByGroupName.get(group.name);
    if (presetExercise) {
      await workoutPresetRepository.addExerciseToWorkoutPreset(
        targetUserId,
        workoutPreset.id,
        presetExercise.id,
        null,
        group.sets,
        presetSortOrder
      );
    }
    presetSortOrder++;
  }

  const client = await getClient(targetUserId, actingUserId);
  try {
    await client.query('BEGIN');

    // 1. Detect if entries or preset entries already exist with this source and source_id
    const existingResult = await client.query(
      'SELECT id, exercise_preset_entry_id FROM exercise_entries WHERE user_id = $1 AND source = $2 AND (source_id = $3 OR source_id LIKE $4)',
      [targetUserId, source, sourceId, `${sourceId}_%`]
    );
    const isUpdate = existingResult.rows.length > 0;
    const existingPresetIds = new Set<string>();
    for (const row of existingResult.rows) {
      if (row.exercise_preset_entry_id) {
        existingPresetIds.add(row.exercise_preset_entry_id);
      }
    }

    // Clean up previous preset entries or loose entries for this file
    if (existingPresetIds.size > 0) {
      await client.query(
        'DELETE FROM exercise_preset_entries WHERE id = ANY($1::uuid[]) AND user_id = $2',
        [Array.from(existingPresetIds), targetUserId]
      );
    }
    await client.query(
      'DELETE FROM exercise_entries WHERE user_id = $1 AND source = $2 AND (source_id = $3 OR source_id LIKE $4)',
      [targetUserId, source, sourceId, `${sourceId}_%`]
    );

    // 2. Workout preset and exercises resolved before checkout (see above)

    // 3. Create exercise preset entry
    const exercisePresetEntryData = {
      user_id: targetUserId,
      workout_preset_id: workoutPreset.id,
      name: workoutName,
      description: `Logged session of ${workoutName}`,
      entry_date: entryDate,
      created_by_user_id: actingUserId,
      notes: transformed.entryData.notes,
      source,
    };
    const newPresetEntry =
      await exercisePresetEntryRepository.createExercisePresetEntryWithClient(
        client,
        targetUserId,
        exercisePresetEntryData,
        actingUserId
      );

    // 4. Save activity details for the preset entry
    await activityDetailsRepository._createActivityDetailWithClient(client, {
      exercise_preset_entry_id: newPresetEntry.id,
      provider_name: source,
      detail_type: 'full_activity_data',
      detail_data: transformed.detailData,
      created_by_user_id: actingUserId,
      updated_by_user_id: actingUserId,
    });
    if (transformed.strengthWorkout?.workoutData) {
      await activityDetailsRepository._createActivityDetailWithClient(client, {
        exercise_preset_entry_id: newPresetEntry.id,
        provider_name: source,
        detail_type: 'full_workout_data',
        detail_data: transformed.strengthWorkout.workoutData,
        created_by_user_id: actingUserId,
        updated_by_user_id: actingUserId,
      });
    }

    // 5. Process grouped exercises
    let exerciseSortOrder = 0;
    const createdGroups: Array<{
      id: string;
      startMs: number | null;
      endMs: number | null;
    }> = [];
    let firstCreatedEntry: { id: string; [key: string]: unknown } | null = null;

    const totalActiveDuration =
      transformed.strengthWorkout?.groupedExercises.reduce(
        (sum, g) => sum + g.activeDuration,
        0
      ) || 0;
    const totalCalories = transformed.entryData.calories_burned || 0;

    const metricDescriptors =
      transformed.detailData.details.metricDescriptors || [];
    const hrIndex = metricDescriptors.findIndex(
      (d) => d.key === 'directHeartRate'
    );
    const timestampIndex = metricDescriptors.findIndex(
      (d) => d.key === 'directTimestamp'
    );
    const activityDetailMetrics =
      transformed.detailData.details.activityDetailMetrics || [];

    // Pre-index heart-rate samples by timestamp so each group's window is
    // resolved with two binary searches instead of a full rescan of every
    // metric. The rescan is O(groups x metrics) synchronous work (up to
    // 10_000 groups x 100_000 metrics), which blocks the event loop for the
    // whole import; this keeps it at O(metrics log metrics) per file.
    const hrSampleTimestamps: number[] = [];
    const hrPrefixSum: number[] = [0];
    if (hrIndex !== -1 && timestampIndex !== -1) {
      const samples: Array<{ ts: number; hr: number }> = [];
      for (const metric of activityDetailMetrics) {
        const metricTimestamp = metric.metrics?.[timestampIndex];
        const heartRate = metric.metrics?.[hrIndex];
        if (
          typeof metricTimestamp === 'number' &&
          typeof heartRate === 'number'
        ) {
          samples.push({ ts: metricTimestamp, hr: heartRate });
        }
      }
      samples.sort((a, b) => a.ts - b.ts);
      for (const sample of samples) {
        hrSampleTimestamps.push(sample.ts);
        hrPrefixSum.push(hrPrefixSum[hrPrefixSum.length - 1] + sample.hr);
      }
    }
    const lowerBoundTs = (target: number): number => {
      let low = 0;
      let high = hrSampleTimestamps.length;
      while (low < high) {
        const mid = (low + high) >> 1;
        if (hrSampleTimestamps[mid] < target) {
          low = mid + 1;
        } else {
          high = mid;
        }
      }
      return low;
    };
    const upperBoundTs = (target: number): number => {
      let low = 0;
      let high = hrSampleTimestamps.length;
      while (low < high) {
        const mid = (low + high) >> 1;
        if (hrSampleTimestamps[mid] <= target) {
          low = mid + 1;
        } else {
          high = mid;
        }
      }
      return low;
    };

    const entryTime =
      typeof transformed.detailData.activity.startTimeLocal === 'string' &&
      transformed.detailData.activity.startTimeLocal.length >= 16
        ? transformed.detailData.activity.startTimeLocal.substring(11, 16)
        : null;

    for (const group of transformed.strengthWorkout?.groupedExercises || []) {
      const exercise = exercisesByGroupName.get(group.name);
      if (!exercise) continue;

      let perExerciseCalories = 0;
      if (totalActiveDuration > 0 && totalCalories > 0) {
        perExerciseCalories = Math.round(
          (group.activeDuration / totalActiveDuration) * totalCalories
        );
      }

      let perExerciseAvgHeartRate: number | null = null;
      if (group.startTime && group.endTime && hrSampleTimestamps.length > 0) {
        const from = lowerBoundTs(group.startTime);
        const to = upperBoundTs(group.endTime);
        const sampleCount = to - from;
        if (sampleCount > 0) {
          perExerciseAvgHeartRate = Math.round(
            (hrPrefixSum[to] - hrPrefixSum[from]) / sampleCount
          );
        }
      }

      const exerciseEntryData = {
        exercise_id: exercise.id,
        duration_minutes: group.totalDuration / 60,
        work_time_seconds: group.activeDuration || null,
        calories_burned: perExerciseCalories,
        entry_date: entryDate,
        entry_time: entryTime,
        notes: `Garmin Exercise: ${exercise.name}`,
        sets: group.sets,
        exercise_preset_entry_id: newPresetEntry.id,
        avg_heart_rate: perExerciseAvgHeartRate,
        source_id: `${sourceId}_${exerciseSortOrder}`,
        steps: exerciseSortOrder === 0 ? (transformed.entryData.steps ?? 0) : 0,
        sort_order: exerciseSortOrder,
        training_load:
          exerciseSortOrder === 0
            ? (transformed.entryData.training_load ?? null)
            : null,
      };

      const { entry: newEntry } =
        await exerciseEntryRepository._createExerciseEntryWithClient(
          client,
          targetUserId,
          exerciseEntryData,
          actingUserId,
          source,
          newPresetEntry.id,
          { skipDuplicateCheck: true }
        );

      if (newEntry && newEntry.id) {
        if (!firstCreatedEntry) {
          firstCreatedEntry = newEntry;
        }
        createdGroups.push({
          id: newEntry.id,
          startMs: group.startTime,
          endMs: group.endTime,
        });
      }
      exerciseSortOrder++;
    }

    // 6. Attach telemetry across created groups
    const detailRecord = transformed.detailData as unknown as Record<
      string,
      unknown
    >;
    const laps = extractGarminLaps(detailRecord);
    const gpsPoints = extractGarminGpsPoints(detailRecord);
    const hrZones = extractGarminHrZones(detailRecord);

    if (createdGroups.length > 0) {
      if (laps.length > 0) {
        const lapRows = laps.map((lap) => {
          const group = findGroupForTimestamp(createdGroups, lap.startMs);
          const { startMs: _startMs, endMs: _endMs, ...lapFields } = lap;
          return {
            user_id: targetUserId,
            exercise_entry_id: (group ?? createdGroups[0]).id,
            entry_date: entryDate,
            ...lapFields,
          };
        });
        await workoutTelemetryRepo._bulkInsertExerciseEntryLapsWithClient(
          client,
          targetUserId,
          lapRows
        );
      }

      if (gpsPoints.length > 0) {
        const gpsRows = gpsPoints.map((pt) => {
          const group = findGroupForTimestamp(createdGroups, pt.timestampMs);
          const { timestampMs: _timestampMs, ...ptFields } = pt;
          return {
            user_id: targetUserId,
            exercise_entry_id: (group ?? createdGroups[0]).id,
            entry_date: entryDate,
            ...ptFields,
          };
        });
        await workoutTelemetryRepo._bulkInsertExerciseEntryGpsPointsWithClient(
          client,
          targetUserId,
          gpsRows
        );
      }

      if (hrZones.length > 0) {
        await workoutTelemetryRepo._bulkInsertExerciseEntryHrZonesWithClient(
          client,
          targetUserId,
          hrZones.map((zone) => ({
            user_id: targetUserId,
            exercise_entry_id: createdGroups[0].id,
            entry_date: entryDate,
            ...zone,
            zone_method: 'device',
          }))
        );
      }
    }

    await client.query('COMMIT');
    return {
      entry: firstCreatedEntry || { id: newPresetEntry.id },
      operation: isUpdate ? 'updated' : 'created',
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Imports a single in-memory FIT buffer as an exercise diary entry with full telemetry.
 */
export async function importFitBuffer(
  targetUserId: string,
  actingUserId: string,
  buffer: Buffer,
  fileName: string,
  options?: FitBufferImportOptions
): Promise<ImportFitFileResult> {
  try {
    const decoded = decodeFitBuffer(buffer);
    if (!decoded.isFit) {
      return { fileName, status: 'failed', reason: 'Not a FIT file.' };
    }
    if (!decoded.messages) {
      return {
        fileName,
        status: 'failed',
        reason: `Could not decode file: ${decoded.errors.join('; ') || 'unknown decode error'}`,
      };
    }
    const transformed = transformFitActivity(
      decoded.messages,
      buffer,
      options?.notesLabel
    );
    if (!transformed.ok) {
      return { fileName, status: 'failed', reason: transformed.reason };
    }

    const warnings = [...transformed.warnings];
    if (!decoded.integrityOk) {
      warnings.push(
        'The file failed its integrity (CRC) check; the readable part was imported.'
      );
    }
    if (decoded.errors.length > 0) {
      warnings.push(`Decoder reported: ${decoded.errors.join('; ')}`);
    }

    const entryDate =
      transformed.entryDate ??
      instantToDay(transformed.startTime, await loadUserTimezone(targetUserId));

    const source = options?.source || FIT_SOURCE;
    const sourceId = options?.sourceIdOverride || transformed.sourceId;

    let entry: { id: string; [key: string]: unknown };
    let operation: 'created' | 'updated';

    if (
      transformed.kind === 'strength' &&
      transformed.strengthWorkout &&
      transformed.strengthWorkout.groupedExercises.length > 0
    ) {
      const persisted = await persistFitStrengthWorkout(
        targetUserId,
        actingUserId,
        transformed,
        entryDate,
        source,
        sourceId
      );
      entry = persisted.entry;
      operation = persisted.operation;
    } else {
      // Exercise rows keep source 'garmin' so a FIT "Tennis" and a linked
      // Garmin Connect "Tennis" share one exercise (lookup is by name first).
      const exercise = await getOrCreateGarminExercise(
        targetUserId,
        transformed.sport,
        transformed.sport
      );

      const persisted = await persistFitEntry(
        targetUserId,
        actingUserId,
        {
          ...transformed.entryData,
          source_id: sourceId,
          exercise_id: exercise.id,
          entry_date: entryDate,
        },
        transformed.detailData,
        entryDate,
        source
      );
      entry = persisted.entry;
      operation = persisted.operation;
    }

    const result: ImportFitFileResult = {
      fileName,
      status: operation,
      exerciseEntryId: entry.id,
      entryDate,
      activityName:
        transformed.strengthWorkout?.workoutName || transformed.activityName,
      sport: transformed.sport,
    };
    if (warnings.length > 0) {
      result.warning = warnings.join(' ');
    }
    return result;
  } catch (error) {
    log(
      'error',
      `[fitImportService] Failed to import FIT buffer "${fileName}" for user ${targetUserId}:`,
      error
    );
    return {
      fileName,
      status: 'failed',
      reason:
        error instanceof Error
          ? error.message
          : 'Unexpected error importing file.',
    };
  }
}

async function importSingleFitFile(
  targetUserId: string,
  actingUserId: string,
  file: UploadedFitFile
): Promise<ImportFitFileResult> {
  const fileName = file.originalname;
  if (!fileName.toLowerCase().endsWith('.fit')) {
    return {
      fileName,
      status: 'failed',
      reason: 'Only .fit files are supported.',
    };
  }
  return importFitBuffer(targetUserId, actingUserId, file.buffer, fileName);
}

/**
 * Imports a batch of uploaded FIT files as exercise diary entries. One bad
 * file never aborts the batch: per-file failures come back as `failed` rows
 * and the response is always a full per-file result list.
 */
async function importFitFiles(
  targetUserId: string,
  actingUserId: string,
  files: UploadedFitFile[]
): Promise<ImportFitResponse> {
  const results: ImportFitFileResult[] = [];
  for (const file of files) {
    results.push(await importSingleFitFile(targetUserId, actingUserId, file));
  }
  const created = results.filter((r) => r.status === 'created').length;
  const updated = results.filter((r) => r.status === 'updated').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  return {
    message: `Imported ${created + updated} of ${results.length} FIT file(s).`,
    created,
    updated,
    failed,
    results,
  };
}

export { importFitFiles };
export default { importFitFiles, importFitBuffer };
