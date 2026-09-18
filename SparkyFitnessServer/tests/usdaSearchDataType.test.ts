import { vi, beforeEach, describe, expect, it } from 'vitest';
import { searchUsdaFoods } from '../integrations/usda/usdaService.js';

vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const ok = (body: unknown) => ({ ok: true, json: async () => body });

const searchBody = (descriptions: string[]) => ({
  foods: descriptions.map((description, i) => ({
    fdcId: 1000 + i,
    description,
  })),
  currentPage: 1,
  totalPages: 1,
  totalHits: descriptions.length,
});

const urlOf = (call: number) => String(mockFetch.mock.calls[call][0]);

describe('USDA search prefers the generic datasets (#2417)', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('names the generic data types, so branded SKUs stop burying whole foods', async () => {
    mockFetch.mockResolvedValueOnce(
      ok(searchBody(['Chicken, breast, boneless, skinless, raw']))
    );

    const result = await searchUsdaFoods('chicken breast', 'key');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const url = new URL(urlOf(0));
    expect(url.searchParams.get('dataType')).toBe(
      'Foundation,SR Legacy,Survey (FNDDS)'
    );
    // The rest of the request is unchanged.
    expect(url.searchParams.get('query')).toBe('chicken breast');
    expect(url.searchParams.get('pageNumber')).toBe('1');
    expect(result.foods[0].description).toContain('Chicken, breast');
  });

  it('falls back to the unfiltered search when nothing generic matches', async () => {
    // A brand name has no generic answer, and answering "no such food" would
    // trade one gap for another.
    mockFetch.mockResolvedValueOnce(ok(searchBody([])));
    mockFetch.mockResolvedValueOnce(ok(searchBody(['OREO, Chocolate Sandwich Cookies']))); // prettier-ignore

    const result = await searchUsdaFoods('oreo', 'key');

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(new URL(urlOf(1)).searchParams.get('dataType')).toBeNull();
    expect(result.foods[0].description).toContain('OREO');
  });

  it('does not spend a second request when the generic search answered', async () => {
    mockFetch.mockResolvedValueOnce(ok(searchBody(['Egg, whole, raw, fresh'])));

    await searchUsdaFoods('egg', 'key');

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('keeps the pagination of whichever response it returns', async () => {
    mockFetch.mockResolvedValueOnce(
      ok({
        foods: [{ fdcId: 1, description: 'Rice, white, long-grain, raw' }],
        currentPage: 2,
        totalPages: 5,
        totalHits: 97,
      })
    );

    const result = await searchUsdaFoods('rice', 'key', 2, 25);

    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 25,
      totalCount: 97,
      hasMore: true,
    });
  });

  it('leaves barcode lookups on the Branded dataset', async () => {
    // The generic sets carry no barcodes, so that path was already right and
    // must stay that way.
    const { searchUsdaFoodsByBarcode } =
      await import('../integrations/usda/usdaService.js');
    mockFetch.mockResolvedValueOnce(ok({ foods: [] }));

    await searchUsdaFoodsByBarcode('04963406', 'key');

    expect(new URL(urlOf(0)).searchParams.get('dataType')).toBe('Branded');
  });
});
