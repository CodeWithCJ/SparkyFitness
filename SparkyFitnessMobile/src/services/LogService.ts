import AsyncStorage from '@react-native-async-storage/async-storage';

export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';
export type LogStatus = 'SUCCESS' | 'WARNING' | 'ERROR' | 'INFO';

export interface LogEntry {
  timestamp: string;
  message: string;
  level: LogLevel;
  status: LogStatus;
  details: string[];
}

export interface LogSummary {
  SUCCESS: number;
  WARNING: number;
  ERROR: number;
  info: number;
  warn: number;
  error: number;
  debug: number;
}

const LOG_KEY = 'app_logs';
const LOG_LEVEL_KEY = 'log_level';

const LOG_LEVELS = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
} as const;

/**
 * Adds a new log entry with a specified level and optional details.
 */
export const addLog = async (
  message: string,
  level: LogLevel = 'info',
  status: LogStatus = 'INFO',
  details: string[] = []
): Promise<void> => {
  try {
    const currentLogLevel = await getLogLevel();
    if (LOG_LEVELS[level] > LOG_LEVELS[currentLogLevel]) {
      return; // Don't log if current level is lower than message level
    }

    // console.log(`[LogService] Attempting to add log: [${level.toUpperCase()}] ${message}`);
    const existingLogs = await AsyncStorage.getItem(LOG_KEY);
    const logs: LogEntry[] = existingLogs ? (JSON.parse(existingLogs) as LogEntry[]) : [];
    const newLog: LogEntry = {
      timestamp: new Date().toISOString(),
      message,
      level,
      status,
      details,
    };
    logs.unshift(newLog); // Add to the beginning for descending order
    await AsyncStorage.setItem(LOG_KEY, JSON.stringify(logs));
    console.log(`[LogService] Logged: [${level.toUpperCase()}] ${message}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[LogService] Failed to add log: ${errorMessage}`, error);
  }
};

/**
 * Clears logs older than a specified number of days.
 */
export const pruneLogs = async (daysToKeep: number = 3): Promise<void> => {
  try {
    const existingLogs = await AsyncStorage.getItem(LOG_KEY);
    const logs: LogEntry[] = existingLogs ? (JSON.parse(existingLogs) as LogEntry[]) : [];

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
 */
export const getLogs = async (
  offset: number = 0,
  limit: number = 30,
  filterLevel: LogLevel | null = null
): Promise<LogEntry[]> => {
  try {
    // Prune logs before retrieving them
    await pruneLogs();
    const existingLogs = await AsyncStorage.getItem(LOG_KEY);
    let logs: LogEntry[] = existingLogs ? (JSON.parse(existingLogs) as LogEntry[]) : [];

    // Filter logs by current log level
    const currentLogLevel = filterLevel || await getLogLevel();
    const currentLevelValue = LOG_LEVELS[currentLogLevel];

    // Only show logs that are at or below the current log level threshold
    // e.g., if level is 'warn' (2), show 'error' (1) and 'warn' (2) but not 'info' (3) or 'debug' (4)
    logs = logs.filter(log => {
      const logLevelValue = LOG_LEVELS[log.level] ?? LOG_LEVELS['info'];
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
 */
export const clearLogs = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(LOG_KEY);
    console.log('[LogService] All logs cleared.');
  } catch (error) {
    console.error('Failed to clear logs', error);
  }
};

/**
 * Sets the current log level.
 */
export const setLogLevel = async (level: LogLevel): Promise<void> => {
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
 */
export const getLogLevel = async (): Promise<LogLevel> => {
  try {
    const level = await AsyncStorage.getItem(LOG_LEVEL_KEY);
    return (level as LogLevel) || 'info'; // Default to 'info'
  } catch (error) {
    console.error('Failed to get log level', error);
    return 'info';
  }
};

/**
 * Retrieves a summary of log entries (successful, warnings, errors).
 */
export const getLogSummary = async (): Promise<LogSummary> => {
  try {
    const existingLogs = await AsyncStorage.getItem(LOG_KEY);
    const logs: LogEntry[] = existingLogs ? (JSON.parse(existingLogs) as LogEntry[]) : [];

    const summary: LogSummary = {
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

        // Count by level (silent is not counted)
        if (log.level !== 'silent' && log.level in summary) {
          summary[log.level as keyof Pick<LogSummary, 'info' | 'warn' | 'error' | 'debug'>]++;
        }
      }
    });
    return summary;
  } catch (error) {
    console.error('Failed to get log summary', error);
    return { SUCCESS: 0, WARNING: 0, ERROR: 0, info: 0, warn: 0, error: 0, debug: 0 };
  }
};
