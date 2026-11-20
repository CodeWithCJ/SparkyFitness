import { AppState, type AppStateStatus } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';

import type {
  GarminStatus,
  WatchConnectivityEvents,
  WatchContextPayload,
} from '../../modules/watch-connectivity';

jest.mock('../../modules/watch-connectivity', () => ({
  __esModule: true,
  default: {
    isSupported: jest.fn(() => true),
    isGarminAvailable: jest.fn(() => true),
    updateContext: jest.fn(() => Promise.resolve()),
    addListener: jest.fn(),
  },
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/services/garminSync', () => ({
  getGarminSync: jest.fn(),
  garminAccountEpoch: jest.fn(() => 0),
  stopGarminWhenDisabled: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../src/constants/garmin', () => ({
  isGarminWatchEnabled: jest.fn(() => true),
}));
// What rendering the whole bridge needs, for the account epoch of a push.
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query'
  ),
  useQuery: jest.fn(() => ({ data: undefined })),
}));
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: jest.fn(() => ({ preferences: undefined })),
}));
jest.mock('../../src/hooks/useCustomNutrients', () => ({
  useCustomNutrients: jest.fn(() => ({ customNutrients: [] })),
}));
jest.mock('../../src/hooks/useDailySummary', () => ({
  useDailySummary: jest.fn(() => ({ summary: undefined })),
}));
jest.mock('../../src/hooks/useSleepDay', () => ({
  useSleepDay: jest.fn(() => ({ wakeUp: null, naps: [] })),
}));
jest.mock('../../src/hooks/useSuggestedExercises', () => ({
  useSuggestedExercises: jest.fn(() => ({
    recentExercises: [],
    topExercises: [],
  })),
}));
jest.mock('../../src/hooks/useWorkoutPresets', () => ({
  useWorkoutPresets: jest.fn(() => ({ presets: [] })),
}));
jest.mock('../../src/hooks/useActiveWorkoutPlan', () => ({
  useActiveWorkoutPlans: jest.fn(() => ({ plans: [] })),
}));
jest.mock('../../src/hooks/useFasting', () => ({
  useCurrentFast: jest.fn(() => ({ data: undefined })),
}));
jest.mock('../../src/hooks/useZone2HeartRateBand', () => ({
  useZone2HeartRateBand: jest.fn(() => null),
}));
jest.mock('../../src/hooks/useWatchHeartRateZoneFloors', () => ({
  useWatchHeartRateZoneFloors: jest.fn(() => null),
}));
jest.mock('../../src/services/runProgramService', () => ({
  useRunProgram: jest.fn(() => ({ status: null, enabled: false })),
}));
jest.mock('../../src/utils/watchRunPlans', () => ({
  buildWatchRunPlans: jest.fn(() => []),
}));
jest.mock('../../src/services/watchIndoorScale', () => ({
  getWatchIndoorScale: jest.fn(() => Promise.resolve(null)),
  onWatchIndoorScaleChange: jest.fn(() => () => {}),
}));
jest.mock('../../src/services/gpsRecordingService', () => ({
  getRecordingPreferences: jest.fn(() =>
    Promise.resolve({
      audioCues: false,
      autoPause: false,
      checkInMinutes: 0,
      heartRateBand: null,
      paceBand: null,
    })
  ),
  onRecordingPreferenceChange: jest.fn(() => () => {}),
}));
jest.mock('../../src/services/watchServerCredentials', () => ({
  syncWatchServerCredentials: jest.fn(),
  isPayloadForActiveServer: jest.fn(() => Promise.resolve(true)),
}));
jest.mock('../../src/services/api/measurementsApi', () => ({
  fetchMeasurementsRange: jest.fn(() => Promise.resolve([])),
}));
jest.mock('../../src/services/storage', () => ({
  getActiveServerConfigId: jest.fn(() => Promise.resolve('server-1')),
}));

import {
  hasWatchTransport,
  sendContextToWatches,
  subscribeGarminSync,
  useGarminWatchSync,
  useWatchCheckInBridge,
} from '../../src/hooks/useWatchCheckInBridge';
import {
  garminAccountEpoch,
  getGarminSync,
  stopGarminWhenDisabled,
  type GarminSync,
} from '../../src/services/garminSync';
import { syncWatchServerCredentials } from '../../src/services/watchServerCredentials';
import { buildGarminSnapshot } from '../../src/utils/garminSnapshot';
import { addLog } from '../../src/services/LogService';
import { isGarminWatchEnabled } from '../../src/constants/garmin';

const watch = (
  jest.requireMock('../../modules/watch-connectivity') as {
    default: {
      isSupported: jest.Mock;
      isGarminAvailable?: jest.Mock;
      updateContext: jest.Mock;
      addListener: jest.Mock;
    };
  }
).default;
const mockedGetGarminSync = getGarminSync as jest.MockedFunction<
  typeof getGarminSync
>;
const mockedGarminEnabled = isGarminWatchEnabled as jest.MockedFunction<
  typeof isGarminWatchEnabled
>;
const mockedAccountEpoch = garminAccountEpoch as jest.MockedFunction<
  typeof garminAccountEpoch
>;
const mockedSyncCredentials = syncWatchServerCredentials as jest.MockedFunction<
  typeof syncWatchServerCredentials
>;

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function fakeGarminSync(): jest.Mocked<GarminSync> {
  return {
    publish: jest.fn(() => Promise.resolve()),
    accountEpoch: jest.fn(() => 0),
    resync: jest.fn(() => Promise.resolve()),
    updateStatus: jest.fn(),
    start: jest.fn(() => Promise.resolve()),
    refreshDevices: jest.fn(() => Promise.resolve()),
    forgetAll: jest.fn(),
    clearAccount: jest.fn(() => Promise.resolve()),
  };
}

const context: WatchContextPayload = {
  pushedAt: 1_763_500_000_000,
  today: '2026-11-19',
  history: [],
  ackedClientIds: [],
  failedClientIds: [],
  energyUnit: 'kcal',
  workoutServerId: 'server-1',
  caloriesConsumed: 1200,
  caloriesBurned: 300,
  caloriesRemaining: 900,
  calorieGoalProgress: 0.5,
  goalNutrients: [],
};

describe('sendContextToWatches', () => {
  let garmin: jest.Mocked<GarminSync>;

  beforeEach(() => {
    jest.clearAllMocks();
    garmin = fakeGarminSync();
    mockedGetGarminSync.mockReturnValue(garmin);
    watch.isSupported.mockReturnValue(true);
    watch.updateContext.mockResolvedValue(undefined);
  });

  test('sends the context and publishes its Garmin snapshot, with the account epoch, when both transports are there', async () => {
    await sendContextToWatches(context, 2);

    expect(watch.updateContext).toHaveBeenCalledWith(context);
    expect(garmin.publish).toHaveBeenCalledWith(
      buildGarminSnapshot(context),
      2
    );
  });

  test('a push that started before there was a Garmin sync publishes nothing to it', async () => {
    await sendContextToWatches(context, null);

    expect(watch.updateContext).toHaveBeenCalledWith(context);
    expect(garmin.publish).not.toHaveBeenCalled();
  });

  test('starts both sends before waiting for either', () => {
    watch.updateContext.mockReturnValue(new Promise<void>(() => {}));

    void sendContextToWatches(context, 0);

    expect(watch.updateContext).toHaveBeenCalledTimes(1);
    expect(garmin.publish).toHaveBeenCalledTimes(1);
  });

  test('a failed Wear OS push still publishes the Garmin snapshot', async () => {
    watch.updateContext.mockRejectedValue(new Error('data layer down'));

    await expect(sendContextToWatches(context, 0)).resolves.toBeUndefined();

    expect(garmin.publish).toHaveBeenCalledTimes(1);
    expect(addLog).toHaveBeenCalledWith(
      'Watch context push failed: Error: data layer down',
      'WARNING'
    );
  });

  test('does not wait for the Garmin publish, which can take a send timeout per watch', async () => {
    garmin.publish.mockReturnValue(new Promise<void>(() => {}));

    const outcome = await Promise.race([
      sendContextToWatches(context, 0).then(() => 'returned'),
      flush().then(() => 'still waiting'),
    ]);

    expect(outcome).toBe('returned');
    expect(garmin.publish).toHaveBeenCalledTimes(1);
  });

  test('a failed Garmin publish does not affect the Wear OS push', async () => {
    garmin.publish.mockRejectedValue(new Error('no Garmin Connect'));

    await expect(sendContextToWatches(context, 0)).resolves.toBeUndefined();
    await flush();

    expect(watch.updateContext).toHaveBeenCalledWith(context);
    expect(addLog).toHaveBeenCalledWith(
      'Garmin snapshot push failed: Error: no Garmin Connect',
      'WARNING'
    );
  });

  test('a send that throws before returning a promise is logged too', async () => {
    watch.updateContext.mockImplementation(() => {
      throw new Error('bridge gone');
    });

    await sendContextToWatches(context, 0);

    expect(garmin.publish).toHaveBeenCalledTimes(1);
    expect(addLog).toHaveBeenCalledWith(
      'Watch context push failed: Error: bridge gone',
      'WARNING'
    );
  });

  test('without a Garmin sync (no Garmin Connect, iOS) only the context goes out', async () => {
    mockedGetGarminSync.mockReturnValue(null);

    await sendContextToWatches(context, 0);

    expect(watch.updateContext).toHaveBeenCalledTimes(1);
    expect(garmin.publish).not.toHaveBeenCalled();
    expect(addLog).not.toHaveBeenCalled();
  });

  test('with Garmin only, the Wear OS context is not sent', async () => {
    watch.isSupported.mockReturnValue(false);

    await sendContextToWatches(context, 0);

    expect(watch.updateContext).not.toHaveBeenCalled();
    expect(garmin.publish).toHaveBeenCalledTimes(1);
  });
});

describe('subscribeGarminSync', () => {
  type ResyncListener = WatchConnectivityEvents['onGarminResync'];
  type StatusListener = WatchConnectivityEvents['onGarminStatusChange'];

  let resyncListener: ResyncListener | null;
  let statusListener: StatusListener | null;
  let removes: jest.Mock[];
  let appStateHandler: ((state: AppStateStatus) => void) | null;
  let appStateRemove: jest.Mock;
  let garmin: jest.Mocked<GarminSync>;

  const foreground = async () => {
    appStateHandler?.('active');
    await flush();
  };

  beforeEach(() => {
    jest.clearAllMocks();
    resyncListener = null;
    statusListener = null;
    removes = [];
    appStateHandler = null;
    appStateRemove = jest.fn();
    garmin = fakeGarminSync();
    mockedGetGarminSync.mockReturnValue(garmin);
    watch.addListener.mockImplementation(
      (event: keyof WatchConnectivityEvents, listener: unknown) => {
        if (event === 'onGarminResync') {
          resyncListener = listener as ResyncListener;
        }
        if (event === 'onGarminStatusChange') {
          statusListener = listener as StatusListener;
        }
        const remove = jest.fn();
        removes.push(remove);
        return { remove };
      }
    );
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_event, handler) => {
        appStateHandler = handler as (state: AppStateStatus) => void;
        return { remove: appStateRemove };
      });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('listens, then starts the link and reads the watches', async () => {
    subscribeGarminSync();
    await flush();

    expect(watch.addListener).toHaveBeenCalledWith(
      'onGarminResync',
      expect.any(Function)
    );
    expect(watch.addListener).toHaveBeenCalledWith(
      'onGarminStatusChange',
      expect.any(Function)
    );
    expect(garmin.start).toHaveBeenCalledTimes(1);
    expect(garmin.refreshDevices).toHaveBeenCalledTimes(1);
    expect(garmin.start.mock.invocationCallOrder[0]).toBeLessThan(
      garmin.refreshDevices.mock.invocationCallOrder[0] ?? 0
    );
  });

  test('passes on resyncs and status changes to the sync of the moment', () => {
    subscribeGarminSync();
    const later = fakeGarminSync();
    mockedGetGarminSync.mockReturnValue(later);

    resyncListener?.({ deviceId: '42', reason: 'requested' });
    const status: GarminStatus = {
      state: 'ready',
      devices: [{ id: '42', name: 'fēnix', connected: true, app: 'installed' }],
    };
    statusListener?.(status);

    expect(later.resync).toHaveBeenCalledWith('42');
    expect(later.updateStatus).toHaveBeenCalledWith(status);
    expect(garmin.resync).not.toHaveBeenCalled();

    // Turned off meanwhile: the events are dropped.
    mockedGetGarminSync.mockReturnValue(null);
    expect(() =>
      resyncListener?.({ deviceId: '42', reason: 'connected' })
    ).not.toThrow();
  });

  test('does nothing where this install does not use Garmin', async () => {
    mockedGetGarminSync.mockReturnValue(null);

    subscribeGarminSync();
    await flush();

    expect(watch.addListener).not.toHaveBeenCalled();
    expect(garmin.start).not.toHaveBeenCalled();
  });

  test('turns a leftover native link off once at startup, not on each foreground', async () => {
    // A release install: the sync is off, but a development build may have
    // left the native flag that starts the link without JS.
    mockedGetGarminSync.mockReturnValue(null);

    subscribeGarminSync();
    await foreground();
    await foreground();

    expect(stopGarminWhenDisabled).toHaveBeenCalledTimes(1);
  });

  test('Garmin Connect installed while the app ran is picked up on the next foreground', async () => {
    mockedGetGarminSync.mockReturnValue(null);
    subscribeGarminSync();

    mockedGetGarminSync.mockReturnValue(garmin);
    await foreground();

    expect(watch.addListener).toHaveBeenCalledTimes(2);
    expect(garmin.start).toHaveBeenCalledTimes(1);
    expect(garmin.refreshDevices).toHaveBeenCalledTimes(1);
  });

  test('each foreground starts the link again and reads the watches, without listening twice', async () => {
    subscribeGarminSync();
    await flush();

    await foreground();
    appStateHandler?.('background');
    await flush();

    expect(watch.addListener).toHaveBeenCalledTimes(2);
    expect(garmin.start).toHaveBeenCalledTimes(2);
    expect(garmin.refreshDevices).toHaveBeenCalledTimes(2);
  });

  test('the cleanup stops listening and forgets every record', () => {
    const stop = subscribeGarminSync();

    stop();

    expect(removes).toHaveLength(2);
    for (const remove of removes) expect(remove).toHaveBeenCalledTimes(1);
    expect(appStateRemove).toHaveBeenCalledTimes(1);
    expect(garmin.forgetAll).toHaveBeenCalledTimes(1);
  });

  test('useGarminWatchSync subscribes with no server involved and cleans up on unmount', async () => {
    const { unmount } = renderHook(() => useGarminWatchSync());
    await flush();

    expect(garmin.start).toHaveBeenCalledTimes(1);

    unmount();

    for (const remove of removes) expect(remove).toHaveBeenCalledTimes(1);
    expect(garmin.forgetAll).toHaveBeenCalledTimes(1);
  });
});

describe('hasWatchTransport', () => {
  test('is true with Wear OS or the Apple Watch alone', () => {
    watch.isSupported.mockReturnValue(true);
    mockedGarminEnabled.mockReturnValue(false);
    expect(hasWatchTransport()).toBe(true);
  });

  test('is true where this install uses Garmin, alone', () => {
    watch.isSupported.mockReturnValue(false);
    mockedGarminEnabled.mockReturnValue(true);
    expect(hasWatchTransport()).toBe(true);
  });

  test('is false with neither, including Garmin Connect in a build without Garmin', () => {
    watch.isSupported.mockReturnValue(false);
    watch.isGarminAvailable?.mockReturnValue(true);
    mockedGarminEnabled.mockReturnValue(false);
    expect(hasWatchTransport()).toBe(false);
  });
});

describe('useWatchCheckInBridge Garmin account epoch', () => {
  let garmin: jest.Mocked<GarminSync>;

  beforeEach(() => {
    jest.clearAllMocks();
    garmin = fakeGarminSync();
    mockedGetGarminSync.mockReturnValue(garmin);
    mockedGarminEnabled.mockReturnValue(true);
    watch.isSupported.mockReturnValue(false);
    watch.addListener.mockImplementation(() => ({ remove: jest.fn() }));
  });

  test('a push hands publish the epoch from before its fetch, so the sync can drop it after a clear mid-fetch', async () => {
    let answer: (serverId: string | null) => void = () => {};
    mockedSyncCredentials.mockReturnValue(
      new Promise<string | null>((resolve) => {
        answer = resolve;
      })
    );
    mockedAccountEpoch.mockReturnValue(3);

    const { unmount } = renderHook(() => useWatchCheckInBridge(true));
    await act(flush);
    expect(mockedSyncCredentials).toHaveBeenCalled();

    // The account is cleared (sign-in again to the same server) mid-fetch.
    mockedAccountEpoch.mockReturnValue(4);
    await act(async () => {
      answer('server-1');
      await flush();
    });

    expect(garmin.publish).toHaveBeenCalledTimes(1);
    expect(garmin.publish).toHaveBeenCalledWith(
      expect.objectContaining({ owner: 'server-1' }),
      3
    );
    unmount();
  });
});
