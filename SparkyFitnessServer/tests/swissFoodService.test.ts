import { vi, beforeEach, describe, expect, it } from 'vitest';
import {
  mapSwissFood,
  searchSwissFoods,
  getSwissFoodDetails,
  SwissFoodDetail,
} from '../integrations/swissfood/swissFoodService.js';

vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('swissFoodService - mapSwissFood', () => {
  it('should map a Swiss Food Detail object with standard nutrients correctly', () => {
    const mockDetail: SwissFoodDetail = {
      id: 350031,
      name: 'Buttermilk',
      foodid: 529,
      values: [
        {
          value: 34,
          component: { code: 'ENERCC', name: 'Energy, kilocalories' },
          unit: { code: 'kcal' },
        },
        {
          value: 3.4,
          component: { code: 'PROT625', name: 'Protein' },
          unit: { code: 'g' },
        },
        {
          value: 4,
          component: { code: 'CHO', name: 'Carbohydrates, available' },
          unit: { code: 'g' },
        },
        {
          value: 0.5,
          component: { code: 'FAT', name: 'Fat, total' },
          unit: { code: 'g' },
        },
        {
          value: 0.3,
          component: { code: 'FASAT', name: 'Fatty acids, saturated' },
          unit: { code: 'g' },
        },
        {
          value: 4,
          component: { code: 'SUGAR', name: 'Sugars' },
          unit: { code: 'g' },
        },
        {
          value: 57,
          component: { code: 'NA', name: 'Sodium' },
          unit: { code: 'mg' },
        },
      ],
    };

    const result = mapSwissFood(mockDetail);

    expect(result.name).toBe('Buttermilk');
    expect(result.brand).toBe('Swiss Food Composition Database');
    expect(result.provider_external_id).toBe('350031');
    expect(result.provider_type).toBe('swissfood');
    expect(result.is_custom).toBe(false);

    expect(result.default_variant.serving_size).toBe(100);
    expect(result.default_variant.serving_unit).toBe('g');
    expect(result.default_variant.calories).toBe(34);
    expect(result.default_variant.protein).toBe(3.4);
    expect(result.default_variant.carbs).toBe(4);
    expect(result.default_variant.fat).toBe(0.5);
    expect(result.default_variant.saturated_fat).toBe(0.3);
    expect(result.default_variant.sugars).toBe(4);
    expect(result.default_variant.sodium).toBe(57);
  });

  it('should handle empty or missing values gracefully', () => {
    const mockDetail: SwissFoodDetail = {
      id: 12345,
      name: 'Empty Food',
      foodid: 999,
      values: [],
    };

    const result = mapSwissFood(mockDetail);

    expect(result.name).toBe('Empty Food');
    expect(result.default_variant.calories).toBe(0);
    expect(result.default_variant.protein).toBe(0);
    expect(result.default_variant.carbs).toBe(0);
    expect(result.default_variant.fat).toBe(0);
  });
});

describe('swissFoodService - searchSwissFoods', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should fetch and map search results correctly', async () => {
    const mockSearchResponse = [
      {
        id: 350031,
        foodName: 'Buttermilk',
        generic: true,
        categoryNames: 'Milk and yoghurt beverages',
        foodid: 529,
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockSearchResponse,
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 350031,
        name: 'Buttermilk',
        foodid: 529,
        values: [
          {
            value: 34,
            component: { code: 'ENERCC', name: 'Energy, kilocalories' },
            unit: { code: 'kcal' },
          },
        ],
      }),
    });

    const result = await searchSwissFoods('milk', 1, 20, 'en');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('foods?search=milk&limit=20&offset=0&lang=en'),
      expect.any(Object)
    );

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('food/350031?lang=en'),
      expect.any(Object)
    );

    expect(result.foods).toHaveLength(1);
    expect(result.foods[0].name).toBe('Buttermilk');
    expect(result.foods[0].provider_external_id).toBe('350031');
    expect(result.foods[0].provider_type).toBe('swissfood');
    expect(result.foods[0].default_variant.calories).toBe(34);
    expect(result.pagination.hasMore).toBe(false);
  });

  it('should fallback to default zero nutrients if detail fetch fails during search', async () => {
    const mockSearchResponse = [
      {
        id: 350031,
        foodName: 'Buttermilk',
        generic: true,
        categoryNames: 'Milk and yoghurt beverages',
        foodid: 529,
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockSearchResponse,
    });

    mockFetch.mockRejectedValueOnce(new Error('Detail fetch failed'));

    const result = await searchSwissFoods('milk', 1, 20, 'en');

    expect(result.foods).toHaveLength(1);
    expect(result.foods[0].name).toBe('Buttermilk');
    expect(result.foods[0].default_variant.calories).toBe(0);
  });

  it('should fallback to en when query language is unsupported', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    await searchSwissFoods('milk', 1, 20, 'es');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('lang=en'),
      expect.any(Object)
    );
  });
});

describe('swissFoodService - getSwissFoodDetails', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should fetch and map food details correctly', async () => {
    const mockDetailResponse = {
      id: 350031,
      name: 'Buttermilk',
      foodid: 529,
      values: [
        {
          value: 34,
          component: { code: 'ENERCC', name: 'Energy, kilocalories' },
          unit: { code: 'kcal' },
        },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockDetailResponse,
    });

    const result = await getSwissFoodDetails('350031', 'en');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('food/350031?lang=en'),
      expect.any(Object)
    );

    expect(result.name).toBe('Buttermilk');
    expect(result.default_variant.calories).toBe(34);
  });

  it('should fallback to en details when language is unsupported', async () => {
    const mockDetailResponse = {
      id: 350031,
      name: 'Buttermilk',
      foodid: 529,
      values: [],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockDetailResponse,
    });

    await getSwissFoodDetails('350031', 'ru');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('food/350031?lang=en'),
      expect.any(Object)
    );
  });
});
