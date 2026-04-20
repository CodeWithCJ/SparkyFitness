import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';

// Unified status type (replaces both LogLevel and LogStatus)
export type LogStatus = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';

// Threshold used by both the capture-level and view-filter settings.
export type LogThreshold = 'all' | 'no_debug' | 'warnings_errors' | 'errors_only';

export interface LogEntry {
  timestamp: string;
  message: string;
  status: LogStatus;
  details: string[];
}

// Shape of log entries as they may appear on disk — older writes can still
// carry legacy `level` or `status: 'SUCCESS'` values that have not yet been
// migrated. Normalized into LogEntry by `migrateLogEntry`.
interface StoredLogEntry {
  timestamp: string;
  message: string;
  status: LogStatus | 'SUCCESS';
  details?: string[];
  level?: string;
}

export interface LogSummary {
  DEBUG: number;
  INFO: number;
  WARNING: number;
  ERROR: number;
}

const LOG_KEY = 'app_logs';
const LOG_CAPTURE_LEVEL_KEY = 'log_capture_level';
const LOG_VIEW_FILTER_KEY = 'log_view_filter';
const LOG_VIEW_SELECTED_STATUSES_KEY = 'log_view_selected_statuses';
const OLD_LOG_FILTER_KEY = 'log_filter'; // Migrated into view filter, then deleted
const OLD_LOG_LEVEL_KEY = 'log_level'; // Migrated into view filter, then deleted

const ALL_LOG_STATUSES: LogStatus[] = ['DEBUG', 'INFO', 'WARNING', 'ERROR'];
const isLogStatus = (value: unknown): value is LogStatus =>
  typeof value === 'string' && (ALL_LOG_STATUSES as string[]).includes(value);

// Status severity for filtering (lower = more critical)
const STATUS_SEVERITY: Record<LogStatus, number> = {
  ERROR: 1,
  WARNING: 2,
  INFO: 3,
  DEBUG: 4,
};

// Threshold table shared by capture and view settings.
const THRESHOLD_LEVEL: Record<LogThreshold, number> = {
  all: 4,
  no_debug: 3,
  warnings_errors: 2,
  errors_only: 1,
};

// Options shared by both the capture-level and view-filter pickers.
export const LOG_THRESHOLD_OPTIONS: { label: string; value: LogThreshold }[] = [
  { label: 'All', value: 'all' },
  { label: 'No Debug', value: 'no_debug' },
  { label: 'Warnings & Errors', value: 'warnings_errors' },
  { label: 'Errors Only', value: 'errors_only' },
];

// --- Write buffering and setting caching state ---
const FLUSH_INTERVAL_MS = 5000;
const FLUSH_THRESHOLD = 20;
const MAX_LOG_ENTRIES = 1000;
const MAX_FLUSH_FAILURES = 3;

let cachedCaptureLevel: LogThreshold | null = null;
let cachedViewFilter: LogThreshold | null = null;
let cachedSelectedStatuses: LogStatus[] | null = null;
let writeBuffer: LogEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushPromise: Promise<void> | null = null;
// Serializes the one-shot view-filter migration chain so concurrent callers
// at init don't see intermediate states (e.g. old key deleted, new key not
// yet written).
let getViewPromise: Promise<LogThreshold> | null = null;
let consecutiveFlushFailures = 0;
let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;

/**
 * Normalizes a stored log entry to the current on-disk shape. Returns
 * `changed: true` when the input required rewriting (legacy `level` field
 * or `status: 'SUCCESS'`) so callers can decide whether to write back.
 */
const migrateLogEntry = (entry: StoredLogEntry): { entry: LogEntry; changed: boolean } => {
  let changed = false;
  let status: LogStatus;

  if (entry.level === 'debug') {
    // Legacy 'debug' level always wins over whatever status was written.
    status = 'DEBUG';
    changed = true;
  } else if (entry.status === 'SUCCESS') {
    // Fold legacy SUCCESS into INFO.
    status = 'INFO';
    changed = true;
  } else {
    status = entry.status || 'INFO';
    if (entry.level !== undefined || entry.status === undefined) {
      changed = true;
    }
  }

  return {
    entry: {
      timestamp: entry.timestamp,
      message: entry.message,
      status,
      details: entry.details || [],
    },
    changed,
  };
};

const normalizeLogs = (raw: StoredLogEntry[]): LogEntry[] =>
  raw.map(item => migrateLogEntry(item).entry);

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
 * Entries whose severity exceeds the capture-level threshold are dropped
 * at write time.
 */
export const addLog = async (
  message: string,
  status: LogStatus = 'INFO',
  details: string[] = []
): Promise<void> => {
  try {
    const captureLevel = await getCaptureLevel();
    const statusSeverity = STATUS_SEVERITY[status];
    const captureThreshold = THRESHOLD_LEVEL[captureLevel];

    if (statusSeverity > captureThreshold) {
      return; // Don't capture entries below the capture threshold
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
 * Clears logs older than a specified number of days and rewrites any
 * stored entries that need legacy-format normalization (SUCCESS→INFO,
 * level→status).
 */
export const pruneLogs = async (daysToKeep: number = 3): Promise<void> => {
  try {
    await flushBuffer();

    const existingLogs = await AsyncStorage.getItem(LOG_KEY);
    const rawLogs: StoredLogEntry[] = existingLogs ? JSON.parse(existingLogs) : [];

    const migrated = rawLogs.map(migrateLogEntry);
    const didNormalize = migrated.some(m => m.changed);
    const logs = migrated.map(m => m.entry);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    cutoffDate.setHours(0, 0, 0, 0); // Set to beginning of the day

    const filteredLogs = logs.filter(log => {
      const logDate = new Date(log.timestamp);
      return logDate >= cutoffDate;
    });

    const removedCount = logs.length - filteredLogs.length;
    if (removedCount !== 0 || didNormalize) {
      await AsyncStorage.setItem(LOG_KEY, JSON.stringify(filteredLogs));
      console.log(`[LogService] Pruned logs: removed ${removedCount} old entries${didNormalize ? ' and normalized legacy entries' : ''}.`);
    } else {
      console.log('[LogService] No old logs to prune.');
    }
  } catch (error) {
    console.error('[LogService] Failed to prune logs', error);
  }
};

/**
 * Retrieves log entries with pagination, filtered by the view filter
 * (or an explicit override) at read time.
 */
export const getLogs = async (
  offset: number = 0,
  limit: number = 30,
  filter: LogThreshold | null = null
): Promise<LogEntry[]> => {
  try {
    await flushBuffer();

    const existingLogs = await AsyncStorage.getItem(LOG_KEY);
    let logs: LogEntry[] = existingLogs
      ? normalizeLogs(JSON.parse(existingLogs) as StoredLogEntry[])
      : [];

    const viewFilter = filter || await getViewFilter();
    const viewThreshold = THRESHOLD_LEVEL[viewFilter];

    logs = logs.filter(log => {
      const statusSeverity = STATUS_SEVERITY[log.status] ?? STATUS_SEVERITY['INFO'];
      return statusSeverity <= viewThreshold;
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
 * Sets the capture level (what addLog writes to disk).
 */
export const setCaptureLevel = async (level: LogThreshold): Promise<void> => {
  try {
    if (THRESHOLD_LEVEL[level] !== undefined) {
      await AsyncStorage.setItem(LOG_CAPTURE_LEVEL_KEY, level);
      cachedCaptureLevel = level;
    } else {
      console.warn(`Invalid log capture level: ${level}. Not setting.`);
    }
  } catch (error) {
    console.error('Failed to set log capture level', error);
  }
};

/**
 * Retrieves the current capture level.
 * Plain cached read with no migration chain — default is `all`.
 */
export const getCaptureLevel = async (): Promise<LogThreshold> => {
  if (cachedCaptureLevel !== null) return cachedCaptureLevel;

  try {
    const stored = await AsyncStorage.getItem(LOG_CAPTURE_LEVEL_KEY);
    if (stored && THRESHOLD_LEVEL[stored as LogThreshold] !== undefined) {
      cachedCaptureLevel = stored as LogThreshold;
      return cachedCaptureLevel;
    }

    cachedCaptureLevel = 'all'; // Default: capture everything
    return cachedCaptureLevel;
  } catch (error) {
    console.error('Failed to get log capture level', error);
    return 'all';
  }
};

/**
 * Sets the view filter (what the Log screen reads back).
 */
export const setViewFilter = async (filter: LogThreshold): Promise<void> => {
  try {
    if (THRESHOLD_LEVEL[filter] !== undefined) {
      await AsyncStorage.setItem(LOG_VIEW_FILTER_KEY, filter);
      cachedViewFilter = filter;
    } else {
      console.warn(`Invalid log view filter: ${filter}. Not setting.`);
    }
  } catch (error) {
    console.error('Failed to set log view filter', error);
  }
};

/**
 * Retrieves the current view filter.
 * Migrates from the old combined `log_filter` setting (or the even older
 * `log_level` preference) on first read. Serialized via `getViewPromise`
 * so concurrent callers don't observe intermediate migration states.
 */
export const getViewFilter = async (): Promise<LogThreshold> => {
  if (cachedViewFilter !== null) return cachedViewFilter;
  if (getViewPromise) return getViewPromise;

  const run = async (): Promise<LogThreshold> => {
    try {
      // 1) New key.
      const stored = await AsyncStorage.getItem(LOG_VIEW_FILTER_KEY);
      if (stored && THRESHOLD_LEVEL[stored as LogThreshold] !== undefined) {
        cachedViewFilter = stored as LogThreshold;
        return cachedViewFilter;
      }

      // 2) Old combined `log_filter` — users set this expecting it to
      // control what they *saw*, so it migrates into the view filter.
      const oldFilter = await AsyncStorage.getItem(OLD_LOG_FILTER_KEY);
      if (oldFilter && THRESHOLD_LEVEL[oldFilter as LogThreshold] !== undefined) {
        await AsyncStorage.setItem(LOG_VIEW_FILTER_KEY, oldFilter);
        await AsyncStorage.removeItem(OLD_LOG_FILTER_KEY);
        cachedViewFilter = oldFilter as LogThreshold;
        return cachedViewFilter;
      }

      // 3) Even older `log_level` preference.
      const oldLevel = await AsyncStorage.getItem(OLD_LOG_LEVEL_KEY);
      if (oldLevel) {
        const migrationMap: Record<string, LogThreshold> = {
          debug: 'all',
          info: 'no_debug',
          warn: 'warnings_errors',
          error: 'errors_only',
          silent: 'errors_only',
        };
        const newFilter = migrationMap[oldLevel] || 'no_debug';
        await AsyncStorage.setItem(LOG_VIEW_FILTER_KEY, newFilter);
        await AsyncStorage.removeItem(OLD_LOG_LEVEL_KEY);
        cachedViewFilter = newFilter;
        return cachedViewFilter;
      }

      cachedViewFilter = 'no_debug'; // Default
      return cachedViewFilter;
    } catch (error) {
      console.error('Failed to get log view filter', error);
      return 'no_debug';
    }
  };

  getViewPromise = run();
  try {
    return await getViewPromise;
  } finally {
    getViewPromise = null;
  }
};

/**
 * Retrieves the per-status chip selection used by the Log screen.
 * An empty array means "no explicit selection — show all" and is the
 * default on a fresh install. Unknown values in the stored array are
 * dropped silently.
 */
export const getViewSelectedStatuses = async (): Promise<LogStatus[]> => {
  if (cachedSelectedStatuses !== null) return cachedSelectedStatuses;

  try {
    const stored = await AsyncStorage.getItem(LOG_VIEW_SELECTED_STATUSES_KEY);
    if (!stored) {
      cachedSelectedStatuses = [];
      return cachedSelectedStatuses;
    }
    const parsed: unknown = JSON.parse(stored);
    cachedSelectedStatuses = Array.isArray(parsed) ? parsed.filter(isLogStatus) : [];
    return cachedSelectedStatuses;
  } catch (error) {
    console.error('Failed to get selected log statuses', error);
    cachedSelectedStatuses = [];
    return cachedSelectedStatuses;
  }
};

/**
 * Persists the per-status chip selection used by the Log screen.
 * Unknown values are filtered out before writing so callers cannot
 * corrupt storage.
 */
export const setViewSelectedStatuses = async (
  statuses: LogStatus[]
): Promise<void> => {
  try {
    const sanitized = statuses.filter(isLogStatus);
    await AsyncStorage.setItem(
      LOG_VIEW_SELECTED_STATUSES_KEY,
      JSON.stringify(sanitized),
    );
    cachedSelectedStatuses = sanitized;
  } catch (error) {
    console.error('Failed to set selected log statuses', error);
  }
};

/**
 * Retrieves a summary of log entries by status for today.
 * Filters by the view filter (or an explicit override) so the summary
 * reflects what the log list is showing.
 */
export const getLogSummary = async (
  filter: LogThreshold | null = null
): Promise<LogSummary> => {
  try {
    await flushBuffer();

    const existingLogs = await AsyncStorage.getItem(LOG_KEY);
    const logs: LogEntry[] = existingLogs
      ? normalizeLogs(JSON.parse(existingLogs) as StoredLogEntry[])
      : [];

    const summary: LogSummary = {
      DEBUG: 0,
      INFO: 0,
      WARNING: 0,
      ERROR: 0,
    };

    const viewFilter = filter || await getViewFilter();
    const viewThreshold = THRESHOLD_LEVEL[viewFilter];

    // Filter logs for today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    logs.forEach(log => {
      const statusSeverity = STATUS_SEVERITY[log.status] ?? STATUS_SEVERITY['INFO'];
      if (statusSeverity > viewThreshold) {
        return;
      }

      const logDate = new Date(log.timestamp);
      logDate.setHours(0, 0, 0, 0);

      if (logDate.getTime() === today.getTime()) {
        summary[log.status]++;
      }
    });
    return summary;
  } catch (error) {
    console.error('Failed to get log summary', error);
    return { DEBUG: 0, INFO: 0, WARNING: 0, ERROR: 0 };
  }
};

/**
 * Initializes the log service. Call once at app startup.
 * Warms the filter caches, prunes + normalizes old logs, and registers
 * an AppState listener to flush the buffer when the app backgrounds.
 */
export const initLogService = async (): Promise<void> => {
  await getCaptureLevel();
  await getViewFilter();
  await pruneLogs();

  appStateSubscription?.remove();
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
  cachedCaptureLevel = null;
  cachedViewFilter = null;
  cachedSelectedStatuses = null;
  writeBuffer = [];
  flushPromise = null;
  getViewPromise = null;
  consecutiveFlushFailures = 0;
  appStateSubscription?.remove();
  appStateSubscription = null;
};

/**
 * Direct reference to flushBuffer for explicit test control.
 */
export const _flushBuffer = flushBuffer;
