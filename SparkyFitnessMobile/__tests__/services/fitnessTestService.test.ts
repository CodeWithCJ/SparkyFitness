import { queryClient } from '../../src/hooks/queryClient';
import { fitnessTestsQueryKey } from '../../src/hooks/queryKeys';
import {
  createFitnessTest,
  deleteFitnessTest,
} from '../../src/services/api/fitnessTestApi';
import {
  removeFitnessTest,
  saveFitnessTest,
} from '../../src/services/fitnessTestService';
import { fitnessTest } from '../helpers/fitnessTestFixture';

jest.mock('../../src/services/api/fitnessTestApi');

beforeEach(() => {
  jest.resetAllMocks();
  queryClient.clear();
});

const body = {
  test_type: '5k' as const,
  test_date: '2026-10-18',
  distance_meters: 5000,
  duration_seconds: 1500,
  split_distance_meters: null,
  exercise_entry_id: 'entry-1',
};

test('saves the measurements and refreshes the list', async () => {
  const saved = fitnessTest({ exercise_entry_id: 'entry-1' });
  jest.mocked(createFitnessTest).mockResolvedValue(saved);
  queryClient.setQueryData(fitnessTestsQueryKey, []);
  const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
  expect(await saveFitnessTest(body)).toBe(saved);
  expect(createFitnessTest).toHaveBeenCalledWith(body);
  expect(invalidate).toHaveBeenCalledWith({ queryKey: fitnessTestsQueryKey });
});

test('leaves the list alone when the server refuses the test', async () => {
  jest.mocked(createFitnessTest).mockRejectedValue(new Error('offline'));
  const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
  await expect(saveFitnessTest(body)).rejects.toThrow('offline');
  expect(invalidate).not.toHaveBeenCalled();
});

test('deletes a test and refreshes the list', async () => {
  jest.mocked(deleteFitnessTest).mockResolvedValue(undefined);
  const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
  await removeFitnessTest('test-1');
  expect(deleteFitnessTest).toHaveBeenCalledWith('test-1');
  expect(invalidate).toHaveBeenCalledWith({ queryKey: fitnessTestsQueryKey });
});
