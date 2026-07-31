import { listEntries, updateEntry } from '../../../src/services/api/medicationsApi';

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

  describe('listEntries', () => {
    test('coalesces a null body to an empty list', async () => {
      mockApiFetch.mockResolvedValueOnce(null);
      await expect(listEntries()).resolves.toEqual([]);
    });
  });
});
