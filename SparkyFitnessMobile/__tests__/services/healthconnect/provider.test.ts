import {
  healthReadProvider,
  readCumulativeByDay,
  readMinMaxAvgByDay,
  postProcessRaw,
} from '../../../src/services/healthconnect/provider';
import {
  aggregateGroupByPeriod,
  aggregateRecord,
  readRecords,
} from 'react-native-health-connect';

jest.mock('../../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const mockAggregateGroupByPeriod = aggregateGroupByPeriod as jest.Mock;
const mockAggregateRecord = aggregateRecord as jest.Mock;
const mockReadRecords = readRecords as jest.Mock;

const start = new Date(2026, 6, 1, 0, 0, 0, 0);
const end = new Date(2026, 6, 3, 15, 30, 0);

describe('healthconnect provider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAggregateGroupByPeriod.mockResolvedValue([]);
    mockAggregateRecord.mockReset().mockResolvedValue({});
    // Answer the cumulative path's offset probes with a record that carries
    // no zone offset, keeping aggregation on the device-zone path.
    mockReadRecords.mockResolvedValue({
      records: [
        {
          startTime: new Date(2026, 6, 1, 12, 0, 0, 0).toISOString(),
          endTime: new Date(2026, 6, 1, 12, 0, 0, 0).toISOString(),
        },
      ],
    });
  });

  describe('readCumulativeByDay', () => {
    test.each([
      ['Steps', 'Steps'],
      ['ActiveCaloriesBurned', 'ActiveCaloriesBurned'],
      ['TotalCaloriesBurned', 'TotalCaloriesBurned'],
      ['Distance', 'Distance'],
      ['FloorsClimbed', 'FloorsClimbed'],
    ])('%s routes to the native day aggregation', async (recordType, nativeRecordType) => {
      const result = await readCumulativeByDay({ recordType }, start, end);

      expect(result).toEqual({ records: [] });
      expect(mockAggregateGroupByPeriod).toHaveBeenCalledWith(
        expect.objectContaining({ recordType: nativeRecordType }),
      );
    });

    test('BasalMetabolicRate reports capability missing (null), never an empty envelope', async () => {
      // HC BMR records carry kcal/day values — treating them as day totals would be
      // wrong, so Android must route BMR down the raw path via null.
      const result = await readCumulativeByDay({ recordType: 'BasalMetabolicRate' }, start, end);

      expect(result).toBeNull();
      expect(mockAggregateGroupByPeriod).not.toHaveBeenCalled();
    });

    test('a native failure returns an error envelope, not null', async () => {
      mockAggregateGroupByPeriod.mockRejectedValue(new Error('native query failed'));

      const result = await readCumulativeByDay({ recordType: 'Steps' }, start, end);

      expect(result).toEqual({ records: [], error: expect.stringContaining('native query failed') });
    });
  });

  test('readMinMaxAvgByDay always reports capability missing on Android', async () => {
    await expect(
      readMinMaxAvgByDay({ recordType: 'HeartRate', unit: 'bpm', type: 'heart_rate' }, start, end),
    ).resolves.toBeNull();
  });

  describe('postProcessRaw', () => {
    test('passes non-exercise records through untouched', async () => {
      const records = [{ value: 75.5 }];
      await expect(postProcessRaw({ recordType: 'Weight' }, records)).resolves.toBe(records);
    });

    test('enriches exercise sessions with native calories and distance aggregates', async () => {
      // enrichExerciseSessions aggregates ActiveCalories/TotalCalories/Distance over
      // each session window (scoped to its dataOrigin) and attaches the selected,
      // plausibility-checked values back onto the record.
      const sessionStart = '2026-07-02T08:00:00.000Z';
      const sessionEnd = '2026-07-02T09:00:00.000Z'; // 1h session
      const records = [
        { metadata: { id: 'session-1', dataOrigin: 'com.example.app' }, startTime: sessionStart, endTime: sessionEnd },
      ];
      mockAggregateRecord.mockImplementation(async ({ recordType }: { recordType: string }) => {
        switch (recordType) {
          case 'ActiveCaloriesBurned': return { ACTIVE_CALORIES_TOTAL: { inKilocalories: 400 } };
          case 'TotalCaloriesBurned': return { ENERGY_TOTAL: { inKilocalories: 450 } };
          case 'Distance': return { DISTANCE: { inMeters: 8000 } };
          default: return {};
        }
      });

      const result = await postProcessRaw({ recordType: 'ExerciseSession' }, records);

      // Active/Total ratio 400/450 ≥ 0.5 → session calories resolve to the Active value.
      expect(result[0]).toMatchObject({
        metadata: { dataOrigin: 'com.example.app' },
        energy: { inKilocalories: 400 },
        distance: { inMeters: 8000 },
      });
      // Aggregates are scoped to the session window and its data origin.
      expect(mockAggregateRecord).toHaveBeenCalledWith(expect.objectContaining({
        recordType: 'ActiveCaloriesBurned',
        timeRangeFilter: { operator: 'between', startTime: sessionStart, endTime: sessionEnd },
        dataOriginFilter: ['com.example.app'],
      }));
    });
  });

  test('the provider object wires every capability', () => {
    expect(healthReadProvider.readCumulativeByDay).toBe(readCumulativeByDay);
    expect(healthReadProvider.readMinMaxAvgByDay).toBe(readMinMaxAvgByDay);
    expect(healthReadProvider.postProcessRaw).toBe(postProcessRaw);
    expect(typeof healthReadProvider.readRaw).toBe('function');
    expect(typeof healthReadProvider.transform).toBe('function');
  });
});
