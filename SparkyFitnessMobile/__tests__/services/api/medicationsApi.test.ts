import {
  listEntries,
  updateEntry,
  createSchedule,
  updateSchedule,
  deleteSchedule,
} from '../../../src/services/api/medicationsApi';

const mockApiFetch = jest.fn();
jest.mock('../../../src/services/api/apiClient', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

describe('medicationsApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('updateEntry', () => {
    test('PUTs the partial patch to /api/v2/medications/entries/:id', async () => {
      mockApiFetch.mockResolvedValueOnce({ id: 'entry-1', status: 'skipped' });

      const result = await updateEntry('entry-1', {
        schedule_id: 'sched-1',
        status: 'skipped',
        taken_at: '2026-07-28T09:05:00Z',
      });

      expect(result).toEqual({ id: 'entry-1', status: 'skipped' });
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: '/api/v2/medications/entries/entry-1',
          method: 'PUT',
          body: {
            schedule_id: 'sched-1',
            status: 'skipped',
            taken_at: '2026-07-28T09:05:00Z',
          },
        }),
      );
    });
  });

  describe('createSchedule', () => {
    test('POSTs the body to /api/v2/medications/:medicationId/schedules', async () => {
      mockApiFetch.mockResolvedValueOnce({ id: 'sched-1' });

      const result = await createSchedule('med-1', {
        schedule_type_id: 'daily',
        time_of_day: '08:00',
      });

      expect(result).toEqual({ id: 'sched-1' });
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: '/api/v2/medications/med-1/schedules',
          method: 'POST',
          body: { schedule_type_id: 'daily', time_of_day: '08:00' },
        }),
      );
    });
  });

  describe('updateSchedule', () => {
    test('PUTs the patch to /api/v2/medications/schedules/:id', async () => {
      mockApiFetch.mockResolvedValueOnce({ id: 'sched-1' });

      await updateSchedule('sched-1', { time_of_day: '09:00', days_of_week: null });

      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: '/api/v2/medications/schedules/sched-1',
          method: 'PUT',
          body: { time_of_day: '09:00', days_of_week: null },
        }),
      );
    });
  });

  describe('deleteSchedule', () => {
    test('DELETEs /api/v2/medications/schedules/:id', async () => {
      mockApiFetch.mockResolvedValueOnce(undefined);

      await deleteSchedule('sched-1');

      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: '/api/v2/medications/schedules/sched-1',
          method: 'DELETE',
        }),
      );
    });
  });

  describe('listEntries', () => {
    test('coalesces a null body to an empty list', async () => {
      mockApiFetch.mockResolvedValueOnce(null);
      await expect(listEntries()).resolves.toEqual([]);
    });
  });
});
