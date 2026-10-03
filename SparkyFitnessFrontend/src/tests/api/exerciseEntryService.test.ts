import { fetchExerciseProgressionStats } from '@/api/Exercises/exerciseEntryService';

const makeOkResponse = (body: unknown) =>
  ({
    ok: true,
    json: () => Promise.resolve(body),
  }) as Response;

describe('fetchExerciseProgressionStats', () => {
  afterEach(() => {
    document.head.innerHTML = '';
  });

  it('fetches from the root path at a root deployment', async () => {
    document.head.innerHTML = '<base href="/">';
    const mockFetch = jest.fn().mockResolvedValue(makeOkResponse({ ok: true }));
    global.fetch = mockFetch;

    await fetchExerciseProgressionStats('abc123');

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v2/exercises/abc123/stats',
      expect.objectContaining({ credentials: 'include' })
    );
  });

  it('prefixes the request with the configured sub-path', async () => {
    document.head.innerHTML = '<base href="/sparky/">';
    const mockFetch = jest.fn().mockResolvedValue(makeOkResponse({ ok: true }));
    global.fetch = mockFetch;

    await fetchExerciseProgressionStats('abc123');

    expect(mockFetch).toHaveBeenCalledWith(
      '/sparky/api/v2/exercises/abc123/stats',
      expect.objectContaining({ credentials: 'include' })
    );
  });
});
