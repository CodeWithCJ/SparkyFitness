import { QueryClient } from '@tanstack/react-query';
import { searchBarcodeV2Options } from '@/hooks/Foods/useFoodsV2';
import { searchBarcodeV2 } from '@/api/Foods/foodService';

jest.mock('@/api/Foods/foodService', () => ({
  searchBarcodeV2: jest.fn(),
  searchFoodsV2: jest.fn(),
  getFoodDetailsV2: jest.fn(),
}));

beforeEach(() => jest.resetAllMocks());

it('keeps the same account and barcode separate across active profiles', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  jest
    .mocked(searchBarcodeV2)
    .mockResolvedValueOnce({ source: 'profile-a-result', food: null })
    .mockResolvedValueOnce({ source: 'profile-b-result', food: null });

  const first = await client.fetchQuery(
    searchBarcodeV2Options(
      '1234567890123',
      'provider-a',
      'account-a',
      'profile-a'
    )
  );
  const second = await client.fetchQuery(
    searchBarcodeV2Options(
      '1234567890123',
      'provider-a',
      'account-a',
      'profile-b'
    )
  );
  expect([first.source, second.source]).toEqual([
    'profile-a-result',
    'profile-b-result',
  ]);
  expect(searchBarcodeV2).toHaveBeenCalledTimes(2);
  expect(searchBarcodeV2).toHaveBeenNthCalledWith(
    2,
    '1234567890123',
    'provider-a'
  );
  expect(
    await client.fetchQuery(
      searchBarcodeV2Options(
        '1234567890123',
        'provider-a',
        'account-a',
        'profile-a'
      )
    )
  ).toEqual(first);
  expect(searchBarcodeV2).toHaveBeenCalledTimes(2);
  client.clear();
});

it('keeps lookup results separate by signed-in account and selected provider', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  jest
    .mocked(searchBarcodeV2)
    .mockResolvedValueOnce({ source: 'a', food: null })
    .mockResolvedValueOnce({ source: 'b', food: null })
    .mockResolvedValueOnce({ source: 'override', food: null });
  const first = await client.fetchQuery(
    searchBarcodeV2Options('1234567890123', undefined, 'account-a')
  );
  const second = await client.fetchQuery(
    searchBarcodeV2Options('1234567890123', undefined, 'account-b')
  );
  const override = await client.fetchQuery(
    searchBarcodeV2Options('1234567890123', 'provider-a', 'account-a')
  );
  expect([first.source, second.source, override.source]).toEqual([
    'a',
    'b',
    'override',
  ]);
  expect(searchBarcodeV2).toHaveBeenNthCalledWith(
    1,
    '1234567890123',
    undefined
  );
  expect(searchBarcodeV2).toHaveBeenNthCalledWith(
    2,
    '1234567890123',
    undefined
  );
  expect(searchBarcodeV2).toHaveBeenNthCalledWith(
    3,
    '1234567890123',
    'provider-a'
  );
  expect(
    await client.fetchQuery(
      searchBarcodeV2Options('1234567890123', undefined, 'account-a')
    )
  ).toEqual(first);
  expect(searchBarcodeV2).toHaveBeenCalledTimes(3);
});
