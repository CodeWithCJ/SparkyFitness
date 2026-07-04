import {
  healthReadProvider,
  readCumulativeByDay,
  postProcessRaw,
} from '../../../src/services/healthkit/provider';
import {
  readMinMaxAvgByDayDetailed,
  readHealthRecordsDetailed,
  initHealthConnect,
} from '../../../src/services/healthkit/index';
import {
  isHealthDataAvailable,
  queryStatisticsCollectionForQuantity,
} from '@kingstinct/react-native-healthkit';

jest.mock('../../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const mockIsHealthDataAvailable = isHealthDataAvailable as jest.Mock;
const mockQueryStatisticsCollection = queryStatisticsCollectionForQuantity as jest.Mock;

const start = new Date(2026, 6, 1, 0, 0, 0, 0);
const end = new Date(2026, 6, 3, 15, 30, 0);

describe('healthkit provider', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockIsHealthDataAvailable.mockResolvedValue(true);
    mockQueryStatisticsCollection.mockResolvedValue([]);
    await initHealthConnect();
  });

  describe('readCumulativeByDay', () => {
    test.each([
      ['Steps', 'HKQuantityTypeIdentifierStepCount'],
      ['ActiveCaloriesBurned', 'HKQuantityTypeIdentifierActiveEnergyBurned'],
      ['Distance', 'HKQuantityTypeIdentifierDistanceWalkingRunning'],
      ['FloorsClimbed', 'HKQuantityTypeIdentifierFlightsClimbed'],
    ])('%s routes to the native statistics collection', async (recordType, identifier) => {
      const result = await readCumulativeByDay({ recordType }, start, end);

      expect(result).toEqual({ records: [] });
      expect(mockQueryStatisticsCollection).toHaveBeenCalledWith(
        identifier,
        ['cumulativeSum'],
        expect.any(Date),
        { day: 1 },
        expect.anything(),
      );
    });

    test('BasalMetabolicRate maps to the basal-energy aggregation (iOS capability)', async () => {
      const result = await readCumulativeByDay({ recordType: 'BasalMetabolicRate' }, start, end);

      expect(result).toEqual({ records: [] });
      expect(mockQueryStatisticsCollection).toHaveBeenCalledWith(
        'HKQuantityTypeIdentifierBasalEnergyBurned',
        ['cumulativeSum'],
        expect.any(Date),
        { day: 1 },
        expect.anything(),
      );
    });

    test('an unknown record type reports capability missing (null)', async () => {
      await expect(readCumulativeByDay({ recordType: 'Weight' }, start, end)).resolves.toBeNull();
    });

    test('a native failure returns an error envelope, not null', async () => {
      mockQueryStatisticsCollection.mockRejectedValue(new Error('native query failed'));

      const result = await readCumulativeByDay({ recordType: 'Steps' }, start, end);

      expect(result).toEqual({ records: [], error: expect.stringContaining('native query failed') });
    });
  });

  test('readMinMaxAvgByDay is the spec-gated day-statistics read (null without a verified spec)', async () => {
    expect(healthReadProvider.readMinMaxAvgByDay).toBe(readMinMaxAvgByDayDetailed);

    await expect(
      healthReadProvider.readMinMaxAvgByDay(
        { recordType: 'RunningSpeed', unit: 'm/s', type: 'running_speed' },
        start,
        end,
      ),
    ).resolves.toBeNull();
  });

  describe('postProcessRaw', () => {
    test('passes non-sleep records through untouched', async () => {
      const records = [{ value: 75.5 }];
      await expect(postProcessRaw({ recordType: 'Weight' }, records)).resolves.toBe(records);
    });

    test('aggregates sleep category samples into sessions', async () => {
      const records = [
        {
          startTime: '2026-07-02T23:00:00.000Z',
          endTime: '2026-07-03T07:00:00.000Z',
          value: 'HKCategoryValueSleepAnalysisAsleepDeep',
        },
      ];

      const result = await postProcessRaw({ recordType: 'SleepSession' }, records);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ type: 'SleepSession', source: 'HealthKit' });
    });
  });

  test('the provider object wires every capability', () => {
    expect(healthReadProvider.readCumulativeByDay).toBe(readCumulativeByDay);
    expect(healthReadProvider.readRaw).toBe(readHealthRecordsDetailed);
    expect(healthReadProvider.postProcessRaw).toBe(postProcessRaw);
    expect(typeof healthReadProvider.transform).toBe('function');
  });
});
