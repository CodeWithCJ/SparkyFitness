import {
  fetchCurrentFast,
  startFast,
  endFast,
  updateFast,
  deleteFast,
  fetchFastingStats,
  fetchFastingHistory,
  fetchFastingRange,
  fetchFastingPreferences,
  updateFastingPreferences,
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
        expect.objectContaining({ endpoint: '/api/fasting/current' })
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
        })
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
        })
      );
    });
  });

  describe('updateFast', () => {
    test('PUTs the updates body to /api/fasting/:id', async () => {
      mockApiFetch.mockResolvedValueOnce({ id: 'fast-1' });
      await updateFast('fast-1', {
        start_time: '2026-06-21T10:00:00.000Z',
        end_time: '2026-06-22T02:00:00.000Z',
      });
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: '/api/fasting/fast-1',
          method: 'PUT',
          body: {
            start_time: '2026-06-21T10:00:00.000Z',
            end_time: '2026-06-22T02:00:00.000Z',
          },
        })
      );
    });
  });

  describe('deleteFast', () => {
    test('DELETEs /api/fasting/:id', async () => {
      mockApiFetch.mockResolvedValueOnce(undefined);
      await deleteFast('fast-1');
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: '/api/fasting/fast-1',
          method: 'DELETE',
        })
      );
    });
  });

  describe('fetchFastingStats', () => {
    test('GETs /api/fasting/stats', async () => {
      mockApiFetch.mockResolvedValueOnce({ total_completed_fasts: '0' });
      await fetchFastingStats();
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.objectContaining({ endpoint: '/api/fasting/stats' })
      );
    });
  });

  describe('fetchFastingHistory', () => {
    test('GETs /api/fasting/history with limit/offset', async () => {
      mockApiFetch.mockResolvedValueOnce([{ id: 'fast-1' }]);
      const result = await fetchFastingHistory({ limit: 1, offset: 0 });
      expect(result).toEqual([{ id: 'fast-1' }]);
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: '/api/fasting/history?limit=1&offset=0',
        })
      );
    });

    test('coalesces a null body to an empty array', async () => {
      mockApiFetch.mockResolvedValueOnce(null);
      await expect(fetchFastingHistory()).resolves.toEqual([]);
    });
  });

  describe('fetchFastingRange', () => {
    test('GETs the inclusive date-range endpoint', async () => {
      mockApiFetch.mockResolvedValueOnce([{ id: 'fast-1' }]);
      const result = await fetchFastingRange('2026-07-08', '2026-10-05');
      expect(result).toEqual([{ id: 'fast-1' }]);
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: '/api/fasting/history/range/2026-07-08/2026-10-05',
        })
      );
    });

    test('coalesces a null body to an empty list', async () => {
      mockApiFetch.mockResolvedValueOnce(null);
      await expect(fetchFastingRange('a', 'b')).resolves.toEqual([]);
    });
  });

  describe('fasting preferences', () => {
    test('fetchFastingPreferences GETs /api/fasting/preferences', async () => {
      mockApiFetch.mockResolvedValueOnce({ auto_calculate: true });
      await expect(fetchFastingPreferences()).resolves.toEqual({
        auto_calculate: true,
      });
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.objectContaining({ endpoint: '/api/fasting/preferences' })
      );
    });

    test('updateFastingPreferences PUTs the partial body', async () => {
      mockApiFetch.mockResolvedValueOnce({ pre_end_alert_minutes: 45 });
      await updateFastingPreferences({ pre_end_alert_minutes: 45 });
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: '/api/fasting/preferences',
          method: 'PUT',
          body: { pre_end_alert_minutes: 45 },
        })
      );
    });
  });
});
