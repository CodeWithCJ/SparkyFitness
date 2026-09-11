import { vi, beforeEach, describe, expect, it } from 'vitest';
import axios from 'axios';
import freeExerciseDBService, {
  resetFreeExerciseDBCache,
} from '../integrations/freeexercisedb/FreeExerciseDBService.js';
import { log } from '../config/logging.js';

vi.mock('axios');
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

describe('FreeExerciseDBService search', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    resetFreeExerciseDBCache();
  });

  it('matches split-term queries and prioritizes exact match sequence sorting', async () => {
    const mockExercises = [
      { name: 'Barbell Lunge' },
      { name: 'Lunge (Barbell)' },
      { name: 'Dumbbell Lunge' },
      { name: 'Barbell Walking Lunge' },
    ];

    vi.mocked(axios.get).mockResolvedValue({ data: mockExercises });

    // Search for "lunge barbe" which should split to "lunge" and "barbe" and match case insensitively.
    // Since "Barbe" matches "Barbell", we expect matches.
    // None match the exact sequence "lunge barbe", so they sort alphabetically.
    const result = (await freeExerciseDBService.searchExercises(
      'lunge barbe'
    )) as any;

    expect(result.totalCount).toBe(3); // Barbell Lunge, Lunge (Barbell), Barbell Walking Lunge
    expect(result.exercises.map((e: any) => e.name)).toEqual([
      'Barbell Lunge',
      'Barbell Walking Lunge',
      'Lunge (Barbell)',
    ]);
    expect(axios.get).toHaveBeenCalledTimes(1);
  });

  it('prioritizes exact matches', async () => {
    const mockExercises = [
      { name: 'Lunge (Barbell)' },
      { name: 'Barbell Lunge' },
      { name: 'Barbell Walking Lunge' },
    ];

    vi.mocked(axios.get).mockResolvedValue({ data: mockExercises });

    // Search for "barbell lunge"
    // "Barbell Lunge" contains the exact sequence "barbell lunge", so it should rank first.
    const result = (await freeExerciseDBService.searchExercises(
      'barbell lunge'
    )) as any;

    expect(result.exercises.map((e: any) => e.name)).toEqual([
      'Barbell Lunge', // Priority 0
      'Barbell Walking Lunge', // Priority 1 (alphabetical)
      'Lunge (Barbell)', // Priority 1 (alphabetical)
    ]);
    expect(axios.get).toHaveBeenCalledTimes(1);
  });

  it('downloads the dataset once for different sequential queries', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: [{ name: 'Barbell Lunge' }, { name: 'Dumbbell Curl' }],
    });

    await freeExerciseDBService.searchExercises('lunge');
    const curlResult = await freeExerciseDBService.searchExercises('curl');

    expect(curlResult).toEqual({
      exercises: [{ name: 'Dumbbell Curl' }],
      totalCount: 1,
    });
    expect(axios.get).toHaveBeenCalledTimes(1);
  });

  it('downloads the dataset from the raw GitHub host', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: [] });

    await freeExerciseDBService.searchExercises('lunge');

    const requestedUrl = vi.mocked(axios.get).mock.calls[0]?.[0];
    expect(requestedUrl).toBe(
      'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json'
    );
    expect(requestedUrl).not.toContain('api.github.com');
  });

  it('configures a timeout for the dataset request', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: [] });

    await freeExerciseDBService.searchExercises('lunge');

    expect(axios.get).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json',
      { timeout: 15_000 }
    );
  });

  it('shares one cold-cache download across concurrent searches', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: [
        { name: 'Barbell Lunge' },
        { name: 'Dumbbell Curl' },
        { name: 'Cable Row' },
      ],
    });

    const results = await Promise.all([
      freeExerciseDBService.searchExercises('lunge'),
      freeExerciseDBService.searchExercises('curl'),
      freeExerciseDBService.searchExercises('row'),
      freeExerciseDBService.searchExercises('barbell'),
    ]);

    expect(results).toEqual([
      { exercises: [{ name: 'Barbell Lunge' }], totalCount: 1 },
      { exercises: [{ name: 'Dumbbell Curl' }], totalCount: 1 },
      { exercises: [{ name: 'Cable Row' }], totalCount: 1 },
      { exercises: [{ name: 'Barbell Lunge' }], totalCount: 1 },
    ]);
    expect(axios.get).toHaveBeenCalledTimes(1);
  });

  it('does not retry a failed cold-start download during the retry interval', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    vi.mocked(axios.get).mockRejectedValue(new Error('network error'));

    const firstResult = await freeExerciseDBService.searchExercises('lunge');
    const retryResult = await freeExerciseDBService.searchExercises('curl');

    expect(firstResult).toEqual({ exercises: [], totalCount: 0 });
    expect(retryResult).toEqual({ exercises: [], totalCount: 0 });
    expect(axios.get).toHaveBeenCalledTimes(1);
  });

  it('retries after rejecting an invalid cold-start dataset response', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: '<html>Proxy interstitial</html>',
    });

    const firstResult = await freeExerciseDBService.searchExercises('lunge');
    vi.advanceTimersByTime(300_001);
    vi.mocked(axios.get).mockResolvedValue({
      data: [{ name: 'Dumbbell Curl' }],
    });

    const retryResult = await freeExerciseDBService.searchExercises('curl');

    expect(firstResult).toEqual({ exercises: [], totalCount: 0 });
    expect(retryResult).toEqual({
      exercises: [{ name: 'Dumbbell Curl' }],
      totalCount: 1,
    });
    expect(axios.get).toHaveBeenCalledTimes(2);
  });

  it('rejects a mixed-validity dataset and retries after the interval', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: [{ name: 'Lunge' }, {}],
    });

    const firstResult = await freeExerciseDBService.searchExercises('lunge');
    vi.advanceTimersByTime(300_001);
    vi.mocked(axios.get).mockResolvedValue({
      data: [{ name: 'Dumbbell Curl' }],
    });

    const retryResult = await freeExerciseDBService.searchExercises('curl');

    expect(firstResult).toEqual({ exercises: [], totalCount: 0 });
    expect(retryResult).toEqual({
      exercises: [{ name: 'Dumbbell Curl' }],
      totalCount: 1,
    });
    expect(axios.get).toHaveBeenCalledTimes(2);
  });

  it('rejects an empty dataset and retries after the interval', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    vi.mocked(axios.get).mockResolvedValueOnce({ data: [] });

    const firstResult = await freeExerciseDBService.searchExercises('lunge');
    vi.advanceTimersByTime(300_001);
    vi.mocked(axios.get).mockResolvedValue({
      data: [{ name: 'Dumbbell Curl' }],
    });

    const retryResult = await freeExerciseDBService.searchExercises('curl');

    expect(firstResult).toEqual({ exercises: [], totalCount: 0 });
    expect(retryResult).toEqual({
      exercises: [{ name: 'Dumbbell Curl' }],
      totalCount: 1,
    });
    expect(axios.get).toHaveBeenCalledTimes(2);
  });

  it('accepts searchable dataset entries with optional fields omitted', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: [{ name: 'Lunge' }, { name: 'Dumbbell Curl' }],
    });

    const result = await freeExerciseDBService.searchExercises('lunge');

    expect(result).toEqual({
      exercises: [{ name: 'Lunge' }],
      totalCount: 1,
    });
    expect(axios.get).toHaveBeenCalledTimes(1);
  });

  it('retries a failed cold-start download after the retry interval', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    vi.mocked(axios.get).mockRejectedValueOnce(new Error('network error'));

    await freeExerciseDBService.searchExercises('lunge');
    vi.advanceTimersByTime(300_001);
    vi.mocked(axios.get).mockResolvedValue({
      data: [{ name: 'Dumbbell Curl' }],
    });

    const retryResult = await freeExerciseDBService.searchExercises('curl');

    expect(retryResult).toEqual({
      exercises: [{ name: 'Dumbbell Curl' }],
      totalCount: 1,
    });
    expect(axios.get).toHaveBeenCalledTimes(2);
  });

  it('serves the last good dataset when a refetch fails', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    vi.mocked(axios.get).mockResolvedValue({
      data: [{ name: 'Barbell Lunge' }],
    });
    await freeExerciseDBService.searchExercises('lunge');
    vi.advanceTimersByTime(3_600_001);
    vi.mocked(axios.get).mockRejectedValue(new Error('network error'));

    const result = await freeExerciseDBService.searchExercises('barbell');

    expect(result).toEqual({
      exercises: [{ name: 'Barbell Lunge' }],
      totalCount: 1,
    });
    expect(axios.get).toHaveBeenCalledTimes(2);

    vi.mocked(axios.get).mockResolvedValue({
      data: [{ name: 'Dumbbell Curl' }],
    });
    vi.advanceTimersByTime(300_001);

    const refreshedResult = await freeExerciseDBService.searchExercises('curl');

    expect(refreshedResult).toEqual({
      exercises: [{ name: 'Dumbbell Curl' }],
      totalCount: 1,
    });
    expect(axios.get).toHaveBeenCalledTimes(3);
  });

  it('serves the last good dataset when a refresh response is invalid', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    vi.mocked(axios.get).mockResolvedValue({
      data: [{ name: 'Barbell Lunge' }],
    });
    await freeExerciseDBService.searchExercises('lunge');
    vi.advanceTimersByTime(3_600_001);
    vi.mocked(axios.get).mockResolvedValue({
      data: { message: 'Rate limit exceeded' },
    });

    const result = await freeExerciseDBService.searchExercises('barbell');

    expect(result).toEqual({
      exercises: [{ name: 'Barbell Lunge' }],
      totalCount: 1,
    });
    expect(axios.get).toHaveBeenCalledTimes(2);
  });

  it('serves stale data without refetching during the retry interval', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    vi.mocked(axios.get).mockResolvedValue({
      data: [{ name: 'Barbell Lunge' }],
    });
    await freeExerciseDBService.searchExercises('lunge');
    vi.advanceTimersByTime(3_600_001);
    vi.mocked(axios.get).mockRejectedValue(new Error('network error'));

    await freeExerciseDBService.searchExercises('barbell');
    const retryResult = await freeExerciseDBService.searchExercises('lunge');

    expect(retryResult).toEqual({
      exercises: [{ name: 'Barbell Lunge' }],
      totalCount: 1,
    });
    expect(axios.get).toHaveBeenCalledTimes(2);
    expect(
      vi.mocked(log).mock.calls.filter(([level]) => level === 'warn')
    ).toHaveLength(1);
  });

  it('serves stale data after a timeout without retrying inside the interval', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    vi.mocked(axios.get).mockResolvedValue({
      data: [{ name: 'Barbell Lunge' }],
    });
    await freeExerciseDBService.searchExercises('lunge');
    vi.advanceTimersByTime(3_600_001);
    vi.mocked(axios.get).mockRejectedValue(
      Object.assign(new Error('timeout of 15000ms exceeded'), {
        code: 'ECONNABORTED',
      })
    );

    const staleResult = await freeExerciseDBService.searchExercises('barbell');
    const retryResult = await freeExerciseDBService.searchExercises('lunge');

    expect(staleResult).toEqual({
      exercises: [{ name: 'Barbell Lunge' }],
      totalCount: 1,
    });
    expect(retryResult).toEqual(staleResult);
    expect(axios.get).toHaveBeenCalledTimes(2);
  });

  it('returns the same dataset array reference for consecutive reads', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: [{ name: 'Barbell Lunge' }],
    });

    const first = await freeExerciseDBService.getAllExercises();
    const second = await freeExerciseDBService.getAllExercises();

    expect(second).toBe(first);
    expect(axios.get).toHaveBeenCalledTimes(1);
  });
});
