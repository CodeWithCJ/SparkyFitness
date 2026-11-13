import { queryQuantitySamples } from '@kingstinct/react-native-healthkit';
import { loadHealthPreference } from '../../../src/services/healthkit/preferences';
import { enrichSleepSessions } from '../../../src/services/healthkit/sleepBiometrics';
import { postProcessRaw } from '../../../src/services/healthkit/provider';
import type { AggregatedSleepSession } from '../../../src/types/healthRecords';

jest.mock('../../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

jest.mock('../../../src/services/healthkit/preferences', () => ({
  loadHealthPreference: jest.fn(),
}));

const mockLoadPreference = loadHealthPreference as jest.Mock;
const mockQueryQuantitySamples = queryQuantitySamples as jest.Mock;

const HRV_KEY = 'syncHeartRateVariabilityEnabled';
const RHR_KEY = 'syncRestingHeartRateEnabled';
const HRV_ID = 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN';
const RHR_ID = 'HKQuantityTypeIdentifierRestingHeartRate';

const setPreferences = (prefs: Record<string, boolean | null>) =>
  mockLoadPreference.mockImplementation(
    async (key: string) => prefs[key] ?? null
  );

const atLocal = (day: string, time: string) => {
  const [year, month, date] = day.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return new Date(year, month - 1, date, hour, minute, 0, 0);
};

const hrv = (day: string, time: string, quantity: number) => ({
  startDate: atLocal(day, time),
  quantity,
  unit: 'ms',
});
const rhr = (day: string, time: string, quantity: number) => ({
  startDate: atLocal(day, time),
  quantity,
  unit: 'count/min',
});

const session = (
  bedtime: Date,
  wake: Date,
  asleepSeconds: number
): AggregatedSleepSession => ({
  type: 'SleepSession',
  source: 'HealthKit',
  timestamp: bedtime.toISOString(),
  entry_date: `${wake.getFullYear()}-${String(wake.getMonth() + 1).padStart(2, '0')}-${String(wake.getDate()).padStart(2, '0')}`,
  bedtime: bedtime.toISOString(),
  wake_time: wake.toISOString(),
  duration_in_seconds: (wake.getTime() - bedtime.getTime()) / 1000,
  time_asleep_in_seconds: asleepSeconds,
  deep_sleep_seconds: 0,
  light_sleep_seconds: asleepSeconds,
  rem_sleep_seconds: 0,
  awake_sleep_seconds: 0,
  stage_events: [],
});

const mainSleep = () =>
  session(
    atLocal('2026-10-14', '23:00'),
    atLocal('2026-10-15', '07:00'),
    8 * 3600
  );
const nap = () =>
  session(
    atLocal('2026-10-15', '13:00'),
    atLocal('2026-10-15', '13:20'),
    20 * 60
  );

const readsOf = (identifier: string) =>
  mockQueryQuantitySamples.mock.calls.filter(([id]) => id === identifier);

describe('enrichSleepSessions', () => {
  beforeEach(() => {
    mockQueryQuantitySamples.mockReset();
    setPreferences({ [HRV_KEY]: true, [RHR_KEY]: true });
    mockQueryQuantitySamples.mockResolvedValue([]);
  });

  test('averages only HRV readings inside the primary sleep window', async () => {
    mockQueryQuantitySamples.mockImplementation(async (identifier: string) =>
      identifier === HRV_ID
        ? [
            hrv('2026-10-15', '01:00', 40),
            hrv('2026-10-15', '03:00', 44),
            hrv('2026-10-15', '14:00', 90),
          ]
        : []
    );

    const [enriched] = await enrichSleepSessions([mainSleep()]);

    expect(enriched.avg_overnight_hrv).toBe(42);
    expect(enriched).not.toHaveProperty('resting_heart_rate');
    const [, options] = readsOf(HRV_ID)[0] as [string, { unit: string }];
    expect(options.unit).toBe('ms');
  });

  test('uses the latest resting heart rate on the wake day', async () => {
    mockQueryQuantitySamples.mockImplementation(async (identifier: string) =>
      identifier === RHR_ID
        ? [rhr('2026-10-15', '06:00', 60), rhr('2026-10-15', '09:00', 57)]
        : []
    );

    const [enriched] = await enrichSleepSessions([mainSleep()]);

    expect(enriched.resting_heart_rate).toBe(57);
    const [, options] = readsOf(RHR_ID)[0] as [string, { unit: string }];
    expect(options.unit).toBe('count/min');
  });

  test('puts the main sleep values on a nap from the same wake day', async () => {
    mockQueryQuantitySamples.mockImplementation(async (identifier: string) => {
      if (identifier === HRV_ID) {
        return [
          hrv('2026-10-15', '01:00', 40),
          hrv('2026-10-15', '03:00', 44),
          hrv('2026-10-15', '13:10', 90),
        ];
      }
      if (identifier === RHR_ID) return [rhr('2026-10-15', '09:00', 57)];
      return [];
    });

    const result = await enrichSleepSessions([nap(), mainSleep()]);

    for (const enriched of result) {
      expect(enriched.avg_overnight_hrv).toBe(42);
      expect(enriched.resting_heart_rate).toBe(57);
    }
  });

  test('a failed HRV read leaves HRV unset but keeps resting heart rate', async () => {
    mockQueryQuantitySamples.mockImplementation(async (identifier: string) => {
      if (identifier === HRV_ID) throw new Error('permission denied');
      if (identifier === RHR_ID) return [rhr('2026-10-15', '09:00', 57)];
      return [];
    });

    const [enriched] = await enrichSleepSessions([mainSleep()]);

    expect(enriched).not.toHaveProperty('avg_overnight_hrv');
    expect(enriched.resting_heart_rate).toBe(57);
  });

  test('returns sessions unchanged when both reads fail', async () => {
    mockQueryQuantitySamples.mockRejectedValue(new Error('denied'));
    const input = [mainSleep()];

    const result = await enrichSleepSessions(input);

    expect(result).toEqual(input);
    expect(result[0]).not.toHaveProperty('avg_overnight_hrv');
    expect(result[0]).not.toHaveProperty('resting_heart_rate');
  });

  test('does not read a metric whose sync toggle is off', async () => {
    setPreferences({ [HRV_KEY]: false, [RHR_KEY]: true });
    mockQueryQuantitySamples.mockImplementation(async (identifier: string) =>
      identifier === RHR_ID ? [rhr('2026-10-15', '09:00', 57)] : []
    );

    const [enriched] = await enrichSleepSessions([mainSleep()]);

    expect(readsOf(HRV_ID)).toHaveLength(0);
    expect(enriched).not.toHaveProperty('avg_overnight_hrv');
    expect(enriched.resting_heart_rate).toBe(57);
  });

  test('does not read anything when both sync toggles are off or unset', async () => {
    setPreferences({ [HRV_KEY]: false });

    const [enriched] = await enrichSleepSessions([mainSleep()]);

    expect(mockQueryQuantitySamples).not.toHaveBeenCalled();
    expect(enriched).not.toHaveProperty('avg_overnight_hrv');
    expect(enriched).not.toHaveProperty('resting_heart_rate');
  });

  test('treats a failed preference read as off', async () => {
    mockLoadPreference.mockRejectedValue(new Error('storage down'));

    const [enriched] = await enrichSleepSessions([mainSleep()]);

    expect(mockQueryQuantitySamples).not.toHaveBeenCalled();
    expect(enriched).not.toHaveProperty('avg_overnight_hrv');
  });

  test('ignores a resting heart rate dated to the next local day', async () => {
    mockQueryQuantitySamples.mockImplementation(async (identifier: string) =>
      identifier === RHR_ID
        ? [rhr('2026-10-15', '09:00', 57), rhr('2026-10-16', '08:00', 50)]
        : []
    );

    const [enriched] = await enrichSleepSessions([mainSleep()]);

    expect(enriched.resting_heart_rate).toBe(57);
  });

  test('ignores non-positive samples', async () => {
    mockQueryQuantitySamples.mockImplementation(async (identifier: string) => {
      if (identifier === HRV_ID) return [hrv('2026-10-15', '02:00', 0)];
      if (identifier === RHR_ID) return [rhr('2026-10-15', '09:00', -1)];
      return [];
    });

    const [enriched] = await enrichSleepSessions([mainSleep()]);

    expect(enriched).not.toHaveProperty('avg_overnight_hrv');
    expect(enriched).not.toHaveProperty('resting_heart_rate');
  });

  describe('time limit', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    test('returns the sessions unchanged when the reads never resolve', async () => {
      mockQueryQuantitySamples.mockImplementation(() => new Promise(() => {}));
      const input = [mainSleep()];
      const pending = enrichSleepSessions(input);
      await jest.advanceTimersByTimeAsync(15_000);
      const result = await pending;

      expect(result).toEqual(input);
      expect(result[0]).not.toHaveProperty('avg_overnight_hrv');
    });

    test('keeps resting heart rate when only the HRV read hangs', async () => {
      mockQueryQuantitySamples.mockImplementation((identifier: string) =>
        identifier === HRV_ID
          ? new Promise(() => {})
          : Promise.resolve([rhr('2026-10-15', '06:30', 57)])
      );
      const pending = enrichSleepSessions([mainSleep()]);
      await jest.advanceTimersByTimeAsync(15_000);
      const [enriched] = await pending;

      expect(enriched.resting_heart_rate).toBe(57);
      expect(enriched).not.toHaveProperty('avg_overnight_hrv');
    });
  });

  test('postProcessRaw enriches an aggregated HealthKit night', async () => {
    mockQueryQuantitySamples.mockImplementation(async (identifier: string) =>
      identifier === HRV_ID ? [hrv('2026-10-15', '02:00', 50)] : []
    );
    const bedtime = atLocal('2026-10-14', '23:00');
    const wake = atLocal('2026-10-15', '07:00');

    const result = (await postProcessRaw({ recordType: 'SleepSession' }, [
      {
        startTime: bedtime.toISOString(),
        endTime: wake.toISOString(),
        value: 'HKCategoryValueSleepAnalysisAsleepDeep',
      },
    ])) as AggregatedSleepSession[];

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('SleepSession');
    expect(result[0].avg_overnight_hrv).toBe(50);
  });
});
