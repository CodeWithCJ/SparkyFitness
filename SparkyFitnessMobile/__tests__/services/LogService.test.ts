import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  addLog,
  getLogs,
  clearLogs,
  pruneLogs,
  setLogFilter,
  getLogFilter,
  getLogSummary,
  LogFilter,
} from '../../src/services/LogService';

describe('LogService', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
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

    test('addLog respects current filter threshold', async () => {
      await setLogFilter('warnings_errors');

      await addLog('Debug message', 'DEBUG');
      await addLog('Info message', 'INFO');

      // Use 'all' filter to see all logs that were actually stored
      const logs = await getLogs(0, 30, 'all');

      expect(logs).toHaveLength(0);
    });

    test('addLog stores logs at or below current filter threshold', async () => {
      await setLogFilter('warnings_errors');

      await addLog('Error message', 'ERROR');
      await addLog('Warning message', 'WARNING');

      const logs = await getLogs(0, 30, 'all');

      expect(logs).toHaveLength(2);
      expect(logs.map(l => l.status)).toEqual(['WARNING', 'ERROR']);
    });

    test('log entries have correct structure', async () => {
      await addLog('Test', 'SUCCESS', ['detail']);

      const logs = await getLogs(0, 30, 'all');

      expect(logs[0]).toMatchObject({
        message: 'Test',
        status: 'SUCCESS',
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

    test('when filter is null, uses stored filter', async () => {
      // Default filter is 'no_debug', so debug logs should be filtered out
      await setLogFilter('all');
      await addLog('Error log', 'ERROR');
      await addLog('Info log', 'INFO');

      // First, verify logs were stored by checking with 'all' filter
      const allLogs = await getLogs(0, 30, 'all');
      expect(allLogs).toHaveLength(2);

      // Now check that default filtering (null = stored filter = 'all') works
      const filteredLogs = await getLogs(0, 30, null);
      expect(filteredLogs).toHaveLength(2);

      // Change filter to 'errors_only' and verify filtering
      await setLogFilter('errors_only');
      const errorOnlyLogs = await getLogs(0, 30, null);
      expect(errorOnlyLogs).toHaveLength(1);
      expect(errorOnlyLogs[0].status).toBe('ERROR');
    });

    test('respects filter parameter over stored filter', async () => {
      // First store logs with permissive filter so they all get saved
      await setLogFilter('all');
      await addLog('Error log', 'ERROR');
      await addLog('Warning log', 'WARNING');
      await addLog('Info log', 'INFO');

      // Change stored filter to 'errors_only' - normally getLogs would only show error
      await setLogFilter('errors_only');

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

    test('does not affect log filter setting', async () => {
      await setLogFilter('errors_only');
      await addLog('Some log', 'ERROR');

      await clearLogs();

      const filter = await getLogFilter();
      expect(filter).toBe('errors_only');
    });

    test('succeeds when no logs exist', async () => {
      await expect(clearLogs()).resolves.toBeUndefined();
    });
  });

  describe('setLogFilter / getLogFilter', () => {
    test('persists log filter setting', async () => {
      await setLogFilter('all');

      const filter = await getLogFilter();

      expect(filter).toBe('all');
    });

    test('returns no_debug as default when no filter set', async () => {
      const filter = await getLogFilter();

      expect(filter).toBe('no_debug');
    });

    test('accepts all valid log filters', async () => {
      const filters: LogFilter[] = ['all', 'no_debug', 'warnings_errors', 'errors_only'];

      for (const f of filters) {
        await setLogFilter(f);
        const result = await getLogFilter();
        expect(result).toBe(f);
      }
    });

    test('invalid log filter preserves previous valid filter', async () => {
      await setLogFilter('warnings_errors');

      // Cast to bypass TypeScript, simulating runtime invalid input
      await setLogFilter('invalid' as LogFilter);

      const filter = await getLogFilter();
      expect(filter).toBe('warnings_errors');
    });
  });

  describe('getLogSummary', () => {
    test('returns zero counts when no logs exist', async () => {
      const summary = await getLogSummary();

      expect(summary).toEqual({
        DEBUG: 0,
        INFO: 0,
        SUCCESS: 0,
        WARNING: 0,
        ERROR: 0,
      });
    });

    test('counts only logs from today', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-06-15T10:00:00.000Z'));

      await addLog('Yesterday log', 'SUCCESS');

      // Move to next day
      jest.setSystemTime(new Date('2024-06-16T10:00:00.000Z'));

      await addLog('Today log', 'SUCCESS');

      const summary = await getLogSummary();

      expect(summary.SUCCESS).toBe(1);
    });

    test('counts all statuses to match list display', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-06-15T10:00:00.000Z'));

      await setLogFilter('all');
      await addLog('Success 1', 'SUCCESS');
      await addLog('Success 2', 'SUCCESS');
      await addLog('Warning', 'WARNING');
      await addLog('Error 1', 'ERROR');
      await addLog('Error 2', 'ERROR');
      await addLog('Error 3', 'ERROR');
      await addLog('Info status', 'INFO');
      await addLog('Debug status', 'DEBUG');

      const summary = await getLogSummary();

      expect(summary.SUCCESS).toBe(2);
      expect(summary.WARNING).toBe(1);
      expect(summary.ERROR).toBe(3);
      expect(summary.INFO).toBe(1);
      expect(summary.DEBUG).toBe(1);
    });

    test('filters by current filter to match getLogs display', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-06-15T10:00:00.000Z'));

      // Set to all to store all statuses
      await setLogFilter('all');

      await addLog('Info log', 'SUCCESS');
      await addLog('Warn log', 'WARNING');
      await addLog('Error log', 'ERROR');
      await addLog('Debug log', 'DEBUG');

      // With 'all' filter, all logs should be counted
      let summary = await getLogSummary();
      expect(summary.SUCCESS).toBe(1);
      expect(summary.WARNING).toBe(1);
      expect(summary.ERROR).toBe(1);
      expect(summary.DEBUG).toBe(1);

      // Change to 'errors_only' filter - only error logs should be counted
      await setLogFilter('errors_only');
      summary = await getLogSummary();
      expect(summary.SUCCESS).toBe(0);
      expect(summary.WARNING).toBe(0);
      expect(summary.ERROR).toBe(1);
      expect(summary.DEBUG).toBe(0);
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
      // Old info level with SUCCESS status should keep SUCCESS (second in array)
      expect(logs[1].status).toBe('SUCCESS');
      // Old error level should keep ERROR status (third in array)
      expect(logs[2].status).toBe('ERROR');
    });

    test('migrates old log level preference to new filter format', async () => {
      // Simulate old format log level preference
      await AsyncStorage.setItem('log_level', 'debug');

      const filter = await getLogFilter();

      // 'debug' should migrate to 'all'
      expect(filter).toBe('all');
    });

    test('cleans up old log level key after migration', async () => {
      // Simulate old format log level preference
      await AsyncStorage.setItem('log_level', 'warn');

      await getLogFilter();

      // Old key should be removed
      const oldValue = await AsyncStorage.getItem('log_level');
      expect(oldValue).toBeNull();
    });
  });
});
