import {
  enableBackgroundDelivery as hkEnableBackgroundDelivery,
  disableBackgroundDelivery as hkDisableBackgroundDelivery,
  subscribeToChanges as hkSubscribeToChanges,
  UpdateFrequency,
} from '@kingstinct/react-native-healthkit';

import {
  enableBackgroundDeliveryForMetric,
  disableBackgroundDeliveryForMetric,
  setupBackgroundDeliveryForEnabledMetrics,
  subscribeToEnabledMetricChanges,
  cleanupAllSubscriptions,
} from '../../../src/services/healthkit/backgroundDelivery';

jest.mock('../../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const mockLoadHealthPreference = jest.fn();
jest.mock('../../../src/services/healthkit/preferences', () => ({
  loadHealthPreference: (...args: unknown[]) => mockLoadHealthPreference(...args),
}));

const mockEnableBgDelivery = hkEnableBackgroundDelivery as jest.Mock;
const mockDisableBgDelivery = hkDisableBackgroundDelivery as jest.Mock;
const mockSubscribeToChanges = hkSubscribeToChanges as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  cleanupAllSubscriptions();
});

describe('enableBackgroundDeliveryForMetric', () => {
  it('uses UpdateFrequency.hourly for hourly-tier metrics (Steps)', async () => {
    await enableBackgroundDeliveryForMetric('Steps');

    expect(mockEnableBgDelivery).toHaveBeenCalledWith(
      'HKQuantityTypeIdentifierStepCount',
      UpdateFrequency.hourly,
    );
  });

  it('uses UpdateFrequency.daily for daily-tier metrics (Weight)', async () => {
    await enableBackgroundDeliveryForMetric('Weight');

    expect(mockEnableBgDelivery).toHaveBeenCalledWith(
      'HKQuantityTypeIdentifierBodyMass',
      UpdateFrequency.daily,
    );
  });

  it('skips background delivery entirely for none-tier metrics (WalkingSpeed)', async () => {
    await enableBackgroundDeliveryForMetric('WalkingSpeed');

    expect(mockEnableBgDelivery).not.toHaveBeenCalled();
  });

  it('defaults to daily for metrics without an explicit tier', async () => {
    // BloodGlucose has no explicit backgroundDeliveryFrequency, should default to daily
    await enableBackgroundDeliveryForMetric('BloodGlucose');

    expect(mockEnableBgDelivery).toHaveBeenCalledWith(
      'HKQuantityTypeIdentifierBloodGlucose',
      UpdateFrequency.daily,
    );
  });

  it('preserves the most aggressive frequency for shared identifiers', async () => {
    mockLoadHealthPreference.mockImplementation((key: string) => {
      if (key === 'syncTotalCaloriesEnabled') return Promise.resolve(true);
      return Promise.resolve(false);
    });

    await enableBackgroundDeliveryForMetric('BasalMetabolicRate');

    expect(mockEnableBgDelivery).toHaveBeenCalledWith(
      'HKQuantityTypeIdentifierBasalEnergyBurned',
      UpdateFrequency.hourly,
    );
  });
});

describe('setupBackgroundDeliveryForEnabledMetrics', () => {
  it('registers hourly metrics with hourly and daily metrics with daily', async () => {
    // Enable Steps (hourly) and Weight (daily)
    mockLoadHealthPreference.mockImplementation((key: string) => {
      if (key === 'syncStepsEnabled') return Promise.resolve(true);
      if (key === 'syncWeightEnabled') return Promise.resolve(true);
      return Promise.resolve(false);
    });

    await setupBackgroundDeliveryForEnabledMetrics();

    expect(mockEnableBgDelivery).toHaveBeenCalledWith(
      'HKQuantityTypeIdentifierStepCount',
      UpdateFrequency.hourly,
    );
    expect(mockEnableBgDelivery).toHaveBeenCalledWith(
      'HKQuantityTypeIdentifierBodyMass',
      UpdateFrequency.daily,
    );
  });

  it('skips none-tier metrics entirely', async () => {
    // Enable only WalkingSpeed (none tier)
    mockLoadHealthPreference.mockImplementation((key: string) => {
      if (key === 'syncWalkingSpeedEnabled') return Promise.resolve(true);
      return Promise.resolve(false);
    });

    await setupBackgroundDeliveryForEnabledMetrics();

    expect(mockEnableBgDelivery).not.toHaveBeenCalled();
  });

  it('uses the most aggressive frequency when metrics share an HK identifier', async () => {
    // TotalCaloriesBurned (hourly) and BasalMetabolicRate (daily) both map to
    // HKQuantityTypeIdentifierBasalEnergyBurned. Hourly should win.
    mockLoadHealthPreference.mockImplementation((key: string) => {
      if (key === 'syncTotalCaloriesEnabled') return Promise.resolve(true);
      if (key === 'syncBasalMetabolicRateEnabled') return Promise.resolve(true);
      return Promise.resolve(false);
    });

    await setupBackgroundDeliveryForEnabledMetrics();

    expect(mockEnableBgDelivery).toHaveBeenCalledTimes(1);
    expect(mockEnableBgDelivery).toHaveBeenCalledWith(
      'HKQuantityTypeIdentifierBasalEnergyBurned',
      UpdateFrequency.hourly,
    );
  });

  it('does not register anything when no metrics are enabled', async () => {
    mockLoadHealthPreference.mockResolvedValue(false);

    await setupBackgroundDeliveryForEnabledMetrics();

    expect(mockEnableBgDelivery).not.toHaveBeenCalled();
  });
});

describe('disableBackgroundDeliveryForMetric', () => {
  it('disables delivery when no other enabled metric needs the identifier', async () => {
    // All metrics disabled
    mockLoadHealthPreference.mockResolvedValue(false);

    await disableBackgroundDeliveryForMetric('Steps');

    expect(mockDisableBgDelivery).toHaveBeenCalledWith(
      'HKQuantityTypeIdentifierStepCount',
    );
  });

  it('re-registers the remaining tier when a shared identifier is still needed', async () => {
    mockLoadHealthPreference.mockImplementation((key: string) => {
      if (key === 'syncBasalMetabolicRateEnabled') return Promise.resolve(true);
      return Promise.resolve(false);
    });

    await disableBackgroundDeliveryForMetric('TotalCaloriesBurned');

    expect(mockDisableBgDelivery).not.toHaveBeenCalled();
    expect(mockEnableBgDelivery).toHaveBeenCalledWith(
      'HKQuantityTypeIdentifierBasalEnergyBurned',
      UpdateFrequency.daily,
    );
  });

  it('disables when the only remaining metric using the identifier has none frequency', async () => {
    // CyclingCadence is enabled but has 'none' frequency — should not keep the identifier
    mockLoadHealthPreference.mockImplementation((key: string) => {
      if (key === 'syncCyclingCadenceEnabled') return Promise.resolve(true);
      return Promise.resolve(false);
    });

    // CyclingCadence maps to HKQuantityTypeIdentifierCyclingCadence
    // If we disable another metric that mapped to the same identifier,
    // the none-tier metric should not prevent disabling.
    // But CyclingCadence has a unique identifier, so let's just verify
    // that a none-tier metric doesn't block disabling of its own identifier.
    await disableBackgroundDeliveryForMetric('CyclingCadence');

    // CyclingCadence has 'none' frequency, so even though it's "enabled",
    // it shouldn't be in stillNeeded. The identifier should be disabled.
    expect(mockDisableBgDelivery).toHaveBeenCalledWith(
      'HKQuantityTypeIdentifierCyclingCadence',
    );
  });
});

describe('rebuildSubscriptions race condition', () => {
  it('discards a stale rebuild when a newer one is triggered', async () => {
    // First rebuild: slow — preferences resolve after a delay
    let resolveFirst!: () => void;
    const firstPromise = new Promise<void>(r => { resolveFirst = r; });

    mockLoadHealthPreference.mockImplementation((key: string) => {
      if (key === 'syncStepsEnabled') {
        return firstPromise.then(() => true);
      }
      return firstPromise.then(() => false);
    });

    const callback = jest.fn();
    const mockRemove = jest.fn();
    mockSubscribeToChanges.mockReturnValue({ remove: mockRemove });

    // Start first rebuild (subscriptions are created async)
    subscribeToEnabledMetricChanges(callback);

    // Before the first rebuild finishes, trigger a second rebuild
    // with preferences that resolve immediately
    mockLoadHealthPreference.mockResolvedValue(false);
    subscribeToEnabledMetricChanges(callback);

    // Let the second rebuild complete
    await Promise.resolve();

    // Now resolve the first (stale) rebuild
    resolveFirst();
    await Promise.resolve();
    // Flush microtask queue
    await new Promise(r => setTimeout(r, 0));

    // The first rebuild should have been discarded — subscribeToChanges
    // should NOT have been called for the stale rebuild's Steps identifier.
    // The second rebuild had no enabled metrics, so no subscriptions at all.
    expect(mockSubscribeToChanges).not.toHaveBeenCalled();
  });

  it('only the latest rebuild registers subscriptions', async () => {
    mockLoadHealthPreference.mockImplementation((key: string) => {
      if (key === 'syncHeartRateEnabled') return Promise.resolve(true);
      return Promise.resolve(false);
    });

    const callback = jest.fn();
    const mockRemove = jest.fn();
    mockSubscribeToChanges.mockReturnValue({ remove: mockRemove });

    subscribeToEnabledMetricChanges(callback);

    // Let the rebuild complete
    await new Promise(r => setTimeout(r, 0));

    // Heart rate should be subscribed
    expect(mockSubscribeToChanges).toHaveBeenCalledWith(
      'HKQuantityTypeIdentifierHeartRate',
      expect.any(Function),
    );
  });
});
