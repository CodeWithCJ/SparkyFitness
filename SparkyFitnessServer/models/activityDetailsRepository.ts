import { getClient } from '../db/poolManager.js';
import { log } from '../config/logging.js';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createActivityDetail(userId: any, detail: any) {
  const client = await getClient(userId);
  const {
    exercise_entry_id,
    exercise_preset_entry_id, // New parameter
    provider_name,
    detail_type,
    detail_data,
    created_by_user_id,
    updated_by_user_id,
  } = detail;
  let processedDetailData;
  if (typeof detail_data === 'string') {
    try {
      processedDetailData = JSON.parse(detail_data);
    } catch {
      processedDetailData = JSON.stringify(detail_data);
    }
  } else {
    processedDetailData = detail_data;
  }
  const query = `
        INSERT INTO exercise_entry_activity_details (
            exercise_entry_id,
            exercise_preset_entry_id,
            provider_name,
            detail_type,
            detail_data,
            created_by_user_id,
            updated_by_user_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *;
    `;
  const values = [
    exercise_entry_id,
    exercise_preset_entry_id,
    provider_name,
    detail_type,
    processedDetailData,
    created_by_user_id,
    updated_by_user_id,
  ];
  try {
    const result = await client.query(query, values);
    log(
      'debug',
      `[activityDetailsRepository] Successfully created activity detail in DB for entry ID: ${exercise_entry_id || exercise_preset_entry_id}, detail_type: ${detail_type}`
    );
    return result.rows[0];
  } catch (error) {
    log(
      'error',
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      `Failed to create activity detail for entry ID ${exercise_entry_id || exercise_preset_entry_id}: ${error.message}`,
      { query, values, error }
    );
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    throw new Error(`Failed to create activity detail: ${error.message}`, {
      cause: error,
    });
  } finally {
    client.release();
  }
}
async function getActivityDetailsByEntryOrPresetId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  entryId = null,
  presetEntryId = null
) {
  const client = await getClient(userId);
  let query;
  let values;
  if (entryId && presetEntryId) {
    throw new Error(
      'Cannot query activity details by both entryId and presetEntryId simultaneously.',
      { cause: { entryId, presetEntryId } }
    );
  }
  if (entryId) {
    query = `
            SELECT eead.*
            FROM exercise_entry_activity_details eead
            WHERE eead.exercise_entry_id = $1
              AND eead.created_by_user_id = $2;
        `;
    values = [entryId, userId];
  } else if (presetEntryId) {
    query = `
            SELECT eead.*
            FROM exercise_entry_activity_details eead
            WHERE eead.exercise_preset_entry_id = $1
              AND eead.created_by_user_id = $2;
        `;
    values = [presetEntryId, userId];
  } else {
    throw new Error('Either entryId or presetEntryId must be provided.');
  }
  try {
    const result = await client.query(query, values);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return result.rows.map((row: any) => {
      // Recursively parse detail_data until it's not a JSON string anymore.
      // This handles cases where data might be double-stringified.
      while (typeof row.detail_data === 'string') {
        try {
          row.detail_data = JSON.parse(row.detail_data);
        } catch {
          // If parsing fails, it's just a plain string, so we break the loop.
          break;
        }
      }
      return row;
    });
  } catch (error) {
    log(
      'error',
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      `Failed to get activity details for entryId ${entryId} or presetEntryId ${presetEntryId}: ${error.message}`,
      { error }
    );
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    throw new Error(`Failed to get activity details: ${error.message}`, {
      cause: error,
    });
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateActivityDetail(userId: any, id: any, detail: any) {
  const client = await getClient(userId);
  const { provider_name, detail_type, detail_data, updated_by_user_id } =
    detail;
  const query = `
        UPDATE exercise_entry_activity_details
        SET
            provider_name = $1,
            detail_type = $2,
            detail_data = $3,
            updated_by_user_id = $4,
            updated_at = NOW()
        WHERE id = $5
          AND (exercise_entry_id IN (SELECT id FROM exercise_entries WHERE user_id = $6)
               OR exercise_preset_entry_id IN (SELECT id FROM exercise_preset_entries WHERE user_id = $6))
        RETURNING *;
    `;
  const values = [
    provider_name,
    detail_type,
    (() => {
      if (typeof detail_data === 'string') {
        try {
          return JSON.parse(detail_data);
        } catch {
          return JSON.stringify(detail_data);
        }
      }
      return detail_data;
    })(),
    updated_by_user_id,
    id,
    userId,
  ];
  try {
    const result = await client.query(query, values);
    if (result.rowCount === 0) {
      throw new Error('Activity detail not found or not authorized to update.');
    }
    log('debug', 'Successfully updated activity detail in DB', {
      result: result.rows[0],
    });
    return result.rows[0];
  } catch (error) {
    log(
      'error',
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      `Failed to update activity detail for id ${id}: ${error.message}`,
      { query, values, error }
    );
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    throw new Error(`Failed to update activity detail: ${error.message}`, {
      cause: error,
    });
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteActivityDetail(userId: any, id: any) {
  const client = await getClient(userId);
  const query = `
        DELETE FROM exercise_entry_activity_details
        WHERE id = $1
          AND (exercise_entry_id IN (SELECT id FROM exercise_entries WHERE user_id = $2)
               OR exercise_preset_entry_id IN (SELECT id FROM exercise_preset_entries WHERE user_id = $2));
    `;
  try {
    const result = await client.query(query, [id, userId]);
    if (result.rowCount === 0) {
      throw new Error('Activity detail not found or not authorized to delete.');
    }
    log('debug', `Successfully deleted activity detail with id ${id}`);
    return { message: 'Activity detail deleted successfully.' };
  } catch (error) {
    log(
      'error',
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      `Failed to delete activity detail with id ${id}: ${error.message}`,
      { error }
    );
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    throw new Error(`Failed to delete activity detail: ${error.message}`, {
      cause: error,
    });
  } finally {
    client.release();
  }
}
async function deleteActivityDetailsByEntryIdAndProvider(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entryId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  providerName: any
) {
  const client = await getClient(userId);
  const query = `
        DELETE FROM exercise_entry_activity_details
        WHERE (exercise_entry_id = $1 OR exercise_preset_entry_id = $1)
          AND provider_name = $2
          AND (exercise_entry_id IN (SELECT id FROM exercise_entries WHERE user_id = $3)
               OR exercise_preset_entry_id IN (SELECT id FROM exercise_preset_entries WHERE user_id = $3));
    `;
  try {
    const result = await client.query(query, [entryId, providerName, userId]);
    log(
      'debug',
      `Successfully deleted ${result.rowCount} activity details for entry ID ${entryId} and provider ${providerName}.`
    );
    return {
      message: `${result.rowCount} activity details deleted successfully.`,
    };
  } catch (error) {
    log(
      'error',
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      `Failed to delete activity details for entry ID ${entryId} and provider ${providerName}: ${error.message}`,
      { error }
    );
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    throw new Error(`Failed to delete activity details: ${error.message}`, {
      cause: error,
    });
  } finally {
    client.release();
  }
}
export { createActivityDetail };
export { getActivityDetailsByEntryOrPresetId };
export { updateActivityDetail };
export { deleteActivityDetail };
export { deleteActivityDetailsByEntryIdAndProvider };
export default {
  createActivityDetail,
  getActivityDetailsByEntryOrPresetId,
  updateActivityDetail,
  deleteActivityDetail,
  deleteActivityDetailsByEntryIdAndProvider,
};
