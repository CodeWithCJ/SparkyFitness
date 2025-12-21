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

async function endFast(id, userId, endTime, durationMinutes, startTime) {
    const client = await getClient(userId);
    try {
        // Build dynamic SET clause so we can optionally update start_time
        const setParts = [];
        const values = [];
        let idx = 1;

        setParts.push(`end_time = $${idx++}`); values.push(endTime);
        setParts.push(`duration_minutes = $${idx++}`); values.push(durationMinutes);
        // Note: mood_entry_id and weight_at_end removed from fasting_logs by design
        if (startTime !== undefined && startTime !== null) {
            setParts.push(`start_time = $${idx++}`); values.push(startTime);
        }
        setParts.push(`status = 'COMPLETED'`);
        setParts.push(`updated_at = NOW()`);

        const whereIdPos = idx++;
        const whereUserPos = idx++;
        const query = `UPDATE fasting_logs SET ${setParts.join(', ')} WHERE id = $${whereIdPos} AND user_id = $${whereUserPos} RETURNING *`;
        values.push(id, userId);

        const result = await client.query(query, values);
        return result.rows[0];
    } finally {
        client.release();
    }
}

async function getFastingById(id, userId) {
    const client = await getClient(userId);
    try {
        const result = await client.query(
            `SELECT * FROM fasting_logs WHERE id = $1 AND user_id = $2 LIMIT 1`,
            [id, userId]
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
            `SELECT fl.*
       FROM fasting_logs fl
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
        // Interpret startDate/endDate as dates (YYYY-MM-DD) and include any fast
        // that started or ended on those dates, or that overlaps the range.
        const result = await client.query(
            `SELECT * FROM fasting_logs
             WHERE user_id = $1
               AND status = 'COMPLETED'
               AND (
                    (start_time::date BETWEEN $2::date AND $3::date)
                    OR (end_time::date BETWEEN $2::date AND $3::date)
                    OR (start_time < ($3::date + INTERVAL '1 day') AND end_time >= $2::date)
               )
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
    getFastingById,
    getCurrentFast,
    getFastingHistory,
    updateFast,
    getFastingStats,
    getFastingLogsByDateRange,
};
