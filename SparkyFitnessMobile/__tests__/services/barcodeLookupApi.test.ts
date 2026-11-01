import { lookupBarcodeV2 } from '../../src/services/api/externalFoodSearchApi';
import { apiFetch } from '../../src/services/api/apiClient';
import type { BarcodeLookupResponse } from '@workspace/shared';

jest.mock('../../src/services/api/apiClient', () => ({ apiFetch: jest.fn() }));

const mockApiFetch = jest.mocked(apiFetch);

describe('barcode lookup metadata', () => {
  it.each([
    ['11111111-1111-4111-8111-111111111111', 'Configured source'],
    ['openfoodfacts-fallback', 'Open Food Facts fallback'],
  ])(
    'retains resolved source %s while mapping a found food',
    async (providerId, providerName) => {
      const response: BarcodeLookupResponse = {
        source: 'openfoodfacts',
        providerId,
        providerName,
        food: {
          name: 'Milk',
          brand: 'Example',
          is_custom: false,
          provider_type: 'openfoodfacts',
          provider_external_id: '1234567890123',
          default_variant: {
            serving_size: 100,
            serving_unit: 'ml',
            calories: 50,
            protein: 3,
            carbs: 5,
            fat: 2,
            is_default: true,
          },
        },
      };
      mockApiFetch.mockResolvedValue(response);
      expect(await lookupBarcodeV2('1234567890123')).toMatchObject({
        source: 'openfoodfacts',
        providerId,
        providerName,
        food: { name: 'Milk', provider_external_id: '1234567890123' },
      });
    }
  );

  it('retains source identity even on no match', async () => {
    const response = {
      source: 'not_found',
      food: null,
      providerId: null,
      providerName: 'Open Food Facts',
    };
    mockApiFetch.mockResolvedValue(response);
    expect(await lookupBarcodeV2('1234567890123')).toEqual(response);
  });
});
