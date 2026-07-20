import { renderHook, waitFor } from '@testing-library/react-native';
import { useCycleOverview, useCycleInsights, useCycleCorrelations } from '../../src/hooks/useCycleInsights';
import { getOverview, getInsights, getCorrelations } from '../../src/services/api/cycleApi';
import { createTestQueryClient, createQueryWrapper, type QueryClient } from './queryTestUtils';

jest.mock('../../src/services/api/cycleApi', () => ({
  getOverview: jest.fn(),
  getInsights: jest.fn(),
  getCorrelations: jest.fn(),
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => void) => {
    cb();
  },
}));

const mockGetOverview = getOverview as jest.MockedFunction<typeof getOverview>;
const mockGetInsights = getInsights as jest.MockedFunction<typeof getInsights>;
const mockGetCorrelations = getCorrelations as jest.MockedFunction<typeof getCorrelations>;

describe('useCycleInsights', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  test('useCycleOverview fetches successfully', async () => {
    const mockData = { date: '2026-07-19', phase: 'menstrual' } as any;
    mockGetOverview.mockResolvedValue(mockData);

    const { result } = renderHook(() => useCycleOverview('2026-07-19'), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGetOverview).toHaveBeenCalledWith('2026-07-19');
    expect(result.current.overview).toEqual(mockData);
  });

  test('useCycleInsights fetches successfully', async () => {
    const mockData = { stats: {} } as any;
    mockGetInsights.mockResolvedValue(mockData);

    const { result } = renderHook(() => useCycleInsights(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGetInsights).toHaveBeenCalled();
    expect(result.current.insights).toEqual(mockData);
  });

  test('useCycleCorrelations fetches successfully', async () => {
    const mockData = { correlations: [] } as any;
    mockGetCorrelations.mockResolvedValue(mockData);

    const { result } = renderHook(() => useCycleCorrelations(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGetCorrelations).toHaveBeenCalled();
    expect(result.current.correlations).toEqual(mockData);
  });
});
