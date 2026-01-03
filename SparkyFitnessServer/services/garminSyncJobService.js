const garminSyncJobRepository = require('../models/garminSyncJobRepository');
const garminConnectService = require('../integrations/garminconnect/garminConnectService');
const garminService = require('./garminService');
const externalProviderRepository = require('../models/externalProviderRepository');
const { log } = require('../config/logging');
const moment = require('moment');
const { getClient } = require('../db/poolManager');

const CHUNK_SIZE_DAYS = 7; // Use smaller chunks to avoid API timeouts
const CHUNK_DELAY_MS = 1000; // Delay between chunks to avoid API rate limiting

// Track active job processing to prevent duplicates
const activeProcessing = new Map();

/**
 * Get all dates that have Garmin data within a date range (efficient single query)
 * Returns a Set of date strings (YYYY-MM-DD) for quick lookup
 * @param {string} userId - User ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Set<string>>} Set of dates with Garmin data
 */
async function getDatesWithGarminData(userId, startDate, endDate) {
  const client = await getClient(userId);
  try {
    // Get all unique dates with Garmin data from multiple tables
    const result = await client.query(`
      SELECT DISTINCT entry_date::date::text as date FROM (
        SELECT entry_date FROM exercise_entries
        WHERE user_id = $1 AND source = 'garmin'
        AND entry_date >= $2 AND entry_date <= $3
        UNION
        SELECT entry_date FROM sleep_entries
        WHERE user_id = $1 AND source = 'garmin'
        AND entry_date >= $2 AND entry_date <= $3
        UNION
        SELECT entry_date FROM exercise_preset_entries
        WHERE user_id = $1 AND source = 'garmin'
        AND entry_date >= $2 AND entry_date <= $3
      ) AS combined_dates
    `, [userId, startDate, endDate]);

    return new Set(result.rows.map(row => row.date));
  } finally {
    client.release();
  }
}

/**
 * Check which days in a chunk need syncing (don't have Garmin data yet)
 * @param {string} chunkStart - Chunk start date (YYYY-MM-DD)
 * @param {string} chunkEnd - Chunk end date (YYYY-MM-DD)
 * @param {Set<string>} existingDates - Set of dates that already have data
 * @returns {{ needsSync: boolean, missingDates: string[] }} Whether chunk needs sync and which dates are missing
 */
function checkChunkNeedsSync(chunkStart, chunkEnd, existingDates) {
  const missingDates = [];
  let current = moment(chunkStart);
  const end = moment(chunkEnd);

  while (current.isSameOrBefore(end)) {
    const dateStr = current.format('YYYY-MM-DD');
    if (!existingDates.has(dateStr)) {
      missingDates.push(dateStr);
    }
    current.add(1, 'day');
  }

  return {
    needsSync: missingDates.length > 0,
    missingDates
  };
}

/**
 * Calculate date chunks for processing a date range in smaller batches
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @param {number} chunkSizeDays - Number of days per chunk (default: 7)
 * @returns {Array<{start: string, end: string}>} Array of chunk date ranges
 */
function calculateChunks(startDate, endDate, chunkSizeDays = CHUNK_SIZE_DAYS) {
  const chunks = [];
  let currentStart = moment(startDate);
  const end = moment(endDate);

  let iteration = 0;
  const maxIterations = 1000; // Safety limit

  while (currentStart.isSameOrBefore(end)) {
    iteration++;
    if (iteration > maxIterations) {
      log('error', 'calculateChunks exceeded max iterations - possible infinite loop');
      break;
    }

    const chunkEnd = moment.min(
      moment(currentStart).add(chunkSizeDays - 1, 'days'),
      end
    );

    chunks.push({
      start: currentStart.format('YYYY-MM-DD'),
      end: chunkEnd.format('YYYY-MM-DD')
    });

    // Clone before mutating to avoid reference issues
    currentStart = moment(chunkEnd).add(1, 'day');
  }

  log('debug', `Calculated ${chunks.length} chunks for range ${startDate} to ${endDate}`);
  return chunks;
}

/**
 * Start an incremental sync from last successful sync date to today
 * @param {string} userId - User ID
 * @param {string[]|null} metricTypes - Optional array of metric types to sync
 * @returns {Promise<{status: string, jobId?: string, message: string, chunksTotal?: number}>}
 */
async function startIncrementalSync(userId, metricTypes = null) {
  // Check for existing active job
  const activeJob = await garminSyncJobRepository.getActiveJob(userId);
  if (activeJob) {
    return {
      status: 'already_running',
      jobId: activeJob.id,
      message: 'A sync job is already in progress'
    };
  }

  // Get last successful sync date from provider
  const provider = await externalProviderRepository.getGarminProvider(userId);
  if (!provider) {
    throw new Error('Garmin not connected. Please link your Garmin account first.');
  }

  const endDate = moment().format('YYYY-MM-DD');
  let startDate;

  if (provider.last_successful_sync_date) {
    // Start from day after last sync
    startDate = moment(provider.last_successful_sync_date).add(1, 'day').format('YYYY-MM-DD');
  } else {
    // No previous sync, default to last 7 days
    startDate = moment().subtract(7, 'days').format('YYYY-MM-DD');
  }

  // If start is after end, nothing to sync
  if (moment(startDate).isAfter(moment(endDate))) {
    return {
      status: 'up_to_date',
      message: 'Already synced up to today'
    };
  }

  const chunks = calculateChunks(startDate, endDate);

  const job = await garminSyncJobRepository.createJob(userId, {
    start_date: startDate,
    end_date: endDate,
    sync_type: 'incremental',
    metric_types: metricTypes,
    chunks_total: chunks.length,
    skip_existing: false // Incremental sync always fetches latest data
  });

  // Start processing in background (non-blocking)
  log('info', `Created incremental sync job ${job.id} - starting background processing`);
  setImmediate(() => processJob(userId, job.id));

  return {
    status: 'started',
    jobId: job.id,
    message: `Syncing from ${startDate} to ${endDate}`,
    chunksTotal: chunks.length
  };
}

/**
 * Start a historical sync with custom date range
 * @param {string} userId - User ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @param {string[]|null} metricTypes - Optional array of metric types to sync
 * @param {boolean} skipExisting - Skip dates that already have data (default: true)
 * @returns {Promise<{status: string, jobId?: string, chunksTotal?: number, estimatedMinutes?: number, message: string}>}
 */
async function startHistoricalSync(userId, startDate, endDate, metricTypes = null, skipExisting = true) {
  // Validate dates
  if (!startDate || !endDate) {
    throw new Error('startDate and endDate are required');
  }

  const start = moment(startDate);
  const end = moment(endDate);

  if (!start.isValid() || !end.isValid()) {
    throw new Error('Invalid date format. Use YYYY-MM-DD');
  }

  if (start.isAfter(end)) {
    throw new Error('startDate must be before endDate');
  }

  if (end.isAfter(moment())) {
    throw new Error('endDate cannot be in the future');
  }

  // Check for existing active job
  const activeJob = await garminSyncJobRepository.getActiveJob(userId);
  if (activeJob) {
    return {
      status: 'already_running',
      jobId: activeJob.id,
      message: 'A sync job is already in progress'
    };
  }

  // Verify Garmin is connected
  const provider = await externalProviderRepository.getGarminProvider(userId);
  if (!provider) {
    throw new Error('Garmin not connected. Please link your Garmin account first.');
  }

  const chunks = calculateChunks(startDate, endDate);
  const estimatedMinutes = Math.ceil(chunks.length * 0.5); // ~30 seconds per chunk

  log('info', `Creating historical sync job: ${startDate} to ${endDate}, ${chunks.length} chunks, skipExisting: ${skipExisting}`);

  const job = await garminSyncJobRepository.createJob(userId, {
    start_date: startDate,
    end_date: endDate,
    sync_type: 'historical',
    metric_types: metricTypes,
    chunks_total: chunks.length,
    skip_existing: skipExisting
  });

  // Start processing in background (non-blocking)
  log('info', `Created historical sync job ${job.id} - starting background processing (skipExisting: ${skipExisting})`);
  setImmediate(() => processJob(userId, job.id));

  return {
    status: 'started',
    jobId: job.id,
    chunksTotal: chunks.length,
    estimatedMinutes,
    message: `Starting historical sync from ${startDate} to ${endDate}`
  };
}

/**
 * Get current sync status for a user including active job details
 * @param {string} userId - User ID
 * @returns {Promise<{hasActiveJob: boolean, job: Object|null, lastSuccessfulSync: string|null}>}
 */
async function getJobStatus(userId) {
  const activeJob = await garminSyncJobRepository.getActiveJob(userId);
  const provider = await externalProviderRepository.getGarminProvider(userId);

  if (!activeJob) {
    return {
      hasActiveJob: false,
      job: null,
      lastSuccessfulSync: provider?.last_successful_sync_date || null
    };
  }

  const percentComplete = activeJob.chunks_total > 0
    ? Math.round((activeJob.chunks_completed / activeJob.chunks_total) * 100)
    : 0;

  let currentChunkRange = null;
  if (activeJob.current_chunk_start && activeJob.current_chunk_end) {
    const startFormatted = moment(activeJob.current_chunk_start).format('MMM YYYY');
    const endFormatted = moment(activeJob.current_chunk_end).format('MMM YYYY');
    currentChunkRange = startFormatted === endFormatted ? startFormatted : `${startFormatted} - ${endFormatted}`;
  }

  return {
    hasActiveJob: true,
    job: {
      id: activeJob.id,
      status: activeJob.status,
      syncType: activeJob.sync_type,
      startDate: activeJob.start_date,
      endDate: activeJob.end_date,
      chunksCompleted: activeJob.chunks_completed,
      chunksTotal: activeJob.chunks_total,
      percentComplete,
      currentChunkRange,
      currentStage: activeJob.current_stage || null,
      errorMessage: activeJob.error_message,
      failedChunks: activeJob.failed_chunks || [],
      createdAt: activeJob.created_at,
      startedAt: activeJob.started_at
    },
    lastSuccessfulSync: provider?.last_successful_sync_date || null
  };
}

/**
 * Resume a paused or failed sync job
 * @param {string} userId - User ID
 * @param {string} jobId - Job ID to resume
 * @returns {Promise<{status: string, jobId: string}>}
 * @throws {Error} If job not found or cannot be resumed
 */
async function resumeJob(userId, jobId) {
  const job = await garminSyncJobRepository.getJobById(userId, jobId);

  if (!job) {
    throw new Error('Job not found');
  }

  if (job.status !== 'paused' && job.status !== 'failed') {
    throw new Error(`Cannot resume job with status: ${job.status}`);
  }

  await garminSyncJobRepository.updateJobStatus(userId, jobId, 'running');

  // Start processing in background
  setImmediate(() => processJob(userId, jobId));

  return {
    status: 'resumed',
    jobId
  };
}

/**
 * Cancel an active, pending, or paused sync job
 * @param {string} userId - User ID
 * @param {string} jobId - Job ID to cancel
 * @returns {Promise<{status: string, jobId: string}>}
 * @throws {Error} If job not found or cannot be cancelled
 */
async function cancelJob(userId, jobId) {
  const job = await garminSyncJobRepository.getJobById(userId, jobId);

  if (!job) {
    throw new Error('Job not found');
  }

  if (job.status !== 'pending' && job.status !== 'running' && job.status !== 'paused') {
    throw new Error(`Cannot cancel job with status: ${job.status}`);
  }

  // Stop processing if active
  activeProcessing.delete(jobId);

  await garminSyncJobRepository.updateJobStatus(userId, jobId, 'cancelled');

  return {
    status: 'cancelled',
    jobId
  };
}

/**
 * Process a sync job (runs in background)
 * Uses both in-memory tracking and database status to prevent duplicate processing.
 * The database status is the source of truth for multi-instance scenarios.
 * @param {string} userId - User ID
 * @param {string} jobId - Job ID to process
 */
async function processJob(userId, jobId) {
  // In-memory check for single-instance duplicate prevention (fast path)
  if (activeProcessing.has(jobId)) {
    log('info', `Job ${jobId} is already being processed in this instance`);
    return;
  }

  // Mark as processing before any async operations
  activeProcessing.set(jobId, true);

  try {
    const job = await garminSyncJobRepository.getJobById(userId, jobId);
    if (!job) {
      log('error', `Job ${jobId} not found`);
      return;
    }

    // Database-level check: if already running, another process has it
    if (job.status === 'running') {
      log('info', `Job ${jobId} is already running (possibly in another instance)`);
      return;
    }

    if (job.status === 'cancelled' || job.status === 'completed') {
      log('info', `Job ${jobId} is ${job.status}, skipping`);
      return;
    }

    // Mark as running in database (acts as a distributed lock)
    await garminSyncJobRepository.updateJobStatus(userId, jobId, 'running');

    // Calculate remaining chunks
    const allChunks = calculateChunks(job.start_date, job.end_date);
    const startFromDate = job.last_successful_date
      ? moment(job.last_successful_date).add(1, 'day')
      : moment(job.start_date);

    const remainingChunks = allChunks.filter(chunk =>
      moment(chunk.start).isSameOrAfter(startFromDate)
    );

    log('info', `Processing job ${jobId}: ${remainingChunks.length} chunks remaining`);

    const skipExisting = job.skip_existing !== false; // Default to true

    // Fetch all dates with existing Garmin data upfront (single efficient query)
    let existingDates = new Set();
    if (skipExisting) {
      existingDates = await getDatesWithGarminData(userId, job.start_date, job.end_date);
      log('info', `Job ${jobId}: Found ${existingDates.size} days with existing Garmin data`);
    }

    for (let i = 0; i < remainingChunks.length; i++) {
      // Check if cancelled
      if (!activeProcessing.has(jobId)) {
        log('info', `Job ${jobId} was cancelled, stopping`);
        return;
      }

      const chunk = remainingChunks[i];
      const chunkNum = job.chunks_completed + i + 1;

      try {
        // Check which days in this chunk need syncing (skip_existing mode)
        if (skipExisting) {
          await garminSyncJobRepository.updateJobStage(userId, jobId, 'Checking existing data...');
          const { needsSync, missingDates } = checkChunkNeedsSync(chunk.start, chunk.end, existingDates);
          if (!needsSync) {
            log('info', `Job ${jobId}: Chunk ${chunkNum} skipped (all days have data: ${chunk.start} to ${chunk.end})`);
            // Update progress to mark chunk as complete
            await garminSyncJobRepository.updateJobProgress(userId, jobId, {
              current_chunk_start: chunk.start,
              current_chunk_end: chunk.end,
              chunks_completed: job.chunks_completed + i + 1,
              last_successful_date: chunk.end,
              current_stage: 'Skipped (data exists)'
            });
            continue;
          }
          log('info', `Job ${jobId}: Chunk ${chunkNum} has ${missingDates.length} days missing data`);
        }

        // Update current chunk
        await garminSyncJobRepository.updateJobProgress(userId, jobId, {
          current_chunk_start: chunk.start,
          current_chunk_end: chunk.end,
          chunks_completed: job.chunks_completed + i,
          last_successful_date: job.last_successful_date,
          current_stage: 'Starting chunk...'
        });

        // Sync this chunk
        log('info', `Job ${jobId}: Processing chunk ${chunkNum} - ${chunk.start} to ${chunk.end}`);

        // Fetch health and wellness data
        await garminSyncJobRepository.updateJobStage(userId, jobId, 'Fetching health data...');
        const healthData = await garminConnectService.syncGarminHealthAndWellness(
          userId,
          chunk.start,
          chunk.end,
          job.metric_types
        );

        // Process the data
        if (healthData && healthData.data) {
          await garminSyncJobRepository.updateJobStage(userId, jobId, 'Processing health data...');
          await garminService.processGarminHealthAndWellnessData(
            userId,
            userId,
            healthData.data,
            chunk.start,
            chunk.end
          );

          // Process sleep data if present
          if (healthData.data.sleep && healthData.data.sleep.length > 0) {
            await garminSyncJobRepository.updateJobStage(userId, jobId, `Processing ${healthData.data.sleep.length} sleep entries...`);
            await garminService.processGarminSleepData(
              userId,
              userId,
              healthData.data.sleep,
              chunk.start,
              chunk.end
            );
          }
        }

        // Fetch activities
        await garminSyncJobRepository.updateJobStage(userId, jobId, 'Fetching activities...');
        const activityData = await garminConnectService.fetchGarminActivitiesAndWorkouts(
          userId,
          chunk.start,
          chunk.end,
          null
        );

        if (activityData) {
          const activityCount = activityData.activities?.length || 0;
          await garminSyncJobRepository.updateJobStage(userId, jobId, `Processing ${activityCount} activities...`);
          await garminService.processActivitiesAndWorkouts(
            userId,
            activityData,
            chunk.start,
            chunk.end
          );
        }

        // Update progress
        await garminSyncJobRepository.updateJobProgress(userId, jobId, {
          current_chunk_start: chunk.start,
          current_chunk_end: chunk.end,
          chunks_completed: job.chunks_completed + i + 1,
          last_successful_date: chunk.end,
          current_stage: 'Chunk complete'
        });

        log('info', `Job ${jobId}: Completed chunk ${chunk.start} to ${chunk.end}`);

      } catch (chunkError) {
        log('error', `Job ${jobId}: Error processing chunk ${chunk.start} to ${chunk.end}:`, chunkError);

        // Record failed chunk but continue
        await garminSyncJobRepository.addFailedChunk(userId, jobId, {
          start: chunk.start,
          end: chunk.end,
          error: chunkError.message
        });
      }

      // Delay between chunks to avoid API rate limiting and yield to event loop
      await new Promise(resolve => setTimeout(resolve, CHUNK_DELAY_MS));
    }

    // All chunks processed
    await garminSyncJobRepository.updateJobStatus(userId, jobId, 'completed');

    // Update provider's last successful sync date
    await externalProviderRepository.updateLastSyncDate(userId, 'garmin', job.end_date);

    // Clean up old jobs (runs async, doesn't block completion)
    garminSyncJobRepository.cleanupOldJobs(userId).catch(err => {
      log('warn', `Failed to cleanup old jobs: ${err.message}`);
    });

    log('info', `Job ${jobId} completed successfully`);

  } catch (error) {
    log('error', `Job ${jobId} failed:`, error);
    await garminSyncJobRepository.updateJobStatus(userId, jobId, 'failed', {
      error_message: error.message
    });
  } finally {
    activeProcessing.delete(jobId);
  }
}

module.exports = {
  calculateChunks,
  startIncrementalSync,
  startHistoricalSync,
  getJobStatus,
  resumeJob,
  cancelJob,
  processJob
};
