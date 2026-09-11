import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

import { searchUsdaFoods } from '../integrations/usda/usdaService.js';

describe('searchUsdaFoods', () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  function searchResponse() {
    return new Response(
      JSON.stringify({
        foods: [],
        currentPage: 1,
        totalPages: 1,
        totalHits: 0,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  }

  it('requests the non-branded datasets by default, correctly URL-encoded', async () => {
    const fetchMock = vi.fn().mockResolvedValue(searchResponse());
    globalThis.fetch = fetchMock;

    await searchUsdaFoods('chicken breast', 'test-api-key');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestedUrl = fetchMock.mock.calls[0][0] as string;
    const { searchParams } = new URL(requestedUrl);

    expect(searchParams.get('dataType')).toBe(
      'Foundation,SR Legacy,Survey (FNDDS)'
    );
    // Catches an unencoded space/paren surviving on the wire even though
    // the decoded assertion above would still pass.
    const rawQuery = requestedUrl.split('?')[1];
    expect(rawQuery).not.toMatch(/[ ()]/);
  });

  it('still sends the query, paging, and api key params', async () => {
    const fetchMock = vi.fn().mockResolvedValue(searchResponse());
    globalThis.fetch = fetchMock;

    await searchUsdaFoods('chicken breast', 'test-api-key', 2, 25);

    const requestedUrl = fetchMock.mock.calls[0][0] as string;
    const { searchParams } = new URL(requestedUrl);

    expect(searchParams.get('query')).toBe('chicken breast');
    expect(searchParams.get('pageNumber')).toBe('2');
    expect(searchParams.get('pageSize')).toBe('25');
    expect(searchParams.get('api_key')).toBe('test-api-key');
  });
});
