import {
  fetchCurrentFast,
  startFast,
  endFast,
  fetchFastingStats,
  fetchFastingHistory,
} from '../../../src/services/api/fastingApi';

const mockApiFetch = jest.fn();
jest.mock('../../../src/services/api/apiClient', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

describe('fastingApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchCurrentFast', () => {
    test('GETs /api/fasting/current', async () => {
      mockApiFetch.mockResolvedValueOnce({ id: 'fast-1' });
      const result = await fetchCurrentFast();
      expect(result).toEqual({ id: 'fast-1' });
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.objectContaining({ endpoint: '/api/fasting/current' }),
      );
    });

    test('coalesces a null body to null', async () => {
      mockApiFetch.mockResolvedValueOnce(null);
      await expect(fetchCurrentFast()).resolves.toBeNull();
    });
  });

  describe('startFast', () => {
    test('POSTs the snake_case body to /api/fasting/start', async () => {
      mockApiFetch.mockResolvedValueOnce({ id: 'fast-1' });
      await startFast({
        startTime: '2026-06-21T10:00:00.000Z',
        targetEndTime: '2026-06-22T02:00:00.000Z',
        fastingType: '16:8 Leangains',
      });
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: '/api/fasting/start',
          method: 'POST',
          body: {
            start_time: '2026-06-21T10:00:00.000Z',
            target_end_time: '2026-06-22T02:00:00.000Z',
            fasting_type: '16:8 Leangains',
          },
        }),
      );
    });
  });

  describe('endFast', () => {
    test('POSTs id/start/end to /api/fasting/end', async () => {
      mockApiFetch.mockResolvedValueOnce({ id: 'fast-1' });
      await endFast({
        id: 'fast-1',
        startTime: '2026-06-21T10:00:00.000Z',
        endTime: '2026-06-22T02:00:00.000Z',
      });
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: '/api/fasting/end',
          method: 'POST',
          body: {
            id: 'fast-1',
            start_time: '2026-06-21T10:00:00.000Z',
            end_time: '2026-06-22T02:00:00.000Z',
          },
        }),
      );
    });
  });

  describe('fetchFastingStats', () => {
    test('GETs /api/fasting/stats', async () => {
      mockApiFetch.mockResolvedValueOnce({ total_completed_fasts: '0' });
      await fetchFastingStats();
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.objectContaining({ endpoint: '/api/fasting/stats' }),
      );
    });
  });

  describe('fetchFastingHistory', () => {
    test('GETs /api/fasting/history with limit/offset', async () => {
      mockApiFetch.mockResolvedValueOnce([{ id: 'fast-1' }]);
      const result = await fetchFastingHistory({ limit: 1, offset: 0 });
      expect(result).toEqual([{ id: 'fast-1' }]);
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.objectContaining({ endpoint: '/api/fasting/history?limit=1&offset=0' }),
      );
    });

    test('coalesces a null body to an empty array', async () => {
      mockApiFetch.mockResolvedValueOnce(null);
      await expect(fetchFastingHistory()).resolves.toEqual([]);
    });
  });
});
