const { getClient } = require('../db/poolManager');
const { log } = require('../config/logging');

async function upsertSleepEntry(userId, actingUserId, sleepEntryData) {
    const client = await getClient(userId);
    try {
        await client.query('BEGIN');

        const {
            id, // Optional: if provided, attempt to update
            entry_date,
            bedtime,
            wake_time,
            duration_in_seconds,
            time_asleep_in_seconds,
            sleep_score,
            source
        } = sleepEntryData;

        let sleepEntryId;

        if (id) {
            // Attempt to update existing entry
            const updateQuery = `
                UPDATE sleep_entries
                SET
                    entry_date = $3,
                    bedtime = $4,
                    wake_time = $5,
                    duration_in_seconds = $6,
                    time_asleep_in_seconds = $7,
                    sleep_score = $8,
                    source = $9,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1 AND user_id = $2
                RETURNING id;
            `;
            const updateResult = await client.query(updateQuery, [
                id,
                userId,
                entry_date,
                bedtime,
                wake_time,
                duration_in_seconds,
                time_asleep_in_seconds,
                sleep_score,
                source
            ]);

            if (updateResult.rows.length > 0) {
                sleepEntryId = updateResult.rows[0].id;
                log('info', `Updated sleep entry ${sleepEntryId} for user ${userId}.`);
            } else {
                // If no row was updated, it means the ID didn't exist for this user, so insert
                const insertQuery = `
                    INSERT INTO sleep_entries (user_id, entry_date, bedtime, wake_time, duration_in_seconds, time_asleep_in_seconds, sleep_score, source)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    RETURNING id;
                `;
                const insertResult = await client.query(insertQuery, [
                    userId,
                    entry_date,
                    bedtime,
                    wake_time,
                    duration_in_seconds,
                    time_asleep_in_seconds,
                    sleep_score,
                    source
                ]);
                sleepEntryId = insertResult.rows[0].id;
                log('info', `Inserted new sleep entry ${sleepEntryId} for user ${userId}.`);
            }
        } else {
            // Insert new entry
            const insertQuery = `
                INSERT INTO sleep_entries (user_id, entry_date, bedtime, wake_time, duration_in_seconds, time_asleep_in_seconds, sleep_score, source)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING id;
            `;
            const insertResult = await client.query(insertQuery, [
                userId,
                entry_date,
                bedtime,
                wake_time,
                duration_in_seconds,
                time_asleep_in_seconds,
                sleep_score,
                source
            ]);
            sleepEntryId = insertResult.rows[0].id;
            log('info', `Inserted new sleep entry ${sleepEntryId} for user ${userId}.`);
        }

        await client.query('COMMIT');
        return { id: sleepEntryId, ...sleepEntryData };
    } catch (error) {
        await client.query('ROLLBACK');
        log('error', `Error upserting sleep entry for user ${userId}:`, error);
        throw error;
    } finally {
        client.release();
    }
}

async function upsertSleepStageEvent(userId, entryId, sleepStageEventData) {
    const client = await getClient(userId);
    try {
        await client.query('BEGIN');

        const {
            id, // Optional: if provided, attempt to update
            stage_type,
            start_time,
            end_time,
            duration_in_seconds
        } = sleepStageEventData;

        let sleepStageEventId;

        // Basic UUID validation
        const isUUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id);

        if (id && isUUID) {
            // Attempt to update existing event
            const updateQuery = `
                UPDATE sleep_entry_stages
                SET
                    stage_type = $4,
                    start_time = $5,
                    end_time = $6,
                    duration_in_seconds = $7,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1 AND entry_id = $2 AND user_id = $3
                RETURNING id;
            `;
            const updateResult = await client.query(updateQuery, [
                id,
                entryId,
                userId,
                stage_type,
                start_time,
                end_time,
                duration_in_seconds
            ]);

            if (updateResult.rows.length > 0) {
                sleepStageEventId = updateResult.rows[0].id;
                log('info', `Updated sleep stage event ${sleepStageEventId} for entry ${entryId}.`);
            } else {
                // If no row was updated, insert new event
                const insertQuery = `
                    INSERT INTO sleep_entry_stages (entry_id, user_id, stage_type, start_time, end_time, duration_in_seconds)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    RETURNING id;
                `;
                const insertResult = await client.query(insertQuery, [
                    entryId,
                    userId,
                    stage_type,
                    start_time,
                    end_time,
                    duration_in_seconds
                ]);
                sleepStageEventId = insertResult.rows[0].id;
                log('info', `Inserted new sleep stage event ${sleepStageEventId} for entry ${entryId}.`);
            }
        } else {
            // Insert new event, ignoring the invalid ID
            const insertQuery = `
                INSERT INTO sleep_entry_stages (entry_id, user_id, stage_type, start_time, end_time, duration_in_seconds)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING id;
            `;
            const insertResult = await client.query(insertQuery, [
                entryId,
                userId,
                stage_type,
                start_time,
                end_time,
                duration_in_seconds
            ]);
            sleepStageEventId = insertResult.rows[0].id;
            log('info', `Inserted new sleep stage event ${sleepStageEventId} for entry ${entryId} (ignoring invalid ID: ${id}).`);
        }

        await client.query('COMMIT');
        const { id: originalId, ...restOfData } = sleepStageEventData;
        return { id: sleepStageEventId, ...restOfData };
    } catch (error) {
        await client.query('ROLLBACK');
        log('error', `Error upserting sleep stage event for entry ${entryId}:`, error);
        throw error;
    } finally {
        client.release();
    }
}

async function getSleepEntriesByUserIdAndDateRange(userId, startDate, endDate) {
    const client = await getClient(userId);
    try {
        const query = `
            SELECT
                se.id,
                se.user_id,
                se.entry_date,
                se.bedtime,
                se.wake_time,
                se.duration_in_seconds,
                se.time_asleep_in_seconds,
                se.sleep_score,
                se.source,
                se.created_at,
                se.updated_at,
                json_agg(sse.* ORDER BY sse.start_time) AS stage_events
            FROM sleep_entries se
            LEFT JOIN sleep_entry_stages sse ON se.id = sse.entry_id
            WHERE se.user_id = $1 AND se.entry_date BETWEEN $2 AND $3
            GROUP BY se.id
            ORDER BY se.entry_date DESC;
        `;
        const result = await client.query(query, [userId, startDate, endDate]);
        return result.rows;
    } catch (error) {
        log('error', `Error fetching sleep entries for user ${userId} from ${startDate} to ${endDate}:`, error);
        throw error;
    } finally {
        client.release();
    }
}

async function getAggregatedSleepStageDataByDateRange(userId, startDate, endDate) {
    const client = await getClient(userId);
    try {
        const query = `
            SELECT
                se.entry_date,
                sse.stage_type,
                SUM(sse.duration_in_seconds) AS total_duration_in_seconds
            FROM sleep_entries se
            JOIN sleep_entry_stages sse ON se.id = sse.entry_id
            WHERE se.user_id = $1 AND se.entry_date BETWEEN $2 AND $3
            GROUP BY se.entry_date, sse.stage_type
            ORDER BY se.entry_date, sse.stage_type;
        `;
        const result = await client.query(query, [userId, startDate, endDate]);
        return result.rows;
    } catch (error) {
        log('error', `Error fetching aggregated sleep stage data for user ${userId} from ${startDate} to ${endDate}:`, error);
        throw error;
    } finally {
        client.release();
    }
}

async function updateSleepEntry(userId, entryId, updateData) {
    const client = await getClient(userId);
    try {
        await client.query('BEGIN');

        const {
            entry_date,
            bedtime,
            wake_time,
            duration_in_seconds,
            time_asleep_in_seconds,
            sleep_score,
            source,
            stage_events // Extract stage_events
        } = updateData;

        const updateFields = [];
        const updateValues = [];
        let paramIndex = 1;

        if (entry_date !== undefined) { updateFields.push(`entry_date = $${paramIndex++}`); updateValues.push(entry_date); }
        if (bedtime !== undefined) { updateFields.push(`bedtime = $${paramIndex++}`); updateValues.push(bedtime); }
        if (wake_time !== undefined) { updateFields.push(`wake_time = $${paramIndex++}`); updateValues.push(wake_time); }
        if (duration_in_seconds !== undefined) { updateFields.push(`duration_in_seconds = $${paramIndex++}`); updateValues.push(duration_in_seconds); }
        if (time_asleep_in_seconds !== undefined) { updateFields.push(`time_asleep_in_seconds = $${paramIndex++}`); updateValues.push(time_asleep_in_seconds); }
        if (sleep_score !== undefined) { updateFields.push(`sleep_score = $${paramIndex++}`); updateValues.push(sleep_score); }
        if (source !== undefined) { updateFields.push(`source = $${paramIndex++}`); updateValues.push(source); }

        updateFields.push(`updated_at = CURRENT_TIMESTAMP`);

        if (updateFields.length === 1 && updateFields[0].includes('updated_at') && !stage_events) { // Only updated_at, no other fields to update
            await client.query('COMMIT');
            return { id: entryId, message: "No specific fields to update for sleep entry." };
        }

        if (updateFields.length > 0) {
            const updateQuery = `
                UPDATE sleep_entries
                SET ${updateFields.join(', ')}
                WHERE id = $${paramIndex++} AND user_id = $${paramIndex++}
                RETURNING id;
            `;
            updateValues.push(entryId, userId);

            const result = await client.query(updateQuery, updateValues);

            if (result.rows.length === 0) {
                throw new Error(`Sleep entry with ID ${entryId} not found for user ${userId}.`);
            }
        }

        // Handle stage_events if provided
        if (stage_events && stage_events.length > 0) {
            // Delete existing stage events for this entry
            await client.query('DELETE FROM sleep_entry_stages WHERE entry_id = $1 AND user_id = $2', [entryId, userId]);

            // Insert new stage events
            const stageEventInsertQuery = `
                INSERT INTO sleep_entry_stages (entry_id, user_id, stage_type, start_time, end_time, duration_in_seconds)
                VALUES ($1, $2, $3, $4, $5, $6);
            `;
            for (const event of stage_events) {
                await client.query(stageEventInsertQuery, [
                    entryId,
                    userId,
                    event.stage_type,
                    event.start_time,
                    event.end_time,
                    event.duration_in_seconds
                ]);
            }
            log('info', `Updated sleep stage events for entry ${entryId}.`);
        } else if (stage_events && stage_events.length === 0) {
            // If an empty array is sent, it means all stage events should be deleted
            await client.query('DELETE FROM sleep_entry_stages WHERE entry_id = $1 AND user_id = $2', [entryId, userId]);
            log('info', `Deleted all sleep stage events for entry ${entryId} as an empty array was provided.`);
        }

        await client.query('COMMIT');
        return { id: entryId, ...updateData };
    } catch (error) {
        await client.query('ROLLBACK');
        log('error', `Error updating sleep entry ${entryId} for user ${userId}:`, error);
        throw error;
    } finally {
        client.release();
    }
}

async function deleteSleepStageEventsByEntryId(userId, entryId) {
    const client = await getClient(userId);
    try {
        await client.query('BEGIN');
        const query = `
            DELETE FROM sleep_entry_stages
            WHERE entry_id = $1 AND user_id = $2;
        `;
        await client.query(query, [entryId, userId]);
        await client.query('COMMIT');
        log('info', `Deleted all sleep stage events for entry ${entryId} for user ${userId}.`);
        return { message: `Deleted all sleep stage events for entry ${entryId} for user ${userId}.` };
    } catch (error) {
        await client.query('ROLLBACK');
        log('error', `Error deleting sleep stage events for entry ${entryId} for user ${userId}:`, error);
        throw error;
    } finally {
        client.release();
    }
}

async function deleteSleepEntriesByEntrySourceAndDate(userId, entrySource, startDate, endDate) {
    const client = await getClient(userId);
    try {
        await client.query('BEGIN');
        const query = `
            DELETE FROM sleep_entries
            WHERE user_id = $1 AND source = $2 AND entry_date BETWEEN $3 AND $4
            RETURNING id;
        `;
        log('debug', `[sleepRepository.deleteSleepEntriesByEntrySourceAndDate] Deletion query: ${query}`);
        log('debug', `[sleepRepository.deleteSleepEntriesByEntrySourceAndDate] Deletion parameters: userId=${userId}, entrySource=${entrySource}, startDate=${startDate}, endDate=${endDate}`);
        const result = await client.query(query, [userId, entrySource, startDate, endDate]);
        await client.query('COMMIT');
        log('info', `Deleted ${result.rows.length} sleep entries for user ${userId} from source ${entrySource} between ${startDate} and ${endDate}.`);
        return { message: `Deleted ${result.rows.length} sleep entries.` };
    } catch (error) {
        await client.query('ROLLBACK');
        log('error', `Error deleting sleep entries for user ${userId} from source ${entrySource} between ${startDate} and ${endDate}:`, error);
        throw error;
    } finally {
        client.release();
    }
}

module.exports = {
    upsertSleepEntry,
    upsertSleepStageEvent,
    getSleepEntriesByUserIdAndDateRange,
    updateSleepEntry,
    deleteSleepStageEventsByEntryId,
    deleteSleepEntry,
    getSleepEntriesWithStagesByUserIdAndDateRange,
    deleteSleepEntriesByEntrySourceAndDate,
};

async function getSleepEntriesWithStagesByUserIdAndDateRange(userId, startDate, endDate) {
    const client = await getClient(userId);
    try {
        const query = `
            SELECT
                se.id,
                se.user_id,
                se.entry_date,
                se.bedtime,
                se.wake_time,
                se.duration_in_seconds,
                se.time_asleep_in_seconds,
                se.sleep_score,
                se.source,
                se.created_at,
                se.updated_at,
                json_agg(
                    CASE
                        WHEN sse.id IS NOT NULL THEN json_build_object(
                            'id', sse.id,
                            'entry_id', sse.entry_id,
                            'user_id', sse.user_id,
                            'stage_type', sse.stage_type,
                            'start_time', sse.start_time,
                            'end_time', sse.end_time,
                            'duration_in_seconds', sse.duration_in_seconds,
                            'created_at', sse.created_at,
                            'updated_at', sse.updated_at
                        )
                        ELSE NULL
                    END
                ) FILTER (WHERE sse.id IS NOT NULL) AS stage_events
            FROM sleep_entries se
            LEFT JOIN sleep_entry_stages sse ON se.id = sse.entry_id
            WHERE se.user_id = $1 AND se.entry_date BETWEEN $2 AND $3
            GROUP BY se.id
            ORDER BY se.entry_date DESC;
        `;
        const result = await client.query(query, [userId, startDate, endDate]);
        return result.rows;
    } catch (error) {
        log('error', `Error fetching sleep entries with stages for user ${userId} from ${startDate} to ${endDate}:`, error);
        throw error;
    } finally {
        client.release();
    }
}

async function deleteSleepEntry(userId, entryId) {
    const client = await getClient(userId);
    try {
        await client.query('BEGIN');

        // First, delete associated sleep stage events
        await deleteSleepStageEventsByEntryId(userId, entryId);

        const deleteQuery = `
            DELETE FROM sleep_entries
            WHERE id = $1 AND user_id = $2
            RETURNING id;
        `;
        const result = await client.query(deleteQuery, [entryId, userId]);

        if (result.rows.length === 0) {
            throw new Error(`Sleep entry with ID ${entryId} not found for user ${userId}.`);
        }

        await client.query('COMMIT');
        log('info', `Deleted sleep entry ${entryId} for user ${userId}.`);
        return { message: `Sleep entry ${entryId} deleted successfully.` };
    } catch (error) {
        await client.query('ROLLBACK');
        log('error', `Error deleting sleep entry ${entryId} for user ${userId}:`, error);
        throw error;
    } finally {
        client.release();
    }
}