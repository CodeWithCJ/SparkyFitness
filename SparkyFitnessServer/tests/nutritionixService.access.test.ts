import { vi, beforeEach, afterEach, describe, expect, it } from 'vitest';
import externalProviderRepository from '../models/externalProviderRepository.js';
import {
  searchNutritionixFoods,
  getNutritionixNutrients,
  getNutritionixBrandedNutrients,
  searchNutritionixExercises,
} from '../integrations/nutritionix/nutritionixService.js';

vi.mock('../config/logging', () => ({ log: vi.fn() }));
vi.mock('../models/externalProviderRepository', () => ({
  default: {
    checkExternalDataProviderAccess: vi.fn(),
    getExternalDataProviderById: vi.fn(),
  },
}));

const checkAccess = vi.mocked(
  externalProviderRepository.checkExternalDataProviderAccess
);
const getProvider = vi.mocked(
  externalProviderRepository.getExternalDataProviderById
);

const callers = [
  [
    'searchNutritionixFoods',
    () => searchNutritionixFoods('bob', 'banana', 'p1'),
  ],
  [
    'getNutritionixNutrients',
    () => getNutritionixNutrients('bob', '1 banana', 'p1'),
  ],
  [
    'getNutritionixBrandedNutrients',
    () => getNutritionixBrandedNutrients('bob', 'nix-1', 'p1'),
  ],
  [
    'searchNutritionixExercises',
    () => searchNutritionixExercises('bob', 'ran 3 miles', 'p1'),
  ],
] as const;

describe('Nutritionix provider access', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(callers)(
    '%s refuses a provider the caller cannot access, before loading its keys',
    async (_name, call) => {
      checkAccess.mockResolvedValue(false);

      await expect(call()).rejects.toMatchObject({
        statusCode: 403,
        message: expect.stringMatching(/^Forbidden/),
      });
      expect(checkAccess).toHaveBeenCalledWith('p1', 'bob');
      expect(getProvider).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it('sends the provider keys when the caller has access', async () => {
    checkAccess.mockResolvedValue(true);
    getProvider.mockResolvedValue({
      provider_type: 'nutritionix',
      app_id: 'id',
      app_key: 'key',
    } as never);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ common: [], branded: [] }),
    });

    await searchNutritionixFoods('bob', 'banana', 'p1');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      'x-app-id': 'id',
      'x-app-key': 'key',
    });
  });

  it('refuses a provider of another type without calling Nutritionix', async () => {
    checkAccess.mockResolvedValue(true);
    getProvider.mockResolvedValue({
      provider_type: 'fatsecret',
      app_id: 'id',
      app_key: 'key',
    } as never);

    await expect(
      searchNutritionixFoods('bob', 'banana', 'p1')
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a provider that no longer exists as not configured', async () => {
    checkAccess.mockResolvedValue(true);
    getProvider.mockResolvedValue(null as never);

    await expect(searchNutritionixFoods('bob', 'banana', 'p1')).rejects.toThrow(
      'Nutritionix provider not configured or keys missing.'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
