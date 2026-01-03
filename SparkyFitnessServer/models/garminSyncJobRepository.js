const { getClient } = require('../db/poolManager');
const { log } = require('../config/logging');

/**
 * Create a new sync job
 */
async function createJob(userId, jobData) {
  const client = await getClient(userId);
  try {
    const {
      start_date,
      end_date,
      sync_type,
      metric_types,
      chunks_total,
      skip_existing = true
    } = jobData;

    const result = await client.query(
      `INSERT INTO garmin_sync_jobs
       (user_id, start_date, end_date, sync_type, metric_types, chunks_total, skip_existing, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
       RETURNING *`,
      [userId, start_date, end_date, sync_type, metric_types, chunks_total, skip_existing]
    );

    log('info', `Created Garmin sync job ${result.rows[0].id} for user ${userId} (skip_existing: ${skip_existing})`);
    return result.rows[0];
  } finally {
    client.release();
  }
}

/**
 * Get active job for user (pending or running)
 */
async function getActiveJob(userId) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT * FROM garmin_sync_jobs
       WHERE user_id = $1 AND status IN ('pending', 'running')
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

/**
 * Get job by ID
 */
async function getJobById(userId, jobId) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT * FROM garmin_sync_jobs WHERE id = $1 AND user_id = $2`,
      [jobId, userId]
    );
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

/**
 * Get most recent job for user (any status)
 */
async function getMostRecentJob(userId) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT * FROM garmin_sync_jobs
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

/**
 * Update job status
 */
async function updateJobStatus(userId, jobId, status, additionalFields = {}) {
  const client = await getClient(userId);
  try {
    const updates = ['status = $3', 'updated_at = NOW()'];
    const values = [jobId, userId, status];
    let paramIndex = 4;

    if (status === 'running' && !additionalFields.started_at) {
      updates.push(`started_at = NOW()`);
    }

    if (status === 'completed' || status === 'failed') {
      updates.push(`completed_at = NOW()`);
    }

    for (const [key, value] of Object.entries(additionalFields)) {
      updates.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }

    const result = await client.query(
      `UPDATE garmin_sync_jobs SET ${updates.join(', ')}
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      values
    );

    return result.rows[0];
  } finally {
    client.release();
  }
}

/**
 * Update job progress after processing a chunk
 */
async function updateJobProgress(userId, jobId, progressData) {
  const client = await getClient(userId);
  try {
    const {
      current_chunk_start,
      current_chunk_end,
      chunks_completed,
      last_successful_date
    } = progressData;

    const result = await client.query(
      `UPDATE garmin_sync_jobs SET
         current_chunk_start = $3,
         current_chunk_end = $4,
         chunks_completed = $5,
         last_successful_date = $6,
         updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [jobId, userId, current_chunk_start, current_chunk_end, chunks_completed, last_successful_date]
    );

    return result.rows[0];
  } finally {
    client.release();
  }
}

/**
 * Add a failed chunk to the job
 */
async function addFailedChunk(userId, jobId, chunkData) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `UPDATE garmin_sync_jobs SET
         failed_chunks = failed_chunks || $3::jsonb,
         updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [jobId, userId, JSON.stringify([chunkData])]
    );

    return result.rows[0];
  } finally {
    client.release();
  }
}

/**
 * Get jobs that need to be resumed (paused or running but stale)
 */
async function getResumableJobs(userId) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT * FROM garmin_sync_jobs
       WHERE user_id = $1
       AND status IN ('paused', 'running')
       AND updated_at < NOW() - INTERVAL '5 minutes'
       ORDER BY created_at DESC`,
      [userId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

module.exports = {
  createJob,
  getActiveJob,
  getJobById,
  getMostRecentJob,
  updateJobStatus,
  updateJobProgress,
  addFailedChunk,
  getResumableJobs
};
