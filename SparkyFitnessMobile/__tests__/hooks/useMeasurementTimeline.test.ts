import { renderHook } from '@testing-library/react-native';
import { useMeasurementTimeline } from '../../src/hooks/useMeasurementTimeline';
import {
  useCustomCategories,
  useCustomMeasurementsByDate,
} from '../../src/hooks/useCustomMeasurements';
import { useQuery } from '@tanstack/react-query';
import { measurementDayPoints } from '@workspace/shared';
import { fetchGlucoseSamples } from '../../src/services/api/healthSamplesApi';

jest.mock('../../src/services/api/healthSamplesApi', () => ({
  fetchGlucoseSamples: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../src/hooks/useCustomMeasurements', () => ({
  useCustomCategories: jest.fn(),
  useCustomMeasurementsByDate: jest.fn(),
}));
jest.mock('@tanstack/react-query', () => ({ useQuery: jest.fn() }));
jest.mock('../../src/hooks/useRefetchOnFocus', () => ({
  useRefetchOnFocus: jest.fn(),
}));
const custom = jest.mocked(useCustomMeasurementsByDate);
const categories = jest.mocked(useCustomCategories);
const query = jest.mocked(useQuery);

beforeEach(() => {
  categories.mockReturnValue({
    data: [],
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useCustomCategories>);
  query.mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useQuery>);
});

test('retains API/synced and manual custom readings at every timestamp', () => {
  custom.mockReturnValue({
    data: [
      {
        category_id: 'cgm',
        value: '100',
        entry_timestamp: '2026-11-03T10:00:00Z',
        source: 'dexcom-api',
      },
      {
        category_id: 'cgm',
        value: '110',
        entry_timestamp: '2026-11-03T10:05:00Z',
        source: 'manual',
      },
      {
        category_id: 'other',
        value: '9',
        entry_timestamp: '2026-11-03T10:00:00Z',
        source: 'api',
      },
    ],
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useCustomMeasurementsByDate>);
  const { result } = renderHook(() =>
    useMeasurementTimeline('cgm', '2026-11-03')
  );
  expect(custom).toHaveBeenCalledWith('2026-11-03', {
    enabled: true,
    byTimestamp: true,
  });
  expect(result.current.readings.data).toEqual([
    { timestamp: '2026-11-03T10:00:00Z', value: 100, source: 'dexcom-api' },
    { timestamp: '2026-11-03T10:05:00Z', value: 110, source: 'manual' },
  ]);
});

test('places readings in the account timezone and leaves gaps', () => {
  const points = measurementDayPoints(
    [
      { timestamp: '2026-11-04T00:00:00Z', value: 100, source: 'api' },
      { timestamp: '2026-11-04T00:05:00Z', value: 110, source: 'api' },
      { timestamp: '2026-11-04T01:00:00Z', value: 120, source: 'api' },
    ],
    '2026-11-03',
    'America/New_York'
  );
  expect(points.map((point) => point.value)).toEqual([100, 110, null, 120]);
  expect(points[0]?.minutes).toBe(19 * 60);
});

test('requests both neighboring bucket dates across extreme timezone changes', async () => {
  renderHook(() => useMeasurementTimeline('blood_glucose', '2026-11-02'));
  const config = query.mock.calls.at(-1)![0] as {
    queryFn: () => Promise<unknown>;
  };
  await config.queryFn();
  expect(fetchGlucoseSamples).toHaveBeenCalledWith('2026-10-31', '2026-11-04');
  const points = measurementDayPoints(
    [{ timestamp: '2026-11-03T10:30:00Z', value: 100, source: 'api' }],
    '2026-11-02',
    'Etc/GMT+12'
  );
  expect(points[0]?.minutes).toBe(1350);
});
