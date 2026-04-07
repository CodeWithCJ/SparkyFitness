// SparkyFitnessServer/utils/diagnosticLogger.js

const fs = require('fs');
const path = require('path');
const { log } = require('../config/logging');

const DIAGNOSTIC_LOGGING_ENABLED =
  process.env.SPARKY_FITNESS_SAVE_MOCK_DATA === 'true';
const DIAGNOSTICS_DIR = path.join(__dirname, '..', 'mock_data');

/**
 * Logs a raw JSON response from an external provider to a consolidated raw bundle in the mock_data directory.
 *
 * @param {string} provider - The name of the provider (e.g., 'polar', 'fitbit')
 * @param {string} dataType - The type of data being logged (e.g., 'sleep', 'exercises')
 * @param {any} data - The raw JSON data to log
 */
function logRawResponse(provider, dataType, data) {
  if (!DIAGNOSTIC_LOGGING_ENABLED) return;

  try {
    if (!fs.existsSync(DIAGNOSTICS_DIR)) {
      fs.mkdirSync(DIAGNOSTICS_DIR, { recursive: true });
    }

    const filePath = path.join(DIAGNOSTICS_DIR, `${provider}_raw.json`);

    // Start with a fresh bundle every time to prevent stale/incorrectly formatted data
    let bundle = {
      provider,
      last_updated: new Date().toISOString(),
      responses: {},
    };

    // If we want to capture multiple data types within a SINGLE sync session (e.g. activities + sleep),
    // we should still allow merging IF the file was updated very recently (e.g. within the last 1 minute).
    // Otherwise, start fresh.
    if (fs.existsSync(filePath)) {
      try {
        const stats = fs.statSync(filePath);
        const now = new Date();
        const lastModified = new Date(stats.mtime);
        const diffInSeconds = (now - lastModified) / 1000;

        // If updated within the last 60 seconds, it's likely the same sync process
        if (diffInSeconds < 60) {
          const existingData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          bundle = { ...bundle, ...existingData };
        }
      } catch (err) {
        console.error(
          `Failed to read or parse existing file at ${filePath}:`,
          err.message
        );
      }
    }

    bundle.last_updated = new Date().toISOString();

    // Update the specific data type with the new raw response
    bundle.responses[dataType] = {
      timestamp: new Date().toISOString(),
      data: data,
    };

    fs.writeFileSync(filePath, JSON.stringify(bundle, null, 2), 'utf8');
    log(
      'info',
      `[diagnosticLogger] Raw ${dataType} data for ${provider} updated in ${filePath}`
    );
  } catch (error) {
    log(
      'error',
      `[diagnosticLogger] Failed to save raw ${dataType} data for ${provider}: ${error.message}`
    );
  }
}

/**
 * Loads a consolidated raw bundle for a provider.
 *
 * @param {string} provider - The name of the provider
 * @returns {object|null} - The parsed bundle or null
 */
function loadRawBundle(provider) {
  const filePath = path.join(DIAGNOSTICS_DIR, `${provider}_raw.json`);
  if (!fs.existsSync(filePath)) return null;

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    log(
      'error',
      `[diagnosticLogger] Failed to load raw bundle for ${provider}: ${error.message}`
    );
    return null;
  }
}

module.exports = {
  logRawResponse,
  loadRawBundle,
};
