import { fetchDashboardStats } from '../../../src/services/api/dashboardApi';
import { apiFetch } from '../../../src/services/api/apiClient';
import type { DashboardStatsResponse } from '@workspace/shared';

jest.mock('../../../src/services/api/apiClient', () => ({
  apiFetch: jest.fn(),
}));

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

describe('dashboardApi', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  const mockStats: DashboardStatsResponse = {
    eaten: 1200,
    burned: 350,
    remaining: 1450,
    goal: 2000,
    net: 850,
    progress: 43,
    steps: 5000,
    stepCalories: 105,
    bmr: 1600,
    unit: 'kcal',
  };

  describe('fetchDashboardStats', () => {
    test('calls apiFetch with encoded date in endpoint', async () => {
      mockApiFetch.mockResolvedValue(mockStats);

      await fetchDashboardStats('2026-03-24');

      expect(mockApiFetch).toHaveBeenCalledWith({
        endpoint: '/api/dashboard/stats?date=2026-03-24',
        serviceName: 'Dashboard API',
        operation: 'fetch dashboard stats',
      });
    });

    test('encodes special characters in date parameter', async () => {
      mockApiFetch.mockResolvedValue(mockStats);

      await fetchDashboardStats('2026/03/24');

      const call = mockApiFetch.mock.calls[0][0];
      expect(call.endpoint).toContain('2026%2F03%2F24');
      expect(call.endpoint).not.toContain('2026/03/24');
    });

    test('returns parsed stats including stepCalories', async () => {
      mockApiFetch.mockResolvedValue(mockStats);

      const result = await fetchDashboardStats('2026-03-24');

      expect(result.steps).toBe(5000);
      expect(result.stepCalories).toBe(105);
      expect(result.eaten).toBe(1200);
      expect(result.unit).toBe('kcal');
    });

    test('throws when apiFetch rejects', async () => {
      mockApiFetch.mockRejectedValue(new Error('Server error: 401 - Unauthorized'));

      await expect(fetchDashboardStats('2026-03-24')).rejects.toThrow(
        'Server error: 401 - Unauthorized',
      );
    });
  });
});
