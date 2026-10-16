import { renderHook, waitFor } from '@testing-library/react-native';
import { useVo2MaxRange } from '../../src/hooks/useVo2MaxRange';
import {
  fetchCustomCategories,
  fetchCustomMeasurementsRange,
  fetchDailyVo2Max,
} from '../../src/services/api/measurementsApi';
import { createQueryWrapper, createTestQueryClient } from './queryTestUtils';

jest.mock('../../src/services/api/measurementsApi', () => ({
  fetchCustomCategories: jest.fn(),
  fetchCustomMeasurementsRange: jest.fn(),
  fetchDailyVo2Max: jest.fn(),
}));
jest.mock('@react-navigation/native', () => ({ useFocusEffect: jest.fn() }));

const categories = jest.mocked(fetchCustomCategories);
const entries = jest.mocked(fetchCustomMeasurementsRange);
const daily = jest.mocked(fetchDailyVo2Max);

const run = () =>
  renderHook(() => useVo2MaxRange({ range: '30d' }), {
    wrapper: createQueryWrapper(createTestQueryClient()),
  });

beforeEach(() => {
  jest.resetAllMocks();
  daily.mockResolvedValue([]);
});

test('is empty when VO2 max was never synced', async () => {
  categories.mockResolvedValue([{ id: 'c1', name: 'steps' }] as never);
  const { result } = run();
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.vo2MaxData).toEqual([]);
  expect(entries).not.toHaveBeenCalled();
});

test('keeps the latest reading per day, oldest first, and drops junk', async () => {
  categories.mockResolvedValue([{ id: 'c1', name: 'vo2_max' }] as never);
  entries.mockResolvedValue([
    {
      entry_date: '2026-10-09',
      value: '44.1',
      entry_timestamp: '2026-10-09T08:00:00Z',
    },
    {
      entry_date: '2026-10-05',
      value: '42.5',
      entry_timestamp: '2026-10-05T08:00:00Z',
    },
    {
      entry_date: '2026-10-09',
      value: '44.8',
      entry_timestamp: '2026-10-09T18:00:00Z',
    },
    {
      entry_date: '2026-10-07',
      value: 'abc',
      entry_timestamp: '2026-10-07T08:00:00Z',
    },
    {
      entry_date: '2026-10-08',
      value: '0',
      entry_timestamp: '2026-10-08T08:00:00Z',
    },
  ] as never);
  const { result } = run();
  await waitFor(() => expect(result.current.vo2MaxData).toHaveLength(2));
  expect(result.current.vo2MaxData).toEqual([
    { day: '2026-10-05', vo2max: 42.5 },
    { day: '2026-10-09', vo2max: 44.8 },
  ]);
  expect(entries).toHaveBeenCalledWith(
    'c1',
    expect.any(String),
    expect.any(String)
  );
});

test('uses the daily metrics too (Garmin), the phone reading winning on a shared day', async () => {
  categories.mockResolvedValue([{ id: 'c1', name: 'vo2_max' }] as never);
  entries.mockResolvedValue([
    {
      entry_date: '2026-10-09',
      value: '44.8',
      entry_timestamp: '2026-10-09T18:00:00Z',
    },
  ] as never);
  daily.mockResolvedValue([
    { entry_date: '2026-10-07T00:00:00.000Z', vo2_max: 51 },
    { entry_date: '2026-10-09', vo2_max: 50 },
    { entry_date: '2026-10-10', vo2_max: null },
  ]);
  const { result } = run();
  await waitFor(() => expect(result.current.vo2MaxData).toHaveLength(2));
  expect(result.current.vo2MaxData).toEqual([
    { day: '2026-10-07', vo2max: 51 },
    { day: '2026-10-09', vo2max: 44.8 },
  ]);
});

test('still shows the phone reading when the daily metrics fail', async () => {
  categories.mockResolvedValue([{ id: 'c1', name: 'vo2_max' }] as never);
  entries.mockResolvedValue([
    { entry_date: '2026-10-09', value: '44', entry_timestamp: 'x' },
  ] as never);
  daily.mockRejectedValue(new Error('403'));
  const { result } = run();
  await waitFor(() => expect(result.current.vo2MaxData).toHaveLength(1));
});
