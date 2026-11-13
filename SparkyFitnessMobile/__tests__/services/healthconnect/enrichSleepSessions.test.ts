import {
  getGrantedPermissions,
  readRecords,
} from 'react-native-health-connect';
import { loadHealthPreference } from '../../../src/services/healthconnect/preferences';
import { enrichSleepSessions } from '../../../src/services/healthconnect';
import { postProcessRaw } from '../../../src/services/healthconnect/provider';
import { createTelemetryRunContext } from '../../../src/services/shared/telemetryBudget';
import { atLocalTime } from '../../helpers/localTime';

jest.mock('../../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

jest.mock('../../../src/services/healthconnect/preferences', () => ({
  loadHealthPreference: jest.fn(),
}));

const mockLoadPreference = loadHealthPreference as jest.Mock;
const setPreferences = (prefs: Record<string, boolean | null>) =>
  mockLoadPreference.mockImplementation(
    async (key: string) => prefs[key] ?? null
  );
const HRV_KEY = 'syncHeartRateVariabilityEnabled';
const RHR_KEY = 'syncRestingHeartRateEnabled';

const mockReadRecords = readRecords as jest.Mock;
const mockGetGrantedPermissions = getGrantedPermissions as jest.Mock;

const grant = (...recordTypes: string[]) =>
  mockGetGrantedPermissions.mockResolvedValue(
    recordTypes.map((recordType) => ({ accessType: 'read', recordType }))
  );
const readsOf = (recordType: string) =>
  mockReadRecords.mock.calls.filter(([type]) => type === recordType);

type ReadOutcome = { records: unknown[] } | Error;

const setReads = (outcomes: {
  HeartRateVariabilityRmssd?: ReadOutcome;
  RestingHeartRate?: ReadOutcome;
}) => {
  mockReadRecords.mockImplementation(async (recordType: string) => {
    const outcome = outcomes[recordType as keyof typeof outcomes];
    if (outcome instanceof Error) throw outcome;
    return outcome ?? { records: [] };
  });
};

const hrv = (day: string, time: string, value: number) => ({
  time: atLocalTime(day, time),
  heartRateVariabilityMillis: value,
});
const rhr = (day: string, time: string, value: number) => ({
  time: atLocalTime(day, time),
  beatsPerMinute: value,
});

const mainSleep = () => ({
  startTime: atLocalTime('2026-10-14', '23:00'),
  endTime: atLocalTime('2026-10-15', '07:00'),
});
const nap = () => ({
  startTime: atLocalTime('2026-10-15', '13:00'),
  endTime: atLocalTime('2026-10-15', '13:20'),
});

const enrich = (records: unknown[]) =>
  enrichSleepSessions(records, createTelemetryRunContext()) as Promise<
    Record<string, unknown>[]
  >;

describe('enrichSleepSessions', () => {
  beforeEach(() => {
    mockReadRecords.mockReset();
    setPreferences({ [HRV_KEY]: true, [RHR_KEY]: true });
    grant('HeartRateVariabilityRmssd', 'RestingHeartRate');
  });

  test('averages only HRV readings inside the session window', async () => {
    setReads({
      HeartRateVariabilityRmssd: {
        records: [
          hrv('2026-10-15', '01:00', 40),
          hrv('2026-10-15', '03:00', 44),
          hrv('2026-10-15', '14:00', 90),
        ],
      },
    });
    const [session] = await enrich([mainSleep()]);
    expect(session.avg_overnight_hrv).toBe(42);
    expect(session.resting_heart_rate).toBeUndefined();
  });

  test('uses the latest resting heart rate on the wake day', async () => {
    setReads({
      RestingHeartRate: {
        records: [
          rhr('2026-10-15', '06:00', 60),
          rhr('2026-10-15', '09:00', 57),
        ],
      },
    });
    const [session] = await enrich([mainSleep()]);
    expect(session.resting_heart_rate).toBe(57);
  });

  test('puts the main sleep values on a nap from the same wake day', async () => {
    setReads({
      HeartRateVariabilityRmssd: {
        records: [
          hrv('2026-10-15', '01:00', 40),
          hrv('2026-10-15', '03:00', 44),
          hrv('2026-10-15', '13:10', 90),
        ],
      },
      RestingHeartRate: { records: [rhr('2026-10-15', '09:00', 57)] },
    });
    const result = await enrich([nap(), mainSleep()]);
    for (const session of result) {
      expect(session.avg_overnight_hrv).toBe(42);
      expect(session.resting_heart_rate).toBe(57);
    }
  });

  test('a failed HRV read leaves HRV unset but keeps resting heart rate', async () => {
    setReads({
      HeartRateVariabilityRmssd: new Error('permission denied'),
      RestingHeartRate: { records: [rhr('2026-10-15', '09:00', 57)] },
    });
    const [session] = await enrich([mainSleep()]);
    expect(session.avg_overnight_hrv).toBeUndefined();
    expect(session.resting_heart_rate).toBe(57);
    expect(readsOf('HeartRateVariabilityRmssd')).toHaveLength(1);
    expect(readsOf('RestingHeartRate')).toHaveLength(1);
  });

  test('returns records unchanged when both reads fail', async () => {
    setReads({
      HeartRateVariabilityRmssd: new Error('denied'),
      RestingHeartRate: new Error('denied'),
    });
    const input = [mainSleep()];
    const result = await enrich(input);
    expect(result).toEqual([mainSleep()]);
    expect(result[0]).not.toHaveProperty('avg_overnight_hrv');
    expect(result[0]).not.toHaveProperty('resting_heart_rate');
    expect(readsOf('HeartRateVariabilityRmssd')).toHaveLength(1);
    expect(readsOf('RestingHeartRate')).toHaveLength(1);
  });

  test('does not read a record type without a read grant', async () => {
    grant('SleepSession', 'RestingHeartRate');
    setReads({
      HeartRateVariabilityRmssd: { records: [hrv('2026-10-15', '02:00', 50)] },
      RestingHeartRate: { records: [rhr('2026-10-15', '09:00', 57)] },
    });
    const [session] = await enrich([mainSleep()]);
    expect(readsOf('HeartRateVariabilityRmssd')).toHaveLength(0);
    expect(session.avg_overnight_hrv).toBeUndefined();
    expect(session.resting_heart_rate).toBe(57);
  });

  test('skips both reads when permissions cannot be fetched', async () => {
    mockGetGrantedPermissions.mockRejectedValue(new Error('boom'));
    const [session] = await enrich([mainSleep()]);
    expect(mockReadRecords).not.toHaveBeenCalled();
    expect(session).not.toHaveProperty('avg_overnight_hrv');
  });

  test('does not read HRV when its sync toggle is off, but still attaches resting heart rate', async () => {
    setPreferences({ [HRV_KEY]: false, [RHR_KEY]: true });
    setReads({
      HeartRateVariabilityRmssd: { records: [hrv('2026-10-15', '02:00', 50)] },
      RestingHeartRate: { records: [rhr('2026-10-15', '09:00', 57)] },
    });
    const [session] = await enrich([mainSleep()]);
    expect(readsOf('HeartRateVariabilityRmssd')).toHaveLength(0);
    expect(session.avg_overnight_hrv).toBeUndefined();
    expect(session.resting_heart_rate).toBe(57);
  });

  test('does not read anything when both sync toggles are off or unset', async () => {
    setPreferences({ [HRV_KEY]: false });
    setReads({
      HeartRateVariabilityRmssd: { records: [hrv('2026-10-15', '02:00', 50)] },
      RestingHeartRate: { records: [rhr('2026-10-15', '09:00', 57)] },
    });
    const [session] = await enrich([mainSleep()]);
    expect(mockReadRecords).not.toHaveBeenCalled();
    expect(session).not.toHaveProperty('avg_overnight_hrv');
    expect(session).not.toHaveProperty('resting_heart_rate');
  });

  test('treats a failed preference read as off', async () => {
    mockLoadPreference.mockRejectedValue(new Error('storage down'));
    const [session] = await enrich([mainSleep()]);
    expect(mockReadRecords).not.toHaveBeenCalled();
    expect(session).not.toHaveProperty('avg_overnight_hrv');
  });

  describe('time limit', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    test('returns the records unchanged when the reads never resolve', async () => {
      mockReadRecords.mockImplementation(() => new Promise(() => {}));
      const pending = enrich([mainSleep()]);
      await jest.advanceTimersByTimeAsync(15_000);
      const result = await pending;
      expect(result).toEqual([mainSleep()]);
      expect(result[0]).not.toHaveProperty('avg_overnight_hrv');
    });

    test('keeps resting heart rate when only the HRV read hangs', async () => {
      grant('HeartRateVariabilityRmssd', 'RestingHeartRate');
      setPreferences({ [HRV_KEY]: true, [RHR_KEY]: true });
      mockReadRecords.mockImplementation((recordType: string) =>
        recordType === 'HeartRateVariabilityRmssd'
          ? new Promise(() => {})
          : Promise.resolve({ records: [rhr('2026-10-15', '06:30', 57)] })
      );
      const pending = enrich([mainSleep()]);
      await jest.advanceTimersByTimeAsync(15_000);
      const [session] = await pending;
      expect(session.resting_heart_rate).toBe(57);
      expect(session).not.toHaveProperty('avg_overnight_hrv');
    });
  });

  test('picks the session with the most asleep time as primary', async () => {
    const longMostlyAwake = {
      startTime: atLocalTime('2026-10-14', '22:00'),
      endTime: atLocalTime('2026-10-15', '06:00'),
      stages: [
        {
          startTime: atLocalTime('2026-10-14', '22:00'),
          endTime: atLocalTime('2026-10-15', '03:00'),
          stage: 1,
        },
        {
          startTime: atLocalTime('2026-10-15', '03:00'),
          endTime: atLocalTime('2026-10-15', '06:00'),
          stage: 4,
        },
      ],
    };
    const shorterMoreAsleep = {
      startTime: atLocalTime('2026-10-15', '06:30'),
      endTime: atLocalTime('2026-10-15', '11:30'),
      stages: [
        {
          startTime: atLocalTime('2026-10-15', '06:30'),
          endTime: atLocalTime('2026-10-15', '11:30'),
          stage: 5,
        },
      ],
    };
    setReads({
      HeartRateVariabilityRmssd: {
        records: [
          hrv('2026-10-15', '04:00', 30),
          hrv('2026-10-15', '08:00', 60),
        ],
      },
    });
    const result = await enrich([longMostlyAwake, shorterMoreAsleep]);
    expect(result[0].avg_overnight_hrv).toBe(60);
    expect(result[1].avg_overnight_hrv).toBe(60);
  });

  test('ignores a resting heart rate dated to the next local day', async () => {
    setReads({
      RestingHeartRate: {
        records: [
          rhr('2026-10-15', '09:00', 57),
          rhr('2026-10-16', '08:00', 50),
        ],
      },
    });
    const [session] = await enrich([mainSleep()]);
    expect(session.resting_heart_rate).toBe(57);
  });

  test('dates a sleep and its resting heart rate at the record offset, not the device zone', async () => {
    const plus9 = { totalSeconds: 32400 };
    setReads({
      RestingHeartRate: {
        records: [
          {
            time: '2026-10-15T01:00:00.000Z',
            zoneOffset: plus9,
            beatsPerMinute: 55,
          },
          {
            time: '2026-10-14T10:00:00.000Z',
            zoneOffset: plus9,
            beatsPerMinute: 61,
          },
        ],
      },
    });
    const [session] = await enrich([
      {
        startTime: '2026-10-14T13:00:00.000Z',
        endTime: '2026-10-14T22:00:00.000Z',
        endZoneOffset: plus9,
      },
    ]);
    expect(session.resting_heart_rate).toBe(55);
    // The mock ignores the range, so pin it: the read must reach a day past
    // each side of the wake day (the 15th) in device time, or a reading
    // dated at a distant offset is never fetched.
    const [, options] = readsOf('RestingHeartRate')[0] as [
      string,
      { timeRangeFilter: { startTime: string; endTime: string } },
    ];
    expect(options.timeRangeFilter.startTime).toBe(
      new Date(2026, 9, 14, 0, 0, 0, 0).toISOString()
    );
    expect(options.timeRangeFilter.endTime).toBe(
      new Date(2026, 9, 16, 23, 59, 59, 999).toISOString()
    );
  });

  test('falls back to the start offset, then the device day, when the end offset is missing', async () => {
    const plus9 = { totalSeconds: 32400 };
    setReads({
      RestingHeartRate: {
        records: [
          {
            time: '2026-10-15T01:00:00.000Z',
            zoneOffset: plus9,
            beatsPerMinute: 55,
          },
        ],
      },
    });
    const [session] = await enrich([
      {
        startTime: '2026-10-14T13:00:00.000Z',
        endTime: '2026-10-14T22:00:00.000Z',
        startZoneOffset: plus9,
      },
    ]);
    expect(session.resting_heart_rate).toBe(55);
  });

  test('a session without offsets still uses the device day', async () => {
    setReads({
      RestingHeartRate: {
        records: [
          rhr('2026-10-15', '09:00', 57),
          rhr('2026-10-14', '09:00', 99),
        ],
      },
    });
    const [session] = await enrich([mainSleep()]);
    expect(session.resting_heart_rate).toBe(57);
  });

  test('postProcessRaw enriches SleepSession records', async () => {
    setReads({
      HeartRateVariabilityRmssd: { records: [hrv('2026-10-15', '02:00', 50)] },
    });
    const result = (await postProcessRaw(
      { recordType: 'SleepSession' },
      [mainSleep()],
      createTelemetryRunContext()
    )) as Record<string, unknown>[];
    expect(result[0].avg_overnight_hrv).toBe(50);
  });
});
