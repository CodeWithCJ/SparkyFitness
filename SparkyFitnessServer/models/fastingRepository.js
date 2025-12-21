const { getClient } = require('../db/poolManager');

async function createFastingLog(userId, startTime, targetEndTime, fastingType) {
    const client = await getClient(userId);
    try {
        const result = await client.query(
            `INSERT INTO fasting_logs (user_id, start_time, target_end_time, fasting_type, status)
       VALUES ($1, $2, $3, $4, 'ACTIVE')
       RETURNING id, user_id, start_time, target_end_time, fasting_type, status, created_at, updated_at`,
            [userId, startTime, targetEndTime, fastingType]
        );
        return result.rows[0];
    } finally {
        client.release();
    }
}

async function endFast(id, userId, endTime, durationMinutes, moodEntryId, weightAtEnd) {
    const client = await getClient(userId);
    try {
        const result = await client.query(
            `UPDATE fasting_logs
         SET end_time = $3,
             duration_minutes = $4,
             mood_entry_id = $5,
             weight_at_end = $6,
             status = 'COMPLETED',
             updated_at = NOW()
         WHERE id = $1 AND user_id = $2
         RETURNING *`,
            [id, userId, endTime, durationMinutes, moodEntryId, weightAtEnd]
        );
        return result.rows[0];
    } finally {
        client.release();
    }
}

async function getCurrentFast(userId) {
    const client = await getClient(userId);
    try {
        console.log(`[Repo] getCurrentFast checking for userId: ${userId}`);
        const result = await client.query(
            `SELECT * FROM fasting_logs
       WHERE user_id = $1 AND status = 'ACTIVE'
       ORDER BY start_time DESC
       LIMIT 1`,
            [userId]
        );
        console.log(`[Repo] getCurrentFast result count: ${result.rowCount}`);
        if (result.rowCount > 0) {
            console.log(`[Repo] Found active fast: ${result.rows[0].id}`);
        }
        return result.rows[0];
    } finally {
        client.release();
    }
}


async function getFastingHistory(userId, limit = 50, offset = 0) {
    const client = await getClient(userId);
    try {
        console.log(`[Repo] getFastingHistory checking for userId: ${userId}`);
        const result = await client.query(
            `SELECT fl.*, me.mood_value, me.notes as mood_notes
       FROM fasting_logs fl
       LEFT JOIN mood_entries me ON fl.mood_entry_id = me.id
       WHERE fl.user_id = $1
       ORDER BY fl.start_time DESC
       LIMIT $2 OFFSET $3`,
            [userId, limit, offset]
        );
        console.log(`[Repo] getFastingHistory result count: ${result.rowCount}`);
        return result.rows;
    } finally {
        client.release();
    }
}
async function updateFast(id, userId, updates) {
    const client = await getClient(userId);
    try {
        const { start_time, target_end_time, end_time, duration_minutes, status, fasting_type } = updates;
        //Build dynamic update query
        let query = 'UPDATE fasting_logs SET updated_at = NOW()';
        const values = [];
        let paramIndex = 1;

        if (start_time !== undefined) { query += `, start_time = $${paramIndex++}`; values.push(start_time); }
        if (target_end_time !== undefined) { query += `, target_end_time = $${paramIndex++}`; values.push(target_end_time); }
        if (end_time !== undefined) { query += `, end_time = $${paramIndex++}`; values.push(end_time); }
        if (duration_minutes !== undefined) { query += `, duration_minutes = $${paramIndex++}`; values.push(duration_minutes); }
        if (status !== undefined) { query += `, status = $${paramIndex++}`; values.push(status); }
        if (fasting_type !== undefined) { query += `, fasting_type = $${paramIndex++}`; values.push(fasting_type); }

        query += ` WHERE id = $${paramIndex++} AND user_id = $${paramIndex++} RETURNING *`;
        values.push(id, userId);

        const result = await client.query(query, values);
        return result.rows[0];
    } finally {
        client.release();
    }
}

async function getFastingStats(userId) {
    const client = await getClient(userId);
    try {
        // Example stats: Total completed fasts, total hours fasted, current streak (simplified)
        const result = await client.query(`
            SELECT
                COUNT(*) FILTER (WHERE status = 'COMPLETED') as total_completed_fasts,
                SUM(duration_minutes) FILTER (WHERE status = 'COMPLETED') as total_minutes_fasted,
                AVG(duration_minutes) FILTER (WHERE status = 'COMPLETED') as average_duration_minutes
            FROM fasting_logs
            WHERE user_id = $1
        `, [userId]);
        return result.rows[0];
    } finally {
        client.release();
    }
}


// Get fasting logs within a date range (inclusive). Returns completed fasts only.
async function getFastingLogsByDateRange(userId, startDate, endDate) {
    const client = await getClient(userId);
    try {
        const result = await client.query(
            `SELECT * FROM fasting_logs
             WHERE user_id = $1
               AND status = 'COMPLETED'
               AND start_time >= $2
               AND end_time <= $3
             ORDER BY start_time DESC`,
            [userId, startDate, endDate]
        );
        return result.rows;
    } finally {
        client.release();
    }
}

module.exports = {
    createFastingLog,
    endFast,
    getCurrentFast,
    getFastingHistory,
    updateFast,
    getFastingStats,
    getFastingLogsByDateRange,
};
