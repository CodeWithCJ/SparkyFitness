import { apiFetch } from '../../src/services/api/apiClient';
import {
  createMoodCheckin,
  deleteMoodCheckin,
  fetchCustomMoods,
  fetchLegacyMoodEntries,
  fetchMoodCheckinsForDate,
  fetchMoodEntries,
  saveMoodEntry,
  updateMoodCheckin,
} from '../../src/services/api/moodApi';

jest.mock('../../src/services/api/apiClient', () => ({
  apiFetch: jest.fn(),
}));

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

describe('moodApi', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockApiFetch.mockResolvedValue([]);
  });

  it('lists mood entries for a date range', async () => {
    await fetchMoodEntries('2026-10-01', '2026-10-05');

    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: '/api/mood?startDate=2026-10-01&endDate=2026-10-05',
      })
    );
  });

  it('posts a mood entry with the snake_case body the server expects', async () => {
    const body = {
      mood_value: 72,
      mood_tags: ['calm'],
      notes: 'ok',
      entry_date: '2026-10-05',
    };

    await saveMoodEntry(body);

    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: '/api/mood',
        method: 'POST',
        body,
      })
    );
  });

  it('sends no mood model header on the legacy POST', async () => {
    await saveMoodEntry({
      mood_value: 72,
      mood_tags: [],
      notes: '',
      entry_date: '2026-10-05',
    });

    // A v2 server would insert a duplicate if this carried the v2 header.
    const call = mockApiFetch.mock.calls[0][0];
    expect(call.method).toBe('POST');
    expect(call.headers).toBeUndefined();
  });

  it('normalises the saved entry like the other mood calls', async () => {
    mockApiFetch.mockResolvedValue({
      id: 'm1',
      mood_value: 60,
      mood_tags: [],
      notes: null,
      entry_date: '2026-10-05',
      created_at: '2026-10-05T08:00:00Z',
    });

    const saved = await saveMoodEntry({
      mood_value: 60,
      mood_tags: [],
      notes: '',
      entry_date: '2026-10-05',
    });

    expect(saved).toEqual(
      expect.objectContaining({
        source: 'manual',
        entry_timestamp: '2026-10-05T08:00:00Z',
      })
    );
  });

  it('passes energy and focus through when provided', async () => {
    await saveMoodEntry({
      mood_value: 72,
      mood_tags: [],
      notes: '',
      entry_date: '2026-10-05',
      energy_value: 4,
      focus_value: null,
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ energy_value: 4, focus_value: null }),
      })
    );
  });

  it('sends no energy or focus key when the body omits them', async () => {
    await saveMoodEntry({
      mood_value: 72,
      mood_tags: [],
      notes: '',
      entry_date: '2026-10-05',
    });

    const { body } = mockApiFetch.mock.calls[0][0] as {
      body: Record<string, unknown>;
    };
    expect('energy_value' in body).toBe(false);
    expect('focus_value' in body).toBe(false);
  });

  it('lists custom moods', async () => {
    await fetchCustomMoods();

    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: '/api/mood/custom' })
    );
  });

  describe('several check-ins per day', () => {
    const V2 = { headers: { 'X-Mood-Model-Version': '2' } };

    it('sends the v2 header when listing a range', async () => {
      await fetchMoodEntries('2026-10-01', '2026-10-05');
      expect(mockApiFetch).toHaveBeenCalledWith(expect.objectContaining(V2));
    });

    it('sends no header on the legacy day read', async () => {
      await fetchLegacyMoodEntries('2026-10-05', '2026-10-05');
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: '/api/mood?startDate=2026-10-05&endDate=2026-10-05',
        })
      );
      expect(mockApiFetch.mock.calls[0][0]).not.toHaveProperty('headers');
    });

    it('does not send the header on custom moods', async () => {
      await fetchCustomMoods();
      expect(mockApiFetch.mock.calls[0][0]).not.toHaveProperty('headers');
    });

    it('lists one day and returns null for an old server answer', async () => {
      mockApiFetch.mockResolvedValueOnce([]);
      await expect(fetchMoodCheckinsForDate('2026-10-05')).resolves.toEqual([]);
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: '/api/mood/date/2026-10-05',
          ...V2,
        })
      );

      mockApiFetch.mockResolvedValueOnce({});
      await expect(fetchMoodCheckinsForDate('2026-10-05')).resolves.toBeNull();
    });

    it('fills source and entry_timestamp on rows from an old server', async () => {
      mockApiFetch.mockResolvedValueOnce([
        {
          id: 'a',
          entry_date: '2026-10-05',
          created_at: '2026-10-05T08:00:00Z',
        },
        { id: 'b', entry_date: '2026-10-06' },
        {
          id: 'c',
          entry_date: '2026-10-07',
          source: 'garmin',
          entry_timestamp: '2026-10-07T01:00:00Z',
        },
      ]);

      const rows = await fetchMoodEntries('2026-10-05', '2026-10-07');

      expect(rows.map((r) => [r.source, r.entry_timestamp])).toEqual([
        ['manual', '2026-10-05T08:00:00Z'],
        ['manual', '2026-10-06T12:00:00Z'],
        ['garmin', '2026-10-07T01:00:00Z'],
      ]);
    });

    it('creates, updates and deletes with the header', async () => {
      mockApiFetch.mockResolvedValue({ id: 'x', entry_date: '2026-10-05' });
      const create = {
        mood_value: 70,
        entry_date: '2026-10-05',
        entry_timestamp: '2026-10-05T14:00:00.000Z',
      };
      await createMoodCheckin(create);
      expect(mockApiFetch).toHaveBeenLastCalledWith(
        expect.objectContaining({
          endpoint: '/api/mood',
          method: 'POST',
          body: create,
          ...V2,
        })
      );

      await updateMoodCheckin('x', { notes: null });
      expect(mockApiFetch).toHaveBeenLastCalledWith(
        expect.objectContaining({
          endpoint: '/api/mood/x',
          method: 'PUT',
          body: { notes: null },
          ...V2,
        })
      );

      mockApiFetch.mockResolvedValue(undefined);
      await expect(deleteMoodCheckin('x')).resolves.toBeUndefined();
      expect(mockApiFetch).toHaveBeenLastCalledWith(
        expect.objectContaining({
          endpoint: '/api/mood/x',
          method: 'DELETE',
          ...V2,
        })
      );
    });
  });
});
