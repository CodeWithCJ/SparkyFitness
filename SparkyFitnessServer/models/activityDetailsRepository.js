const { getClient } = require('../db/poolManager');
const { log } = require('../config/logging');

async function createActivityDetail(userId, detail) {
    const client = await getClient(userId);
    const {
        exercise_entry_id,
        provider_name,
        detail_type,
        detail_data,
        created_by_user_id,
        updated_by_user_id
    } = detail;

    const query = `
        INSERT INTO exercise_entry_activity_details (
            exercise_entry_id,
            provider_name,
            detail_type,
            detail_data,
            created_by_user_id,
            updated_by_user_id
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *;
    `;

    const values = [
        exercise_entry_id,
        provider_name,
        detail_type,
        JSON.stringify(detail_data), // Stringify here
        created_by_user_id,
        updated_by_user_id
    ];

    try {
        const result = await client.query(query, values);
        log('debug', 'Successfully created activity detail in DB', { result: result.rows[0] });
        return result.rows[0];
    } catch (error) {
        log('error', `Failed to create activity detail for exercise_entry_id ${exercise_entry_id}: ${error.message}`, { query, values, error });
        throw new Error(`Failed to create activity detail: ${error.message}`);
    } finally {
        client.release();
    }
}

async function getActivityDetailsByEntryId(userId, exerciseEntryId) {
    const client = await getClient(userId);
    const query = `
        SELECT eead.*
        FROM exercise_entry_activity_details eead
        JOIN exercise_entries ee ON eead.exercise_entry_id = ee.id
        WHERE eead.exercise_entry_id = $1 AND ee.user_id = $2;
    `;
    try {
        const result = await client.query(query, [exerciseEntryId, userId]);
        return result.rows;
    } catch (error) {
        log('error', `Failed to get activity details for exercise_entry_id ${exerciseEntryId}: ${error.message}`, { error });
        throw new Error(`Failed to get activity details: ${error.message}`);
    } finally {
        client.release();
    }
}

async function updateActivityDetail(userId, id, detail) {
    const client = await getClient(userId);
    const {
        provider_name,
        detail_type,
        detail_data,
        updated_by_user_id
    } = detail;

    const query = `
        UPDATE exercise_entry_activity_details
        SET
            provider_name = $1,
            detail_type = $2,
            detail_data = $3,
            updated_by_user_id = $4,
            updated_at = NOW()
        WHERE id = $5
          AND exercise_entry_id IN (SELECT id FROM exercise_entries WHERE user_id = $6)
        RETURNING *;
    `;

    const values = [
        provider_name,
        detail_type,
        JSON.stringify(detail_data), // Stringify here
        updated_by_user_id,
        id,
        userId
    ];

    try {
        const result = await client.query(query, values);
        if (result.rowCount === 0) {
            throw new Error('Activity detail not found or not authorized to update.');
        }
        log('debug', 'Successfully updated activity detail in DB', { result: result.rows[0] });
        return result.rows[0];
    } catch (error) {
        log('error', `Failed to update activity detail for id ${id}: ${error.message}`, { query, values, error });
        throw new Error(`Failed to update activity detail: ${error.message}`);
    } finally {
        client.release();
    }
}

async function deleteActivityDetail(userId, id) {
    const client = await getClient(userId);
    const query = `
        DELETE FROM exercise_entry_activity_details
        WHERE id = $1
          AND exercise_entry_id IN (SELECT id FROM exercise_entries WHERE user_id = $2);
    `;
    try {
        const result = await client.query(query, [id, userId]);
        if (result.rowCount === 0) {
            throw new Error('Activity detail not found or not authorized to delete.');
        }
        log('debug', `Successfully deleted activity detail with id ${id}`);
        return { message: 'Activity detail deleted successfully.' };
    } catch (error) {
        log('error', `Failed to delete activity detail with id ${id}: ${error.message}`, { error });
        throw new Error(`Failed to delete activity detail: ${error.message}`);
    } finally {
        client.release();
    }
}

module.exports = {
    createActivityDetail,
    getActivityDetailsByEntryId,
    updateActivityDetail,
    deleteActivityDetail
};