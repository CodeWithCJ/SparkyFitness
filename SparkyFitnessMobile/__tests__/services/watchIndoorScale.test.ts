import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getWatchIndoorScaleProfile,
  learnWatchIndoorScale,
  onWatchIndoorScaleChange,
  resetWatchIndoorScale,
} from '../../src/services/watchIndoorScale';
import { addLog } from '../../src/services/LogService';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(() => Promise.resolve()),
  },
}));
jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const mockedGetItem = jest.mocked(AsyncStorage.getItem);

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetItem.mockResolvedValue(null);
});

test('logs the inputs of a correction it learned from', async () => {
  mockedGetItem.mockResolvedValue(
    JSON.stringify({ run: { scale: 1.1, samples: 2 } })
  );
  await learnWatchIndoorScale('run', 1.1, 3300, 2736, 'watch');
  expect(addLog).toHaveBeenCalledWith(
    expect.stringContaining('Indoor run distance factor now'),
    'INFO',
    [
      'source: watch',
      'factor applied on the watch: 1.100',
      'watch showed: 3300 m',
      'watch raw (shown / applied): 3000 m',
      'entered: 2736 m',
      'factor before: 1.100 (2 corrections)',
    ]
  );
});

test('logs a correction that taught nothing, with its source', async () => {
  await learnWatchIndoorScale('run', 1, 3000, 3010, 'phone');
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  expect(addLog).toHaveBeenCalledWith(
    expect.stringContaining('taught nothing'),
    'INFO',
    expect.arrayContaining(['source: phone', 'factor before: none'])
  );
});

test('ignores kinds other than walk and run', async () => {
  await learnWatchIndoorScale('ride', 1, 3000, 2000);
  expect(addLog).not.toHaveBeenCalled();
});

describe('one run counts once', () => {
  let storage: string | null;
  beforeEach(() => {
    storage = null;
    mockedGetItem.mockImplementation(async () => storage);
    jest.mocked(AsyncStorage.setItem).mockImplementation(async (_k, v) => {
      storage = v;
    });
  });
  const stored = () => JSON.parse(storage ?? '{}').run;

  test('a phone edit replaces the distance typed on the wrist', async () => {
    await learnWatchIndoorScale('run', 1, 3000, 2700, 'watch', 'entry-1');
    expect(stored().samples).toBe(1);
    expect(stored().scale).toBeCloseTo(0.9, 5);

    await learnWatchIndoorScale('run', 1, 3000, 2850, 'phone', 'entry-1');
    expect(stored().samples).toBe(1);
    expect(stored().scale).toBeCloseTo(0.95, 5);
  });

  test('teaching the same run twice, as a retry does, changes nothing', async () => {
    await learnWatchIndoorScale('run', 1, 3000, 2700, 'watch', 'entry-1');
    const once = stored();
    await learnWatchIndoorScale('run', 1, 3000, 2700, 'watch', 'entry-1');
    expect(stored()).toEqual(once);
  });

  test('a replacement is blended with the runs before it, not with itself', async () => {
    await learnWatchIndoorScale('run', 1, 3000, 3300, 'watch', 'entry-1');
    await learnWatchIndoorScale('run', 1.1, 3300, 2700, 'watch', 'entry-2');
    const afterTwo = stored().scale;
    await learnWatchIndoorScale('run', 1.1, 3300, 2700, 'phone', 'entry-2');
    expect(stored().samples).toBe(2);
    expect(stored().scale).toBeCloseTo(afterTwo, 10);
  });

  test('a different run adds a sample', async () => {
    await learnWatchIndoorScale('run', 1, 3000, 2700, 'watch', 'entry-1');
    await learnWatchIndoorScale('run', 1, 3000, 2700, 'watch', 'entry-2');
    expect(stored().samples).toBe(2);
  });

  test('an edit that lands on the watch figure takes the run back out', async () => {
    await learnWatchIndoorScale('run', 1, 3000, 2700, 'watch', 'entry-1');
    await learnWatchIndoorScale('run', 1, 3000, 3005, 'phone', 'entry-1');
    expect(stored()).toBeUndefined();
  });

  test('without a run id every correction counts', async () => {
    await learnWatchIndoorScale('run', 1, 3000, 2700);
    await learnWatchIndoorScale('run', 1, 3000, 2700);
    expect(stored().samples).toBe(2);
  });
});

describe('the learned factor, as the settings screen reads and resets it', () => {
  let storage: string | null;
  beforeEach(() => {
    storage = JSON.stringify({
      run: { scale: 1.096, samples: 6, last: { runId: 'e', before: null } },
      walk: { scale: 0.95, samples: 1 },
    });
    mockedGetItem.mockImplementation(async () => storage);
    jest.mocked(AsyncStorage.setItem).mockImplementation(async (_k, v) => {
      storage = v;
    });
  });

  test('reads each kind, without the replace bookkeeping', async () => {
    expect(await getWatchIndoorScaleProfile()).toEqual({
      run: { scale: 1.096, samples: 6 },
      walk: { scale: 0.95, samples: 1 },
    });
  });

  test('reads null for a kind with nothing learned', async () => {
    storage = null;
    expect(await getWatchIndoorScaleProfile()).toEqual({
      run: null,
      walk: null,
    });
  });

  test('resets one kind, leaves the other and tells listeners', async () => {
    const listener = jest.fn();
    const unsubscribe = onWatchIndoorScaleChange(listener);

    expect(await resetWatchIndoorScale('run')).toBe(true);

    expect(JSON.parse(storage ?? '{}')).toEqual({
      walk: { scale: 0.95, samples: 1 },
    });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  test('reports a storage failure instead of throwing', async () => {
    jest
      .mocked(AsyncStorage.setItem)
      .mockRejectedValueOnce(new Error('disk full'));
    expect(await resetWatchIndoorScale('run')).toBe(false);
  });
});
