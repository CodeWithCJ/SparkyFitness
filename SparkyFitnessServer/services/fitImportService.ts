import { instantToDay } from '@workspace/shared';
import type { ImportFitFileResult, ImportFitResponse } from '@workspace/shared';
import { log } from '../config/logging.js';
import { getClient } from '../db/poolManager.js';
import { decodeFitBuffer } from '../integrations/garminfit/fitDecoder.js';
import { transformFitActivity } from '../integrations/garminfit/fitActivityTransform.js';
import type {
  FitDetailData,
  FitEntryData,
} from '../integrations/garminfit/fitActivityTransform.js';
import exerciseEntryRepository from '../models/exerciseEntry.js';
import activityDetailsRepository from '../models/activityDetailsRepository.js';
import { getOrCreateGarminExercise } from './garminService.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';

// Distinct from the Connect sync's 'garmin' so its range-delete-and-recreate
// re-sync never wipes FIT imports.
const FIT_SOURCE = 'garmin_fit';

interface UploadedFitFile {
  originalname: string;
  buffer: Buffer;
}

interface PersistedFitEntry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entry: any;
  operation: 'created' | 'updated';
}

/**
 * Writes the exercise entry and its activity detail in one transaction so a
 * detail failure can never leave an entry without report data.
 */
async function persistFitEntry(
  targetUserId: string,
  actingUserId: string,
  entryData: FitEntryData & { exercise_id: string; entry_date: string },
  detailData: FitDetailData
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
        FIT_SOURCE
      );
    await activityDetailsRepository._deleteActivityDetailsByEntryIdAndProviderWithClient(
      client,
      targetUserId,
      entry.id,
      FIT_SOURCE
    );
    await activityDetailsRepository._createActivityDetailWithClient(client, {
      exercise_entry_id: entry.id,
      provider_name: FIT_SOURCE,
      detail_type: 'full_activity_data',
      detail_data: detailData,
      created_by_user_id: actingUserId,
      updated_by_user_id: actingUserId,
    });
    await client.query('COMMIT');
    return { entry, operation };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function importSingleFitFile(
  targetUserId: string,
  actingUserId: string,
  file: UploadedFitFile
): Promise<ImportFitFileResult> {
  const fileName = file.originalname;
  try {
    if (!fileName.toLowerCase().endsWith('.fit')) {
      return {
        fileName,
        status: 'failed',
        reason: 'Only .fit files are supported.',
      };
    }
    const decoded = decodeFitBuffer(file.buffer);
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
    const transformed = transformFitActivity(decoded.messages, file.buffer);
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

    // Exercise rows keep source 'garmin' so a FIT "Tennis" and a linked
    // Garmin Connect "Tennis" share one exercise (lookup is by name first).
    const exercise = await getOrCreateGarminExercise(
      targetUserId,
      transformed.sport,
      transformed.sport
    );

    const { entry, operation } = await persistFitEntry(
      targetUserId,
      actingUserId,
      {
        ...transformed.entryData,
        exercise_id: exercise.id,
        entry_date: entryDate,
      },
      transformed.detailData
    );

    const result: ImportFitFileResult = {
      fileName,
      status: operation,
      exerciseEntryId: entry.id,
      entryDate,
      activityName: transformed.activityName,
      sport: transformed.sport,
    };
    if (warnings.length > 0) {
      result.warning = warnings.join(' ');
    }
    return result;
  } catch (error) {
    log(
      'error',
      `[fitImportService] Failed to import FIT file "${fileName}" for user ${targetUserId}:`,
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
export default { importFitFiles };
