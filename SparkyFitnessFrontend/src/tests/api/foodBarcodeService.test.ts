import { apiCall } from '@/api/api';
import {
  getBarcodeAlternatives,
  searchBarcodeV2,
} from '@/api/Foods/foodService';

jest.mock('@/api/api', () => ({ apiCall: jest.fn() }));
const providerId = '11111111-1111-4111-8111-111111111111';

describe('barcode APIs', () => {
  beforeEach(() => jest.resetAllMocks());

  it('preserves lookup metadata without adding provider overrides', async () => {
    const result = {
      source: 'none',
      food: null,
    };
    jest.mocked(apiCall).mockResolvedValue(result);
    expect(await searchBarcodeV2('1234567890123')).toEqual(result);
    expect(apiCall).toHaveBeenCalledWith('/v2/foods/barcode/1234567890123', {
      method: 'GET',
      params: {},
    });
  });

  it('loads alternatives for the existing barcode and validates their result status', async () => {
    const result = {
      results: [
        {
          providerId,
          providerName: 'Source A',
          source: 'fatsecret',
          status: 'error',
          food: null,
        },
      ],
    };
    jest.mocked(apiCall).mockResolvedValue(result);
    expect(await getBarcodeAlternatives('1234567890123')).toEqual(result);
    expect(apiCall).toHaveBeenCalledWith(
      '/v2/foods/barcode/1234567890123/alternatives',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('passes the selected provider through to a normal lookup', async () => {
    jest.mocked(apiCall).mockResolvedValue({ source: 'none', food: null });
    await searchBarcodeV2('1234567890123', providerId);
    expect(apiCall).toHaveBeenCalledWith('/v2/foods/barcode/1234567890123', {
      method: 'GET',
      params: { providerId },
    });
  });
});
