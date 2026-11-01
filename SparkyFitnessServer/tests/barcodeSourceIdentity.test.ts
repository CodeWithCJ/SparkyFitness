import { beforeEach, describe, expect, it, vi } from 'vitest';
import repository from '../models/foodRepository.js';
import service from '../services/foodCoreService.js';
vi.mock('../models/foodRepository.js');
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
const input = {
  name: 'Chosen source B',
  brand: 'Brand',
  user_id: 'owner',
  is_custom: false,
  barcode: '1234567890123',
  provider_type: 'usda',
  provider_external_id: 'product-b',
  serving_size: 100,
  serving_unit: 'g',
  calories: 120,
  protein: 3,
  carbs: 20,
  fat: 2,
};
beforeEach(() => vi.resetAllMocks());
describe('barcode imports preserve selected provider identity', () => {
  it('does not replace a different selected source with a barcode-only match', async () => {
    vi.mocked(repository.findFoodByBarcode).mockResolvedValue({
      id: 'old-food',
      provider_type: 'openfoodfacts',
      provider_external_id: input.barcode,
    });
    vi.mocked(repository.findFoodByProviderExternalId).mockResolvedValue(null);
    vi.mocked(repository.createFood).mockResolvedValue({
      id: 'new-food',
      ...input,
    });
    const result = await service.createFood('owner', input);
    expect(result.id).toBe('new-food');
    expect(repository.createFood).toHaveBeenCalledWith(
      expect.objectContaining({
        provider_type: 'usda',
        provider_external_id: 'product-b',
      })
    );
    expect(repository.updateFood).not.toHaveBeenCalled();
  });
  it('preserves a custom barcode match when another provider is explicitly selected', async () => {
    const customFood = {
      id: 'custom-food',
      name: 'My corrected food',
      is_custom: true,
      barcode: input.barcode,
      provider_type: null,
      provider_external_id: null,
    };
    vi.mocked(repository.findFoodByBarcode).mockResolvedValue(customFood);
    vi.mocked(repository.findFoodByProviderExternalId).mockResolvedValue(null);
    vi.mocked(repository.createFood).mockResolvedValue({
      id: 'selected-source-food',
      ...input,
    });

    const result = await service.createFood('owner', input);

    expect(result.id).toBe('selected-source-food');
    expect(repository.createFood).toHaveBeenCalledWith(
      expect.objectContaining({
        provider_type: input.provider_type,
        provider_external_id: input.provider_external_id,
      })
    );
    expect(repository.updateFood).not.toHaveBeenCalled();
  });
  it('reuses the exact selected source on retry even if a different source owns the first barcode match', async () => {
    const selected = {
      id: 'selected-food',
      provider_type: 'usda',
      provider_external_id: 'product-b',
    };
    vi.mocked(repository.findFoodByBarcode).mockResolvedValue({
      id: 'old-food',
      provider_type: 'openfoodfacts',
      provider_external_id: input.barcode,
    });
    vi.mocked(repository.findFoodByProviderExternalId).mockResolvedValue(
      selected
    );
    const result = await service.createFood('owner', input);
    expect(result.id).toBe('selected-food');
    expect(repository.createFood).not.toHaveBeenCalled();
  });
});
