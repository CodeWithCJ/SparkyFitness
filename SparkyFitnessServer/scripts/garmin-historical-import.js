#!/usr/bin/env node

/**
 * Garmin Historical Import CLI Script
 *
 * This is a convenience wrapper around the garminSyncJobService for command-line usage.
 * All sync logic is handled by the service - this script just provides CLI access.
 *
 * Usage:
 *   node scripts/garmin-historical-import.js --user-id=<uuid> --start=YYYY-MM-DD --end=YYYY-MM-DD [--skip-existing=true]
 *
 * Example:
 *   node scripts/garmin-historical-import.js --user-id=8b9b60d7-d248-4a47-ba1b-e4f08be03b6b --start=2020-01-01 --end=2026-01-03
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const moment = require('moment');
const garminSyncJobService = require('../services/garminSyncJobService');
const garminSyncJobRepository = require('../models/garminSyncJobRepository');

// Parse command line arguments
function parseArgs() {
  const args = {};
  process.argv.slice(2).forEach(arg => {
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) {
      args[match[1]] = match[2];
    }
  });
  return args;
}

// Format duration in human readable format
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

// Progress bar
function progressBar(current, total, width = 30) {
  const percent = Math.round((current / total) * 100);
  const filled = Math.round((current / total) * width);
  const empty = width - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${percent}%`;
}

async function main() {
  const args = parseArgs();

  // Validate arguments
  if (!args['user-id']) {
    console.error('Error: --user-id is required');
    console.error('Usage: node scripts/garmin-historical-import.js --user-id=<uuid> --start=YYYY-MM-DD --end=YYYY-MM-DD [--skip-existing=true]');
    process.exit(1);
  }

  if (!args['start'] || !args['end']) {
    console.error('Error: --start and --end dates are required (YYYY-MM-DD format)');
    process.exit(1);
  }

  const userId = args['user-id'];
  const startDate = args['start'];
  const endDate = args['end'];
  const skipExisting = args['skip-existing'] !== 'false'; // Default to true

  // Validate dates
  if (!moment(startDate, 'YYYY-MM-DD', true).isValid()) {
    console.error('Error: Invalid start date format. Use YYYY-MM-DD');
    process.exit(1);
  }

  if (!moment(endDate, 'YYYY-MM-DD', true).isValid()) {
    console.error('Error: Invalid end date format. Use YYYY-MM-DD');
    process.exit(1);
  }

  if (moment(startDate).isAfter(moment(endDate))) {
    console.error('Error: Start date must be before end date');
    process.exit(1);
  }

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║           GARMIN HISTORICAL DATA IMPORT                    ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log(`User ID:       ${userId}`);
  console.log(`Date Range:    ${startDate} to ${endDate}`);
  console.log(`Skip Existing: ${skipExisting}\n`);

  const startTime = Date.now();

  try {
    // Start the historical sync using the service
    console.log('Starting historical sync...');
    const result = await garminSyncJobService.startHistoricalSync(
      userId,
      startDate,
      endDate,
      null, // All metric types
      skipExisting
    );

    if (result.status === 'already_running') {
      console.log(`\n⚠ A sync job is already in progress (Job ID: ${result.jobId})`);
      console.log('Please wait for it to complete or cancel it first.');
      process.exit(1);
    }

    console.log(`✓ Sync job created (ID: ${result.jobId})`);
    console.log(`  Chunks to process: ${result.chunksTotal}\n`);

    // Poll for status until complete
    let lastChunksCompleted = 0;
    while (true) {
      const status = await garminSyncJobService.getJobStatus(userId);

      if (!status.hasActiveJob) {
        // Job finished
        const job = await garminSyncJobRepository.getMostRecentJob(userId);
        const elapsed = Date.now() - startTime;

        process.stdout.write(`\r${progressBar(job.chunks_total, job.chunks_total)} Complete!                                        \n`);

        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║                    IMPORT COMPLETE                         ║');
        console.log('╚════════════════════════════════════════════════════════════╝\n');

        console.log(`Total time:       ${formatDuration(elapsed)}`);
        console.log(`Final status:     ${job.status}`);
        console.log(`Chunks processed: ${job.chunks_completed}/${job.chunks_total}`);

        if (job.failed_chunks && job.failed_chunks.length > 0) {
          console.log(`\n⚠ Failed chunks (${job.failed_chunks.length}):`);
          job.failed_chunks.forEach(fc => {
            console.log(`  - ${fc.start} to ${fc.end}: ${fc.error}`);
          });
        } else if (job.status === 'completed') {
          console.log('\n✓ All chunks processed successfully!');
        }

        if (job.error_message) {
          console.log(`\n✗ Error: ${job.error_message}`);
        }

        console.log('\nDone!\n');
        process.exit(job.status === 'completed' ? 0 : 1);
      }

      // Show progress
      const job = status.job;
      if (job.chunksCompleted !== lastChunksCompleted) {
        const range = job.currentChunkRange || `${job.startDate} - ${job.endDate}`;
        process.stdout.write(`\r${progressBar(job.chunksCompleted, job.chunksTotal)} Chunk ${job.chunksCompleted}/${job.chunksTotal}: ${range}     `);
        lastChunksCompleted = job.chunksCompleted;
      }

      // Wait before polling again
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

  } catch (error) {
    console.error('\n✗ Error:', error.message);
    process.exit(1);
  }
}

// Run the script
main().catch(error => {
  console.error('\nFatal error:', error);
  process.exit(1);
});
