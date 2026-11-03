import { aggregateRecord, readRecords } from 'react-native-health-connect';
import { healthReadProvider } from '../../../src/services/healthconnect/provider';
import { runForegroundSync } from '../../../src/services/shared/healthSyncEngine';
import { syncHealthData } from '../../../src/services/api/healthDataApi';

jest.mock('../../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../../src/services/writeback', () => ({
  runWriteback: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../src/services/api/measurementsApi', () => ({
  serverSupportsPerRecordWater: jest.fn().mockResolvedValue(true),
}));
jest.mock('../../../src/services/api/healthDataApi', () => ({
  syncHealthData: jest
    .fn()
    .mockResolvedValue({ processed: 1, recordErrors: [] }),
}));

test('does not upload a zero-energy workout after a calorie read fails and recovers on retry', async () => {
  jest.useFakeTimers({ now: new Date('2024-01-15T12:00:00Z') });
  try {
    const session = {
      startTime: '2024-01-15T10:00:00Z',
      endTime: '2024-01-15T11:00:00Z',
      exerciseType: 70,
      metadata: {
        id: 'synthetic-strength-session',
        dataOrigin: 'com.example.test',
      },
      exerciseRoute: { type: 'NO_DATA', route: [] },
    };
    (readRecords as jest.Mock).mockImplementation(
      async (recordType: string) => ({
        records: recordType === 'ExerciseSession' ? [session] : [],
      })
    );
    let failFallback = true;
    (aggregateRecord as jest.Mock).mockImplementation(
      async (request: { recordType: string; dataOriginFilter?: string[] }) => {
        if (
          failFallback &&
          !request.dataOriginFilter &&
          ['ActiveCaloriesBurned', 'TotalCaloriesBurned'].includes(
            request.recordType
          )
        ) {
          throw new Error('API call quota exceeded');
        }
        if (request.recordType === 'ActiveCaloriesBurned') {
          return { ACTIVE_CALORIES_TOTAL: { inKilocalories: 0 } };
        }
        if (request.recordType === 'TotalCaloriesBurned') {
          return { ENERGY_TOTAL: { inKilocalories: failFallback ? 75 : 300 } };
        }
        if (request.recordType === 'BasalMetabolicRate') {
          return { BASAL_CALORIES_TOTAL: { inKilocalories: 75 } };
        }
        return {};
      }
    );
    const options = {
      logTag: '[Synthetic Health Connect test]',
      emptyMessage: 'Nothing to sync.',
      timeoutLabelPrefix: 'Synthetic Health Connect query',
    };
    const states = { isExerciseSessionSyncEnabled: true };

    const failed = await runForegroundSync(
      healthReadProvider,
      'today',
      states,
      options
    );

    expect(failed.syncErrors).toEqual([
      { type: 'ExerciseSession', error: 'API call quota exceeded' },
    ]);
    expect(syncHealthData).not.toHaveBeenCalled();

    failFallback = false;
    const retried = await runForegroundSync(
      healthReadProvider,
      'today',
      states,
      options
    );

    expect(retried.syncErrors).toEqual([]);
    expect(syncHealthData).toHaveBeenCalledWith([
      expect.objectContaining({
        source_id: 'synthetic-strength-session',
        caloriesBurned: 225,
      }),
    ]);
  } finally {
    jest.useRealTimers();
  }
});
