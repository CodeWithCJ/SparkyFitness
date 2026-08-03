// One-off backfill: re-derives the relational workout telemetry (exercise_entries
// columns, laps, GPS points, HR zones) for Garmin activities synced before the fixes in
// this change, from the raw JSON payload already stored in
// exercise_entry_activity_details.detail_data (detail_type = 'full_activity_data' /
// 'full_workout_data'). That JSON is exactly the "backup for future reprocessing" it was
// always meant to be — this is the reprocessing.
//
// Usage (from SparkyFitnessServer/):
//   pnpm exec tsx scripts/backfillWorkoutTelemetry.script.ts --dry-run
//   pnpm exec tsx scripts/backfillWorkoutTelemetry.script.ts
//   pnpm exec tsx scripts/backfillWorkoutTelemetry.script.ts --start=2026-01-01 --end=2026-07-30
//
// Idempotent: laps/GPS/HR-zone writers upsert on their unique constraints, and the
// telemetry-column update always overwrites with freshly-derived values, so running this
// twice produces the same result as running it once.
//
// Known limitation: for a multi-exercise strength SESSION (Garmin workout with several
// named exercises), the live sync path (garminActivityProcessor.ts) windows laps/GPS to
// the specific exercise whose active-set time range contains them. Reconstructing those
// per-exercise time windows here would require re-running the full exerciseSets grouping
// algorithm against archived data with no guarantee the grouping is still reproducible.
// This script instead attaches session-level laps/GPS to the session's first child
// exercise (sort_order 0) — the same place they lived before this fix — and reprocesses
// standalone (non-session) activities fully, per-exercise, with no compromise. HR zones
// are session-level in both the live path and here, so they backfill correctly either way.

import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { loadSecrets } from '../utils/secretLoader.js';
import { getSystemClient } from '../db/poolManager.js';
import { endPool } from '../db/poolManager.js';
import { log } from '../config/logging.js';
import exerciseEntryRepository from '../models/exerciseEntry.js';
import * as workoutTelemetryRepo from '../models/workoutTelemetryRepository.js';
import {
  extractGarminLaps,
  extractGarminGpsPoints,
  extractGarminHrZones,
  extractGarminTelemetryFields,
} from '../services/garmin/garminTelemetryExtractors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface CliArgs {
  dryRun: boolean;
  startDate?: string;
  endDate?: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const startArg = args.find((a) => a.startsWith('--start='));
  const endArg = args.find((a) => a.startsWith('--end='));
  return {
    dryRun,
    startDate: startArg?.split('=')[1],
    endDate: endArg?.split('=')[1],
  };
}

interface RawDetailRow {
  id: string;
  exercise_entry_id: string | null;
  exercise_preset_entry_id: string | null;
  provider_name: string;
  detail_type: string;
  detail_data: unknown;
  user_id: string;
  entry_date: string | null;
}

async function run() {
  const { dryRun, startDate, endDate } = parseArgs();
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });
  loadSecrets();

  log(
    'info',
    `[backfillWorkoutTelemetry] Starting${dryRun ? ' (dry run)' : ''}. ` +
      `Date range: ${startDate ?? 'earliest'} to ${endDate ?? 'latest'}.`
  );

  const client = await getSystemClient();
  let processedStandalone = 0;
  let processedSessionChildren = 0;
  let lapsWritten = 0;
  let gpsPointsWritten = 0;
  let hrZonesWritten = 0;
  let errors = 0;

  try {
    // Standalone (non-session) activities: detail row is keyed by exercise_entry_id.
    // Join back to exercise_entries for user_id/entry_date so we don't trust the raw
    // payload for identity.
    const standaloneParams: unknown[] = [];
    let standaloneWhere =
      "ead.exercise_entry_id IS NOT NULL AND ead.provider_name IN ('garmin', 'garmin_fit') " +
      "AND ead.detail_type = 'full_activity_data'";
    if (startDate) {
      standaloneParams.push(startDate);
      standaloneWhere += ` AND ee.entry_date >= $${standaloneParams.length}`;
    }
    if (endDate) {
      standaloneParams.push(endDate);
      standaloneWhere += ` AND ee.entry_date <= $${standaloneParams.length}`;
    }
    const standaloneResult = await client.query(
      `SELECT ead.id, ead.exercise_entry_id, ead.exercise_preset_entry_id,
              ead.provider_name, ead.detail_type, ead.detail_data,
              ee.user_id, ee.entry_date::text AS entry_date
       FROM exercise_entry_activity_details ead
       JOIN exercise_entries ee ON ee.id = ead.exercise_entry_id
       WHERE ${standaloneWhere}
       ORDER BY ee.entry_date ASC`,
      standaloneParams
    );

    for (const row of standaloneResult.rows as RawDetailRow[]) {
      try {
        const activityData = parseDetailData(row.detail_data);
        if (!activityData || !row.exercise_entry_id || !row.entry_date)
          continue;

        const telemetryFields = extractGarminTelemetryFields(activityData);
        const laps = extractGarminLaps(activityData);
        const gpsPoints = extractGarminGpsPoints(activityData);
        const hrZones = extractGarminHrZones(activityData);

        if (!dryRun) {
          await exerciseEntryRepository.updateExerciseEntryTelemetryOnly(
            row.exercise_entry_id,
            row.user_id,
            telemetryFields
          );
          if (laps.length > 0) {
            const written =
              await workoutTelemetryRepo.bulkInsertExerciseEntryLaps(
                row.user_id,
                row.user_id,
                laps.map(({ startMs: _s, endMs: _e, ...lap }) => ({
                  user_id: row.user_id,
                  exercise_entry_id: row.exercise_entry_id as string,
                  entry_date: row.entry_date as string,
                  ...lap,
                }))
              );
            lapsWritten += written.length;
          }
          if (gpsPoints.length > 0) {
            const written =
              await workoutTelemetryRepo.bulkInsertExerciseEntryGpsPoints(
                row.user_id,
                row.user_id,
                gpsPoints.map(({ timestampMs: _t, ...pt }) => ({
                  user_id: row.user_id,
                  exercise_entry_id: row.exercise_entry_id as string,
                  entry_date: row.entry_date as string,
                  ...pt,
                }))
              );
            gpsPointsWritten += written.length;
          }
          if (hrZones.length > 0) {
            const written =
              await workoutTelemetryRepo.bulkInsertExerciseEntryHrZones(
                row.user_id,
                row.user_id,
                hrZones.map((zone) => ({
                  user_id: row.user_id,
                  exercise_entry_id: row.exercise_entry_id as string,
                  entry_date: row.entry_date as string,
                  ...zone,
                }))
              );
            hrZonesWritten += written.length;
          }
        } else {
          lapsWritten += laps.length;
          gpsPointsWritten += gpsPoints.length;
          hrZonesWritten += hrZones.length;
        }
        processedStandalone++;
      } catch (err) {
        errors++;
        log(
          'error',
          `[backfillWorkoutTelemetry] Failed on standalone activity detail ${row.id}:`,
          err
        );
      }
    }

    // Multi-exercise sessions: detail row is keyed by exercise_preset_entry_id. Attach
    // laps/GPS/HR-zones to the first child (sort_order 0) — see the file-level comment
    // for why per-exercise windowing isn't reconstructed here — and telemetry columns to
    // every child (activity-level fields like weather/gear apply to the whole session).
    const sessionParams: unknown[] = [];
    let sessionWhere =
      "ead.exercise_preset_entry_id IS NOT NULL AND ead.provider_name IN ('garmin', 'garmin_fit') " +
      "AND ead.detail_type = 'full_activity_data'";
    if (startDate) {
      sessionParams.push(startDate);
      sessionWhere += ` AND epe.entry_date >= $${sessionParams.length}`;
    }
    if (endDate) {
      sessionParams.push(endDate);
      sessionWhere += ` AND epe.entry_date <= $${sessionParams.length}`;
    }
    const sessionResult = await client.query(
      `SELECT ead.id, ead.exercise_entry_id, ead.exercise_preset_entry_id,
              ead.provider_name, ead.detail_type, ead.detail_data,
              epe.user_id, epe.entry_date::text AS entry_date
       FROM exercise_entry_activity_details ead
       JOIN exercise_preset_entries epe ON epe.id = ead.exercise_preset_entry_id
       WHERE ${sessionWhere}
       ORDER BY epe.entry_date ASC`,
      sessionParams
    );

    for (const row of sessionResult.rows as RawDetailRow[]) {
      try {
        const activityData = parseDetailData(row.detail_data);
        if (!activityData || !row.exercise_preset_entry_id || !row.entry_date)
          continue;

        const childrenResult = await client.query(
          `SELECT id FROM exercise_entries
           WHERE exercise_preset_entry_id = $1
           ORDER BY sort_order ASC, created_at ASC`,
          [row.exercise_preset_entry_id]
        );
        const childIds = childrenResult.rows.map((r: { id: string }) => r.id);
        if (childIds.length === 0) continue;
        const firstChildId = childIds[0];

        const laps = extractGarminLaps(activityData);
        const gpsPoints = extractGarminGpsPoints(activityData);
        const hrZones = extractGarminHrZones(activityData);

        if (!dryRun) {
          if (laps.length > 0) {
            const written =
              await workoutTelemetryRepo.bulkInsertExerciseEntryLaps(
                row.user_id,
                row.user_id,
                laps.map(({ startMs: _s, endMs: _e, ...lap }) => ({
                  user_id: row.user_id,
                  exercise_entry_id: firstChildId,
                  entry_date: row.entry_date as string,
                  ...lap,
                }))
              );
            lapsWritten += written.length;
          }
          if (gpsPoints.length > 0) {
            const written =
              await workoutTelemetryRepo.bulkInsertExerciseEntryGpsPoints(
                row.user_id,
                row.user_id,
                gpsPoints.map(({ timestampMs: _t, ...pt }) => ({
                  user_id: row.user_id,
                  exercise_entry_id: firstChildId,
                  entry_date: row.entry_date as string,
                  ...pt,
                }))
              );
            gpsPointsWritten += written.length;
          }
          if (hrZones.length > 0) {
            const written =
              await workoutTelemetryRepo.bulkInsertExerciseEntryHrZones(
                row.user_id,
                row.user_id,
                hrZones.map((zone) => ({
                  user_id: row.user_id,
                  exercise_entry_id: firstChildId,
                  entry_date: row.entry_date as string,
                  ...zone,
                }))
              );
            hrZonesWritten += written.length;
          }
        } else {
          lapsWritten += laps.length;
          gpsPointsWritten += gpsPoints.length;
          hrZonesWritten += hrZones.length;
        }
        processedSessionChildren += childIds.length;
      } catch (err) {
        errors++;
        log(
          'error',
          `[backfillWorkoutTelemetry] Failed on session activity detail ${row.id}:`,
          err
        );
      }
    }

    log(
      'info',
      `[backfillWorkoutTelemetry] Done${dryRun ? ' (dry run — nothing written)' : ''}. ` +
        `Standalone activities: ${processedStandalone}. Session child entries touched: ${processedSessionChildren}. ` +
        `Laps: ${lapsWritten}. GPS points: ${gpsPointsWritten}. HR zones: ${hrZonesWritten}. Errors: ${errors}.`
    );
  } finally {
    client.release();
    await endPool();
  }

  if (errors > 0) {
    process.exitCode = 1;
  }
}

function parseDetailData(raw: unknown): Record<string, unknown> | null {
  let data = raw;
  while (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return null;
    }
  }
  return data && typeof data === 'object'
    ? (data as Record<string, unknown>)
    : null;
}

run().catch((err) => {
  log('error', '[backfillWorkoutTelemetry] Fatal error:', err);
  process.exitCode = 1;
});
