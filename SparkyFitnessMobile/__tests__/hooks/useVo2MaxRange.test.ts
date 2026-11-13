import type { RunningEstimatesResponse } from '@workspace/shared';
import { renderHook, waitFor } from '@testing-library/react-native';
import {
  estimatedVo2MaxPoints,
  useVo2MaxRange,
} from '../../src/hooks/useVo2MaxRange';
import {
  fetchCustomCategories,
  fetchCustomMeasurementsRange,
  fetchDailyVo2Max,
} from '../../src/services/api/measurementsApi';
import { fetchRunEstimates } from '../../src/services/api/reportsApi';
import { addDays, getTodayDate } from '../../src/utils/dateUtils';
import { buildVo2MaxTooltipText } from '../../src/components/Vo2MaxLineChart';
import { createQueryWrapper, createTestQueryClient } from './queryTestUtils';

jest.mock('../../src/services/api/measurementsApi', () => ({
  fetchCustomCategories: jest.fn(),
  fetchCustomMeasurementsRange: jest.fn(),
  fetchDailyVo2Max: jest.fn(),
}));
jest.mock('../../src/services/api/reportsApi', () => ({
  fetchRunEstimates: jest.fn(),
}));
jest.mock('@react-navigation/native', () => ({ useFocusEffect: jest.fn() }));

const categories = jest.mocked(fetchCustomCategories);
const entries = jest.mocked(fetchCustomMeasurementsRange);
const daily = jest.mocked(fetchDailyVo2Max);
const estimates = jest.mocked(fetchRunEstimates);

const today = getTodayDate();
const estimate = (
  series: { day: string; value: number }[] | undefined
): RunningEstimatesResponse => ({
  vo2Max: {
    value: 50,
    runs: series?.length ?? 2,
    from: addDays(today, -20),
    to: today,
    series,
  },
  power: null,
});

const run = () =>
  renderHook(() => useVo2MaxRange({ range: '30d' }), {
    wrapper: createQueryWrapper(createTestQueryClient()),
  });

beforeEach(() => {
  jest.resetAllMocks();
  daily.mockResolvedValue([]);
  estimates.mockResolvedValue({ vo2Max: null, power: null });
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

describe('estimate fallback', () => {
  const synced = () =>
    categories.mockResolvedValue([{ id: 'c1', name: 'steps' }] as never);

  test('falls back to the run estimate, oldest first, flagged as an estimate', async () => {
    synced();
    estimates.mockResolvedValue(
      estimate([
        { day: addDays(today, -20), value: 48.2 },
        { day: addDays(today, -3), value: 49.9 },
      ])
    );
    const { result } = run();
    await waitFor(() => expect(result.current.vo2MaxData).toHaveLength(2));
    expect(result.current.isEstimate).toBe(true);
    expect(result.current.vo2MaxData).toEqual([
      { day: addDays(today, -20), vo2max: 48.2 },
      { day: addDays(today, -3), vo2max: 49.9 },
    ]);
  });

  test('a real reading wins and the estimate is never requested or mixed in', async () => {
    categories.mockResolvedValue([{ id: 'c1', name: 'vo2_max' }] as never);
    entries.mockResolvedValue([
      { entry_date: addDays(today, -3), value: '44', entry_timestamp: 'x' },
    ] as never);
    estimates.mockResolvedValue(
      estimate([
        { day: addDays(today, -3), value: 49.9 },
        { day: addDays(today, -5), value: 48 },
      ])
    );
    const { result } = run();
    await waitFor(() => expect(result.current.vo2MaxData).toHaveLength(1));
    expect(result.current.vo2MaxData).toEqual([
      { day: addDays(today, -3), vo2max: 44 },
    ]);
    expect(result.current.isEstimate).toBe(false);
    expect(estimates).not.toHaveBeenCalled();
  });

  test('stays hidden when the estimate has too few runs', async () => {
    synced();
    estimates.mockResolvedValue(estimate(undefined));
    const { result } = run();
    await waitFor(() => expect(estimates).toHaveBeenCalled());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.vo2MaxData).toEqual([]);
    expect(result.current.isEstimate).toBe(false);
  });

  test('keeps only run days inside the window, even a single one', () => {
    const series = [
      { day: addDays(today, -60), value: 47 },
      { day: addDays(today, -20), value: 48 },
    ];
    const start = addDays(today, -29);
    // One qualifying day left in the window is still a valid estimate (two
    // runs on that day make one point), so it is not hidden.
    expect(
      estimatedVo2MaxPoints(estimate(series).vo2Max, start, today)
    ).toEqual([{ day: addDays(today, -20), vo2max: 48 }]);
    expect(estimatedVo2MaxPoints(null, start, today)).toEqual([]);
    expect(
      estimatedVo2MaxPoints(estimate(series).vo2Max, addDays(today, -89), today)
    ).toHaveLength(2);
  });
});

test('labels an estimated tooltip with an approximation sign', () => {
  const point = { day: '2026-10-09', vo2max: 49.9 };
  expect(buildVo2MaxTooltipText(point, true)).toMatch(/^≈ 49[.,]9 ml\/kg\/min/);
  expect(buildVo2MaxTooltipText(point)).toMatch(/^49[.,]9 ml\/kg\/min/);
});
