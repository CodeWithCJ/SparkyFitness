#!/usr/bin/env node

/**
 * Garmin Historical Import CLI Script
 *
 * Usage:
 *   node scripts/garmin-historical-import.js --user-id=<uuid> --start=YYYY-MM-DD --end=YYYY-MM-DD [--chunk-days=30]
 *
 * Example:
 *   node scripts/garmin-historical-import.js --user-id=8b9b60d7-d248-4a47-ba1b-e4f08be03b6b --start=2020-01-01 --end=2026-01-03
 *
 * Run with increased memory if needed:
 *   NODE_OPTIONS="--max-old-space-size=4096" node scripts/garmin-historical-import.js ...
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const moment = require('moment');
const garminConnectService = require('../integrations/garminconnect/garminConnectService');
const garminService = require('../services/garminService');
const externalProviderRepository = require('../models/externalProviderRepository');
const { getClient } = require('../db/poolManager');

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

// Calculate chunks for a date range
function calculateChunks(startDate, endDate, chunkSizeDays = 30) {
  const chunks = [];
  let currentStart = moment(startDate);
  const end = moment(endDate);

  while (currentStart.isSameOrBefore(end)) {
    const chunkEnd = moment.min(
      moment(currentStart).add(chunkSizeDays - 1, 'days'),
      end
    );
    chunks.push({
      start: currentStart.format('YYYY-MM-DD'),
      end: chunkEnd.format('YYYY-MM-DD')
    });
    currentStart = chunkEnd.add(1, 'day');
  }

  return chunks;
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
    console.error('Usage: node scripts/garmin-historical-import.js --user-id=<uuid> --start=YYYY-MM-DD --end=YYYY-MM-DD');
    process.exit(1);
  }

  if (!args['start'] || !args['end']) {
    console.error('Error: --start and --end dates are required (YYYY-MM-DD format)');
    process.exit(1);
  }

  const userId = args['user-id'];
  const startDate = args['start'];
  const endDate = args['end'];
  const chunkDays = parseInt(args['chunk-days'] || '30', 10);

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

  console.log(`User ID:     ${userId}`);
  console.log(`Date Range:  ${startDate} to ${endDate}`);
  console.log(`Chunk Size:  ${chunkDays} days\n`);

  // Verify Garmin is connected
  console.log('Checking Garmin connection...');
  const provider = await externalProviderRepository.getExternalDataProviderByUserIdAndProviderName(userId, 'garmin');

  if (!provider) {
    console.error('Error: Garmin not connected for this user. Please link your Garmin account first.');
    process.exit(1);
  }

  console.log('✓ Garmin account connected\n');

  // Calculate chunks
  const chunks = calculateChunks(startDate, endDate, chunkDays);
  console.log(`Total chunks to process: ${chunks.length}`);
  console.log(`Estimated time: ${Math.ceil(chunks.length * 0.5)} - ${Math.ceil(chunks.length * 2)} minutes\n`);

  const startTime = Date.now();
  const failedChunks = [];
  let successCount = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkNum = i + 1;

    // Clear line and show progress
    process.stdout.write(`\r${progressBar(i, chunks.length)} Chunk ${chunkNum}/${chunks.length}: ${chunk.start} to ${chunk.end}     `);

    try {
      // Fetch health and wellness data
      const healthData = await garminConnectService.syncGarminHealthAndWellness(
        userId,
        chunk.start,
        chunk.end,
        null // All metric types
      );

      // Process the data
      if (healthData && healthData.data) {
        await garminService.processGarminHealthAndWellnessData(
          userId,
          userId,
          healthData.data,
          chunk.start,
          chunk.end
        );

        // Process sleep data if present
        if (healthData.data.sleep && healthData.data.sleep.length > 0) {
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
      const activityData = await garminConnectService.fetchGarminActivitiesAndWorkouts(
        userId,
        chunk.start,
        chunk.end,
        null
      );

      if (activityData) {
        await garminService.processActivitiesAndWorkouts(
          userId,
          activityData,
          chunk.start,
          chunk.end
        );
      }

      successCount++;

    } catch (error) {
      console.log(`\n⚠ Error processing chunk ${chunk.start} to ${chunk.end}: ${error.message}`);
      failedChunks.push({ ...chunk, error: error.message });
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Final progress
  process.stdout.write(`\r${progressBar(chunks.length, chunks.length)} Complete!                                        \n`);

  const elapsed = Date.now() - startTime;

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                    IMPORT COMPLETE                         ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log(`Total time:      ${formatDuration(elapsed)}`);
  console.log(`Chunks processed: ${successCount}/${chunks.length}`);

  if (failedChunks.length > 0) {
    console.log(`\n⚠ Failed chunks (${failedChunks.length}):`);
    failedChunks.forEach(fc => {
      console.log(`  - ${fc.start} to ${fc.end}: ${fc.error}`);
    });
    console.log('\nTo retry failed chunks, run the script again with the specific date ranges.');
  } else {
    console.log('\n✓ All chunks processed successfully!');
  }

  // Update last sync date
  try {
    await externalProviderRepository.updateLastSyncDate(userId, 'garmin', endDate);
    console.log(`\n✓ Updated last sync date to ${endDate}`);
  } catch (error) {
    console.log(`\n⚠ Could not update last sync date: ${error.message}`);
  }

  console.log('\nDone!\n');
  process.exit(failedChunks.length > 0 ? 1 : 0);
}

// Run the script
main().catch(error => {
  console.error('\nFatal error:', error);
  process.exit(1);
});
