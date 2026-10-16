import { vi, beforeEach, describe, expect, it } from 'vitest';
import {
  mapLivsmedelsverketFood,
  searchLivsmedelsverketFoods,
  getLivsmedelsverketFoodDetails,
  getLivsmedelsverketFoodDirectory,
  resolveSprakCode,
  clearLivsmedelsverketDirectoryCache,
  type LivsmedelsverketFoodDetailRaw,
} from '../integrations/livsmedelsverket/livsmedelsverketService.js';

vi.mock('../config/logging.js', () => ({
  log: vi.fn(),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('livsmedelsverketService - resolveSprakCode', () => {
  it('returns 1 for Swedish, null, or undefined', () => {
    expect(resolveSprakCode('sv')).toBe(1);
    expect(resolveSprakCode('sv-SE')).toBe(1);
    expect(resolveSprakCode(null)).toBe(1);
    expect(resolveSprakCode(undefined)).toBe(1);
    expect(resolveSprakCode('de')).toBe(1);
  });

  it('returns 2 for English', () => {
    expect(resolveSprakCode('en')).toBe(2);
    expect(resolveSprakCode('en-US')).toBe(2);
  });
});

describe('livsmedelsverketService - mapLivsmedelsverketFood', () => {
  const sampleFood: LivsmedelsverketFoodDetailRaw = {
    nummer: 1,
    namn: 'Beef tallow',
    vetenskapligtNamn: 'Bos taurus',
    naringsvarden: [
      {
        namn: 'Energy (kcal)',
        euroFIRkod: 'ENERC',
        enhet: 'kcal',
        varde: 884,
      },
      {
        namn: 'Energy (kJ)',
        euroFIRkod: 'ENERC',
        enhet: 'kJ',
        varde: 3700,
      },
      {
        namn: 'Protein',
        euroFIRkod: 'PROT',
        enhet: 'g',
        varde: 0,
      },
      {
        namn: 'Fat, total',
        euroFIRkod: 'FAT',
        enhet: 'g',
        varde: 100,
      },
      {
        namn: 'Fatty acids, total saturated',
        euroFIRkod: 'FASAT',
        enhet: 'g',
        varde: 54.8,
      },
      {
        namn: 'Carbohydrates, available',
        euroFIRkod: 'CHO',
        enhet: 'g',
        varde: 0,
      },
      {
        namn: 'Sodium, Na',
        euroFIRkod: 'NA',
        enhet: 'mg',
        varde: 5,
      },
    ],
  };

  it('maps raw food item to standard SparkyFitness format with 100g serving', () => {
    const mapped = mapLivsmedelsverketFood(sampleFood);

    expect(mapped.name).toBe('Beef tallow');
    expect(mapped.brand).toBe('Swedish Food Agency (Livsmedelsverket)');
    expect(mapped.provider_type).toBe('livsmedelsverket');
    expect(mapped.provider_external_id).toBe('1');
    expect(mapped.default_variant.serving_size).toBe(100);
    expect(mapped.default_variant.serving_unit).toBe('g');
    expect(mapped.default_variant.calories).toBe(884);
    expect(mapped.default_variant.fat).toBe(100);
    expect(mapped.default_variant.saturated_fat).toBe(54.8);
    expect(mapped.default_variant.sodium).toBe(5);
  });

  it('calculates calories from macros if explicit kcal is missing', () => {
    const rawNoKcal: LivsmedelsverketFoodDetailRaw = {
      nummer: 10,
      namn: 'Protein shake',
      naringsvarden: [
        { namn: 'Protein', euroFIRkod: 'PROT', varde: 25 },
        { namn: 'Fat', euroFIRkod: 'FAT', varde: 2 },
        { namn: 'Carbs', euroFIRkod: 'CHO', varde: 5 },
      ],
    };

    const mapped = mapLivsmedelsverketFood(rawNoKcal);
    // 25*4 + 5*4 + 2*9 = 100 + 20 + 18 = 138
    expect(mapped.default_variant.calories).toBe(138);
    expect(mapped.default_variant.protein).toBe(25);
  });
});

describe('livsmedelsverketService - searchLivsmedelsverketFoods & getLivsmedelsverketFoodDetails', () => {
  beforeEach(() => {
    clearLivsmedelsverketDirectoryCache();
    mockFetch.mockReset();
  });

  it('fetches directory and searches matching items', async () => {
    const directoryResponse = {
      livsmedel: [
        { nummer: 1, namn: 'Nöt talg', vetenskapligtNamn: 'Bos taurus' },
        { nummer: 2, namn: 'Gris späck', vetenskapligtNamn: 'Sus scrofa' },
        { nummer: 3, namn: 'Nöt köttfärs', vetenskapligtNamn: 'Bos taurus' },
      ],
    };

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => directoryResponse,
      })
      // Detail call for food 1
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ nummer: 1, namn: 'Nöt talg' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [
          {
            namn: 'Energi (kcal)',
            euroFIRkod: 'ENERC',
            enhet: 'kcal',
            varde: 884,
          },
        ],
      })
      // Detail call for food 3
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ nummer: 3, namn: 'Nöt köttfärs' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [
          {
            namn: 'Energi (kcal)',
            euroFIRkod: 'ENERC',
            enhet: 'kcal',
            varde: 215,
          },
        ],
      });

    const result = await searchLivsmedelsverketFoods('nöt', 1, 10, 'sv');

    expect(result.pagination.totalCount).toBe(2);
    expect(result.foods).toHaveLength(2);
    expect(result.foods[0].name).toBe('Nöt talg');
    expect(result.foods[1].name).toBe('Nöt köttfärs');
  });

  it('fetches details for a specific food nummer', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ nummer: 5, namn: 'Havregryn' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [
          {
            namn: 'Energi (kcal)',
            euroFIRkod: 'ENERC',
            enhet: 'kcal',
            varde: 370,
          },
          { namn: 'Protein', euroFIRkod: 'PROT', enhet: 'g', varde: 13 },
        ],
      });

    const details = await getLivsmedelsverketFoodDetails('5', 'sv');
    expect(details.name).toBe('Havregryn');
    expect(details.default_variant.calories).toBe(370);
    expect(details.default_variant.protein).toBe(13);
  });

  it('throws an error if nutrient endpoint returns non-OK status', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ nummer: 5, namn: 'Havregryn' }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

    await expect(getLivsmedelsverketFoodDetails('5', 'sv')).rejects.toThrow(
      'Failed to fetch nutrients for Livsmedelsverket food 5: HTTP 500'
    );
  });

  it('caches directory per baseUrl and sprakCode', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        livsmedel: [{ nummer: 1, namn: 'Test Food' }],
      }),
    });

    await getLivsmedelsverketFoodDirectory(1, 'http://custom1.local');
    await getLivsmedelsverketFoodDirectory(1, 'http://custom1.local');
    // First custom URL called once due to cache
    expect(mockFetch).toHaveBeenCalledTimes(1);

    await getLivsmedelsverketFoodDirectory(1, 'http://custom2.local');
    // Different baseUrl causes a new fetch
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
