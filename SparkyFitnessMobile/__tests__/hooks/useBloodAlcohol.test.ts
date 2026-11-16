import { renderHook, waitFor } from '@testing-library/react-native';
import type { BloodAlcoholResponse } from '@workspace/shared';
import { useBloodAlcohol } from '../../src/hooks/useBloodAlcohol';
import { fetchBloodAlcohol } from '../../src/services/api/bloodAlcoholApi';
import {
  createTestQueryClient,
  createQueryWrapper,
  type QueryClient,
} from './queryTestUtils';

jest.mock('../../src/services/api/bloodAlcoholApi', () => ({
  fetchBloodAlcohol: jest.fn(),
}));

const mockFetchBloodAlcohol = fetchBloodAlcohol as jest.MockedFunction<
  typeof fetchBloodAlcohol
>;

const response: BloodAlcoholResponse = {
  status: 'ok',
  missing_inputs: [],
  formula: 'watson',
  fell_back_from: null,
  display_unit: 'permille',
  elimination_rate: 0.15,
  distribution_factor: 0.7,
  weight_kg: 80,
  doses: [{ at: '2026-09-18T19:00:00.000Z', grams: 14 }],
  estimated_now_permille: 0.2,
  peak: { at: '2026-09-18T19:45:00.000Z', permille: 0.22 },
  has_estimated_times: false,
};

describe('useBloodAlcohol', () => {
  let queryClient: QueryClient;
  const testDate = '2026-09-18';

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  test('fetches the estimate for the day', async () => {
    mockFetchBloodAlcohol.mockResolvedValue(response);

    const { result } = renderHook(() => useBloodAlcohol(testDate), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockFetchBloodAlcohol).toHaveBeenCalledWith(testDate);
    expect(result.current.estimate?.peak?.permille).toBe(0.22);
  });

  test('makes no request while the card is hidden', () => {
    renderHook(() => useBloodAlcohol(testDate, false), {
      wrapper: createQueryWrapper(queryClient),
    });

    expect(mockFetchBloodAlcohol).not.toHaveBeenCalled();
  });
});
