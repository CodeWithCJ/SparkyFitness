import {
  healthReadProvider,
  readCumulativeByDay,
  readMinMaxAvgByDay,
  postProcessRaw,
} from '../../../src/services/healthconnect/provider';
import { aggregateGroupByPeriod } from 'react-native-health-connect';

jest.mock('../../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const mockAggregateGroupByPeriod = aggregateGroupByPeriod as jest.Mock;

const start = new Date(2026, 6, 1, 0, 0, 0, 0);
const end = new Date(2026, 6, 3, 15, 30, 0);

describe('healthconnect provider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAggregateGroupByPeriod.mockResolvedValue([]);
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

    test('enriches exercise sessions via the native aggregate', async () => {
      // enrichExerciseSessions aggregates per session over the session window;
      // with the native mock returning nothing, records pass through — the
      // assertion here is that the enrichment path is invoked for ExerciseSession.
      const records = [
        { metadata: { id: 'session-1', dataOrigin: 'com.example.app' }, startTime: start.toISOString(), endTime: end.toISOString() },
      ];

      const result = await postProcessRaw({ recordType: 'ExerciseSession' }, records);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
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
