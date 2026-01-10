import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  addLog,
  getLogs,
  clearLogs,
  pruneLogs,
  setLogLevel,
  getLogLevel,
  getLogSummary,
  LogLevel,
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

      const logs = await getLogs();

      expect(logs).toHaveLength(1);
      expect(logs[0].message).toBe('Test message');
      expect(logs[0].level).toBe('info');
      expect(logs[0].status).toBe('INFO');
      expect(logs[0].details).toEqual([]);
    });

    test('creates log entry with all specified values', async () => {
      await addLog('Error occurred', 'error', 'ERROR', ['detail1', 'detail2']);

      const logs = await getLogs();

      expect(logs).toHaveLength(1);
      expect(logs[0].message).toBe('Error occurred');
      expect(logs[0].level).toBe('error');
      expect(logs[0].status).toBe('ERROR');
      expect(logs[0].details).toEqual(['detail1', 'detail2']);
    });

    test('stores logs in descending chronological order (newest first)', async () => {
      await addLog('First');
      await addLog('Second');
      await addLog('Third');

      const logs = await getLogs();

      expect(logs).toHaveLength(3);
      expect(logs[0].message).toBe('Third');
      expect(logs[1].message).toBe('Second');
      expect(logs[2].message).toBe('First');
    });

    test('addLog respects current log level threshold', async () => {
      await setLogLevel('warn');

      await addLog('Debug message', 'debug');
      await addLog('Info message', 'info');

      // Use 'debug' filterLevel to see all logs that were actually stored
      const logs = await getLogs(0, 30, 'debug');

      expect(logs).toHaveLength(0);
    });

    test('addLog stores logs at or below current level', async () => {
      await setLogLevel('warn');

      await addLog('Error message', 'error');
      await addLog('Warning message', 'warn');

      const logs = await getLogs(0, 30, 'debug');

      expect(logs).toHaveLength(2);
      expect(logs.map(l => l.level)).toEqual(['warn', 'error']);
    });

    test('log entries have correct structure', async () => {
      await addLog('Test', 'info', 'SUCCESS', ['detail']);

      const logs = await getLogs();

      expect(logs[0]).toMatchObject({
        message: 'Test',
        level: 'info',
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

    test('when filterLevel is null, uses stored log level', async () => {
      // Default level is 'info', so debug logs should be filtered out
      await addLog('Error log', 'error');
      await addLog('Info log', 'info');

      // First, verify logs were stored by checking with 'debug' level
      const allLogs = await getLogs(0, 30, 'debug');
      expect(allLogs).toHaveLength(2);

      // Now check that default filtering (null = stored level = 'info') works
      const filteredLogs = await getLogs(0, 30, null);
      expect(filteredLogs).toHaveLength(2);

      // Change level to 'error' and verify filtering
      await setLogLevel('error');
      const errorOnlyLogs = await getLogs(0, 30, null);
      expect(errorOnlyLogs).toHaveLength(1);
      expect(errorOnlyLogs[0].level).toBe('error');
    });

    test('respects filterLevel parameter over stored level', async () => {
      // First store logs with permissive level so they all get saved
      await setLogLevel('debug');
      await addLog('Error log', 'error');
      await addLog('Warning log', 'warn');
      await addLog('Info log', 'info');

      // Change stored level to 'error' - normally getLogs would only show error
      await setLogLevel('error');

      // But with filterLevel='debug', we override and see all logs
      const logs = await getLogs(0, 30, 'debug');

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

      const logs = await getLogs(0, 30, 'debug');

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

      const logs = await getLogs(0, 30, 'debug');

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

      const logs = await getLogs(0, 30, 'debug');

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

      const logs = await getLogs(0, 30, 'debug');

      expect(logs).toEqual([]);
    });

    test('does not affect log level setting', async () => {
      await setLogLevel('error');
      await addLog('Some log', 'error');

      await clearLogs();

      const level = await getLogLevel();
      expect(level).toBe('error');
    });

    test('succeeds when no logs exist', async () => {
      await expect(clearLogs()).resolves.toBeUndefined();
    });
  });

  describe('setLogLevel / getLogLevel', () => {
    test('persists log level setting', async () => {
      await setLogLevel('debug');

      const level = await getLogLevel();

      expect(level).toBe('debug');
    });

    test('returns info as default when no level set', async () => {
      const level = await getLogLevel();

      expect(level).toBe('info');
    });

    test('accepts all valid log levels', async () => {
      const levels: LogLevel[] = ['silent', 'error', 'warn', 'info', 'debug'];

      for (const lvl of levels) {
        await setLogLevel(lvl);
        const result = await getLogLevel();
        expect(result).toBe(lvl);
      }
    });

    test('invalid log level preserves previous valid level', async () => {
      await setLogLevel('warn');

      // Cast to bypass TypeScript, simulating runtime invalid input
      await setLogLevel('invalid' as LogLevel);

      const level = await getLogLevel();
      expect(level).toBe('warn');
    });
  });

  describe('getLogSummary', () => {
    test('returns zero counts when no logs exist', async () => {
      const summary = await getLogSummary();

      expect(summary).toEqual({
        SUCCESS: 0,
        WARNING: 0,
        ERROR: 0,
        info: 0,
        warn: 0,
        error: 0,
        debug: 0,
      });
    });

    test('counts only logs from today', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-06-15T10:00:00.000Z'));

      await addLog('Yesterday log', 'info', 'SUCCESS');

      // Move to next day
      jest.setSystemTime(new Date('2024-06-16T10:00:00.000Z'));

      await addLog('Today log', 'info', 'SUCCESS');

      const summary = await getLogSummary();

      expect(summary.SUCCESS).toBe(1);
    });

    test('counts SUCCESS, WARNING, ERROR statuses', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-06-15T10:00:00.000Z'));

      await addLog('Success 1', 'info', 'SUCCESS');
      await addLog('Success 2', 'info', 'SUCCESS');
      await addLog('Warning', 'warn', 'WARNING');
      await addLog('Error 1', 'error', 'ERROR');
      await addLog('Error 2', 'error', 'ERROR');
      await addLog('Error 3', 'error', 'ERROR');
      await addLog('Info status', 'info', 'INFO'); // INFO status not counted

      const summary = await getLogSummary();

      expect(summary.SUCCESS).toBe(2);
      expect(summary.WARNING).toBe(1);
      expect(summary.ERROR).toBe(3);
    });

    test('counts logs by level', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-06-15T10:00:00.000Z'));

      // Set to debug to allow all levels to be stored
      await setLogLevel('debug');

      await addLog('Info 1', 'info', 'INFO');
      await addLog('Info 2', 'info', 'INFO');
      await addLog('Warn', 'warn', 'WARNING');
      await addLog('Error', 'error', 'ERROR');
      await addLog('Debug 1', 'debug', 'INFO');
      await addLog('Debug 2', 'debug', 'INFO');
      await addLog('Debug 3', 'debug', 'INFO');

      const summary = await getLogSummary();

      expect(summary.info).toBe(2);
      expect(summary.warn).toBe(1);
      expect(summary.error).toBe(1);
      expect(summary.debug).toBe(3);
    });
  });
});
