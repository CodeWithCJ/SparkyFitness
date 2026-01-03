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

// Allowlist of fields that can be dynamically updated in updateJobStatus
const ALLOWED_UPDATE_FIELDS = ['error_message', 'started_at', 'completed_at'];

/**
 * Update job status with optional additional fields
 * @param {string} userId - User ID
 * @param {string} jobId - Job ID
 * @param {string} status - New status
 * @param {Object} additionalFields - Additional fields to update (must be in allowlist)
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
      // Validate field name against allowlist to prevent SQL injection
      if (!ALLOWED_UPDATE_FIELDS.includes(key)) {
        log('warn', `Attempted to update non-allowed field: ${key}`);
        continue;
      }
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
 * @param {string} userId - User ID
 * @param {string} jobId - Job ID
 * @param {Object} progressData - Progress data including current_stage
 */
async function updateJobProgress(userId, jobId, progressData) {
  const client = await getClient(userId);
  try {
    const {
      current_chunk_start,
      current_chunk_end,
      chunks_completed,
      last_successful_date,
      current_stage
    } = progressData;

    const result = await client.query(
      `UPDATE garmin_sync_jobs SET
         current_chunk_start = $3,
         current_chunk_end = $4,
         chunks_completed = $5,
         last_successful_date = $6,
         current_stage = $7,
         updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [jobId, userId, current_chunk_start, current_chunk_end, chunks_completed, last_successful_date, current_stage || null]
    );

    return result.rows[0];
  } finally {
    client.release();
  }
}

/**
 * Update just the current stage (lightweight update for frequent status changes)
 * @param {string} userId - User ID
 * @param {string} jobId - Job ID
 * @param {string} stage - Current stage description
 */
async function updateJobStage(userId, jobId, stage) {
  const client = await getClient(userId);
  try {
    await client.query(
      `UPDATE garmin_sync_jobs SET
         current_stage = $3,
         updated_at = NOW()
       WHERE id = $1 AND user_id = $2`,
      [jobId, userId, stage]
    );
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
 * Delete old completed/failed/cancelled jobs to prevent table bloat
 * Keeps jobs from the last 30 days by default
 * @param {string} userId - User ID
 * @param {number} retentionDays - Number of days to retain jobs (default: 30)
 * @returns {Promise<number>} Number of jobs deleted
 */
async function cleanupOldJobs(userId, retentionDays = 30) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `DELETE FROM garmin_sync_jobs
       WHERE user_id = $1
       AND status IN ('completed', 'failed', 'cancelled')
       AND created_at < NOW() - INTERVAL '1 day' * $2
       RETURNING id`,
      [userId, retentionDays]
    );

    if (result.rows.length > 0) {
      log('info', `Cleaned up ${result.rows.length} old Garmin sync jobs for user ${userId}`);
    }

    return result.rows.length;
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
  updateJobStage,
  addFailedChunk,
  cleanupOldJobs
};
