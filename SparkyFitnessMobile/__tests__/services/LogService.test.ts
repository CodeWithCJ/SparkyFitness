import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  addLog,
  getLogs,
  clearLogs,
  pruneLogs,
  setCaptureLevel,
  getCaptureLevel,
  setViewFilter,
  getViewFilter,
  setViewSelectedStatuses,
  getViewSelectedStatuses,
  getLogSummary,
  _resetForTesting,
  _flushBuffer,
  LogStatus,
  LogThreshold,
} from '../../src/services/LogService';

describe('LogService', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    _resetForTesting();
    await AsyncStorage.clear();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    _resetForTesting();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('addLog + getLogs', () => {
    test('creates retrievable log entry with default values', async () => {
      await addLog('Test message');

      const logs = await getLogs(0, 30, 'all');

      expect(logs).toHaveLength(1);
      expect(logs[0].message).toBe('Test message');
      expect(logs[0].status).toBe('INFO');
      expect(logs[0].details).toEqual([]);
    });

    test('creates log entry with all specified values', async () => {
      await addLog('Error occurred', 'ERROR', ['detail1', 'detail2']);

      const logs = await getLogs(0, 30, 'all');

      expect(logs).toHaveLength(1);
      expect(logs[0].message).toBe('Error occurred');
      expect(logs[0].status).toBe('ERROR');
      expect(logs[0].details).toEqual(['detail1', 'detail2']);
    });

    test('stores logs in descending chronological order (newest first)', async () => {
      await addLog('First');
      await addLog('Second');
      await addLog('Third');

      const logs = await getLogs(0, 30, 'all');

      expect(logs).toHaveLength(3);
      expect(logs[0].message).toBe('Third');
      expect(logs[1].message).toBe('Second');
      expect(logs[2].message).toBe('First');
    });

    test('addLog respects capture level, not view filter', async () => {
      // Capture restricts what's written to disk; view only affects read.
      await setCaptureLevel('errors_only');
      await setViewFilter('all');

      await addLog('Debug message', 'DEBUG');
      await addLog('Info message', 'INFO');
      await addLog('Warning message', 'WARNING');
      await addLog('Error message', 'ERROR');

      const logs = await getLogs(0, 30, 'all');

      expect(logs).toHaveLength(1);
      expect(logs[0].status).toBe('ERROR');
    });

    test('addLog stores logs at or below current capture threshold', async () => {
      await setCaptureLevel('warnings_errors');

      await addLog('Error message', 'ERROR');
      await addLog('Warning message', 'WARNING');

      const logs = await getLogs(0, 30, 'all');

      expect(logs).toHaveLength(2);
      expect(logs.map(l => l.status)).toEqual(['WARNING', 'ERROR']);
    });

    test('log entries have correct structure', async () => {
      await addLog('Test', 'INFO', ['detail']);

      const logs = await getLogs(0, 30, 'all');

      expect(logs[0]).toMatchObject({
        message: 'Test',
        status: 'INFO',
        details: ['detail'],
      });
      expect(logs[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('getLogs', () => {
    test('returns empty array when no logs exist', async () => {
      const logs = await getLogs();

      expect(logs).toEqual([]);
    });

    test('when filter is null, uses stored view filter', async () => {
      await setViewFilter('all');
      await addLog('Error log', 'ERROR');
      await addLog('Info log', 'INFO');

      // First, verify logs were stored by checking with 'all' filter
      const allLogs = await getLogs(0, 30, 'all');
      expect(allLogs).toHaveLength(2);

      // Now check that default filtering (null = stored view filter = 'all') works
      const filteredLogs = await getLogs(0, 30, null);
      expect(filteredLogs).toHaveLength(2);

      // Change view filter to 'errors_only' and verify filtering
      await setViewFilter('errors_only');
      const errorOnlyLogs = await getLogs(0, 30, null);
      expect(errorOnlyLogs).toHaveLength(1);
      expect(errorOnlyLogs[0].status).toBe('ERROR');
    });

    test('respects filter parameter over stored view filter', async () => {
      // Capture=all so every entry lands on disk regardless of view.
      await setCaptureLevel('all');
      await addLog('Error log', 'ERROR');
      await addLog('Warning log', 'WARNING');
      await addLog('Info log', 'INFO');

      // Stored view filter is 'errors_only' — normally getLogs would only show errors
      await setViewFilter('errors_only');

      // But with filter='all', we override and see all logs
      const logs = await getLogs(0, 30, 'all');

      expect(logs).toHaveLength(3);
    });

    test('applies pagination with offset and limit', async () => {
      for (let i = 1; i <= 5; i++) {
        await addLog(`Log ${i}`);
      }

      const page1 = await getLogs(0, 2);
      const page2 = await getLogs(2, 2);
      const page3 = await getLogs(4, 2);

      expect(page1).toHaveLength(2);
      expect(page1[0].message).toBe('Log 5');
      expect(page1[1].message).toBe('Log 4');

      expect(page2).toHaveLength(2);
      expect(page2[0].message).toBe('Log 3');
      expect(page2[1].message).toBe('Log 2');

      expect(page3).toHaveLength(1);
      expect(page3[0].message).toBe('Log 1');
    });

    test('offset beyond available logs returns empty array', async () => {
      await addLog('Only log');

      const logs = await getLogs(10, 30);

      expect(logs).toEqual([]);
    });

    test('limit larger than available returns all available', async () => {
      await addLog('Log 1');
      await addLog('Log 2');

      const logs = await getLogs(0, 100);

      expect(logs).toHaveLength(2);
    });
  });

  describe('pruneLogs', () => {
    test('removes logs older than specified days', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-06-15T10:00:00.000Z'));

      await addLog('Old log');

      // Move time forward 5 days
      jest.setSystemTime(new Date('2024-06-20T10:00:00.000Z'));

      await addLog('New log');
      await pruneLogs(3);

      const logs = await getLogs(0, 30, 'all');

      expect(logs).toHaveLength(1);
      expect(logs[0].message).toBe('New log');
    });

    test('preserves logs within retention period', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-06-15T10:00:00.000Z'));

      await addLog('Recent log');

      // Move time forward only 1 day
      jest.setSystemTime(new Date('2024-06-16T10:00:00.000Z'));

      await pruneLogs(3);

      const logs = await getLogs(0, 30, 'all');

      expect(logs).toHaveLength(1);
      expect(logs[0].message).toBe('Recent log');
    });

    test('defaults to 3 days retention', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-06-15T10:00:00.000Z'));

      await addLog('Old log');

      // Move time forward 4 days
      jest.setSystemTime(new Date('2024-06-19T10:00:00.000Z'));

      await pruneLogs(); // No parameter = default 3 days

      const logs = await getLogs(0, 30, 'all');

      expect(logs).toHaveLength(0);
    });

    test('handles empty log list without error', async () => {
      await expect(pruneLogs()).resolves.toBeUndefined();
    });

    test('normalizes legacy SUCCESS entries on disk even when none age out', async () => {
      // Seed storage with a legacy-format entry that should be rewritten.
      const legacy = [
        {
          timestamp: new Date().toISOString(),
          message: 'Legacy success',
          status: 'SUCCESS',
          details: [],
        },
      ];
      await AsyncStorage.setItem('app_logs', JSON.stringify(legacy));

      await pruneLogs(30);

      const raw = await AsyncStorage.getItem('app_logs');
      const parsed = JSON.parse(raw!);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].status).toBe('INFO');
    });
  });

  describe('clearLogs', () => {
    test('removes all log entries', async () => {
      await addLog('Log 1');
      await addLog('Log 2');
      await addLog('Log 3');

      await clearLogs();

      const logs = await getLogs(0, 30, 'all');

      expect(logs).toEqual([]);
    });

    test('does not affect view filter setting', async () => {
      await setViewFilter('errors_only');
      await addLog('Some log', 'ERROR');

      await clearLogs();

      const filter = await getViewFilter();
      expect(filter).toBe('errors_only');
    });

    test('succeeds when no logs exist', async () => {
      await expect(clearLogs()).resolves.toBeUndefined();
    });

    test('clears buffered entries that have not been flushed', async () => {
      await addLog('Buffered log');

      // Don't flush — clearLogs should discard the buffer
      await clearLogs();

      const logs = await getLogs(0, 30, 'all');
      expect(logs).toEqual([]);
    });

    test('waits for in-flight flush before removing storage', async () => {
      // Trigger a flush so flushPromise is set
      await addLog('Entry before clear');
      const flushDone = _flushBuffer();

      // clearLogs runs while flush is in progress — should wait for it,
      // then remove storage so the flushed entries don't survive.
      await clearLogs();
      await flushDone;

      const logs = await getLogs(0, 30, 'all');
      expect(logs).toEqual([]);
    });

    test('discards entries requeued by a failed in-flight flush', async () => {
      await addLog('Will be requeued');

      // Make setItem fail once so flushBuffer's catch path restores entries
      jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(
        new Error('simulated storage failure')
      );

      // Start a flush that will fail and requeue entries into writeBuffer
      const flushDone = _flushBuffer();

      // clearLogs awaits the failed flush, then re-clears writeBuffer
      await clearLogs();
      await flushDone;

      const logs = await getLogs(0, 30, 'all');
      expect(logs).toEqual([]);
    });
  });

  describe('setCaptureLevel / getCaptureLevel', () => {
    test('persists capture level setting', async () => {
      await setCaptureLevel('warnings_errors');

      const level = await getCaptureLevel();

      expect(level).toBe('warnings_errors');
    });

    test('returns "all" as default on fresh install', async () => {
      const level = await getCaptureLevel();

      expect(level).toBe('all');
    });

    test('accepts all valid thresholds', async () => {
      const levels: LogThreshold[] = ['all', 'no_debug', 'warnings_errors', 'errors_only'];

      for (const lvl of levels) {
        await setCaptureLevel(lvl);
        const result = await getCaptureLevel();
        expect(result).toBe(lvl);
      }
    });

    test('invalid capture level preserves previous valid setting', async () => {
      await setCaptureLevel('warnings_errors');

      await setCaptureLevel('invalid' as LogThreshold);

      const level = await getCaptureLevel();
      expect(level).toBe('warnings_errors');
    });

    test('getCaptureLevel returns cached value without hitting AsyncStorage', async () => {
      await setCaptureLevel('errors_only');

      await getCaptureLevel();

      await AsyncStorage.removeItem('log_capture_level');

      const level = await getCaptureLevel();
      expect(level).toBe('errors_only');
    });

    test('does not migrate from old log_filter key (captures stays at default)', async () => {
      // Legacy combined filter belongs to view, not capture.
      await AsyncStorage.setItem('log_filter', 'errors_only');

      const level = await getCaptureLevel();
      expect(level).toBe('all');
    });
  });

  describe('setViewFilter / getViewFilter', () => {
    test('persists view filter setting', async () => {
      await setViewFilter('all');

      const filter = await getViewFilter();

      expect(filter).toBe('all');
    });

    test('returns "no_debug" as default on fresh install', async () => {
      const filter = await getViewFilter();

      expect(filter).toBe('no_debug');
    });

    test('accepts all valid thresholds', async () => {
      const filters: LogThreshold[] = ['all', 'no_debug', 'warnings_errors', 'errors_only'];

      for (const f of filters) {
        await setViewFilter(f);
        const result = await getViewFilter();
        expect(result).toBe(f);
      }
    });

    test('invalid view filter preserves previous valid filter', async () => {
      await setViewFilter('warnings_errors');

      await setViewFilter('invalid' as LogThreshold);

      const filter = await getViewFilter();
      expect(filter).toBe('warnings_errors');
    });

    test('getViewFilter returns cached value without hitting AsyncStorage', async () => {
      await setViewFilter('all');

      await getViewFilter();

      await AsyncStorage.removeItem('log_view_filter');

      const filter = await getViewFilter();
      expect(filter).toBe('all');
    });

    test('capture and view settings are independent', async () => {
      await setCaptureLevel('errors_only');
      await setViewFilter('all');

      expect(await getCaptureLevel()).toBe('errors_only');
      expect(await getViewFilter()).toBe('all');

      await setCaptureLevel('all');
      await setViewFilter('warnings_errors');

      expect(await getCaptureLevel()).toBe('all');
      expect(await getViewFilter()).toBe('warnings_errors');
    });

    test('concurrent getViewFilter calls during init do not double-migrate', async () => {
      // Seed the legacy key the migration reads from.
      await AsyncStorage.setItem('log_filter', 'warnings_errors');

      // Fire several concurrent reads at cold cache.
      const results = await Promise.all([
        getViewFilter(),
        getViewFilter(),
        getViewFilter(),
      ]);

      expect(results).toEqual(['warnings_errors', 'warnings_errors', 'warnings_errors']);

      // Legacy key must be cleaned up.
      expect(await AsyncStorage.getItem('log_filter')).toBeNull();
      // Migrated value is persisted to the new key.
      expect(await AsyncStorage.getItem('log_view_filter')).toBe('warnings_errors');
    });
  });

  describe('setViewSelectedStatuses / getViewSelectedStatuses', () => {
    test('returns empty array as default on fresh install', async () => {
      const statuses = await getViewSelectedStatuses();
      expect(statuses).toEqual([]);
    });

    test('persists selected statuses across reads', async () => {
      await setViewSelectedStatuses(['INFO', 'ERROR']);

      const statuses = await getViewSelectedStatuses();
      expect(statuses).toEqual(['INFO', 'ERROR']);
    });

    test('round-trips an empty selection (means show all)', async () => {
      await setViewSelectedStatuses(['INFO']);
      await setViewSelectedStatuses([]);

      const statuses = await getViewSelectedStatuses();
      expect(statuses).toEqual([]);
    });

    test('drops invalid status values silently when reading', async () => {
      // Direct write of mixed-validity payload to simulate corruption.
      await AsyncStorage.setItem(
        'log_view_selected_statuses',
        JSON.stringify(['INFO', 'BOGUS', 'ERROR']),
      );

      const statuses = await getViewSelectedStatuses();
      expect(statuses).toEqual(['INFO', 'ERROR']);
    });

    test('drops invalid status values when writing', async () => {
      await setViewSelectedStatuses(['INFO', 'BOGUS' as LogStatus, 'WARNING']);

      const statuses = await getViewSelectedStatuses();
      expect(statuses).toEqual(['INFO', 'WARNING']);
    });

    test('treats malformed stored JSON as empty selection', async () => {
      await AsyncStorage.setItem('log_view_selected_statuses', 'not-json');

      const statuses = await getViewSelectedStatuses();
      expect(statuses).toEqual([]);
    });

    test('returns cached value without hitting AsyncStorage', async () => {
      await setViewSelectedStatuses(['WARNING']);

      // Warm the cache.
      await getViewSelectedStatuses();

      await AsyncStorage.removeItem('log_view_selected_statuses');

      const statuses = await getViewSelectedStatuses();
      expect(statuses).toEqual(['WARNING']);
    });

    describe('threshold migration', () => {
      test.each<[LogThreshold, LogStatus[]]>([
        ['all', []],
        ['no_debug', ['ERROR', 'WARNING', 'INFO']],
        ['warnings_errors', ['ERROR', 'WARNING']],
        ['errors_only', ['ERROR']],
      ])('translates persisted "%s" threshold into chip selection', async (threshold, expected) => {
        await setViewFilter(threshold);
        _resetForTesting();

        const statuses = await getViewSelectedStatuses();
        expect(statuses).toEqual(expected);
      });

      test('prefers stored chip selection over legacy threshold', async () => {
        await setViewFilter('errors_only');
        await setViewSelectedStatuses(['INFO', 'WARNING']);
        _resetForTesting();

        const statuses = await getViewSelectedStatuses();
        expect(statuses).toEqual(['INFO', 'WARNING']);
      });

      test('migrates from the old log_filter key via getViewFilter chain', async () => {
        await AsyncStorage.setItem('log_filter', 'errors_only');
        // Simulate initLogService running getViewFilter once — it moves
        // `log_filter` → `log_view_filter` and deletes the old key.
        await getViewFilter();
        _resetForTesting();

        const statuses = await getViewSelectedStatuses();
        expect(statuses).toEqual(['ERROR']);
      });

      test('does not translate when no threshold has ever been persisted', async () => {
        const statuses = await getViewSelectedStatuses();
        expect(statuses).toEqual([]);
      });

      test('ignores invalid threshold values stored under log_view_filter', async () => {
        await AsyncStorage.setItem('log_view_filter', 'not-a-threshold');

        const statuses = await getViewSelectedStatuses();
        expect(statuses).toEqual([]);
      });

      test('translation does not mutate the shared threshold map', async () => {
        await setViewFilter('no_debug');
        _resetForTesting();

        const first = await getViewSelectedStatuses();
        first.push('DEBUG');
        _resetForTesting();

        const second = await getViewSelectedStatuses();
        expect(second).toEqual(['ERROR', 'WARNING', 'INFO']);
      });
    });
  });

  describe('getLogSummary', () => {
    test('returns zero counts when no logs exist', async () => {
      const summary = await getLogSummary();

      expect(summary).toEqual({
        DEBUG: 0,
        INFO: 0,
        WARNING: 0,
        ERROR: 0,
      });
    });

    test('counts only logs from today', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-06-15T10:00:00.000Z'));

      await addLog('Yesterday log', 'INFO');

      // Move to next day
      jest.setSystemTime(new Date('2024-06-16T10:00:00.000Z'));

      await addLog('Today log', 'INFO');

      const summary = await getLogSummary();

      expect(summary.INFO).toBe(1);
    });

    test('counts all statuses to match list display', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-06-15T10:00:00.000Z'));

      await setCaptureLevel('all');
      await setViewFilter('all');
      await addLog('Info 1', 'INFO');
      await addLog('Info 2', 'INFO');
      await addLog('Warning', 'WARNING');
      await addLog('Error 1', 'ERROR');
      await addLog('Error 2', 'ERROR');
      await addLog('Error 3', 'ERROR');
      await addLog('Debug status', 'DEBUG');

      const summary = await getLogSummary();

      expect(summary.INFO).toBe(2);
      expect(summary.WARNING).toBe(1);
      expect(summary.ERROR).toBe(3);
      expect(summary.DEBUG).toBe(1);
    });

    test('filters by current view filter to match getLogs display', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-06-15T10:00:00.000Z'));

      // Capture=all so every entry persists regardless of view
      await setCaptureLevel('all');
      await setViewFilter('all');

      await addLog('Info log', 'INFO');
      await addLog('Warn log', 'WARNING');
      await addLog('Error log', 'ERROR');
      await addLog('Debug log', 'DEBUG');

      // With 'all' view filter, all logs should be counted
      let summary = await getLogSummary();
      expect(summary.INFO).toBe(1);
      expect(summary.WARNING).toBe(1);
      expect(summary.ERROR).toBe(1);
      expect(summary.DEBUG).toBe(1);

      // Change view to 'errors_only' — only error logs should be counted
      await setViewFilter('errors_only');
      summary = await getLogSummary();
      expect(summary.INFO).toBe(0);
      expect(summary.WARNING).toBe(0);
      expect(summary.ERROR).toBe(1);
      expect(summary.DEBUG).toBe(0);
    });

    test("'all' override returns unfiltered counts (for diagnostics)", async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-06-15T10:00:00.000Z'));

      await setCaptureLevel('all');
      await setViewFilter('errors_only');

      await addLog('Info log', 'INFO');
      await addLog('Warn log', 'WARNING');
      await addLog('Error log', 'ERROR');
      await addLog('Debug log', 'DEBUG');

      const summary = await getLogSummary('all');

      expect(summary.INFO).toBe(1);
      expect(summary.WARNING).toBe(1);
      expect(summary.ERROR).toBe(1);
      expect(summary.DEBUG).toBe(1);
    });
  });

  describe('Migration', () => {
    test('migrates old log entries with level field to new format', async () => {
      // Simulate old format log entries directly in storage
      const oldLogs = [
        { timestamp: new Date().toISOString(), message: 'Debug log', level: 'debug', status: 'INFO', details: [] },
        { timestamp: new Date().toISOString(), message: 'Success log', level: 'info', status: 'SUCCESS', details: [] },
        { timestamp: new Date().toISOString(), message: 'Error log', level: 'error', status: 'ERROR', details: [] },
      ];
      await AsyncStorage.setItem('app_logs', JSON.stringify(oldLogs));

      // getLogs should migrate on read
      const logs = await getLogs(0, 30, 'all');

      expect(logs).toHaveLength(3);
      // Old debug level should become DEBUG status (first in array)
      expect(logs[0].status).toBe('DEBUG');
      // Old SUCCESS status folds into INFO (second in array)
      expect(logs[1].status).toBe('INFO');
      // Old error level should keep ERROR status (third in array)
      expect(logs[2].status).toBe('ERROR');
    });

    test('migrates SUCCESS-only entries (no legacy level field) to INFO on read', async () => {
      const entries = [
        { timestamp: new Date().toISOString(), message: 'SUCCESS only', status: 'SUCCESS', details: [] },
      ];
      await AsyncStorage.setItem('app_logs', JSON.stringify(entries));

      const logs = await getLogs(0, 30, 'all');

      expect(logs).toHaveLength(1);
      expect(logs[0].status).toBe('INFO');
    });

    test('migrates old log_filter key to log_view_filter and deletes it', async () => {
      await AsyncStorage.setItem('log_filter', 'warnings_errors');

      const filter = await getViewFilter();
      expect(filter).toBe('warnings_errors');

      // Old key should be deleted
      expect(await AsyncStorage.getItem('log_filter')).toBeNull();
      // New key should have the migrated value
      expect(await AsyncStorage.getItem('log_view_filter')).toBe('warnings_errors');
    });

    test('migrates old log_level key to log_view_filter (not capture)', async () => {
      await AsyncStorage.setItem('log_level', 'debug');

      const filter = await getViewFilter();

      // 'debug' should migrate to 'all'
      expect(filter).toBe('all');
      expect(await AsyncStorage.getItem('log_level')).toBeNull();

      // Capture should remain default — legacy value never routes to capture
      expect(await getCaptureLevel()).toBe('all');
    });

    test('cleans up old log_level key after migration', async () => {
      await AsyncStorage.setItem('log_level', 'warn');

      await getViewFilter();

      const oldValue = await AsyncStorage.getItem('log_level');
      expect(oldValue).toBeNull();
    });
  });

  describe('Write buffering', () => {
    test('buffers entries and flushes them to storage on getLogs', async () => {
      await addLog('Buffered entry 1');
      await addLog('Buffered entry 2');

      // Entries should not be in AsyncStorage yet (below flush threshold)
      const rawBefore = await AsyncStorage.getItem('app_logs');
      expect(rawBefore).toBeNull();

      // getLogs flushes before reading
      const logs = await getLogs(0, 30, 'all');
      expect(logs).toHaveLength(2);

      // Now entries should be in AsyncStorage
      const rawAfter = await AsyncStorage.getItem('app_logs');
      expect(rawAfter).not.toBeNull();
      expect(JSON.parse(rawAfter!)).toHaveLength(2);
    });

    test('flushes immediately when buffer hits threshold', async () => {
      // Add enough entries to trigger an immediate flush (FLUSH_THRESHOLD = 20)
      for (let i = 0; i < 20; i++) {
        await addLog(`Entry ${i}`);
      }

      // Should have been flushed to storage already
      const raw = await AsyncStorage.getItem('app_logs');
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw!).length).toBe(20);
    });

    test('explicit _flushBuffer writes buffered entries to storage', async () => {
      await addLog('Manual flush test');

      await _flushBuffer();

      const raw = await AsyncStorage.getItem('app_logs');
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw!)).toHaveLength(1);
      expect(JSON.parse(raw!)[0].message).toBe('Manual flush test');
    });

    test('_flushBuffer is a no-op when buffer is empty', async () => {
      await _flushBuffer();

      const raw = await AsyncStorage.getItem('app_logs');
      expect(raw).toBeNull();
    });

    test('flush merges with existing entries in storage', async () => {
      // Pre-populate storage with an existing entry
      const existing = [{ timestamp: '2024-01-01T00:00:00.000Z', message: 'Existing', status: 'INFO', details: [] }];
      await AsyncStorage.setItem('app_logs', JSON.stringify(existing));

      await addLog('New entry');
      await _flushBuffer();

      const raw = await AsyncStorage.getItem('app_logs');
      const logs = JSON.parse(raw!);
      expect(logs).toHaveLength(2);
      expect(logs[0].message).toBe('New entry');
      expect(logs[1].message).toBe('Existing');
    });

    test('flush caps total entries at MAX_LOG_ENTRIES', async () => {
      // Pre-populate storage with entries near the cap
      const existing = Array.from({ length: 995 }, (_, i) => ({
        timestamp: new Date().toISOString(),
        message: `Old ${i}`,
        status: 'INFO',
        details: [],
      }));
      await AsyncStorage.setItem('app_logs', JSON.stringify(existing));

      // Add 10 new entries
      for (let i = 0; i < 10; i++) {
        await addLog(`New ${i}`);
      }
      await _flushBuffer();

      const raw = await AsyncStorage.getItem('app_logs');
      const logs = JSON.parse(raw!);
      expect(logs.length).toBe(1000);
      // Newest entries should be first
      expect(logs[0].message).toBe('New 9');
    });

    test('_resetForTesting clears all buffer state', async () => {
      await addLog('Should be cleared');

      _resetForTesting();

      // Buffer should be empty — flushing should write nothing
      await _flushBuffer();

      const raw = await AsyncStorage.getItem('app_logs');
      expect(raw).toBeNull();
    });

    test('getLogs waits for in-flight flush even when buffer is empty', async () => {
      await addLog('Entry during flush');

      // Start a flush — this swaps writeBuffer to [] immediately
      const flushDone = _flushBuffer();

      // getLogs runs while flush is in progress. The buffer is empty (already
      // swapped), but getLogs should still wait for the flush to commit.
      const logs = await getLogs(0, 30, 'all');
      await flushDone;

      expect(logs).toHaveLength(1);
      expect(logs[0].message).toBe('Entry during flush');
    });
  });
});
