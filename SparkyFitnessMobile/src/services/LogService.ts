import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';

// Unified status type (replaces both LogLevel and LogStatus)
export type LogStatus = 'DEBUG' | 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';

// Filter options for UI picker
export type LogFilter = 'all' | 'no_debug' | 'warnings_errors' | 'errors_only';

export interface LogEntry {
  timestamp: string;
  message: string;
  status: LogStatus;
  details: string[];
}

export interface LogSummary {
  DEBUG: number;
  INFO: number;
  SUCCESS: number;
  WARNING: number;
  ERROR: number;
}

const LOG_KEY = 'app_logs';
const LOG_FILTER_KEY = 'log_filter';
const OLD_LOG_LEVEL_KEY = 'log_level'; // For migration

// Status severity for filtering (lower = more critical)
const STATUS_SEVERITY: Record<LogStatus, number> = {
  ERROR: 1,
  WARNING: 2,
  SUCCESS: 3,
  INFO: 3, // Same as SUCCESS
  DEBUG: 4,
};

// Filter thresholds
const FILTER_THRESHOLD: Record<LogFilter, number> = {
  all: 4,
  no_debug: 3,
  warnings_errors: 2,
  errors_only: 1,
};

// Filter options for the UI picker
export const LOG_FILTER_OPTIONS: { label: string; value: LogFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'No Debug', value: 'no_debug' },
  { label: 'Warnings & Errors', value: 'warnings_errors' },
  { label: 'Errors Only', value: 'errors_only' },
];

// --- Write buffering and filter caching state ---
const FLUSH_INTERVAL_MS = 5000;
const FLUSH_THRESHOLD = 20;
const MAX_LOG_ENTRIES = 1000;
const MAX_FLUSH_FAILURES = 3;

let cachedFilter: LogFilter | null = null;
let writeBuffer: LogEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushPromise: Promise<void> | null = null;
let consecutiveFlushFailures = 0;
let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;

/**
 * Migrates an old log entry format to the new format.
 * Old format: { level: 'info', status: 'SUCCESS', ... }
 * New format: { status: 'SUCCESS', ... }
 */
const migrateLogEntry = (entry: LogEntry & { level?: string }): LogEntry => {
  if (!entry.level) return entry; // Already migrated

  // If level='debug', always map to DEBUG (level takes precedence)
  // Otherwise, use the existing status value directly
  const newStatus: LogStatus =
    entry.level === 'debug' ? 'DEBUG' : (entry.status || 'INFO');

  return {
    timestamp: entry.timestamp,
    message: entry.message,
    status: newStatus,
    details: entry.details || [],
  };
};

/**
 * Flushes the write buffer to AsyncStorage.
 * Serializes concurrent flush calls via flushPromise.
 */
const flushBuffer = async (): Promise<void> => {
  // Wait for all in-flight flushes so callers read fully committed data.
  // Loop because another caller can start a new flush in the gap after
  // our await resolves (e.g. concurrent getLogs + getLogSummary).
  while (flushPromise) {
    await flushPromise;
  }

  if (writeBuffer.length === 0) return;

  // Swap buffer to local variable so new addLog() calls go to a fresh buffer
  const entriesToFlush = writeBuffer;
  writeBuffer = [];

  // Clear any pending timer since we're flushing now
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  const doFlush = async (): Promise<void> => {
    try {
      const existingData = await AsyncStorage.getItem(LOG_KEY);
      const existingLogs: LogEntry[] = existingData ? JSON.parse(existingData) : [];
      const merged = [...entriesToFlush, ...existingLogs].slice(0, MAX_LOG_ENTRIES);
      await AsyncStorage.setItem(LOG_KEY, JSON.stringify(merged));
      consecutiveFlushFailures = 0;
    } catch (error) {
      consecutiveFlushFailures++;
      if (consecutiveFlushFailures < MAX_FLUSH_FAILURES) {
        // Restore entries to buffer for retry
        writeBuffer = [...entriesToFlush, ...writeBuffer];
      } else {
        console.error('[LogService] Dropping buffered entries after repeated flush failures', error);
      }
    }
  };

  flushPromise = doFlush();
  await flushPromise;
  flushPromise = null;
};

/**
 * Schedules a deferred flush if one isn't already pending.
 */
const scheduleFlush = (): void => {
  if (flushTimer === null) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushBuffer().catch(error => {
        console.error('[LogService] Scheduled flush failed:', error);
      });
    }, FLUSH_INTERVAL_MS);
  }
};

/**
 * Adds a new log entry with a specified status and optional details.
 */
export const addLog = async (
  message: string,
  status: LogStatus = 'INFO',
  details: string[] = []
): Promise<void> => {
  try {
    const currentFilter = await getLogFilter();
    const statusSeverity = STATUS_SEVERITY[status];
    const filterThreshold = FILTER_THRESHOLD[currentFilter];

    if (statusSeverity > filterThreshold) {
      return; // Don't log if status severity is below the filter threshold
    }

    const newLog: LogEntry = {
      timestamp: new Date().toISOString(),
      message,
      status,
      details,
    };
    writeBuffer.unshift(newLog);
    console.log(`[LogService] Logged: [${status}] ${message}`);

    if (writeBuffer.length >= FLUSH_THRESHOLD) {
      await flushBuffer();
    } else {
      scheduleFlush();
    }
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
    await flushBuffer();

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
 * Retrieves log entries with pagination, filtered by current filter setting.
 */
export const getLogs = async (
  offset: number = 0,
  limit: number = 30,
  filter: LogFilter | null = null
): Promise<LogEntry[]> => {
  try {
    await flushBuffer();

    const existingLogs = await AsyncStorage.getItem(LOG_KEY);
    let logs: LogEntry[] = existingLogs
      ? (JSON.parse(existingLogs) as (LogEntry & { level?: string })[]).map(migrateLogEntry)
      : [];

    // Filter logs by current filter setting
    const currentFilter = filter || await getLogFilter();
    const filterThreshold = FILTER_THRESHOLD[currentFilter];

    // Only show logs that meet the filter threshold
    logs = logs.filter(log => {
      const statusSeverity = STATUS_SEVERITY[log.status] ?? STATUS_SEVERITY['INFO'];
      return statusSeverity <= filterThreshold;
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
    writeBuffer = [];
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    // Wait for all in-flight flushes before removing storage.
    // Use a while loop (like flushBuffer does) because another waiter
    // (e.g. getLogs) can resume from the same flush and start a new one
    // before we reach removeItem. Re-clear the buffer each iteration
    // because a failed flush restores entries into writeBuffer.
    while (flushPromise) {
      await flushPromise;
      writeBuffer = [];
    }
    await AsyncStorage.removeItem(LOG_KEY);
    console.log('[LogService] All logs cleared.');
  } catch (error) {
    console.error('Failed to clear logs', error);
  }
};

/**
 * Sets the current log filter.
 */
export const setLogFilter = async (filter: LogFilter): Promise<void> => {
  try {
    if (FILTER_THRESHOLD[filter] !== undefined) {
      await AsyncStorage.setItem(LOG_FILTER_KEY, filter);
      cachedFilter = filter;
    } else {
      console.warn(`Invalid log filter: ${filter}. Not setting.`);
    }
  } catch (error) {
    console.error('Failed to set log filter', error);
  }
};

/**
 * Retrieves the current log filter.
 * Returns cached value if available, otherwise reads from AsyncStorage.
 * Migrates from old log level format if necessary.
 */
export const getLogFilter = async (): Promise<LogFilter> => {
  if (cachedFilter !== null) return cachedFilter;

  try {
    // Check new key first
    const filter = await AsyncStorage.getItem(LOG_FILTER_KEY);
    if (filter && FILTER_THRESHOLD[filter as LogFilter] !== undefined) {
      cachedFilter = filter as LogFilter;
      return cachedFilter;
    }

    // Try to migrate from old log level key
    const oldLevel = await AsyncStorage.getItem(OLD_LOG_LEVEL_KEY);
    if (oldLevel) {
      // Migrate: 'debug' -> 'all', 'info' -> 'no_debug', 'warn' -> 'warnings_errors', 'error'/'silent' -> 'errors_only'
      const migrationMap: Record<string, LogFilter> = {
        debug: 'all',
        info: 'no_debug',
        warn: 'warnings_errors',
        error: 'errors_only',
        silent: 'errors_only',
      };
      const newFilter = migrationMap[oldLevel] || 'no_debug';

      // Save migrated value and clean up old key
      await AsyncStorage.setItem(LOG_FILTER_KEY, newFilter);
      await AsyncStorage.removeItem(OLD_LOG_LEVEL_KEY);

      cachedFilter = newFilter;
      return cachedFilter;
    }

    cachedFilter = 'no_debug'; // Default
    return cachedFilter;
  } catch (error) {
    console.error('Failed to get log filter', error);
    return 'no_debug';
  }
};

/**
 * Retrieves a summary of log entries by status.
 * Counts match what's displayed in the log list.
 * Filters by current filter setting to match what getLogs() displays.
 */
export const getLogSummary = async (): Promise<LogSummary> => {
  try {
    await flushBuffer();

    const existingLogs = await AsyncStorage.getItem(LOG_KEY);
    const logs: LogEntry[] = existingLogs
      ? (JSON.parse(existingLogs) as (LogEntry & { level?: string })[]).map(migrateLogEntry)
      : [];

    const summary: LogSummary = {
      DEBUG: 0,
      INFO: 0,
      SUCCESS: 0,
      WARNING: 0,
      ERROR: 0,
    };

    // Get current filter for filtering (same as getLogs)
    const currentFilter = await getLogFilter();
    const filterThreshold = FILTER_THRESHOLD[currentFilter];

    // Filter logs for today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    logs.forEach(log => {
      // Filter by status severity (same logic as getLogs)
      const statusSeverity = STATUS_SEVERITY[log.status] ?? STATUS_SEVERITY['INFO'];
      if (statusSeverity > filterThreshold) {
        return; // Skip logs below filter threshold
      }

      const logDate = new Date(log.timestamp);
      logDate.setHours(0, 0, 0, 0);

      if (logDate.getTime() === today.getTime()) {
        // Count by status (matches what's displayed in the log list)
        summary[log.status]++;
      }
    });
    return summary;
  } catch (error) {
    console.error('Failed to get log summary', error);
    return { DEBUG: 0, INFO: 0, SUCCESS: 0, WARNING: 0, ERROR: 0 };
  }
};

/**
 * Initializes the log service. Call once at app startup.
 * Warms the filter cache, prunes old logs, and registers an AppState
 * listener to flush the buffer when the app goes to background.
 */
export const initLogService = async (): Promise<void> => {
  await getLogFilter();
  await pruneLogs();

  appStateSubscription = AppState.addEventListener('change', (nextState) => {
    if (nextState === 'background' || nextState === 'inactive') {
      flushBuffer().catch(error => {
        console.error('[LogService] Background flush failed:', error);
      });
    }
  });
};

/**
 * Resets all module-level state for testing. Not for production use.
 */
export const _resetForTesting = (): void => {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  cachedFilter = null;
  writeBuffer = [];
  flushPromise = null;
  consecutiveFlushFailures = 0;
  appStateSubscription?.remove();
  appStateSubscription = null;
};

/**
 * Direct reference to flushBuffer for explicit test control.
 */
export const _flushBuffer = flushBuffer;
