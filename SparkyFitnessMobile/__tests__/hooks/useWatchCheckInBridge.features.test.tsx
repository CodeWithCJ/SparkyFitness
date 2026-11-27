import { AppState } from 'react-native';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import WatchConnectivity, {
  type WatchContextPayload,
} from '../../modules/watch-connectivity';
import type { FeatureChoicesResponse } from '@workspace/shared';
import { useWatchCheckInBridge } from '../../src/hooks/useWatchCheckInBridge';
import { queryClient } from '../../src/hooks/queryClient';
import { useDailySummary } from '../../src/hooks/useDailySummary';
import { useCurrentFast } from '../../src/hooks/useFasting';
import { fetchFeatureChoices } from '../../src/services/api/featureChoicesApi';
import {
  listEntries,
  listMedications,
} from '../../src/services/api/medicationsApi';
import {
  deleteWaterIntakeLogEntry,
  fetchMeasurementsRange,
  fetchWaterIntakeLive,
  fetchWaterIntakeLog,
  fetchWaterIntakeLogLive,
} from '../../src/services/api/measurementsApi';
import { ApiError } from '../../src/services/api/errors';
import { logDrinkOrQueue } from '../../src/offline/logDrink';
import {
  cancelQueuedWaterDrink,
  getQueuedWaterDrinkStatus,
} from '../../src/offline/waterHandOver';
import { addLog } from '../../src/services/LogService';
import {
  getActiveServerConfigId,
  type ServerConfig,
} from '../../src/services/storage';
import {
  isPayloadForActiveServer,
  resolveWatchServerConfig,
} from '../../src/services/watchServerCredentials';
import { useAppPreferencesStore } from '../../src/stores/appPreferencesStore';
import {
  dailySummaryQueryKey,
  fastingCurrentQueryKey,
  fastingRootQueryKey,
  featureChoicesQueryKey,
  measurementsQueryKey,
  measurementsRangeQueryKey,
  medicationEntriesQueryKey,
  waterIntakeRangeRootQueryKey,
} from '../../src/hooks/queryKeys';
import type { DailySummary } from '../../src/types/dailySummary';
import type { FastingLog } from '../../src/types/fasting';
import { bumpAccountGeneration } from '../../src/offline/accountGeneration';
import {
  notifyAccountChanged,
  notifyUploadsConfirmed,
} from '../../src/offline/events';
import { addDays, getTodayDate } from '../../src/utils/dateUtils';
import { createQueryWrapper, createTestQueryClient } from './queryTestUtils';

const mockWatchListeners = new Map<string, (payload: unknown) => void>();

jest.mock('../../modules/watch-connectivity', () => ({
  __esModule: true,
  default: {
    isSupported: jest.fn(() => true),
    updateContext: jest.fn(() => Promise.resolve()),
    addListener: jest.fn((name: string, fn: (payload: unknown) => void) => {
      mockWatchListeners.set(name, fn);
      return {
        remove: jest.fn(() => {
          if (mockWatchListeners.get(name) === fn) {
            mockWatchListeners.delete(name);
          }
        }),
      };
    }),
    sendAck: jest.fn(() => Promise.resolve()),
  },
}));
jest.mock('../../src/services/api/featureChoicesApi', () => ({
  fetchFeatureChoices: jest.fn(),
  updateFeatureChoices: jest.fn(),
}));
jest.mock('../../src/services/api/medicationsApi', () => ({
  listMedications: jest.fn(() => Promise.resolve([])),
  listEntries: jest.fn(() => Promise.resolve([])),
  createEntry: jest.fn(),
  deleteEntry: jest.fn(),
  updateEntry: jest.fn(),
}));
jest.mock('../../src/services/api/measurementsApi', () => ({
  upsertCheckIn: jest.fn(),
  fetchMeasurementsRange: jest.fn(() => Promise.resolve([])),
  fetchWaterContainers: jest.fn(() => Promise.resolve([])),
  fetchWaterIntakeLive: jest.fn(() => Promise.resolve({ water_ml: 0 })),
  fetchWaterIntakeLog: jest.fn(() => Promise.resolve([])),
  fetchWaterIntakeLogLive: jest.fn(() => Promise.resolve([])),
  deleteWaterIntakeLogEntry: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../src/offline/logDrink', () => ({
  logDrinkOrQueue: jest.fn(),
}));
jest.mock('../../src/offline/waterHandOver', () => ({
  cancelQueuedWaterDrink: jest.fn(() => Promise.resolve('cancelled')),
  getQueuedWaterDrinkEntryDate: jest.fn(() => Promise.resolve(null)),
  getQueuedWaterDrinkStatus: jest.fn(() => Promise.resolve('none')),
}));
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: null }),
}));
jest.mock('../../src/hooks/useCustomNutrients', () => ({
  useCustomNutrients: () => ({ customNutrients: [] }),
}));
jest.mock('../../src/hooks/useDailySummary', () => ({
  useDailySummary: jest.fn(() => ({ summary: undefined, dataUpdatedAt: 0 })),
}));
jest.mock('../../src/hooks/useSleepDay', () => ({
  useSleepDay: () => ({ wakeUp: null, naps: [] }),
}));
jest.mock('../../src/hooks/useWorkoutPresets', () => ({
  useWorkoutPresets: () => ({ presets: [] }),
}));
jest.mock('../../src/hooks/useSuggestedExercises', () => ({
  useSuggestedExercises: () => ({ recentExercises: [], topExercises: [] }),
}));
jest.mock('../../src/hooks/useActiveWorkoutPlan', () => ({
  useActiveWorkoutPlans: () => ({ plans: [] }),
}));
jest.mock('../../src/hooks/useFasting', () => ({
  useCurrentFast: jest.fn(() => ({ data: undefined, dataUpdatedAt: 0 })),
}));
jest.mock('../../src/hooks/useZone2HeartRateBand', () => ({
  useZone2HeartRateBand: () => null,
}));
jest.mock('../../src/hooks/useWatchHeartRateZoneFloors', () => ({
  useWatchHeartRateZoneFloors: () => null,
}));
jest.mock('../../src/services/runProgramService', () => ({
  useRunProgram: () => ({ status: null, enabled: false }),
}));
jest.mock('../../src/utils/watchRunPlans', () => ({
  buildWatchRunPlans: () => [],
}));
jest.mock('../../src/components/recording/IntervalSetup', () => ({
  presetName: () => '',
}));
jest.mock('../../src/components/recording/RunProgramCard', () => ({
  programWorkoutLabel: () => '',
}));
jest.mock('../../src/services/gpsRecordingService', () => ({
  getRecordingPreferences: () =>
    Promise.resolve({
      audioCues: false,
      autoPause: false,
      checkInMinutes: 0,
      heartRateBand: null,
      paceBand: null,
    }),
  onRecordingPreferenceChange: () => () => {},
}));
jest.mock('../../src/services/watchIndoorScale', () => ({
  getWatchIndoorScale: () => Promise.resolve(null),
  onWatchIndoorScaleChange: () => () => {},
}));
jest.mock('../../src/services/storage', () => ({
  getActiveServerConfigId: jest.fn(() => Promise.resolve('server-a')),
}));
const mockServerConfigA: ServerConfig = {
  id: 'server-a',
  name: 'Server A',
  url: 'https://server-a.example.com',
  authType: 'apiKey',
  apiKey: 'key-a',
};

jest.mock('../../src/services/watchServerCredentials', () => ({
  syncWatchServerCredentials: () => Promise.resolve('server-a'),
  isPayloadForActiveServer: jest.fn(() => Promise.resolve(true)),
  resolveWatchServerConfig: jest.fn(() => Promise.resolve(mockServerConfigA)),
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));

const watch = WatchConnectivity as unknown as {
  updateContext: jest.Mock<Promise<void>, [WatchContextPayload]>;
  sendAck: jest.Mock<Promise<void>, [string, boolean]>;
};
const mockFetchChoices = jest.mocked(fetchFeatureChoices);
const mockUseDailySummary = jest.mocked(useDailySummary);
const mockUseCurrentFast = jest.mocked(useCurrentFast);
const mockLogDrinkOrQueue = jest.mocked(logDrinkOrQueue);
const mockCancelQueuedWaterDrink = jest.mocked(cancelQueuedWaterDrink);
const mockDeleteWaterIntakeLogEntry = jest.mocked(deleteWaterIntakeLogEntry);
const mockFetchMeasurementsRange = jest.mocked(fetchMeasurementsRange);
const mockFetchWaterIntakeLive = jest.mocked(fetchWaterIntakeLive);
const mockFetchWaterIntakeLog = jest.mocked(fetchWaterIntakeLog);
const mockFetchWaterIntakeLogLive = jest.mocked(fetchWaterIntakeLogLive);
const mockResolveWatchServerConfig = jest.mocked(resolveWatchServerConfig);

function makeTestSummary(waterConsumed: number): DailySummary {
  return {
    protein: { consumed: 0, goal: 120 },
    carbs: { consumed: 0, goal: 200 },
    fat: { consumed: 0, goal: 70 },
    waterConsumed,
    waterGoal: 2500,
    stepsGoal: 10000,
    waterFromFood: 0,
    exerciseEntries: [],
    exerciseMinutes: 0,
    exerciseMinutesGoal: 30,
    otherExerciseCalories: 0,
    exerciseCaloriesGoal: 400,
  } as unknown as DailySummary;
}

function lastContext(): WatchContextPayload {
  const calls = watch.updateContext.mock.calls;
  return calls[calls.length - 1]![0];
}

const activeBridges: {
  client: ReturnType<typeof createTestQueryClient>;
  unmount: () => void;
}[] = [];

function renderBridgeWithHandle(cachedChoices?: FeatureChoicesResponse) {
  const client = createTestQueryClient();
  if (cachedChoices) client.setQueryData(featureChoicesQueryKey, cachedChoices);
  const rendered = renderHook(() => useWatchCheckInBridge(true), {
    wrapper: createQueryWrapper(client),
  });
  activeBridges.push({ client, unmount: rendered.unmount });
  return { client, rerender: rendered.rerender, unmount: rendered.unmount };
}

function cleanupActiveBridges() {
  while (activeBridges.length > 0) {
    const entry = activeBridges.pop()!;
    entry.unmount();
    entry.client.clear();
  }
}

function renderBridge(cachedChoices?: FeatureChoicesResponse) {
  return renderBridgeWithHandle(cachedChoices).client;
}

describe('useWatchCheckInBridge and the Medications switch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAppPreferencesStore.setState({ hiddenWatchPages: ['trend'] });
  });

  afterEach(() => {
    cleanupActiveBridges();
  });

  it('hides the Medications page and reads no doses while it is off', async () => {
    const off = { feature_choices: { mobile: { medications: false } } };
    mockFetchChoices.mockResolvedValue(off);
    renderBridge(off);

    await waitFor(() =>
      expect(lastContext().offFeatures).toEqual(['medications'])
    );
    expect(lastContext().hiddenPages).toEqual(['trend', 'medications']);
    expect(lastContext().medications).toBeNull();
    expect(listMedications).not.toHaveBeenCalled();
    expect(listEntries).not.toHaveBeenCalled();
    // The stored setting is left alone.
    expect(useAppPreferencesStore.getState().hiddenWatchPages).toEqual([
      'trend',
    ]);
  });

  it('sends the stored pages and the doses while it is on', async () => {
    mockFetchChoices.mockResolvedValue({ feature_choices: {} });
    renderBridge();

    await waitFor(() => expect(lastContext().medications).toEqual([]));
    expect(lastContext().offFeatures).toEqual([]);
    expect(lastContext().hiddenPages).toEqual(['trend']);
  });

  it('stops sending the doses when it is turned off', async () => {
    mockFetchChoices.mockResolvedValue({ feature_choices: {} });
    const client = renderBridge();
    await waitFor(() => expect(lastContext().medications).toEqual([]));

    act(() => {
      client.setQueryData(featureChoicesQueryKey, {
        feature_choices: { mobile: { medications: false } },
      });
    });

    await waitFor(() => expect(lastContext().medications).toBeNull());
    expect(lastContext().offFeatures).toEqual(['medications']);
  });

  it("reads the new account's choices after an account switch", async () => {
    const off = { feature_choices: { mobile: { medications: false } } };
    mockFetchChoices.mockResolvedValue(off);
    const client = renderBridge(off);
    await waitFor(() =>
      expect(lastContext().offFeatures).toEqual(['medications'])
    );

    // Another account with Medications on takes over. As in useAuth, the
    // cache is cleared, which mounted queries are not told about, and then
    // the app is told the account changed.
    mockFetchChoices.mockResolvedValue({ feature_choices: {} });
    act(() => {
      bumpAccountGeneration();
      client.clear();
      notifyAccountChanged();
    });

    await waitFor(() => expect(lastContext().offFeatures).toEqual([]));
    expect(lastContext().hiddenPages).toEqual(['trend']);
  });

  it('leaves the pages to the watch while the choices are not known', async () => {
    mockFetchChoices.mockReturnValue(new Promise(() => {}));
    renderBridge();

    await waitFor(() => expect(watch.updateContext).toHaveBeenCalled());
    expect(lastContext()).not.toHaveProperty('hiddenPages');
    expect(lastContext()).not.toHaveProperty('offFeatures');
    expect(lastContext().pageOrder).toBeDefined();
  });
});

describe('useWatchCheckInBridge direct water sync ack coordination', () => {
  const mockIsPayloadForActiveServer = jest.mocked(isPayloadForActiveServer);
  const mockGetActiveServerConfigId = jest.mocked(getActiveServerConfigId);
  const originalAppStateDescriptor = Object.getOwnPropertyDescriptor(
    AppState,
    'currentState'
  );

  beforeEach(async () => {
    jest.clearAllMocks();
    mockWatchListeners.clear();
    Object.defineProperty(AppState, 'currentState', {
      configurable: true,
      value: 'active',
    });
    mockIsPayloadForActiveServer.mockReset();
    mockIsPayloadForActiveServer.mockResolvedValue(true);
    mockGetActiveServerConfigId.mockReset();
    mockGetActiveServerConfigId.mockResolvedValue('server-a');
    mockUseDailySummary.mockReset();
    mockUseDailySummary.mockReturnValue({
      summary: undefined,
      dataUpdatedAt: 0,
    } as unknown as ReturnType<typeof useDailySummary>);
    mockUseCurrentFast.mockReset();
    mockUseCurrentFast.mockReturnValue({
      data: undefined,
      dataUpdatedAt: 0,
    } as unknown as ReturnType<typeof useCurrentFast>);
    mockLogDrinkOrQueue.mockReset();
    mockCancelQueuedWaterDrink.mockReset();
    mockCancelQueuedWaterDrink.mockResolvedValue('cancelled');
    mockDeleteWaterIntakeLogEntry.mockReset();
    mockDeleteWaterIntakeLogEntry.mockResolvedValue(undefined);
    mockFetchMeasurementsRange.mockReset();
    mockFetchMeasurementsRange.mockResolvedValue([]);
    mockFetchWaterIntakeLive.mockReset();
    mockFetchWaterIntakeLive.mockResolvedValue({
      water_ml: 0,
    } as unknown as Awaited<ReturnType<typeof fetchWaterIntakeLive>>);
    mockFetchWaterIntakeLog.mockReset();
    mockFetchWaterIntakeLog.mockResolvedValue([]);
    mockFetchWaterIntakeLogLive.mockReset();
    mockFetchWaterIntakeLogLive.mockResolvedValue([]);
    mockResolveWatchServerConfig.mockReset();
    mockResolveWatchServerConfig.mockResolvedValue(mockServerConfigA);
    mockFetchChoices.mockResolvedValue({ feature_choices: {} });
    await AsyncStorage.clear();
  });

  afterEach(() => {
    cleanupActiveBridges();
    if (originalAppStateDescriptor) {
      Object.defineProperty(
        AppState,
        'currentState',
        originalAppStateDescriptor
      );
    }
    jest.restoreAllMocks();
  });

  it('acknowledges direct water clientId only after water queries finish refetching for active owner', async () => {
    const today = getTodayDate();
    let resolveSummaryRefetch!: () => void;
    const summaryRefetchGate = new Promise<void>((resolve) => {
      resolveSummaryRefetch = resolve;
    });
    const invalidateSpy = jest
      .spyOn(queryClient, 'invalidateQueries')
      .mockImplementation(async (filters) => {
        if (
          JSON.stringify(filters?.queryKey) ===
          JSON.stringify(dailySummaryQueryKey(today))
        ) {
          await summaryRefetchGate;
        }
      });

    renderBridge({ feature_choices: {} });
    await waitFor(() => expect(watch.updateContext).toHaveBeenCalled());
    expect(lastContext().ackedClientIds).not.toContain('direct-water-1');

    expect(mockWatchListeners.has('onWatchServerSynced')).toBe(true);
    const onWatchServerSynced = mockWatchListeners.get('onWatchServerSynced');

    act(() => {
      onWatchServerSynced?.({
        domain: 'water',
        ownerId: 'server-a',
        entryDate: today,
        clientId: 'direct-water-1',
      });
    });

    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith(
        { queryKey: dailySummaryQueryKey(today) },
        { throwOnError: true }
      )
    );
    expect(lastContext().ackedClientIds).not.toContain('direct-water-1');

    await act(async () => {
      resolveSummaryRefetch();
      await summaryRefetchGate;
    });

    await waitFor(() =>
      expect(lastContext().ackedClientIds).toContain('direct-water-1')
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: waterIntakeRangeRootQueryKey,
        predicate: expect.any(Function),
      })
    );
  });

  it('does not add direct water clientId to ackedClientIds when water refetch fails or owner switches', async () => {
    const today = getTodayDate();
    const invalidateSpy = jest
      .spyOn(queryClient, 'invalidateQueries')
      .mockImplementation(async (filters) => {
        if (
          JSON.stringify(filters?.queryKey) ===
          JSON.stringify(dailySummaryQueryKey(today))
        ) {
          throw new Error('network error');
        }
      });

    renderBridge({ feature_choices: {} });
    await waitFor(() => expect(watch.updateContext).toHaveBeenCalled());

    expect(mockWatchListeners.has('onWatchServerSynced')).toBe(true);
    const onWatchServerSynced = mockWatchListeners.get('onWatchServerSynced');

    act(() => {
      onWatchServerSynced?.({
        domain: 'water',
        ownerId: 'server-a',
        entryDate: today,
        clientId: 'direct-water-failed',
      });
    });

    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith(
        { queryKey: dailySummaryQueryKey(today) },
        { throwOnError: true }
      )
    );
    await waitFor(() =>
      expect(addLog).toHaveBeenCalledWith(
        expect.stringContaining('Watch direct water refetch failed'),
        'WARNING'
      )
    );
    expect(lastContext().ackedClientIds).not.toContain('direct-water-failed');

    invalidateSpy.mockResolvedValue(undefined);
    mockIsPayloadForActiveServer.mockClear();
    mockIsPayloadForActiveServer
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    act(() => {
      onWatchServerSynced?.({
        domain: 'water',
        ownerId: 'server-a',
        entryDate: today,
        clientId: 'direct-water-switched',
      });
    });

    await waitFor(() =>
      expect(mockIsPayloadForActiveServer).toHaveBeenCalledTimes(2)
    );
    expect(lastContext().ackedClientIds).not.toContain('direct-water-switched');
  });

  it('drops an older context push if direct water sync bumps pushGenerationRef while awaiting getActiveServerConfigId', async () => {
    const today = getTodayDate();
    jest.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    renderBridge({ feature_choices: {} });
    await waitFor(() => expect(watch.updateContext).toHaveBeenCalled());
    watch.updateContext.mockClear();
    mockGetActiveServerConfigId.mockClear();

    let resolveStaleServerCheck!: (value: string | null) => void;
    const staleServerCheckGate = new Promise<string | null>((resolve) => {
      resolveStaleServerCheck = resolve;
    });
    mockGetActiveServerConfigId.mockImplementationOnce(
      () => staleServerCheckGate
    );

    expect(mockWatchListeners.has('onContextRequest')).toBe(true);
    expect(mockWatchListeners.has('onWatchServerSynced')).toBe(true);

    act(() => {
      mockWatchListeners.get('onContextRequest')?.({});
    });

    await waitFor(() =>
      expect(mockGetActiveServerConfigId).toHaveBeenCalledTimes(1)
    );
    expect(watch.updateContext).not.toHaveBeenCalled();

    act(() => {
      mockWatchListeners.get('onWatchServerSynced')?.({
        domain: 'water',
        ownerId: 'server-a',
        entryDate: today,
        clientId: 'direct-water-race',
      });
    });

    await waitFor(() =>
      expect(lastContext().ackedClientIds).toContain('direct-water-race')
    );
    const callsAfterFreshPush = watch.updateContext.mock.calls.length;

    await act(async () => {
      resolveStaleServerCheck('server-a');
      await staleServerCheckGate;
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(watch.updateContext).toHaveBeenCalledTimes(callsAfterFreshPush);
    expect(lastContext().ackedClientIds).toContain('direct-water-race');
  });

  it('omits direct water clientId on stale-dataUpdatedAt pushes and advertises it once fresh water snapshot commits', async () => {
    const today = getTodayDate();
    mockUseDailySummary.mockReturnValue({
      summary: makeTestSummary(500),
      dataUpdatedAt: 1000,
    } as unknown as ReturnType<typeof useDailySummary>);

    jest.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
    const cache = queryClient.getQueryCache();
    const originalFindAll = cache.findAll.bind(cache);
    jest.spyOn(cache, 'findAll').mockImplementation((filters) => {
      if (
        JSON.stringify(filters?.queryKey) ===
        JSON.stringify(dailySummaryQueryKey(today))
      ) {
        return [
          {
            state: {
              isInvalidated: false,
              status: 'success',
              fetchStatus: 'idle',
              dataUpdatedAt: 2000,
            },
          } as unknown as ReturnType<typeof originalFindAll>[number],
        ];
      }
      return originalFindAll(filters);
    });

    const { rerender } = renderBridgeWithHandle({ feature_choices: {} });
    await waitFor(() => expect(lastContext().waterConsumedMl).toBe(500));

    act(() => {
      mockWatchListeners.get('onWatchServerSynced')?.({
        domain: 'water',
        ownerId: 'server-a',
        entryDate: today,
        clientId: 'direct-water-wm',
      });
    });

    // Even if onContextRequest fires while the hook still holds the stale
    // 500 mL render (dataUpdatedAt 1000 < watermark 2000), direct-water-wm
    // must NOT be paired with the stale water total.
    const callsBeforeRequest = watch.updateContext.mock.calls.length;
    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 20));
      mockWatchListeners.get('onContextRequest')?.({});
    });
    await waitFor(() =>
      expect(watch.updateContext.mock.calls.length).toBeGreaterThan(
        callsBeforeRequest
      )
    );
    expect(lastContext().waterConsumedMl).toBe(500);
    expect(lastContext().ackedClientIds).not.toContain('direct-water-wm');

    // Once the hook re-renders with the fresh 750 mL snapshot (dataUpdatedAt 2000),
    // the push advertises direct-water-wm alongside 750 mL.
    mockUseDailySummary.mockReturnValue({
      summary: makeTestSummary(750),
      dataUpdatedAt: 2000,
    } as unknown as ReturnType<typeof useDailySummary>);
    act(() => {
      rerender({});
    });

    await waitFor(() =>
      expect(lastContext().ackedClientIds).toContain('direct-water-wm')
    );
    expect(lastContext().waterConsumedMl).toBe(750);
  });

  it('omits direct fasting clientId while fast snapshot is stale and advertises it once fresh fasting query commits', async () => {
    mockUseCurrentFast.mockReturnValue({
      data: null,
      dataUpdatedAt: 1000,
    } as unknown as ReturnType<typeof useCurrentFast>);

    const invalidateSpy = jest
      .spyOn(queryClient, 'invalidateQueries')
      .mockResolvedValue(undefined);
    const cache = queryClient.getQueryCache();
    const originalFindAll = cache.findAll.bind(cache);
    jest.spyOn(cache, 'findAll').mockImplementation((filters) => {
      if (
        JSON.stringify(filters?.queryKey) ===
        JSON.stringify(fastingCurrentQueryKey)
      ) {
        return [
          {
            state: {
              isInvalidated: false,
              status: 'success',
              fetchStatus: 'idle',
              dataUpdatedAt: 3000,
            },
          } as unknown as ReturnType<typeof originalFindAll>[number],
        ];
      }
      return originalFindAll(filters);
    });

    const { rerender } = renderBridgeWithHandle({ feature_choices: {} });
    await waitFor(() => expect(lastContext().fastKnown).toBe(true));
    expect(lastContext().fast).toBeNull();

    act(() => {
      mockWatchListeners.get('onWatchServerSynced')?.({
        domain: 'fasting',
        ownerId: 'server-a',
        clientId: 'direct-fast-wm',
      });
    });

    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith(
        { queryKey: fastingRootQueryKey },
        { throwOnError: true }
      )
    );

    // Pre-fresh-render push with stale fast: null (dataUpdatedAt 1000 < 3000)
    // must NOT carry direct-fast-wm.
    const callsBeforeRequest = watch.updateContext.mock.calls.length;
    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 20));
      mockWatchListeners.get('onContextRequest')?.({});
    });
    await waitFor(() =>
      expect(watch.updateContext.mock.calls.length).toBeGreaterThan(
        callsBeforeRequest
      )
    );
    expect(lastContext().fast).toBeNull();
    expect(lastContext().ackedClientIds).not.toContain('direct-fast-wm');

    // Once the fresh fasting query commits (dataUpdatedAt 3000), direct-fast-wm
    // is included alongside the confirmed fast.
    const confirmedFast = {
      id: 'f-direct',
      start_time: '2026-11-25T10:00:00.000Z',
      target_end_time: '2026-11-26T02:00:00.000Z',
      fasting_type: '16:8 Leangains',
    } as unknown as FastingLog;
    mockUseCurrentFast.mockReturnValue({
      data: confirmedFast,
      dataUpdatedAt: 3000,
    } as unknown as ReturnType<typeof useCurrentFast>);
    act(() => {
      rerender({});
    });

    await waitFor(() =>
      expect(lastContext().ackedClientIds).toContain('direct-fast-wm')
    );
    expect(lastContext().fast).toEqual(
      expect.objectContaining({ id: 'f-direct' })
    );

    // A failed fasting refetch must NOT record the direct fasting clientId.
    invalidateSpy.mockImplementationOnce(async (filters) => {
      if (
        JSON.stringify(filters?.queryKey) ===
        JSON.stringify(fastingRootQueryKey)
      ) {
        throw new Error('fasting offline');
      }
    });
    act(() => {
      mockWatchListeners.get('onWatchServerSynced')?.({
        domain: 'fasting',
        ownerId: 'server-a',
        clientId: 'direct-fast-failed',
      });
    });
    await waitFor(() =>
      expect(addLog).toHaveBeenCalledWith(
        expect.stringContaining('Watch direct fasting refetch failed'),
        'WARNING'
      )
    );
    expect(lastContext().ackedClientIds).not.toContain('direct-fast-failed');
  });

  it('persists direct acks with provenance separately from ackedClientIds and re-gates hydrated direct acks across restarts', async () => {
    const today = getTodayDate();
    await AsyncStorage.setItem(
      'sparky.watch.ackState.v1',
      JSON.stringify({
        ackedClientIds: ['phone-write-1'],
        directAcks: [
          {
            clientId: 'direct-water-restarted',
            ownerId: 'server-a',
            domain: 'water',
            day: today,
          },
        ],
        pendingDirectAcks: [
          {
            clientId: 'direct-fast-restarted',
            ownerId: 'server-a',
            domain: 'fasting',
            day: today,
          },
        ],
      })
    );

    const { rerender, unmount } = renderBridgeWithHandle({
      feature_choices: {},
    });
    // Ordinary phone-write ack replays immediately after restart hydration,
    // while hydrated direct acks stay gated until fresh session queries load.
    await waitFor(() =>
      expect(lastContext().ackedClientIds).toContain('phone-write-1')
    );
    expect(lastContext().ackedClientIds).not.toContain(
      'direct-water-restarted'
    );
    expect(lastContext().ackedClientIds).not.toContain('direct-fast-restarted');

    // Fresh water query loads in current session -> publishes direct-water-restarted only.
    mockUseDailySummary.mockReturnValue({
      summary: makeTestSummary(900),
      dataUpdatedAt: 4000,
    } as unknown as ReturnType<typeof useDailySummary>);
    act(() => {
      rerender({});
    });
    await waitFor(() =>
      expect(lastContext().ackedClientIds).toContain('direct-water-restarted')
    );
    expect(lastContext().waterConsumedMl).toBe(900);
    expect(lastContext().ackedClientIds).not.toContain('direct-fast-restarted');

    // Fresh fasting query loads in current session -> publishes direct-fast-restarted.
    mockUseCurrentFast.mockReturnValue({
      data: null,
      dataUpdatedAt: 4500,
    } as unknown as ReturnType<typeof useCurrentFast>);
    act(() => {
      rerender({});
    });
    await waitFor(() =>
      expect(lastContext().ackedClientIds).toContain('direct-fast-restarted')
    );
    expect(lastContext().fastKnown).toBe(true);
    expect(lastContext().fast).toBeNull();

    // Direct acks MUST keep their provenance in `directAcks` and NEVER downgrade into plain `ackedClientIds`.
    await waitFor(async () => {
      const persisted = JSON.parse(
        (await AsyncStorage.getItem('sparky.watch.ackState.v1')) ?? '{}'
      ) as {
        ackedClientIds?: string[];
        directAcks?: {
          clientId: string;
          ownerId: string;
          domain: string;
          day: string;
        }[];
        pendingDirectAcks?: unknown[];
      };
      expect(persisted.pendingDirectAcks).toBeUndefined();
      expect(persisted.ackedClientIds).toEqual(['phone-write-1']);
      expect(persisted.directAcks).toEqual(
        expect.arrayContaining([
          {
            clientId: 'direct-water-restarted',
            ownerId: 'server-a',
            domain: 'water',
            day: today,
          },
          {
            clientId: 'direct-fast-restarted',
            ownerId: 'server-a',
            domain: 'fasting',
            day: today,
          },
        ])
      );
    });

    // Simulate a second phone restart with stale/unloaded queries:
    // ordinary phone-write replays immediately, while previously-published direct acks re-gate!
    unmount();
    watch.updateContext.mockClear();
    mockUseDailySummary.mockReturnValue({
      summary: undefined,
      dataUpdatedAt: 0,
    } as unknown as ReturnType<typeof useDailySummary>);
    mockUseCurrentFast.mockReturnValue({
      data: undefined,
      dataUpdatedAt: 0,
    } as unknown as ReturnType<typeof useCurrentFast>);

    renderBridgeWithHandle({ feature_choices: {} });
    await waitFor(() =>
      expect(lastContext().ackedClientIds).toContain('phone-write-1')
    );
    expect(lastContext().ackedClientIds).not.toContain(
      'direct-water-restarted'
    );
    expect(lastContext().ackedClientIds).not.toContain('direct-fast-restarted');
  });

  it('clears published and pending direct acks on account change while preserving ordinary phone-write ackedClientIds', async () => {
    const today = getTodayDate();
    await AsyncStorage.setItem(
      'sparky.watch.ackState.v1',
      JSON.stringify({
        ackedClientIds: ['phone-write-keep'],
      })
    );

    let activeCacheUpdatedAt = 2000;
    mockUseDailySummary.mockReturnValue({
      summary: makeTestSummary(500),
      dataUpdatedAt: 1000,
    } as unknown as ReturnType<typeof useDailySummary>);
    jest.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
    const cache = queryClient.getQueryCache();
    const originalFindAll = cache.findAll.bind(cache);
    jest.spyOn(cache, 'findAll').mockImplementation((filters) => {
      if (
        JSON.stringify(filters?.queryKey) ===
        JSON.stringify(dailySummaryQueryKey(today))
      ) {
        return [
          {
            state: {
              isInvalidated: false,
              status: 'success',
              fetchStatus: 'idle',
              dataUpdatedAt: activeCacheUpdatedAt,
            },
          } as unknown as ReturnType<typeof originalFindAll>[number],
        ];
      }
      return originalFindAll(filters);
    });

    const { rerender } = renderBridgeWithHandle({ feature_choices: {} });
    await waitFor(() =>
      expect(lastContext().ackedClientIds).toContain('phone-write-keep')
    );

    // Record direct-water-promoted while render is still stale (1000 < 2000):
    // must persist ONLY in directAcks, NEVER in ackedClientIds.
    act(() => {
      mockWatchListeners.get('onWatchServerSynced')?.({
        domain: 'water',
        ownerId: 'server-a',
        entryDate: today,
        clientId: 'direct-water-promoted',
      });
    });
    await waitFor(async () => {
      const persisted = JSON.parse(
        (await AsyncStorage.getItem('sparky.watch.ackState.v1')) ?? '{}'
      ) as {
        ackedClientIds?: string[];
        directAcks?: { clientId: string }[];
      };
      expect(persisted.ackedClientIds).not.toContain('direct-water-promoted');
      expect(persisted.directAcks?.map((p) => p.clientId)).toContain(
        'direct-water-promoted'
      );
    });

    // Fresh render commits -> publishes direct-water-promoted in context while retaining provenance in directAcks.
    mockUseDailySummary.mockReturnValue({
      summary: makeTestSummary(750),
      dataUpdatedAt: 2000,
    } as unknown as ReturnType<typeof useDailySummary>);
    act(() => {
      rerender({});
    });
    await waitFor(() =>
      expect(lastContext().ackedClientIds).toContain('direct-water-promoted')
    );
    await waitFor(async () => {
      const persisted = JSON.parse(
        (await AsyncStorage.getItem('sparky.watch.ackState.v1')) ?? '{}'
      ) as {
        ackedClientIds?: string[];
        directAcks?: { clientId: string }[];
      };
      expect(persisted.ackedClientIds).not.toContain('direct-water-promoted');
      expect(persisted.directAcks?.map((p) => p.clientId)).toContain(
        'direct-water-promoted'
      );
    });

    // Record a second pending direct ack (watermark 3000 > rendered 2000).
    activeCacheUpdatedAt = 3000;
    act(() => {
      mockWatchListeners.get('onWatchServerSynced')?.({
        domain: 'water',
        ownerId: 'server-a',
        entryDate: today,
        clientId: 'direct-water-still-pending',
      });
    });
    await waitFor(async () => {
      const persisted = JSON.parse(
        (await AsyncStorage.getItem('sparky.watch.ackState.v1')) ?? '{}'
      ) as { directAcks?: { clientId: string }[] };
      expect(persisted.directAcks?.map((p) => p.clientId)).toContain(
        'direct-water-still-pending'
      );
    });

    // Account switch must clear BOTH pending and published direct acks while
    // keeping ordinary phone-write ackedClientIds eligible for replay.
    mockUseDailySummary.mockReturnValue({
      summary: makeTestSummary(100),
      dataUpdatedAt: 3000,
    } as unknown as ReturnType<typeof useDailySummary>);
    act(() => {
      bumpAccountGeneration();
      notifyAccountChanged();
    });
    act(() => {
      rerender({});
    });

    await waitFor(() => expect(lastContext().waterConsumedMl).toBe(100));
    expect(lastContext().ackedClientIds).toContain('phone-write-keep');
    expect(lastContext().ackedClientIds).not.toContain('direct-water-promoted');
    expect(lastContext().ackedClientIds).not.toContain(
      'direct-water-still-pending'
    );

    await waitFor(async () => {
      const persisted = JSON.parse(
        (await AsyncStorage.getItem('sparky.watch.ackState.v1')) ?? '{}'
      ) as {
        ackedClientIds?: string[];
        directAcks?: unknown[];
        pendingDirectAcks?: unknown[];
      };
      expect(persisted.directAcks).toBeUndefined();
      expect(persisted.pendingDirectAcks).toBeUndefined();
      expect(persisted.ackedClientIds).toContain('phone-write-keep');
      expect(persisted.ackedClientIds).not.toContain('direct-water-promoted');
      expect(persisted.ackedClientIds).not.toContain(
        'direct-water-still-pending'
      );
    });
  });

  it('acknowledges direct medications and checkIn syncs only after refetches succeed', async () => {
    const today = getTodayDate();
    const rangeStart = addDays(today, -13);
    const invalidateSpy = jest
      .spyOn(queryClient, 'invalidateQueries')
      .mockResolvedValue(undefined);
    const cache = queryClient.getQueryCache();
    const originalFindAll = cache.findAll.bind(cache);
    let medWatermark = 1;
    jest.spyOn(cache, 'findAll').mockImplementation((filters) => {
      if (
        JSON.stringify(filters?.queryKey) ===
        JSON.stringify(
          medicationEntriesQueryKey({ fromDate: today, toDate: today })
        )
      ) {
        return [
          {
            state: {
              isInvalidated: false,
              status: 'success',
              fetchStatus: 'idle',
              dataUpdatedAt: medWatermark,
            },
          } as unknown as ReturnType<typeof originalFindAll>[number],
        ];
      }
      if (
        JSON.stringify(filters?.queryKey) ===
          JSON.stringify(measurementsQueryKey(today)) ||
        JSON.stringify(filters?.queryKey) ===
          JSON.stringify(measurementsRangeQueryKey(rangeStart, today))
      ) {
        return [
          {
            state: {
              isInvalidated: false,
              status: 'success',
              fetchStatus: 'idle',
              dataUpdatedAt: Date.now(),
            },
          } as unknown as ReturnType<typeof originalFindAll>[number],
        ];
      }
      return originalFindAll(filters);
    });

    mockFetchMeasurementsRange.mockResolvedValue([
      { entry_date: today, weight: 78.4, body_fat_percentage: 17.5 },
    ] as unknown as Awaited<ReturnType<typeof fetchMeasurementsRange>>);

    renderBridgeWithHandle({ feature_choices: {} });
    await waitFor(() => expect(lastContext().medications).toEqual([]));

    // 1. Direct medications sync publishes once medication entries are fresh.
    act(() => {
      mockWatchListeners.get('onWatchServerSynced')?.({
        domain: 'medications',
        ownerId: 'server-a',
        entryDate: today,
        clientId: 'direct-med-1',
      });
    });
    await waitFor(() =>
      expect(lastContext().ackedClientIds).toContain('direct-med-1')
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      {
        queryKey: medicationEntriesQueryKey({
          fromDate: today,
          toDate: today,
        }),
      },
      { throwOnError: true }
    );

    // Failed medications refetch must NOT record direct-med-failed.
    medWatermark = 2;
    invalidateSpy.mockImplementationOnce(async (filters) => {
      if (
        JSON.stringify(filters?.queryKey) ===
        JSON.stringify(
          medicationEntriesQueryKey({ fromDate: today, toDate: today })
        )
      ) {
        throw new Error('medications offline');
      }
    });
    act(() => {
      mockWatchListeners.get('onWatchServerSynced')?.({
        domain: 'medications',
        ownerId: 'server-a',
        entryDate: today,
        clientId: 'direct-med-failed',
      });
    });
    await waitFor(() =>
      expect(addLog).toHaveBeenCalledWith(
        expect.stringContaining('Watch direct medications refetch failed'),
        'WARNING'
      )
    );
    expect(lastContext().ackedClientIds).not.toContain('direct-med-failed');

    // 2. Direct checkIn sync publishes with refreshed measurements range.
    act(() => {
      mockWatchListeners.get('onWatchServerSynced')?.({
        domain: 'checkIn',
        ownerId: 'server-a',
        entryDate: today,
        clientId: 'direct-checkin-1',
      });
    });
    await waitFor(() =>
      expect(lastContext().ackedClientIds).toContain('direct-checkin-1')
    );
    expect(lastContext().todayWeightKg).toBe(78.4);
    expect(invalidateSpy).toHaveBeenCalledWith(
      { queryKey: measurementsQueryKey(today) },
      { throwOnError: true }
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      { queryKey: measurementsRangeQueryKey(rangeStart, today) },
      { throwOnError: true }
    );
    await waitFor(async () => {
      const persisted = JSON.parse(
        (await AsyncStorage.getItem('sparky.watch.ackState.v1')) ?? '{}'
      ) as {
        ackedClientIds?: string[];
        directAcks?: {
          clientId: string;
          ownerId: string;
          domain: string;
          day: string;
        }[];
      };
      expect(persisted.ackedClientIds ?? []).not.toContain('direct-med-1');
      expect(persisted.ackedClientIds ?? []).not.toContain('direct-checkin-1');
      expect(persisted.directAcks).toEqual(
        expect.arrayContaining([
          {
            clientId: 'direct-med-1',
            ownerId: 'server-a',
            domain: 'medications',
            day: today,
          },
          {
            clientId: 'direct-checkin-1',
            ownerId: 'server-a',
            domain: 'checkIn',
            day: today,
          },
        ])
      );
    });

    // Failed checkIn refetch must NOT record direct-checkin-failed.
    invalidateSpy.mockImplementationOnce(async (filters) => {
      if (
        JSON.stringify(filters?.queryKey) ===
        JSON.stringify(measurementsQueryKey(today))
      ) {
        throw new Error('checkIn offline');
      }
    });
    act(() => {
      mockWatchListeners.get('onWatchServerSynced')?.({
        domain: 'checkIn',
        ownerId: 'server-a',
        entryDate: today,
        clientId: 'direct-checkin-failed',
      });
    });
    await waitFor(() =>
      expect(addLog).toHaveBeenCalledWith(
        expect.stringContaining('Watch direct check-in refetch failed'),
        'WARNING'
      )
    );
    expect(lastContext().ackedClientIds).not.toContain('direct-checkin-failed');
  });

  it('honors onWaterTapCancel by dropping late taps across restarts and compensating committed or mid-flight taps', async () => {
    const today = getTodayDate();
    jest.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    // Part 1: Pre-tap cancellation persists across restarts and drops a late waterIntake tap.
    const first = renderBridgeWithHandle({ feature_choices: {} });
    await waitFor(() => expect(watch.updateContext).toHaveBeenCalled());

    act(() => {
      mockWatchListeners.get('onWaterTapCancel')?.({
        clientId: 'tap-pre-cancel',
        ownerId: 'server-a',
      });
    });
    await waitFor(() =>
      expect(watch.sendAck).toHaveBeenCalledWith('tap-pre-cancel', true)
    );
    await waitFor(async () => {
      const persisted = JSON.parse(
        (await AsyncStorage.getItem('sparky.watch.ackState.v1')) ?? '{}'
      ) as { cancelledWaterTaps?: { ownerId: string; clientId: string }[] };
      expect(persisted.cancelledWaterTaps).toContainEqual({
        ownerId: 'server-a',
        clientId: 'tap-pre-cancel',
      });
    });

    // Restart bridge instance and deliver the stale waterIntake DataItem -> must NOT log drink.
    first.unmount();
    watch.sendAck.mockClear();
    renderBridgeWithHandle({ feature_choices: {} });
    await waitFor(() =>
      expect(mockWatchListeners.has('onWaterIntake')).toBe(true)
    );

    act(() => {
      mockWatchListeners.get('onWaterIntake')?.({
        clientId: 'tap-pre-cancel',
        entryDate: today,
        containerId: 1,
        ownerId: 'server-a',
      });
    });
    await waitFor(() =>
      expect(watch.sendAck).toHaveBeenCalledWith('tap-pre-cancel', true)
    );
    expect(mockLogDrinkOrQueue).not.toHaveBeenCalled();

    // Part 2: Post-commit cancellation deletes the created water log row and removes ackedClientId.
    mockLogDrinkOrQueue.mockResolvedValueOnce({
      queued: false,
      response: { water_ml: 250, log_entry_id: 'log-entry-42' },
    } as unknown as Awaited<ReturnType<typeof logDrinkOrQueue>>);

    act(() => {
      mockWatchListeners.get('onWaterIntake')?.({
        clientId: 'tap-post-commit',
        entryDate: today,
        containerId: 1,
        ownerId: 'server-a',
      });
    });
    await waitFor(() =>
      expect(watch.sendAck).toHaveBeenCalledWith('tap-post-commit', true)
    );
    await waitFor(() =>
      expect(lastContext().ackedClientIds).toContain('tap-post-commit')
    );

    watch.sendAck.mockClear();
    act(() => {
      mockWatchListeners.get('onWaterTapCancel')?.({
        clientId: 'tap-post-commit',
        ownerId: 'server-a',
      });
    });
    await waitFor(() =>
      expect(mockDeleteWaterIntakeLogEntry).toHaveBeenCalledWith(
        'log-entry-42',
        mockServerConfigA
      )
    );
    await waitFor(() =>
      expect(watch.sendAck).toHaveBeenCalledWith('tap-post-commit', true)
    );
    expect(lastContext().ackedClientIds).not.toContain('tap-post-commit');

    // Part 3: Mid-flight cancellation while POST is in flight deletes the newly created row on completion
    // with the owner-bound ServerConfig and only acks once compensating delete settles.
    let resolveMidFlight!: (
      value: Awaited<ReturnType<typeof logDrinkOrQueue>>
    ) => void;
    mockLogDrinkOrQueue.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveMidFlight = resolve;
        })
    );
    watch.sendAck.mockClear();
    mockDeleteWaterIntakeLogEntry.mockClear();

    act(() => {
      mockWatchListeners.get('onWaterIntake')?.({
        clientId: 'tap-mid-flight',
        entryDate: today,
        containerId: 2,
        ownerId: 'server-a',
      });
    });
    await waitFor(() => expect(mockLogDrinkOrQueue).toHaveBeenCalledTimes(2));

    act(() => {
      mockWatchListeners.get('onWaterTapCancel')?.({
        clientId: 'tap-mid-flight',
        ownerId: 'server-a',
      });
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(watch.sendAck).not.toHaveBeenCalledWith('tap-mid-flight', true);

    let resolveMidFlightDelete!: () => void;
    mockDeleteWaterIntakeLogEntry.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveMidFlightDelete = resolve;
        })
    );

    act(() => {
      resolveMidFlight({
        queued: false,
        response: { water_ml: 500, log_entry_id: 'log-entry-99' },
      } as unknown as Awaited<ReturnType<typeof logDrinkOrQueue>>);
    });
    await waitFor(() =>
      expect(mockDeleteWaterIntakeLogEntry).toHaveBeenCalledWith(
        'log-entry-99',
        mockServerConfigA
      )
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(watch.sendAck).not.toHaveBeenCalledWith('tap-mid-flight', true);

    act(() => {
      resolveMidFlightDelete();
    });
    await waitFor(() =>
      expect(watch.sendAck).toHaveBeenCalledWith('tap-mid-flight', true)
    );
    expect(lastContext().ackedClientIds).not.toContain('tap-mid-flight');
  });

  it('never guesses water log rows, leaves undo unresolved when owner ServerConfig is missing, and cancels offline outbox drinks by replay key', async () => {
    const today = getTodayDate();
    jest.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
    renderBridgeWithHandle({ feature_choices: {} });
    await waitFor(() => expect(watch.updateContext).toHaveBeenCalled());

    // 1. Committed online without authoritative row id -> never delete a guessed manual row; ack ok=false.
    mockFetchWaterIntakeLog.mockResolvedValueOnce([
      {
        id: 'unrelated-phone-drink',
        source: 'manual',
        container_name: 'Bottle',
        water_ml: 500,
        logged_at: `${today}T12:00:00.000Z`,
      } as unknown as Awaited<ReturnType<typeof fetchWaterIntakeLog>>[number],
    ]);
    mockLogDrinkOrQueue.mockResolvedValueOnce({
      queued: false,
      response: { water_ml: 750 },
    } as unknown as Awaited<ReturnType<typeof logDrinkOrQueue>>);

    act(() => {
      mockWatchListeners.get('onWaterIntake')?.({
        clientId: 'tap-no-row-id',
        entryDate: today,
        containerId: 1,
        ownerId: 'server-a',
      });
    });
    await waitFor(() =>
      expect(watch.sendAck).toHaveBeenCalledWith('tap-no-row-id', true)
    );

    watch.sendAck.mockClear();
    act(() => {
      mockWatchListeners.get('onWaterTapCancel')?.({
        clientId: 'tap-no-row-id',
        ownerId: 'server-a',
      });
    });
    await waitFor(() =>
      expect(watch.sendAck).toHaveBeenCalledWith('tap-no-row-id', false)
    );
    expect(mockDeleteWaterIntakeLogEntry).not.toHaveBeenCalled();

    // 2. Queued in offline outbox -> cancelQueuedWaterDrink removes untouched row (ok=true)
    //    and reports ok=false when upload already started ('uploading').
    mockLogDrinkOrQueue.mockResolvedValueOnce({
      queued: true,
      replayKey: 'outbox-replay-1',
    });
    act(() => {
      mockWatchListeners.get('onWaterIntake')?.({
        clientId: 'tap-queued-1',
        entryDate: today,
        containerId: 1,
        ownerId: 'server-a',
      });
    });
    await waitFor(() =>
      expect(watch.sendAck).toHaveBeenCalledWith('tap-queued-1', true)
    );

    watch.sendAck.mockClear();
    mockCancelQueuedWaterDrink.mockResolvedValueOnce('cancelled');
    act(() => {
      mockWatchListeners.get('onWaterTapCancel')?.({
        clientId: 'tap-queued-1',
        ownerId: 'server-a',
      });
    });
    await waitFor(() =>
      expect(mockCancelQueuedWaterDrink).toHaveBeenCalledWith(
        'outbox-replay-1',
        'server-a'
      )
    );
    await waitFor(() =>
      expect(watch.sendAck).toHaveBeenCalledWith('tap-queued-1', true)
    );

    mockLogDrinkOrQueue.mockResolvedValueOnce({
      queued: true,
      replayKey: 'outbox-replay-uploading',
    });
    act(() => {
      mockWatchListeners.get('onWaterIntake')?.({
        clientId: 'tap-queued-uploading',
        entryDate: today,
        containerId: 1,
        ownerId: 'server-a',
      });
    });
    await waitFor(() =>
      expect(watch.sendAck).toHaveBeenCalledWith('tap-queued-uploading', true)
    );

    watch.sendAck.mockClear();
    mockCancelQueuedWaterDrink.mockResolvedValueOnce('uploading');
    (getQueuedWaterDrinkStatus as jest.Mock).mockResolvedValueOnce('failed');
    act(() => {
      mockWatchListeners.get('onWaterTapCancel')?.({
        clientId: 'tap-queued-uploading',
        ownerId: 'server-a',
      });
    });
    await waitFor(() =>
      expect(watch.sendAck).toHaveBeenCalledWith('tap-queued-uploading', false)
    );

    // 3. Authoritative row id exists, but owner's ServerConfig cannot be resolved -> leave unresolved.
    mockLogDrinkOrQueue.mockResolvedValueOnce({
      queued: false,
      response: { water_ml: 1000, log_entry_id: 'log-owner-check' },
    } as unknown as Awaited<ReturnType<typeof logDrinkOrQueue>>);
    act(() => {
      mockWatchListeners.get('onWaterIntake')?.({
        clientId: 'tap-missing-owner-cfg',
        entryDate: today,
        containerId: 1,
        ownerId: 'server-a',
      });
    });
    await waitFor(() =>
      expect(watch.sendAck).toHaveBeenCalledWith('tap-missing-owner-cfg', true)
    );

    watch.sendAck.mockClear();
    mockDeleteWaterIntakeLogEntry.mockClear();
    mockResolveWatchServerConfig.mockResolvedValueOnce(null);
    act(() => {
      mockWatchListeners.get('onWaterTapCancel')?.({
        clientId: 'tap-missing-owner-cfg',
        ownerId: 'server-a',
      });
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(mockDeleteWaterIntakeLogEntry).not.toHaveBeenCalled();
    expect(watch.sendAck).not.toHaveBeenCalled();
  });

  it('requires a live server water-log read (not offline cache fallback) for direct water acks and keeps target medication queries fresh', async () => {
    const today = getTodayDate();
    const targetMedKey = JSON.stringify(
      medicationEntriesQueryKey({ fromDate: today, toDate: today })
    );
    let targetMedInvalidated = false;

    jest
      .spyOn(queryClient, 'invalidateQueries')
      .mockImplementation(async (filters) => {
        if (
          JSON.stringify(filters?.queryKey) ===
          JSON.stringify(medicationEntriesQueryKey())
        ) {
          const excluded = filters?.predicate
            ? !filters.predicate({
                queryKey: medicationEntriesQueryKey({
                  fromDate: today,
                  toDate: today,
                }),
              } as Parameters<NonNullable<typeof filters.predicate>>[0])
            : false;
          if (!excluded) {
            targetMedInvalidated = true;
          }
        }
      });
    const cache = queryClient.getQueryCache();
    const originalFindAll = cache.findAll.bind(cache);
    jest.spyOn(cache, 'findAll').mockImplementation((filters) => {
      if (JSON.stringify(filters?.queryKey) === targetMedKey) {
        return [
          {
            state: {
              isInvalidated: targetMedInvalidated,
              status: 'success',
              fetchStatus: 'idle',
              dataUpdatedAt: 1,
            },
          } as unknown as ReturnType<typeof originalFindAll>[number],
        ];
      }
      return originalFindAll(filters);
    });

    renderBridgeWithHandle({ feature_choices: {} });
    await waitFor(() => expect(lastContext().medications).toEqual([]));

    // 1. Offline live water-log read fails -> direct water ack MUST NOT be recorded even though invalidateQueries resolved.
    mockFetchWaterIntakeLogLive.mockRejectedValueOnce(new Error('offline'));
    act(() => {
      mockWatchListeners.get('onWatchServerSynced')?.({
        domain: 'water',
        ownerId: 'server-a',
        entryDate: today,
        clientId: 'direct-water-offline-cache-only',
      });
    });
    await waitFor(() =>
      expect(addLog).toHaveBeenCalledWith(
        expect.stringContaining('Watch direct water refetch failed'),
        'WARNING'
      )
    );
    expect(lastContext().ackedClientIds).not.toContain(
      'direct-water-offline-cache-only'
    );

    // 2. Direct medications sync must exclude the just-refetched target query from broad invalidation
    //    so `areMedicationQueriesFresh` stays true and publishes `direct-med-fresh`.
    act(() => {
      mockWatchListeners.get('onWatchServerSynced')?.({
        domain: 'medications',
        ownerId: 'server-a',
        entryDate: today,
        clientId: 'direct-med-fresh',
      });
    });
    await waitFor(() =>
      expect(lastContext().ackedClientIds).toContain('direct-med-fresh')
    );
    expect(targetMedInvalidated).toBe(false);
  });

  it('requires live server water total, skips cache writes after account switch, and treats 404 water deletes as success', async () => {
    const today = getTodayDate();
    jest.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
    const setQueryDataSpy = jest.spyOn(queryClient, 'setQueryData');

    renderBridgeWithHandle({ feature_choices: {} });
    await waitFor(() => expect(watch.updateContext).toHaveBeenCalled());

    // 1. Live water-log succeeds, but live water total fails (offline dailySummary fallback) ->
    //    MUST NOT record direct-water-total-offline.
    mockFetchWaterIntakeLogLive.mockResolvedValueOnce([]);
    mockFetchWaterIntakeLive.mockRejectedValueOnce(new Error('total offline'));
    act(() => {
      mockWatchListeners.get('onWatchServerSynced')?.({
        domain: 'water',
        ownerId: 'server-a',
        entryDate: today,
        clientId: 'direct-water-total-offline',
      });
    });
    await waitFor(() =>
      expect(addLog).toHaveBeenCalledWith(
        expect.stringContaining('Watch direct water refetch failed'),
        'WARNING'
      )
    );
    expect(lastContext().ackedClientIds).not.toContain(
      'direct-water-total-offline'
    );

    // 2. Account switches while live water fetches are in flight -> MUST NOT write Server A data into React Query cache.
    let resolveLiveTotal!: (
      value: Awaited<ReturnType<typeof fetchWaterIntakeLive>>
    ) => void;
    mockFetchWaterIntakeLogLive.mockResolvedValueOnce([]);
    mockFetchWaterIntakeLive.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveLiveTotal = resolve;
        })
    );
    setQueryDataSpy.mockClear();
    act(() => {
      mockWatchListeners.get('onWatchServerSynced')?.({
        domain: 'water',
        ownerId: 'server-a',
        entryDate: today,
        clientId: 'direct-water-stale-account',
      });
    });
    await waitFor(() =>
      expect(mockFetchWaterIntakeLive).toHaveBeenCalledTimes(2)
    );

    act(() => {
      bumpAccountGeneration();
      notifyAccountChanged();
    });
    resolveLiveTotal({
      water_ml: 999,
    } as unknown as Awaited<ReturnType<typeof fetchWaterIntakeLive>>);
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(setQueryDataSpy).not.toHaveBeenCalled();
    expect(lastContext().ackedClientIds).not.toContain(
      'direct-water-stale-account'
    );

    // 3. onWaterDelete treats HTTP 404 (already deleted row) as success ack (ok=true) while
    //    genuine 400 client rejections still ack ok=false.
    watch.sendAck.mockClear();
    mockDeleteWaterIntakeLogEntry.mockRejectedValueOnce(
      new ApiError('Not found', 404)
    );
    act(() => {
      mockWatchListeners.get('onWaterDelete')?.({
        clientId: 'delete-already-gone-404',
        entryId: 'row-404',
        ownerId: 'server-a',
      });
    });
    await waitFor(() =>
      expect(watch.sendAck).toHaveBeenCalledWith(
        'delete-already-gone-404',
        true
      )
    );
    await waitFor(() =>
      expect(lastContext().ackedClientIds).toContain('delete-already-gone-404')
    );

    watch.sendAck.mockClear();
    mockDeleteWaterIntakeLogEntry.mockRejectedValueOnce(
      new ApiError('Invalid entry id', 400)
    );
    act(() => {
      mockWatchListeners.get('onWaterDelete')?.({
        clientId: 'delete-invalid-400',
        entryId: 'row-bad',
        ownerId: 'server-a',
      });
    });
    await waitFor(() =>
      expect(watch.sendAck).toHaveBeenCalledWith('delete-invalid-400', false)
    );
    expect(lastContext().failedClientIds).toContain('delete-invalid-400');
  });

  it('verifies uncertain water writes on waterTapCancel via live log before acking and rotates unpublished direct acks FIFO', async () => {
    const today = getTodayDate();
    jest.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
    renderBridgeWithHandle({ feature_choices: {} });
    await waitFor(() => expect(watch.updateContext).toHaveBeenCalled());

    // 1. Transient failure leaves clientId in uncertainWaterWrites.
    mockLogDrinkOrQueue.mockRejectedValueOnce(
      new TypeError('Network request failed')
    );
    act(() => {
      mockWatchListeners.get('onWaterIntake')?.({
        clientId: 'tap-uncertain-1',
        entryDate: today,
        containerId: 1,
        ownerId: 'server-a',
      });
    });
    await waitFor(() => expect(mockLogDrinkOrQueue).toHaveBeenCalledTimes(1));

    // Transient log lookup failure must NOT ack ok=true yet.
    mockFetchWaterIntakeLogLive.mockRejectedValueOnce(
      new TypeError('Network request failed')
    );
    act(() => {
      mockWatchListeners.get('onWaterTapCancel')?.({
        clientId: 'tap-uncertain-1',
        ownerId: 'server-a',
      });
    });
    await waitFor(() =>
      expect(mockFetchWaterIntakeLogLive).toHaveBeenCalledTimes(1)
    );
    expect(watch.sendAck).not.toHaveBeenCalledWith('tap-uncertain-1', true);

    // Retry succeeds: matching row is found and deleted before ack(ok=true).
    mockFetchWaterIntakeLogLive.mockResolvedValueOnce([
      {
        id: 'server-row-uncertain-1',
        client_id: 'tap-uncertain-1',
        water_ml: 250,
        logged_at: `${today}T12:00:00.000Z`,
      } as unknown as Awaited<
        ReturnType<typeof fetchWaterIntakeLogLive>
      >[number],
    ]);
    mockDeleteWaterIntakeLogEntry.mockResolvedValueOnce(undefined);
    act(() => {
      mockWatchListeners.get('onWaterTapCancel')?.({
        clientId: 'tap-uncertain-1',
        ownerId: 'server-a',
      });
    });
    await waitFor(() =>
      expect(mockDeleteWaterIntakeLogEntry).toHaveBeenCalledWith(
        'server-row-uncertain-1',
        mockServerConfigA
      )
    );
    await waitFor(() =>
      expect(watch.sendAck).toHaveBeenCalledWith('tap-uncertain-1', true)
    );

    // 2. With 10 ordinary acks + 11 direct acks, push 1 marks only the 10 included direct acks
    //    published and push 2 rotates the 11th unpublished direct ack into ackedClientIds.
    watch.updateContext.mockClear();
    for (let i = 1; i <= 10; i += 1) {
      mockLogDrinkOrQueue.mockResolvedValueOnce({
        queued: false,
        response: { water_ml: 250 * i, log_entry_id: `ord-row-${i}` },
      } as unknown as Awaited<ReturnType<typeof logDrinkOrQueue>>);
      act(() => {
        mockWatchListeners.get('onWaterIntake')?.({
          clientId: `ord-${i}`,
          entryDate: today,
          containerId: 1,
          ownerId: 'server-a',
        });
      });
    }
    await waitFor(() =>
      expect(lastContext().ackedClientIds).toContain('ord-10')
    );

    mockFetchWaterIntakeLive.mockResolvedValue({
      water_ml: 500,
    } as unknown as Awaited<ReturnType<typeof fetchWaterIntakeLive>>);
    mockFetchWaterIntakeLogLive.mockResolvedValue([]);
    for (let i = 1; i <= 11; i += 1) {
      act(() => {
        mockWatchListeners.get('onWatchServerSynced')?.({
          domain: 'water',
          ownerId: 'server-a',
          entryDate: today,
          clientId: `dir-${i}`,
        });
      });
    }
    await waitFor(() =>
      expect(
        (lastContext().ackedClientIds ?? []).some((id) => id.startsWith('dir-'))
      ).toBe(true)
    );
    const push1Directs = (lastContext().ackedClientIds ?? []).filter((id) =>
      id.startsWith('dir-')
    );
    expect(push1Directs).toHaveLength(10);
    expect(push1Directs).not.toContain('dir-11');

    act(() => {
      mockWatchListeners.get('onContextRequest')?.();
    });
    await waitFor(() =>
      expect(lastContext().ackedClientIds).toContain('dir-11')
    );
  });

  it('reconciles cancelled queued water taps across uploading->confirmed and none states via live client_id lookup', async () => {
    const today = getTodayDate();
    jest.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
    const mockGetQueuedStatus =
      getQueuedWaterDrinkStatus as jest.MockedFunction<
        typeof getQueuedWaterDrinkStatus
      >;
    const mockCancelQueued = cancelQueuedWaterDrink as jest.MockedFunction<
      typeof cancelQueuedWaterDrink
    >;
    renderBridgeWithHandle({ feature_choices: {} });
    await waitFor(() => expect(watch.updateContext).toHaveBeenCalled());

    // 1. Tap is queued offline, then cancelled while outbox is actively 'uploading'.
    mockLogDrinkOrQueue.mockResolvedValueOnce({
      queued: true,
      replayKey: 'replay-uploading-1',
    } as unknown as Awaited<ReturnType<typeof logDrinkOrQueue>>);
    act(() => {
      mockWatchListeners.get('onWaterIntake')?.({
        clientId: 'tap-queued-uploading',
        entryDate: today,
        containerId: 1,
        ownerId: 'server-a',
      });
    });
    await waitFor(() => expect(mockLogDrinkOrQueue).toHaveBeenCalledTimes(1));

    watch.sendAck.mockClear();
    mockCancelQueued.mockResolvedValueOnce('uploading');
    mockGetQueuedStatus.mockResolvedValueOnce('active');
    act(() => {
      mockWatchListeners.get('onWaterTapCancel')?.({
        clientId: 'tap-queued-uploading',
        ownerId: 'server-a',
      });
    });
    await waitFor(() => expect(mockGetQueuedStatus).toHaveBeenCalledTimes(1));
    // Must NOT ack false or drop tracking while upload is active!
    expect(watch.sendAck).not.toHaveBeenCalledWith(
      'tap-queued-uploading',
      false
    );
    expect(watch.sendAck).not.toHaveBeenCalledWith(
      'tap-queued-uploading',
      true
    );

    // Outbox finishes uploading -> notifyUploadsConfirmed triggers reconciliation,
    // finds the landed row by client_id, deletes it, and acks true!
    mockCancelQueued.mockResolvedValueOnce('none');
    mockFetchWaterIntakeLogLive.mockResolvedValueOnce([
      {
        id: 'landed-row-1',
        client_id: 'replay-uploading-1',
        water_ml: 250,
        logged_at: `${today}T12:00:00.000Z`,
      } as unknown as Awaited<
        ReturnType<typeof fetchWaterIntakeLogLive>
      >[number],
    ]);
    mockDeleteWaterIntakeLogEntry.mockResolvedValueOnce(undefined);
    act(() => {
      notifyUploadsConfirmed();
    });
    await waitFor(() =>
      expect(mockDeleteWaterIntakeLogEntry).toHaveBeenCalledWith(
        'landed-row-1',
        mockServerConfigA
      )
    );
    await waitFor(() =>
      expect(watch.sendAck).toHaveBeenCalledWith('tap-queued-uploading', true)
    );

    // 2. 'none' on initial cancel immediately looks up and deletes landed row by client_id.
    mockLogDrinkOrQueue.mockResolvedValueOnce({
      queued: true,
      replayKey: 'replay-none-2',
    } as unknown as Awaited<ReturnType<typeof logDrinkOrQueue>>);
    act(() => {
      mockWatchListeners.get('onWaterIntake')?.({
        clientId: 'tap-queued-none',
        entryDate: today,
        containerId: 1,
        ownerId: 'server-a',
      });
    });
    await waitFor(() =>
      expect(watch.sendAck).toHaveBeenCalledWith('tap-queued-none', true)
    );
    watch.sendAck.mockClear();

    let resolveQueuedDelete!: () => void;
    mockCancelQueued.mockResolvedValueOnce('none');
    mockFetchWaterIntakeLogLive.mockResolvedValueOnce([
      {
        id: 'landed-row-2',
        client_id: 'replay-none-2',
        water_ml: 250,
        logged_at: `${today}T12:05:00.000Z`,
      } as unknown as Awaited<
        ReturnType<typeof fetchWaterIntakeLogLive>
      >[number],
    ]);
    mockDeleteWaterIntakeLogEntry.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveQueuedDelete = resolve;
        })
    );
    act(() => {
      mockWatchListeners.get('onWaterTapCancel')?.({
        clientId: 'tap-queued-none',
        ownerId: 'server-a',
      });
    });
    await waitFor(() =>
      expect(mockDeleteWaterIntakeLogEntry).toHaveBeenCalledWith(
        'landed-row-2',
        mockServerConfigA
      )
    );
    expect(watch.sendAck).not.toHaveBeenCalled();

    act(() => {
      resolveQueuedDelete();
    });
    await waitFor(() =>
      expect(watch.sendAck).toHaveBeenCalledWith('tap-queued-none', true)
    );

    // 3. 'unreadable' saved copy keeps queued water cancellation pending until readable.
    mockLogDrinkOrQueue.mockResolvedValueOnce({
      queued: true,
      replayKey: 'replay-unreadable-3',
    } as unknown as Awaited<ReturnType<typeof logDrinkOrQueue>>);
    act(() => {
      mockWatchListeners.get('onWaterIntake')?.({
        clientId: 'tap-queued-unreadable',
        entryDate: today,
        containerId: 1,
        ownerId: 'server-a',
      });
    });
    await waitFor(() =>
      expect(watch.sendAck).toHaveBeenCalledWith('tap-queued-unreadable', true)
    );
    watch.sendAck.mockClear();
    mockCancelQueued.mockClear();
    mockCancelQueued.mockResolvedValueOnce('unreadable');
    await act(async () => {
      mockWatchListeners.get('onWaterTapCancel')?.({
        clientId: 'tap-queued-unreadable',
        ownerId: 'server-a',
      });
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(mockCancelQueued).toHaveBeenCalledWith(
        'replay-unreadable-3',
        'server-a'
      )
    );
    expect(mockCancelQueued).toHaveBeenCalledTimes(1);
    expect(watch.sendAck).not.toHaveBeenCalled();

    mockCancelQueued.mockResolvedValueOnce('cancelled');
    act(() => {
      notifyUploadsConfirmed();
    });
    await waitFor(() => expect(mockCancelQueued).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(watch.sendAck).toHaveBeenCalledWith('tap-queued-unreadable', true)
    );
  });

  it('does not bump pushGenerationRef in background recordDirectAck so in-flight pushContext completes', async () => {
    const today = getTodayDate();
    jest.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
    renderBridgeWithHandle({ feature_choices: {} });
    await waitFor(() => expect(watch.updateContext).toHaveBeenCalled());
    // Every 'change' listener, as AppState notifies them all: the bridge's is
    // not the only one (the Garmin sync listens for the foreground too).
    const appStateChangeListeners = (
      AppState.addEventListener as jest.Mock
    ).mock.calls
      .filter(([type]) => type === 'change')
      .map(([, listener]) => listener as (state: string) => void);

    let resolveRange!: (
      rows: Awaited<ReturnType<typeof fetchMeasurementsRange>>
    ) => void;
    mockFetchMeasurementsRange.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRange = resolve;
        })
    );
    watch.updateContext.mockClear();
    mockFetchMeasurementsRange.mockClear();
    act(() => {
      mockWatchListeners.get('onContextRequest')?.();
    });
    await waitFor(() =>
      expect(mockFetchMeasurementsRange).toHaveBeenCalledTimes(1)
    );

    const prevAppState = AppState.currentState;
    try {
      Object.defineProperty(AppState, 'currentState', {
        value: 'background',
        configurable: true,
      });
      mockFetchWaterIntakeLive.mockResolvedValueOnce({
        water_ml: 250,
      } as unknown as Awaited<ReturnType<typeof fetchWaterIntakeLive>>);
      mockFetchWaterIntakeLogLive.mockResolvedValueOnce([]);
      const setItemSpy = jest.spyOn(AsyncStorage, 'setItem');
      act(() => {
        mockWatchListeners.get('onWatchServerSynced')?.({
          domain: 'water',
          ownerId: 'server-a',
          entryDate: today,
          clientId: 'bg-direct-water',
        });
      });
      await waitFor(() =>
        expect(setItemSpy).toHaveBeenCalledWith(
          'sparky.watch.ackState.v1',
          expect.stringContaining('bg-direct-water')
        )
      );
      resolveRange([]);
      await waitFor(() => expect(watch.updateContext).toHaveBeenCalledTimes(1));

      Object.defineProperty(AppState, 'currentState', {
        value: 'active',
        configurable: true,
      });
      watch.updateContext.mockClear();
      act(() => {
        for (const listener of appStateChangeListeners) listener('active');
      });
      await waitFor(() =>
        expect(lastContext().ackedClientIds).toContain('bg-direct-water')
      );
    } finally {
      Object.defineProperty(AppState, 'currentState', {
        value: prevAppState,
        configurable: true,
      });
    }
  });

  it('continues reconciling remaining cancelled queued water taps if an earlier candidate throws', async () => {
    const today = getTodayDate();
    jest.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
    const mockGetQueuedStatus =
      getQueuedWaterDrinkStatus as jest.MockedFunction<
        typeof getQueuedWaterDrinkStatus
      >;
    const mockCancelQueued = cancelQueuedWaterDrink as jest.MockedFunction<
      typeof cancelQueuedWaterDrink
    >;
    renderBridgeWithHandle({ feature_choices: {} });
    await waitFor(() => expect(watch.updateContext).toHaveBeenCalled());

    for (const [cid, rkey] of [
      ['tap-queued-err-1', 'replay-err-1'],
      ['tap-queued-ok-2', 'replay-ok-2'],
    ] as const) {
      mockLogDrinkOrQueue.mockResolvedValueOnce({
        queued: true,
        replayKey: rkey,
      } as unknown as Awaited<ReturnType<typeof logDrinkOrQueue>>);
      act(() => {
        mockWatchListeners.get('onWaterIntake')?.({
          clientId: cid,
          entryDate: today,
          containerId: 1,
          ownerId: 'server-a',
        });
      });
    }
    await waitFor(() => expect(mockLogDrinkOrQueue).toHaveBeenCalledTimes(2));

    watch.sendAck.mockClear();
    mockCancelQueued
      .mockResolvedValueOnce('uploading')
      .mockResolvedValueOnce('uploading');
    mockGetQueuedStatus
      .mockResolvedValueOnce('active')
      .mockResolvedValueOnce('active');
    for (const cid of ['tap-queued-err-1', 'tap-queued-ok-2']) {
      act(() => {
        mockWatchListeners.get('onWaterTapCancel')?.({
          clientId: cid,
          ownerId: 'server-a',
        });
      });
    }
    await waitFor(() => expect(mockGetQueuedStatus).toHaveBeenCalledTimes(2));

    // Candidate 1 throws during reconciliation; candidate 2 must still settle!
    mockCancelQueued
      .mockRejectedValueOnce(new Error('SQLite busy'))
      .mockResolvedValueOnce('cancelled');
    act(() => {
      notifyUploadsConfirmed();
    });
    await waitFor(() =>
      expect(watch.sendAck).toHaveBeenCalledWith('tap-queued-ok-2', true)
    );
    expect(addLog).toHaveBeenCalledWith(
      expect.stringContaining('tap-queued-err-1'),
      'WARNING'
    );
  });
});
