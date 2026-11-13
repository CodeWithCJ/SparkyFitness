import { api } from '@/api/api';
import {
  createMoodCheckin,
  deleteMoodCheckin,
  getMoodCheckinsByDate,
  getMoodEntries,
  updateMoodCheckin,
} from '@/api/CheckIn/moodService';

jest.mock('@/api/api', () => ({
  api: {
    get: jest.fn().mockResolvedValue([]),
    post: jest.fn().mockResolvedValue({ data: {} }),
    put: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue(undefined),
  },
}));

const V2 = { headers: { 'X-Mood-Model-Version': '2' } };

describe('mood check-in calls (v2)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('getMoodCheckinsByDate GETs the day with the version header', async () => {
    await getMoodCheckinsByDate('2026-10-20');
    expect(api.get).toHaveBeenCalledWith(
      '/mood/date/2026-10-20',
      expect.objectContaining(V2)
    );
  });

  test('createMoodCheckin POSTs the body unchanged', async () => {
    const body = { mood_value: 70, notes: 'ok' };
    await createMoodCheckin(body);
    expect(api.post).toHaveBeenCalledWith(
      '/mood',
      expect.objectContaining({ body, ...V2 })
    );
  });

  test('updateMoodCheckin PUTs the body unchanged', async () => {
    const body = { energy_value: null };
    await updateMoodCheckin('abc', body);
    expect(api.put).toHaveBeenCalledWith(
      '/mood/abc',
      expect.objectContaining({ body, ...V2 })
    );
  });

  test('deleteMoodCheckin DELETEs by id', async () => {
    // The real api resolves a 204 to an empty object.
    jest.mocked(api.delete).mockResolvedValueOnce({});
    await expect(deleteMoodCheckin('abc')).resolves.toBeUndefined();
    expect(api.delete).toHaveBeenCalledWith(
      '/mood/abc',
      expect.objectContaining(V2)
    );
  });

  test('getMoodEntries sends the version header with the range params', async () => {
    await getMoodEntries('2026-10-01', '2026-10-31');
    expect(api.get).toHaveBeenCalledWith(
      '/mood',
      expect.objectContaining({
        params: { startDate: '2026-10-01', endDate: '2026-10-31' },
        ...V2,
      })
    );
  });
});
