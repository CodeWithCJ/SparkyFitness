import { log } from '../config/logging.js';
import measurementRepository from '../models/measurementRepository.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import {
  instantToDay,
  instantHourMinute,
  instantToDayWithOffset,
  instantHourMinuteWithOffset,
  isValidTimeZone,
  isDayString,
} from '@workspace/shared';
import { userAge } from '../utils/dateHelpers.js';
import userRepository from '../models/userRepository.js';
import sleepRepository from '../models/sleepRepository.js';
import exerciseEntryDb from '../models/exerciseEntry.js';
import waterContainerRepository from '../models/waterContainerRepository.js';
import {
  resolveHandler,
  customMeasurementHandler,
  createCategoryResolver,
  HEALTH_TYPE_DISPLAY_NAMES,
} from './healthDataHandlers.js';
import type {
  HandleBatchFn,
  PreparedHealthEntry,
} from './healthDataHandlers.js';
/**
 * Resolve the entry date, timestamp, and hour for a health data record using
 * the per-record timezone fallback chain:
 *   1. record_timezone (IANA)
 *   2. record_utc_offset_minutes (fixed offset)
 *   3. fallbackTimezone (account timezone)
 *
 * Basis instant varies by record type:
 *   - SleepSession: wake_time (entry date = wake day)
 *   - ExerciseSession/Workout: timestamp or date (entry date = start day)
 *   - everything else: date / entry_date / timestamp
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveHealthEntryDate(entry: any, fallbackTimezone: any) {
  // 1. Determine the basis instant
  let basisField;
  if (entry.type === 'SleepSession') {
    basisField =
      entry.wake_time || entry.date || entry.entry_date || entry.timestamp;
  } else if (entry.type === 'ExerciseSession' || entry.type === 'Workout') {
    // Prefer timestamp (actual instant) over pre-bucketed date strings
    // so timezone metadata can derive the correct day from the real instant
    basisField = entry.timestamp || entry.date || entry.entry_date;
  } else {
    basisField = entry.date || entry.entry_date || entry.timestamp;
  }
  // 2. If the basis is a date-only string (YYYY-MM-DD) with no timestamp,
  // the record was already bucketed client-side. Trust the date as-is —
  // applying timezone conversion to a UTC-midnight-parsed day string would
  // shift negative-offset zones to the previous day.
  const basisIsDayOnly =
    typeof basisField === 'string' &&
    isDayString(basisField) &&
    !entry.timestamp;
  const basisDate = new Date(basisField);
  if (isNaN(basisDate.getTime())) {
    return null;
  }
  if (basisIsDayOnly) {
    return {
      parsedDate: basisField,
      entryTimestamp: basisDate.toISOString(),
      entryHour: 0,
    };
  }
  // 3. Determine the timestamp for entryTimestamp (prefer explicit timestamp)
  let entryTimestamp;
  if (entry.timestamp) {
    const tsObj = new Date(entry.timestamp);
    entryTimestamp = isNaN(tsObj.getTime())
      ? basisDate.toISOString()
      : tsObj.toISOString();
  } else {
    entryTimestamp = basisDate.toISOString();
  }
  // The instant used for hour derivation
  const hourBasis = entry.timestamp ? new Date(entry.timestamp) : null;
  const validHourBasis =
    hourBasis && !isNaN(hourBasis.getTime()) ? hourBasis : null;
  // 4. Resolve timezone (fallback chain)
  if (entry.record_timezone && isValidTimeZone(entry.record_timezone)) {
    return {
      parsedDate: instantToDay(basisDate, entry.record_timezone),
      entryTimestamp,
      entryHour: validHourBasis
        ? instantHourMinute(validHourBasis, entry.record_timezone).hour
        : 0,
    };
  }
  if (
    entry.record_utc_offset_minutes !== null &&
    typeof entry.record_utc_offset_minutes === 'number'
  ) {
    return {
      parsedDate: instantToDayWithOffset(
        basisDate,
        entry.record_utc_offset_minutes
      ),
      entryTimestamp,
      entryHour: validHourBasis
        ? instantHourMinuteWithOffset(
            validHourBasis,
            entry.record_utc_offset_minutes
          ).hour
        : 0,
    };
  }
  // Fallback to account timezone — log for observability (Phase 4 tracking)
  log(
    'DEBUG',
    `[resolveHealthEntryDate] No per-record timezone metadata for type=${entry.type}, falling back to account timezone (${fallbackTimezone})`
  );
  return {
    parsedDate: instantToDay(basisDate, fallbackTimezone),
    entryTimestamp,
    entryHour: validHourBasis
      ? instantHourMinute(validHourBasis, fallbackTimezone).hour
      : 0,
  };
}
// Delete-then-insert idempotency for provider-sourced entries: groups the given
// entries by source, computes each source's [min,max] resolved-day range, and
// invokes deleteFn(userId, startDate, endDate, source). Shared by the exercise
// and nutrition pre-cleanup passes so a re-sync of a date range never duplicates
// rows; manual/web entries (no matching source) are left untouched.
async function preCleanEntriesBySourceAndDate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entries: any[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fallbackTimezone: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  label: string,
  deleteFn: (
    userId: unknown,
    startDate: string,
    endDate: string,
    source: string
  ) => Promise<unknown>
) {
  if (entries.length === 0) return;
  const daysBySource: Record<string, Set<string>> = {};
  for (const entry of entries) {
    const source = entry.source || 'manual';
    const resolved = resolveHealthEntryDate(entry, fallbackTimezone);
    if (!resolved) continue;
    (daysBySource[source] ??= new Set()).add(resolved.parsedDate);
  }
  for (const source of Object.keys(daysBySource)) {
    const days = [...daysBySource[source]].sort();
    if (days.length === 0) continue;
    const startDate = days[0];
    const endDate = days[days.length - 1];
    log(
      'info',
      `[processHealthData] Pre-cleanup: Deleting existing ${label} for source '${source}' from ${startDate} to ${endDate}.`
    );
    await deleteFn(userId, startDate, endDate, source);
  }
}

async function processHealthData(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  healthDataArray: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any
) {
  const tz = await loadUserTimezone(userId);
  const processedResults = [];
  const errors = [];
  const skipped = [];
  const tzMetadataByType = {};
  const tzFallbackByType = {};
  // Loaded at most once per batch and shared across every sleep session so we don't
  // re-query the user profile per record. Lazy so non-sleep syncs pay nothing.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sleepContext: { tz: string; userProfile: any } | undefined;
  const getSleepContext = async () => {
    if (!sleepContext) {
      sleepContext = {
        tz,
        userProfile: await userRepository.getUserProfile(userId),
      };
    }
    return sleepContext;
  };
  // 0. Pre-Cleanup (delete-then-insert idempotency) for exercise/workout sessions.
  // Sleep is intentionally excluded: a partial-window re-sync (e.g. only
  // post-midnight stages) must NOT wipe the previously-stored full night — sleep
  // ingest is merge-based via upsertSleepStageEvent ON CONFLICT + aggregate
  // recompute (issue #1180). Nutrition is also excluded: it upserts each entry by
  // (source, source_id) in its handler, so it needs no range-delete and can be
  // chunked freely by the client.
  await preCleanEntriesBySourceAndDate(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    healthDataArray.filter(
      (d: any) => d.type === 'ExerciseSession' || d.type === 'Workout'
    ),
    tz,
    userId,
    'exercise entries',
    exerciseEntryDb.deleteExerciseEntriesByEntrySourceAndDate
  );
  // Request-scoped dependencies for the handlers: categories are fetched at
  // most once per request (see createCategoryResolver).
  const batchContext = {
    userId,
    actingUserId,
    getSleepContext,
    processSleepEntry,
    resolveCategory: createCategoryResolver(),
  };
  const pendingBatches = new Map<HandleBatchFn, PreparedHealthEntry[]>();
  for (const dataEntry of healthDataArray) {
    const { value, type, date, timestamp } = dataEntry;
    // Check for required fields. Note: 'value' is not required for complex types like SleepSession, Stress, Workout.
    const complexTypes = [
      'SleepSession',
      'Stress',
      'ExerciseSession',
      'Workout',
      'Nutrition',
    ];
    const isComplexType = complexTypes.includes(type);
    if (
      (!isComplexType && (value === undefined || value === null)) ||
      !type ||
      (!date && !timestamp)
    ) {
      // Check for undefined/null value only for non-complex types
      errors.push({
        error:
          'Missing required fields: value (for scalar types), type, or date/timestamp in one of the entries',
        entry: dataEntry,
      });
      continue;
    }
    const resolved = resolveHealthEntryDate(dataEntry, tz);
    if (!resolved) {
      const dateToParse = date || dataEntry.entry_date || timestamp;
      log(
        'error',
        `Date/Timestamp parsing error: Invalid date '${dateToParse}'`
      );
      errors.push({
        error: `Invalid date/timestamp format for entry: ${JSON.stringify(dataEntry)}.`,
        entry: dataEntry,
      });
      continue;
    }
    // Track timezone metadata presence per type for observability
    const entryType = dataEntry.type || 'unknown';
    if (
      dataEntry.record_timezone ||
      (dataEntry.record_utc_offset_minutes !== null &&
        dataEntry.record_utc_offset_minutes !== undefined)
    ) {
      // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
      tzMetadataByType[entryType] = (tzMetadataByType[entryType] || 0) + 1;
    } else {
      // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
      tzFallbackByType[entryType] = (tzFallbackByType[entryType] || 0) + 1;
    }
    const parsedDate = resolved.parsedDate;
    const entryTimestamp = resolved.entryTimestamp;
    const entryHour = resolved.entryHour;
    // Dispatch to the type's handler (see healthDataHandlers.ts); types
    // without a dedicated handler are stored as custom measurements.
    const handler = resolveHandler(type) ?? customMeasurementHandler;
    // Batch-capable types are queued and flushed after the loop; handlers
    // sharing one handleBatch function share a write group.
    if (handler.handleBatch) {
      const group = pendingBatches.get(handler.handleBatch);
      const prepared = {
        entry: dataEntry,
        parsedDate,
        entryTimestamp,
        entryHour,
      };
      if (group) {
        group.push(prepared);
      } else {
        pendingBatches.set(handler.handleBatch, [prepared]);
      }
      continue;
    }
    try {
      const outcome = await handler.handle(dataEntry, {
        ...batchContext,
        parsedDate,
        entryTimestamp,
        entryHour,
      });
      if (outcome.status === 'success') {
        processedResults.push({ type, status: 'success', data: outcome.data });
      } else if (outcome.status === 'error') {
        errors.push({ error: outcome.error, entry: dataEntry });
      } else {
        skipped.push({ reason: outcome.reason, entry: dataEntry });
      }
    } catch (error) {
      log(
        'error',
        `Error processing health data entry ${JSON.stringify(dataEntry)}:`,
        error
      );
      errors.push({
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        error: `Failed to process entry: ${error.message}`,
        entry: dataEntry,
      });
    }
  }
  // Flush the queued batch groups: each group writes through one repository
  // transaction; outcomes come back aligned with the group's entries.
  for (const [handleBatch, group] of pendingBatches) {
    let outcomes;
    try {
      outcomes = await handleBatch(group, batchContext);
    } catch (error) {
      log('error', 'Error processing health data batch:', error);
      for (const prepared of group) {
        errors.push({
          // @ts-expect-error TS(2571): Object is of type 'unknown'.
          error: `Failed to process entry: ${error.message}`,
          entry: prepared.entry,
        });
      }
      continue;
    }
    for (let i = 0; i < group.length; i++) {
      const { entry } = group[i];
      const outcome = outcomes[i];
      if (!outcome) {
        errors.push({
          error: 'Failed to process entry: missing batch outcome',
          entry,
        });
      } else if (outcome.status === 'success') {
        processedResults.push({
          type: entry.type,
          status: 'success',
          data: outcome.data,
        });
      } else if (outcome.status === 'error') {
        errors.push({ error: outcome.error, entry });
      } else {
        skipped.push({ reason: outcome.reason, entry });
      }
    }
  }
  // Log timezone metadata coverage per type for observability
  const fallbackTypes = Object.keys(tzFallbackByType);
  if (fallbackTypes.length > 0) {
    const details = fallbackTypes
      // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
      .map((t) => `${t}=${tzFallbackByType[t]}`)
      .join(', ');
    log(
      'INFO',
      `[processHealthData] Timezone fallback to account tz (${tz}) by type: ${details}`
    );
  }
  const metadataTypes = Object.keys(tzMetadataByType);
  if (metadataTypes.length > 0) {
    const details = metadataTypes
      // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
      .map((t) => `${t}=${tzMetadataByType[t]}`)
      .join(', ');
    log(
      'DEBUG',
      `[processHealthData] Timezone metadata present by type: ${details}`
    );
  }
  // Per-record error contract: the request succeeded even if individual
  // records did not, so per-record failures are reported in the body rather
  // than thrown. `errors` and `skipped` are always present (possibly empty).
  return {
    message:
      errors.length > 0
        ? 'Some health data entries could not be processed.'
        : 'All health data successfully processed.',
    processed: processedResults,
    errors,
    skipped,
  };
}
// Helper function to get or create a custom category
async function getOrCreateCustomCategory(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  categoryName: any,
  dataType = 'numeric',
  measurementType = 'N/A'
) {
  const displayName = HEALTH_TYPE_DISPLAY_NAMES[categoryName as string];
  // Try to get existing category
  const existingCategories =
    await measurementRepository.getCustomCategories(userId);
  const category = existingCategories.find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (cat: any) => cat.name === categoryName
  );
  if (category) {
    // Backfill a friendly display_name for health-derived categories created
    // before labels existed (e.g. the HRV category first added by Fitbit/Google).
    if (displayName && !category.display_name) {
      await measurementRepository.updateCustomCategory(
        category.id,
        userId,
        actingUserId,
        { display_name: displayName }
      );
      return { ...category, display_name: displayName };
    }
    return category;
  } else {
    // Create new category if it doesn't exist
    const newCategoryData = {
      user_id: userId,
      created_by_user_id: actingUserId, // Use actingUserId for audit
      name: categoryName,
      display_name: displayName ?? null,
      measurement_type: measurementType, // Default to numeric for Health Connect data
      frequency: 'Daily', // Default frequency, can be refined later if needed
      data_type: dataType, // Default to numeric for new categories from health data
    };
    const newCategory =
      await measurementRepository.createCustomCategory(newCategoryData);
    // To return the full category object including the id and the default data_type
    return { id: newCategory.id, ...newCategoryData };
  }
}
async function getWaterIntake(
  authenticatedUserId: string,
  targetUserId: string,
  date: string
) {
  try {
    const waterData = await measurementRepository.getWaterIntakeByDate(
      targetUserId,
      date
    );
    // waterData will be { water_ml: SUM(...) } from the new repository logic
    return waterData || { water_ml: 0 };
  } catch (error) {
    log(
      'error',
      `Error fetching water intake for user ${targetUserId} on ${date} by ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}
async function upsertWaterIntake(
  authenticatedUserId: string,
  actingUserId: string,
  entryDate: string,
  changeDrinks: number,
  containerId: number | null
) {
  try {
    // 1. Get current MANUAL water intake for the day to avoid mixing with syncs
    const currentManualRecord =
      await measurementRepository.getWaterIntakeByDate(
        authenticatedUserId,
        entryDate,
        // @ts-expect-error TS(2345): Argument of type '"manual"' is not assignable to p... Remove this comment to see the full error message
        'manual'
      );
    const currentManualMl = currentManualRecord
      ? Number(currentManualRecord.water_ml)
      : 0;
    // 2. Determine amount per drink based on container
    let amountPerDrink;
    let containerName: string | null = null;
    if (containerId) {
      const container = await waterContainerRepository.getWaterContainerById(
        containerId,
        authenticatedUserId
      );
      if (container) {
        amountPerDrink =
          Number(container.volume) / Number(container.servings_per_container);
        containerName = container.name || null;
      } else {
        // Fallback to default if container not found
        log(
          'warn',
          `Container with ID ${containerId} not found for user ${authenticatedUserId}. Using default amount per drink.`
        );
        amountPerDrink = 2000 / 8; // Default: 2000ml / 8 servings
        containerId = null; // Reset to null so we don't violate FK constraints
      }
    } else {
      // Use default amount per drink if no container ID is provided
      amountPerDrink = 2000 / 8; // Default: 2000ml / 8 servings
    }
    // 5. Log individual drink(s) into water_intake_entries.
    if (changeDrinks > 0) {
      // 5a. Additions: insert new log entries and update daily total
      const newManualTotalWaterMl = Math.max(
        0,
        currentManualMl + changeDrinks * amountPerDrink
      );
      await measurementRepository.upsertWaterData(
        authenticatedUserId,
        actingUserId,
        newManualTotalWaterMl,
        entryDate,
        'manual'
      );
      for (let i = 0; i < changeDrinks; i++) {
        await measurementRepository.insertWaterIntakeLog(
          authenticatedUserId,
          actingUserId,
          entryDate,
          amountPerDrink,
          containerId || null,
          containerName,
          'manual'
        );
      }
    } else if (changeDrinks < 0) {
      // 5b. Decrements: delete the most recent log entries and subtract
      // their *actual* water_ml from the daily total. This avoids drift
      // when log rows were recorded with different containers.
      const logEntries = await measurementRepository.getWaterIntakeLogByDate(
        authenticatedUserId,
        entryDate
      );
      const entriesToRemove = Math.min(
        Math.abs(changeDrinks),
        logEntries.length
      );
      let actualMlRemoved = 0;
      for (let i = 0; i < entriesToRemove; i++) {
        const entry = logEntries[i];
        if (entry) {
          actualMlRemoved += Number(entry.water_ml);
          await measurementRepository.deleteWaterIntakeLog(
            entry.id,
            authenticatedUserId
          );
        }
      }
      const newManualTotalWaterMl = Math.max(
        0,
        currentManualMl - actualMlRemoved
      );
      await measurementRepository.upsertWaterData(
        authenticatedUserId,
        actingUserId,
        newManualTotalWaterMl,
        entryDate,
        'manual'
      );
    }
    // Return the latest record after the upsert
    const finalRecord = await measurementRepository.getWaterIntakeByDate(
      authenticatedUserId,
      entryDate,
      // @ts-expect-error TS(2345): Argument of type '"manual"' is not assignable to p... Remove this comment to see the full error message
      'manual'
    );
    return finalRecord;
  } catch (error) {
    log(
      'error',
      `Error upserting water intake for user ${authenticatedUserId} by ${actingUserId}:`,
      error
    );
    throw error;
  }
}
// Logs a raw ml amount into the itemized water_intake_entries log AND keeps the
// aggregated water_intake row (the daily total read by the dashboard) in sync.
// Used by callers that log a plain amount rather than a container-based drink
// count (e.g. the AI chat log_water tool), mirroring how upsertWaterIntake keeps
// both tables reconciled for the manual "+" button.
async function logWaterIntakeAmount(
  authenticatedUserId: string,
  actingUserId: string,
  entryDate: string,
  waterMl: number,
  source = 'manual'
) {
  try {
    // 1. Insert the itemized log entry.
    const logEntry = await measurementRepository.insertWaterIntakeLog(
      authenticatedUserId,
      actingUserId,
      entryDate,
      waterMl,
      null,
      null,
      source
    );
    // 2. Add the amount to the aggregated daily total for this source so the
    //    dashboard (which SUMs water_intake) reflects the logged water.
    const currentRecord = await measurementRepository.getWaterIntakeByDate(
      authenticatedUserId,
      entryDate,
      // @ts-expect-error TS(2345): source narrows the aggregate lookup to this source
      source
    );
    const currentMl = currentRecord ? Number(currentRecord.water_ml) : 0;
    await measurementRepository.upsertWaterData(
      authenticatedUserId,
      actingUserId,
      Math.max(0, currentMl + waterMl),
      entryDate,
      source
    );
    return logEntry;
  } catch (error) {
    log(
      'error',
      `Error logging water intake amount for user ${authenticatedUserId} by ${actingUserId}:`,
      error
    );
    throw error;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getWaterIntakeEntryById(authenticatedUserId: any, id: any) {
  try {
    const entryOwnerId = await measurementRepository.getWaterIntakeEntryOwnerId(
      id,
      authenticatedUserId
    );
    if (!entryOwnerId) {
      throw new Error('Water intake entry not found.');
    }
    const entry = await measurementRepository.getWaterIntakeEntryById(
      id,
      authenticatedUserId
    );
    return entry;
  } catch (error) {
    log(
      'error',
      `Error fetching water intake entry ${id} by ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}
async function updateWaterIntake(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  id: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateData: any
) {
  try {
    const entryOwnerId = await measurementRepository.getWaterIntakeEntryOwnerId(
      id,
      authenticatedUserId
    );
    if (!entryOwnerId) {
      throw new Error('Water intake entry not found.');
    }
    if (entryOwnerId !== authenticatedUserId) {
      throw new Error(
        'Forbidden: You do not have permission to update this water intake entry.'
      );
    }
    const updatedEntry = await measurementRepository.updateWaterIntake(
      id,
      authenticatedUserId,
      actingUserId,
      updateData
    );
    if (!updatedEntry) {
      throw new Error(
        'Water intake entry not found or not authorized to update.'
      );
    }
    return updatedEntry;
  } catch (error) {
    log(
      'error',
      `Error updating water intake entry ${id} by ${authenticatedUserId} on behalf of ${actingUserId}:`,
      error
    );
    throw error;
  }
}
async function deleteWaterIntake(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  id: any
) {
  try {
    const entryOwnerId = await measurementRepository.getWaterIntakeEntryOwnerId(
      id,
      authenticatedUserId
    );
    if (!entryOwnerId) {
      throw new Error('Water intake entry not found.');
    }
    if (entryOwnerId !== authenticatedUserId) {
      throw new Error(
        'Forbidden: You do not have permission to delete this water intake entry.'
      );
    }
    const success = await measurementRepository.deleteWaterIntake(
      id,
      authenticatedUserId
    );
    if (!success) {
      throw new Error('Water intake entry not found.');
    }
    return { message: 'Water intake entry deleted successfully.' };
  } catch (error) {
    log(
      'error',
      `Error deleting water intake entry ${id} by ${authenticatedUserId} on behalf of ${actingUserId}:`,
      error
    );
    throw error;
  }
}
async function upsertCheckInMeasurements(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entryDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  measurements: any
) {
  try {
    const result = await measurementRepository.upsertCheckInMeasurements(
      authenticatedUserId,
      actingUserId,
      entryDate,
      measurements
    );
    return result;
  } catch (error) {
    log(
      'error',
      `Error upserting check-in measurements for user ${authenticatedUserId} by ${actingUserId}:`,
      error
    );
    throw error;
  }
}
async function getCheckInMeasurements(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  targetUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  date: any
) {
  try {
    const row =
      await measurementRepository.getLatestCheckInMeasurementsOnOrBeforeDate(
        targetUserId,
        date
      );
    return row || {};
  } catch (error) {
    log(
      'error',
      `Error fetching check-in measurements for user ${targetUserId} on ${date} by ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}
async function getLatestCheckInMeasurementsOnOrBeforeDate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  targetUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  date: any
) {
  try {
    const measurement =
      await measurementRepository.getLatestCheckInMeasurementsOnOrBeforeDate(
        targetUserId,
        date
      );
    return measurement || null;
  } catch (error) {
    log(
      'error',
      `Error fetching latest check-in measurements on or before ${date} for user ${targetUserId} by ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}
async function updateCheckInMeasurements(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entryDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateData: any
) {
  log(
    'info',
    `[measurementService] updateCheckInMeasurements called with: authenticatedUserId=${authenticatedUserId}, actingUserId=${actingUserId}, entryDate=${entryDate}, updateData=`,
    updateData
  );
  try {
    // Verify ownership using entry_date and user_id
    const existingMeasurement =
      await measurementRepository.getCheckInMeasurementsByDate(
        authenticatedUserId,
        entryDate
      );
    if (!existingMeasurement) {
      log(
        'warn',
        `[measurementService] Check-in measurement not found for user ${authenticatedUserId} on date: ${entryDate}`
      );
      throw new Error('Check-in measurement not found.');
    }
    const updatedMeasurement =
      await measurementRepository.updateCheckInMeasurements(
        authenticatedUserId,
        actingUserId,
        entryDate,
        updateData
      );
    if (!updatedMeasurement) {
      log(
        'warn',
        `[measurementService] Check-in measurement not found or not authorized to update after repository call for user ${authenticatedUserId} on date: ${entryDate}`
      );
      throw new Error(
        'Check-in measurement not found or not authorized to update.'
      );
    }
    log(
      'info',
      `[measurementService] Successfully updated check-in measurement for user ${authenticatedUserId} on date: ${entryDate}`
    );
    return updatedMeasurement;
  } catch (error) {
    log(
      'error',
      `[measurementService] Error updating check-in measurements for user ${authenticatedUserId} on date ${entryDate}:`,
      error
    );
    throw error;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteCheckInMeasurements(authenticatedUserId: any, id: any) {
  try {
    // deleteCheckInMeasurements is scoped by user_id, so it already enforces
    // both existence and ownership; no separate owner pre-check is needed.
    const success = await measurementRepository.deleteCheckInMeasurements(
      id,
      authenticatedUserId
    );
    if (!success) {
      throw new Error('Check-in measurement not found.');
    }
    return { message: 'Check-in measurement deleted successfully.' };
  } catch (error) {
    log(
      'error',
      `Error deleting check-in measurements ${id} by ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}
async function getCustomCategories(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  targetUserId: any
) {
  try {
    let finalUserId = authenticatedUserId;
    if (targetUserId && targetUserId !== authenticatedUserId) {
      finalUserId = targetUserId;
    }
    const categories =
      await measurementRepository.getCustomCategories(finalUserId);
    return categories;
  } catch (error) {
    log(
      'error',
      `Error fetching custom categories for user ${targetUserId} by ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}
async function createCustomCategory(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  categoryData: any
) {
  try {
    categoryData.user_id = authenticatedUserId; // Ensure user_id is set from authenticated user
    categoryData.created_by_user_id = actingUserId; // Use actingUserId for audit
    const newCategory =
      await measurementRepository.createCustomCategory(categoryData);
    return newCategory;
  } catch (error) {
    log(
      'error',
      `Error creating custom category for user ${authenticatedUserId} by ${actingUserId}:`,
      error
    );
    throw error;
  }
}
async function updateCustomCategory(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  id: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateData: any
) {
  try {
    const categoryOwnerId =
      await measurementRepository.getCustomCategoryOwnerId(
        id,
        authenticatedUserId
      );
    if (!categoryOwnerId) {
      throw new Error('Custom category not found.');
    }
    if (categoryOwnerId !== authenticatedUserId) {
      throw new Error(
        'Forbidden: You do not have permission to update this custom category.'
      );
    }
    // Ensure `authenticatedUserId` is passed as `updatedByUserId` to the repository
    const updatedCategory = await measurementRepository.updateCustomCategory(
      id,
      authenticatedUserId,
      authenticatedUserId,
      updateData
    );
    if (!updatedCategory) {
      throw new Error('Custom category not found or not authorized to update.');
    }
    return updatedCategory;
  } catch (error) {
    log(
      'error',
      `Error updating custom category ${id} by ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteCustomCategory(authenticatedUserId: any, id: any) {
  try {
    const categoryOwnerId =
      await measurementRepository.getCustomCategoryOwnerId(
        id,
        authenticatedUserId
      ); // Pass authenticatedUserId
    if (!categoryOwnerId) {
      throw new Error('Custom category not found.');
    }
    if (categoryOwnerId !== authenticatedUserId) {
      throw new Error(
        'Forbidden: You do not have permission to delete this custom category.'
      );
    }
    const success = await measurementRepository.deleteCustomCategory(
      id,
      authenticatedUserId
    );
    if (!success) {
      throw new Error('Custom category not found.');
    }
    return { message: 'Custom category deleted successfully.' };
  } catch (error) {
    log(
      'error',
      `Error deleting custom category ${id} by ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}
async function getCustomMeasurementEntries(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  limit: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  orderBy: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filterObj: any
) {
  // Renamed 'filter' to 'filterObj' for clarity
  try {
    // The targetUserId is implicitly the authenticatedUserId for this endpoint
    const entries = await measurementRepository.getCustomMeasurementEntries(
      authenticatedUserId,
      limit,
      orderBy,
      filterObj
    ); // Pass filterObj
    return entries;
  } catch (error) {
    log(
      'error',
      `Error fetching custom measurement entries for user ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}
async function getCustomMeasurementEntriesByDate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  targetUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  date: any
) {
  try {
    const entries =
      await measurementRepository.getCustomMeasurementEntriesByDate(
        targetUserId,
        date
      );
    return entries;
  } catch (error) {
    log(
      'error',
      `Error fetching custom measurement entries for user ${targetUserId} on ${date} by ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}
async function getCheckInMeasurementsByDateRange(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  startDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  endDate: any
) {
  try {
    const measurements =
      await measurementRepository.getCheckInMeasurementsByDateRange(
        userId,
        startDate,
        endDate
      );
    return measurements;
  } catch (error) {
    log(
      'error',
      `Error fetching check-in measurements for user ${userId} from ${startDate} to ${endDate} by ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}
async function getCustomMeasurementsByDateRange(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  categoryId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  startDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  endDate: any
) {
  try {
    const measurements =
      await measurementRepository.getCustomMeasurementsByDateRange(
        userId,
        categoryId,
        startDate,
        endDate
      );
    return measurements;
  } catch (error) {
    log(
      'error',
      `Error fetching custom measurements for user ${userId}, category ${categoryId} from ${startDate} to ${endDate} by ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}
async function calculateSleepScore(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sleepEntryData: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stageEvents: any,
  age = null
) {
  const { duration_in_seconds, time_asleep_in_seconds } = sleepEntryData;
  if (!duration_in_seconds || duration_in_seconds <= 0) return 0;
  let score = 0;
  const maxScore = 100;
  // Define optimal ranges based on age and gender
  let optimalMinDuration = 7 * 3600; // Default 7 hours
  let optimalMaxDuration = 9 * 3600; // Default 9 hours
  let optimalDeepMin = 15; // Default 15%
  let optimalDeepMax = 25; // Default 25%
  const optimalRemMin = 20; // Default 20%
  const optimalRemMax = 25; // Default 25%
  // Adjust optimal sleep duration based on age
  if (age !== null) {
    if (age >= 65) {
      // Older adults
      optimalMinDuration = 7 * 3600;
      optimalMaxDuration = 8 * 3600;
    } else if (age >= 18 && age <= 64) {
      // Adults
      optimalMinDuration = 7 * 3600;
      optimalMaxDuration = 9 * 3600;
    } else if (age >= 14 && age <= 17) {
      // Teenagers
      optimalMinDuration = 8 * 3600;
      optimalMaxDuration = 10 * 3600;
    }
    // Add more age groups as needed
  }
  // Component 1: Total Sleep Duration (TST) - 30% of score
  const tstWeight = 30;
  if (
    duration_in_seconds >= optimalMinDuration &&
    duration_in_seconds <= optimalMaxDuration
  ) {
    score += tstWeight;
  } else {
    // Deduct points for being outside optimal range
    const deviation = Math.min(
      Math.abs(duration_in_seconds - optimalMinDuration),
      Math.abs(duration_in_seconds - optimalMaxDuration)
    );
    score += Math.max(0, tstWeight - (deviation / 3600) * 5); // 5 points deduction per hour deviation
  }
  // Component 2: Sleep Efficiency - 25% of score
  const sleepEfficiency = (time_asleep_in_seconds / duration_in_seconds) * 100;
  const optimalEfficiency = 85; // 85%
  const efficiencyWeight = 25;
  if (sleepEfficiency >= optimalEfficiency) {
    score += efficiencyWeight;
  } else {
    score += Math.max(
      0,
      efficiencyWeight - (optimalEfficiency - sleepEfficiency) * 1
    ); // 1 point deduction per % below optimal
  }
  // Component 3: Sleep Stage Distribution (Deep & REM) - 30% of score (15% each)
  let deepSleepDuration = 0;
  let remSleepDuration = 0;
  let awakeDuration = 0;
  let numAwakePeriods = 0;
  if (stageEvents && stageEvents.length > 0) {
    let inAwakePeriod = false;
    for (const event of stageEvents) {
      if (event.stage_type === 'deep') {
        deepSleepDuration += event.duration_in_seconds;
      } else if (event.stage_type === 'rem') {
        remSleepDuration += event.duration_in_seconds;
      } else if (event.stage_type === 'awake') {
        awakeDuration += event.duration_in_seconds;
        if (!inAwakePeriod) {
          numAwakePeriods++;
          inAwakePeriod = true;
        }
      } else {
        inAwakePeriod = false;
      }
    }
  }
  const totalSleepStagesDuration =
    deepSleepDuration +
    remSleepDuration +
    (time_asleep_in_seconds - awakeDuration);
  if (totalSleepStagesDuration > 0) {
    const deepSleepPercentage =
      (deepSleepDuration / totalSleepStagesDuration) * 100;
    const remSleepPercentage =
      (remSleepDuration / totalSleepStagesDuration) * 100;
    // Adjust optimal deep and REM sleep percentages based on age/gender if needed
    // For simplicity, using general guidelines here. More specific adjustments can be added.
    if (age !== null) {
      if (age >= 65) {
        // Older adults might have less deep sleep
        optimalDeepMin = 10;
        optimalDeepMax = 20;
      }
    }
    // Deep Sleep Score (15%)
    const deepWeight = 15;
    if (
      deepSleepPercentage >= optimalDeepMin &&
      deepSleepPercentage <= optimalDeepMax
    ) {
      score += deepWeight;
    } else {
      const deviation = Math.min(
        Math.abs(deepSleepPercentage - optimalDeepMin),
        Math.abs(deepSleepPercentage - optimalDeepMax)
      );
      score += Math.max(0, deepWeight - deviation * 0.5); // 0.5 point deduction per % deviation
    }
    // REM Sleep Score (15%)
    const remWeight = 15;
    if (
      remSleepPercentage >= optimalRemMin &&
      remSleepPercentage <= optimalRemMax
    ) {
      score += remWeight;
    } else {
      const deviation = Math.min(
        Math.abs(remSleepPercentage - optimalRemMin),
        Math.abs(remSleepPercentage - optimalRemMax)
      );
      score += Math.max(0, remWeight - deviation * 0.5); // 0.5 point deduction per % deviation
    }
  }
  // Component 4: Disturbances (Awake Time/Periods) - 15% of score
  const disturbanceWeight = 15;
  let disturbanceDeduction = 0;
  // Deduct for total awake time
  disturbanceDeduction += (awakeDuration / 60) * 0.5; // 0.5 points deduction per minute awake
  // Deduct for number of awake periods
  disturbanceDeduction += numAwakePeriods * 2; // 2 points deduction per awake period
  score += Math.max(0, disturbanceWeight - disturbanceDeduction);
  // Ensure score is within 0-100 range
  return Math.round(Math.max(0, Math.min(score, maxScore)));
}
// "Time asleep" is the sum of the genuinely-asleep stages only: deep + light + rem.
// It excludes 'awake', and also 'in_bed' and 'unknown' — the in-bed envelope still
// counts toward `duration` (so efficiency = time_asleep / duration stays meaningful)
// but must not inflate asleep time. Overlap across sources is resolved on the mobile
// client before upload, so a plain sum over the stored stages does not double-count.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sumAsleepSeconds(stages: any[]): number {
  if (!Array.isArray(stages)) return 0;
  return stages.reduce((sum, stage) => {
    if (
      stage.stage_type === 'deep' ||
      stage.stage_type === 'light' ||
      stage.stage_type === 'rem'
    ) {
      return sum + (Math.round(Number(stage.duration_in_seconds)) || 0);
    }
    return sum;
  }, 0);
}
async function processSleepEntry(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sleepEntryData: any,
  // Batch callers pass an already-loaded profile + timezone to skip a per-session
  // DB round-trip; single-entry callers omit it and load directly below.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prefetched?: { tz: string; userProfile: any }
) {
  log(
    'debug',
    `[processSleepEntry] Received sleepEntryData: ${JSON.stringify(sleepEntryData)}`
  );
  try {
    const originalHadStages =
      Array.isArray(sleepEntryData.stage_events) &&
      sleepEntryData.stage_events.length > 0;
    let stage_events = sleepEntryData.stage_events;
    const {
      stage_events: _stage_events,
      entry_date,
      bedtime,
      wake_time,
      duration_in_seconds,
      time_asleep_in_seconds: _time_asleep_in_seconds,
      source,
      sleep_score: _incomingSleepScore,
      deep_sleep_seconds,
      light_sleep_seconds,
      rem_sleep_seconds,
      awake_sleep_seconds,
      ...rest
    } = sleepEntryData;
    // If no stage events are provided, create a default "light sleep" stage. We do NOT
    // run overlap-delete in this path — the synthetic default would wipe legitimate
    // pre-existing stages stored from earlier real syncs.
    if (!stage_events || stage_events.length === 0) {
      log(
        'info',
        `No sleep stage events provided for entry on ${entry_date}. Creating default 'light' sleep stage.`
      );
      stage_events = [
        {
          stage_type: 'light',
          start_time: bedtime,
          end_time: wake_time,
          duration_in_seconds: duration_in_seconds,
        },
      ];
    }
    // Transient time-asleep to seed the first upsert + score; the recompute below
    // overwrites it from the durable merged stages. Excludes awake/in_bed/unknown.
    const timeAsleepInSeconds = sumAsleepSeconds(stage_events);
    // User profile (age/gender) + timezone, reusing prefetched values when present.
    const userProfile = prefetched
      ? prefetched.userProfile
      : await userRepository.getUserProfile(userId);
    const tz = prefetched ? prefetched.tz : await loadUserTimezone(userId);
    const age = userProfile?.date_of_birth
      ? userAge(userProfile.date_of_birth, tz)
      : null;
    const gender = userProfile?.gender || null;
    const sleepScore = await calculateSleepScore(
      { duration_in_seconds, time_asleep_in_seconds: timeAsleepInSeconds },
      stage_events,
      age,
      // @ts-expect-error TS(2554): Expected 2-3 arguments, but got 4.
      gender
    );
    const entryToUpsert = {
      entry_date: entry_date,
      bedtime: new Date(bedtime),
      wake_time: new Date(wake_time),
      duration_in_seconds: Math.round(Number(duration_in_seconds)) || 0,
      time_asleep_in_seconds: Math.round(Number(timeAsleepInSeconds)) || 0,
      sleep_score: Number(sleepScore) || 0, // Sleep score is numeric, so decimals are allowed, but usually integer
      source: source,
      deep_sleep_seconds: Math.round(Number(deep_sleep_seconds)) || 0,
      light_sleep_seconds: Math.round(Number(light_sleep_seconds)) || 0,
      rem_sleep_seconds: Math.round(Number(rem_sleep_seconds)) || 0,
      awake_sleep_seconds: Math.round(Number(awake_sleep_seconds)) || 0,
      ...rest, // Include any other properties
    };
    log(
      'debug',
      '[processSleepEntry] entryToUpsert before upsert:',
      entryToUpsert
    );
    // Pass actingUserId to upsertSleepEntry
    const newSleepEntry = await sleepRepository.upsertSleepEntry(
      userId,
      actingUserId,
      entryToUpsert
    );
    if (originalHadStages && stage_events && stage_events.length > 0) {
      // Stages merge by natural key (entry_id, start_time, end_time) inside one
      // repository transaction so partial-window cleanup and reinserts are atomic.
      await sleepRepository.mergeSleepStageEvents(
        userId,
        newSleepEntry.id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        stage_events.map((stageEvent: any) => ({
          ...stageEvent,
          duration_in_seconds:
            Math.round(Number(stageEvent.duration_in_seconds)) || 0,
        })),
        actingUserId
      );
    }
    // Recompute sleep_entries aggregates from the stored stage rows so they reflect the
    // durable merged state. For summary-only retries with no incoming stage data, preserve
    // any previously stored detailed stages instead of layering a synthetic full-night
    // fallback on top of them. If no stages exist at all, seed a single fallback stage.
    let mergedStages = await sleepRepository.getSleepStageEventsByEntryId(
      userId,
      newSleepEntry.id
    );
    if (
      !originalHadStages &&
      mergedStages.length === 0 &&
      stage_events.length > 0
    ) {
      await sleepRepository.mergeSleepStageEvents(
        userId,
        newSleepEntry.id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        stage_events.map((stageEvent: any) => ({
          ...stageEvent,
          duration_in_seconds:
            Math.round(Number(stageEvent.duration_in_seconds)) || 0,
        })),
        actingUserId
      );
      mergedStages = await sleepRepository.getSleepStageEventsByEntryId(
        userId,
        newSleepEntry.id
      );
    } else if (!originalHadStages && mergedStages.length > 0) {
      log(
        'info',
        `[processSleepEntry] Preserving ${mergedStages.length} existing stage events for entry ${newSleepEntry.id} because the payload had no authoritative stage data.`
      );
    }
    const recomputed = recomputeSleepAggregatesFromStages(mergedStages);
    const recomputedSleepScore = await calculateSleepScore(
      {
        duration_in_seconds: recomputed.duration_in_seconds,
        time_asleep_in_seconds: recomputed.time_asleep_in_seconds,
      },
      mergedStages,
      age,
      // @ts-expect-error TS(2554): Expected 2-3 arguments, but got 4.
      gender
    );
    await sleepRepository.updateSleepEntryAggregates(
      userId,
      newSleepEntry.id,
      actingUserId,
      {
        ...recomputed,
        sleep_score: Number(recomputedSleepScore) || 0,
      }
    );
    return {
      ...newSleepEntry,
      ...recomputed,
      sleep_score: Number(recomputedSleepScore) || 0,
    };
  } catch (error) {
    log('error', `Error in processSleepEntry for user ${userId}:`, error);
    throw error;
  }
}

// Pure aggregate derivation from a stage list. The stored stages are already a
// non-overlapping timeline (mobile resolves cross-source overlap before upload), so the
// per-stage buckets and `duration` are plain min/max/sum. `time_asleep` counts only the
// asleep stages (deep/light/rem) via sumAsleepSeconds; `duration` still spans the full
// in-bed envelope so efficiency = time_asleep / duration stays meaningful.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function recomputeSleepAggregatesFromStages(stages: any[]) {
  if (!stages || stages.length === 0) {
    return {
      bedtime: null,
      wake_time: null,
      duration_in_seconds: 0,
      time_asleep_in_seconds: 0,
      deep_sleep_seconds: 0,
      light_sleep_seconds: 0,
      rem_sleep_seconds: 0,
      awake_sleep_seconds: 0,
    };
  }
  let minStart = new Date(stages[0].start_time).getTime();
  let maxEnd = new Date(stages[0].end_time).getTime();
  let deep = 0;
  let light = 0;
  let rem = 0;
  let awake = 0;
  for (const s of stages) {
    const startMs = new Date(s.start_time).getTime();
    const endMs = new Date(s.end_time).getTime();
    if (startMs < minStart) minStart = startMs;
    if (endMs > maxEnd) maxEnd = endMs;
    const duration = Math.round(Number(s.duration_in_seconds)) || 0;
    switch (s.stage_type) {
      case 'deep':
        deep += duration;
        break;
      case 'light':
        light += duration;
        break;
      case 'rem':
        rem += duration;
        break;
      case 'awake':
        awake += duration;
        break;
      default:
        // in_bed / unknown: bounds the envelope (min/max above) but is NOT asleep time.
        break;
    }
  }
  const durationInSeconds = Math.max(0, Math.round((maxEnd - minStart) / 1000));
  const timeAsleep = sumAsleepSeconds(stages);
  return {
    bedtime: new Date(minStart),
    wake_time: new Date(maxEnd),
    duration_in_seconds: durationInSeconds,
    time_asleep_in_seconds: timeAsleep,
    deep_sleep_seconds: deep,
    light_sleep_seconds: light,
    rem_sleep_seconds: rem,
    awake_sleep_seconds: awake,
  };
}
async function updateSleepEntry(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entryId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateData: any
) {
  try {
    const {
      stage_events,
      bedtime,
      wake_time,
      duration_in_seconds,
      entry_date,
      ...entryDetails
    } = updateData;
    // Web edit path: derive time asleep the same way as sync (excludes awake/in_bed/
    // unknown) so editing a synced entry never re-inflates it with the in-bed envelope.
    const timeAsleepInSeconds = sumAsleepSeconds(stage_events);
    // Fetch user profile to get age and gender
    const userProfile = await userRepository.getUserProfile(userId);
    const tz = await loadUserTimezone(userId);
    const age = userProfile?.date_of_birth
      ? userAge(userProfile.date_of_birth, tz)
      : null;
    const gender = userProfile?.gender || null;
    const sleepScore = await calculateSleepScore(
      { duration_in_seconds, time_asleep_in_seconds: timeAsleepInSeconds },
      stage_events,
      age,
      // @ts-expect-error TS(2554): Expected 2-3 arguments, but got 4.
      gender
    );
    const updatedEntryDetails = {
      ...entryDetails,
      entry_date: entry_date, // Trust the passed entry_date
      bedtime: bedtime ? new Date(bedtime) : undefined,
      wake_time: wake_time ? new Date(wake_time) : undefined,
      duration_in_seconds: duration_in_seconds,
      time_asleep_in_seconds: timeAsleepInSeconds, // Populate time_asleep_in_seconds
      sleep_score: sleepScore, // Always use the calculated sleepScore
    };
    log(
      'debug',
      '[updateSleepEntry] updatedEntryDetails before update:',
      updatedEntryDetails
    );
    // Update the main sleep entry details
    // Pass actingUserId provided in the arguments
    const updatedEntry = await sleepRepository.updateSleepEntry(
      userId,
      entryId,
      actingUserId,
      updatedEntryDetails
    );
    // Handle stage events if provided
    if (stage_events !== undefined) {
      // First, delete all existing stage events for this sleep entry
      await sleepRepository.deleteSleepStageEventsByEntryId(userId, entryId);
      // Then, insert the new stage events
      if (stage_events.length > 0) {
        for (const stageEvent of stage_events) {
          await sleepRepository.upsertSleepStageEvent(
            userId,
            entryId,
            stageEvent,
            actingUserId
          );
        }
      }
    }
    return updatedEntry;
  } catch (error) {
    log(
      'error',
      `Error in updateSleepEntry for user ${userId}, entry ${entryId}:`,
      error
    );
    throw error;
  }
}
async function upsertCustomMeasurementEntry(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any
) {
  try {
    const {
      category_id,
      value,
      entry_date,
      entry_hour,
      entry_timestamp,
      notes,
      source = 'manual',
    } = payload;
    // Fetch category details to get the frequency
    const categories =
      await measurementRepository.getCustomCategories(authenticatedUserId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const category = categories.find((cat: any) => cat.id === category_id);
    if (!category) {
      throw new Error(`Custom category with ID ${category_id} not found.`);
    }
    const result = await measurementRepository.upsertCustomMeasurement(
      authenticatedUserId,
      actingUserId,
      category_id,
      value,
      entry_date,
      entry_hour,
      entry_timestamp,
      notes,
      category.frequency, // Pass the frequency to the repository
      source // Pass the source to the repository
    );
    return result;
  } catch (error) {
    log(
      'error',
      `Error upserting custom measurement entry for user ${authenticatedUserId} by ${actingUserId}:`,
      error
    );
    throw error;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteCustomMeasurementEntry(authenticatedUserId: any, id: any) {
  try {
    const entryOwnerId =
      await measurementRepository.getCustomMeasurementOwnerId(
        id,
        authenticatedUserId
      );
    if (!entryOwnerId) {
      throw new Error('Custom measurement entry not found.');
    }
    if (entryOwnerId !== authenticatedUserId) {
      throw new Error(
        'Forbidden: You do not have permission to delete this custom measurement entry.'
      );
    }
    const success = await measurementRepository.deleteCustomMeasurement(
      id,
      authenticatedUserId
    );
    if (!success) {
      throw new Error('Custom measurement entry not found.');
    }
    return { message: 'Custom measurement entry deleted successfully.' };
  } catch (error) {
    log(
      'error',
      `Error deleting custom measurement entry ${id} by ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getMostRecentMeasurement(userId: any, measurementType: any) {
  try {
    const measurement = await measurementRepository.getMostRecentMeasurement(
      userId,
      measurementType
    );
    return measurement;
  } catch (error) {
    log(
      'error',
      `Error fetching most recent ${measurementType} for user ${userId}:`,
      error
    );
    throw error;
  }
}
export const getSleepEntriesByUserIdAndDateRange =
  sleepRepository.getSleepEntriesByUserIdAndDateRange;
export const deleteSleepEntry = sleepRepository.deleteSleepEntry;
export { processHealthData };
export { getWaterIntake };
export { upsertWaterIntake };
export { logWaterIntakeAmount };
export { getWaterIntakeEntryById };
export { updateWaterIntake };
export { deleteWaterIntake };
export { upsertCheckInMeasurements };
export { getCheckInMeasurements };
export { getLatestCheckInMeasurementsOnOrBeforeDate };
export { updateCheckInMeasurements };
export { deleteCheckInMeasurements };
export { getCustomCategories };
export { createCustomCategory };
export { updateCustomCategory };
export { deleteCustomCategory };
export { getCustomMeasurementEntries };
export { getCustomMeasurementEntriesByDate };
export { getCheckInMeasurementsByDateRange };
export { getCustomMeasurementsByDateRange };
export { calculateSleepScore };
export { upsertCustomMeasurementEntry };
export { deleteCustomMeasurementEntry };
export { getMostRecentMeasurement };
export { processSleepEntry };
export { updateSleepEntry };
export { getOrCreateCustomCategory };
export { resolveHealthEntryDate };

// ── Water Intake Entries service functions ───────────────────────────────

async function getWaterIntakeLog(
  authenticatedUserId: string,
  targetUserId: string,
  date: string
) {
  try {
    const logEntries = await measurementRepository.getWaterIntakeLogByDate(
      targetUserId,
      date
    );
    return logEntries || [];
  } catch (error) {
    log(
      'error',
      `Error fetching water intake log for user ${targetUserId} on ${date} by ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}

async function deleteWaterIntakeLogEntry(
  authenticatedUserId: string,
  actingUserId: string,
  logId: string
) {
  try {
    // 1. Verify ownership
    const ownerId = await measurementRepository.getWaterIntakeLogEntryOwnerId(
      logId,
      authenticatedUserId
    );
    if (!ownerId) {
      throw new Error('Water intake log entry not found.');
    }
    if (ownerId !== authenticatedUserId) {
      throw new Error(
        'Forbidden: You do not have permission to delete this water intake log entry.'
      );
    }

    // 2. Delete the log entry and get the ml amount + date + source
    const deleted = await measurementRepository.deleteWaterIntakeLog(
      logId,
      authenticatedUserId
    );
    if (!deleted) {
      throw new Error('Water intake log entry not found.');
    }

    // 3. Subtract the deleted amount from the daily total
    const currentRecord = await measurementRepository.getWaterIntakeByDate(
      authenticatedUserId,
      deleted.entry_date,
      deleted.source || 'manual'
    );
    if (currentRecord) {
      const currentMl = Number(currentRecord.water_ml);
      const newTotalMl = Math.max(0, currentMl - Number(deleted.water_ml));
      await measurementRepository.upsertWaterData(
        authenticatedUserId,
        actingUserId,
        newTotalMl,
        deleted.entry_date,
        deleted.source || 'manual'
      );
    }

    return { message: 'Water intake log entry deleted successfully.' };
  } catch (error) {
    log(
      'error',
      `Error deleting water intake log entry ${logId} by ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}

export { getWaterIntakeLog };
export { deleteWaterIntakeLogEntry };

async function updateWaterIntakeLogTime(
  logId: string,
  loggedAt: string,
  authenticatedUserId: string
) {
  const ownerId = await measurementRepository.getWaterIntakeLogEntryOwnerId(
    logId,
    authenticatedUserId
  );
  if (!ownerId) {
    throw new Error('Water intake log entry not found or access denied');
  }
  const updated = await measurementRepository.updateWaterIntakeLogTime(
    logId,
    authenticatedUserId,
    loggedAt
  );
  return updated;
}

export { updateWaterIntakeLogTime };

export default {
  processHealthData,
  getWaterIntake,
  upsertWaterIntake,
  logWaterIntakeAmount,
  getWaterIntakeEntryById,
  updateWaterIntake,
  deleteWaterIntake,
  getWaterIntakeLog,
  deleteWaterIntakeLogEntry,
  updateWaterIntakeLogTime,
  upsertCheckInMeasurements,
  getCheckInMeasurements,
  getLatestCheckInMeasurementsOnOrBeforeDate,
  updateCheckInMeasurements,
  deleteCheckInMeasurements,
  getCustomCategories,
  createCustomCategory,
  updateCustomCategory,
  deleteCustomCategory,
  getCustomMeasurementEntries,
  getCustomMeasurementEntriesByDate,
  getCheckInMeasurementsByDateRange,
  getCustomMeasurementsByDateRange,
  calculateSleepScore,
  upsertCustomMeasurementEntry,
  deleteCustomMeasurementEntry,
  getMostRecentMeasurement,
  processSleepEntry,
  updateSleepEntry,
  getSleepEntriesByUserIdAndDateRange,
  deleteSleepEntry,
  getOrCreateCustomCategory,
  resolveHealthEntryDate,
};
