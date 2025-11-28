import AsyncStorage from '@react-native-async-storage/async-storage';

const LOG_KEY = 'app_logs';
const LOG_LEVEL_KEY = 'log_level';

// Define log levels
const LOG_LEVELS = {
  'silent': 0,
  'error': 1,
  'warn': 2,
  'info': 3,
  'debug': 4,
};

/**
 * Adds a new log entry with a specified level and optional details.
 * @param {string} message - The log message.
 * @param {string} level - The log level (e.g., 'info', 'warn', 'error', 'debug').
 * @param {string} status - The status of the log (e.g., 'SUCCESS', 'WARNING', 'ERROR').
 * @param {Array<string>} details - Optional array of strings for additional details.
 */
export const addLog = async (message, level = 'info', status = 'INFO', details = []) => {
  try {
    const currentLogLevel = await getLogLevel();
    if (LOG_LEVELS[level] > LOG_LEVELS[currentLogLevel]) {
      return; // Don't log if current level is lower than message level
    }

    console.log(`[LogService] Attempting to add log: [${level.toUpperCase()}] ${message}`);
    const existingLogs = await AsyncStorage.getItem(LOG_KEY);
    const logs = existingLogs ? JSON.parse(existingLogs) : [];
    const newLog = {
      timestamp: new Date().toISOString(),
      message,
      level,
      status,
      details,
    };
    logs.unshift(newLog); // Add to the beginning for descending order
    await AsyncStorage.setItem(LOG_KEY, JSON.stringify(logs));
    console.log(`[LogService] Successfully added log: [${level.toUpperCase()}] ${message}`);
  } catch (error) {
    console.error(`[LogService] Failed to add log: ${error.message}`, error);
  }
};

/**
 * Clears logs older than a specified number of days.
 * @param {number} daysToKeep - The number of days to keep logs for. Logs older than this will be deleted.
 */
export const pruneLogs = async (daysToKeep = 3) => {
  try {
    const existingLogs = await AsyncStorage.getItem(LOG_KEY);
    let logs = existingLogs ? JSON.parse(existingLogs) : [];

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    cutoffDate.setHours(0, 0, 0, 0); // Set to beginning of the day

    const filteredLogs = logs.filter(log => {
      const logDate = new Date(log.timestamp);
      return logDate >= cutoffDate;
    });

    if (filteredLogs.length !== logs.length) {
      await AsyncStorage.setItem(LOG_KEY, JSON.stringify(filteredLogs));
      console.log(`[LogService] Pruned logs: removed ${logs.length - filteredLogs.length} old entries.`);
    } else {
      console.log('[LogService] No old logs to prune.');
    }
  } catch (error) {
    console.error('[LogService] Failed to prune logs', error);
  }
};

/**
 * Retrieves log entries with pagination, filtered by current log level.
 * @param {number} offset - The starting index for logs.
 * @param {number} limit - The maximum number of logs to retrieve.
 * @param {string|null} filterLevel - Optional log level to filter by. If null, uses stored log level.
 * @returns {Promise<Array>} An array of log objects.
 */
export const getLogs = async (offset = 0, limit = 30, filterLevel = null) => {
  try {
    // Prune logs before retrieving them
    await pruneLogs();
    const existingLogs = await AsyncStorage.getItem(LOG_KEY);
    let logs = existingLogs ? JSON.parse(existingLogs) : [];
    
    // Filter logs by current log level
    const currentLogLevel = filterLevel || await getLogLevel();
    const currentLevelValue = LOG_LEVELS[currentLogLevel];
    
    // Only show logs that are at or below the current log level threshold
    // e.g., if level is 'warn' (2), show 'error' (1) and 'warn' (2) but not 'info' (3) or 'debug' (4)
    logs = logs.filter(log => {
      const logLevelValue = LOG_LEVELS[log.level] || LOG_LEVELS['info'];
      return logLevelValue <= currentLevelValue;
    });
    
    return logs.slice(offset, offset + limit);
  } catch (error) {
    console.error('Failed to get logs', error);
    return [];
  }
};

/**
 * Clears all log entries.
 * @returns {Promise<void>}
 */
export const clearLogs = async () => {
  try {
    await AsyncStorage.removeItem(LOG_KEY);
    console.log('[LogService] All logs cleared.');
  } catch (error) {
    console.error('Failed to clear logs', error);
  }
};

/**
 * Sets the current log level.
 * @param {string} level - The log level (e.g., 'silent', 'info', 'warn', 'error', 'debug').
 */
export const setLogLevel = async (level) => {
  try {
    if (LOG_LEVELS[level] !== undefined) {
      await AsyncStorage.setItem(LOG_LEVEL_KEY, level);
    } else {
      console.warn(`Invalid log level: ${level}. Not setting.`);
    }
  } catch (error) {
    console.error('Failed to set log level', error);
  }
};

/**
 * Retrieves the current log level.
 * @returns {Promise<string>} The current log level, defaults to 'info'.
 */
export const getLogLevel = async () => {
  try {
    const level = await AsyncStorage.getItem(LOG_LEVEL_KEY);
    return level || 'info'; // Default to 'info'
  } catch (error) {
    console.error('Failed to get log level', error);
    return 'info';
  }
};

/**
 * Retrieves a summary of log entries (successful, warnings, errors).
 * @returns {Promise<object>} An object with counts for successful, warnings, and failed logs.
 */
export const getLogSummary = async () => {
  try {
    const existingLogs = await AsyncStorage.getItem(LOG_KEY);
    const logs = existingLogs ? JSON.parse(existingLogs) : [];

    const summary = {
      SUCCESS: 0,
      WARNING: 0,
      ERROR: 0,
      info: 0,
      warn: 0,
      error: 0,
      debug: 0,
    };

    // Filter logs for today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    logs.forEach(log => {
      const logDate = new Date(log.timestamp);
      logDate.setHours(0, 0, 0, 0);

      if (logDate.getTime() === today.getTime()) {
        // Count by status
        if (log.status === 'SUCCESS') {
          summary.SUCCESS++;
        } else if (log.status === 'WARNING') {
          summary.WARNING++;
        } else if (log.status === 'ERROR') {
          summary.ERROR++;
        }

        // Count by level
        if (summary[log.level] !== undefined) {
          summary[log.level]++;
        }
      }
    });
    return summary;
  } catch (error) {
    console.error('Failed to get log summary', error);
    return { SUCCESS: 0, WARNING: 0, ERROR: 0, info: 0, warn: 0, error: 0, debug: 0 };
  }
};