import { act, renderHook, waitFor } from '@testing-library/react-native';
import WatchConnectivity, {
  type WatchContextPayload,
} from '../../modules/watch-connectivity';
import type { FeatureChoicesResponse } from '@workspace/shared';
import { useWatchCheckInBridge } from '../../src/hooks/useWatchCheckInBridge';
import { fetchFeatureChoices } from '../../src/services/api/featureChoicesApi';
import {
  listEntries,
  listMedications,
} from '../../src/services/api/medicationsApi';
import { useAppPreferencesStore } from '../../src/stores/appPreferencesStore';
import { featureChoicesQueryKey } from '../../src/hooks/queryKeys';
import { createQueryWrapper, createTestQueryClient } from './queryTestUtils';

jest.mock('../../modules/watch-connectivity', () => ({
  __esModule: true,
  default: {
    isSupported: jest.fn(() => true),
    updateContext: jest.fn(() => Promise.resolve()),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
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
  fetchWaterIntakeLog: jest.fn(() => Promise.resolve([])),
  deleteWaterIntakeLogEntry: jest.fn(),
}));
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: null }),
}));
jest.mock('../../src/hooks/useCustomNutrients', () => ({
  useCustomNutrients: () => ({ customNutrients: [] }),
}));
jest.mock('../../src/hooks/useDailySummary', () => ({
  useDailySummary: () => ({ summary: undefined }),
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
  useCurrentFast: () => ({ data: undefined }),
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
  getActiveServerConfigId: () => Promise.resolve('server-a'),
}));
jest.mock('../../src/services/watchServerCredentials', () => ({
  syncWatchServerCredentials: () => Promise.resolve('server-a'),
  isPayloadForActiveServer: () => Promise.resolve(true),
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));

const watch = WatchConnectivity as unknown as {
  updateContext: jest.Mock<Promise<void>, [WatchContextPayload]>;
};
const mockFetchChoices = jest.mocked(fetchFeatureChoices);

function lastContext(): WatchContextPayload {
  const calls = watch.updateContext.mock.calls;
  return calls[calls.length - 1]![0];
}

function renderBridge(cachedChoices?: FeatureChoicesResponse) {
  const client = createTestQueryClient();
  if (cachedChoices) client.setQueryData(featureChoicesQueryKey, cachedChoices);
  renderHook(() => useWatchCheckInBridge(true), {
    wrapper: createQueryWrapper(client),
  });
  return client;
}

describe('useWatchCheckInBridge and the Medications switch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAppPreferencesStore.setState({ hiddenWatchPages: ['trend'] });
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

  it('leaves the pages to the watch while the choices are not known', async () => {
    mockFetchChoices.mockReturnValue(new Promise(() => {}));
    renderBridge();

    await waitFor(() => expect(watch.updateContext).toHaveBeenCalled());
    expect(lastContext()).not.toHaveProperty('hiddenPages');
    expect(lastContext()).not.toHaveProperty('offFeatures');
    expect(lastContext().pageOrder).toBeDefined();
  });
});
