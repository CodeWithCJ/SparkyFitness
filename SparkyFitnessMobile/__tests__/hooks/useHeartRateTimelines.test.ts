import { renderHook, waitFor } from '@testing-library/react-native';

import { useHeartRateDayTimeline } from '../../src/hooks/useHeartRateTimelines';
import { fetchHeartRateSamples } from '../../src/services/api/exerciseStatsApi';
import { fetchSleepEntries } from '../../src/services/api/sleepApi';
import { createQueryWrapper, createTestQueryClient } from './queryTestUtils';

jest.mock('../../src/services/api/exerciseStatsApi', () => ({
  fetchHeartRateSamples: jest.fn(),
}));
jest.mock('../../src/services/api/sleepApi', () => ({
  fetchSleepEntries: jest.fn(),
}));
const mockDailySummary = jest.fn();
jest.mock('../../src/hooks/useDailySummary', () => ({
  useDailySummary: () => mockDailySummary(),
}));
jest.mock('@react-navigation/native', () => ({ useFocusEffect: jest.fn() }));

const samples = jest.mocked(fetchHeartRateSamples);
const sleep = jest.mocked(fetchSleepEntries);

const run = () =>
  renderHook(() => useHeartRateDayTimeline('2026-10-05', 'Workout'), {
    wrapper: createQueryWrapper(createTestQueryClient()),
  });

beforeEach(() => {
  jest.resetAllMocks();
  samples.mockResolvedValue([]);
  sleep.mockResolvedValue([]);
});

test('is not an error when every source loads', async () => {
  mockDailySummary.mockReturnValue({
    summary: undefined,
    isLoading: false,
    isError: false,
  });
  const { result } = run();
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.isError).toBe(false);
});

test('reports an error when the daily summary fails, as workouts would be missing', async () => {
  mockDailySummary.mockReturnValue({
    summary: undefined,
    isLoading: false,
    isError: true,
  });
  const { result } = run();
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.isError).toBe(true);
});
