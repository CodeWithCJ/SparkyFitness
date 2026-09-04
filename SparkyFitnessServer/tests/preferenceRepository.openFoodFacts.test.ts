import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getClient } from '../db/poolManager.js';
import preferenceRepository from '../models/preferenceRepository.js';

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));

interface FakeClient {
  query: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
}

const fakeClient: FakeClient = {
  query: vi.fn(),
  release: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  fakeClient.query.mockResolvedValue({
    rows: [
      {
        auto_contribute_openfoodfacts: true,
        openfoodfacts_product_language: 'de',
        openfoodfacts_backfill_pending: true,
      },
    ],
    rowCount: 1,
  });
  vi.mocked(getClient).mockResolvedValue(fakeClient as never);
});

describe('preferenceRepository Open Food Facts consent', () => {
  it('lets database triggers exclusively own backfill transitions', async () => {
    await preferenceRepository.setOpenFoodFactsContributionPreferences(
      'user-1',
      {
        enabled: true,
        productLanguage: 'de',
      }
    );

    const [query, params] = fakeClient.query.mock.calls[0] as [
      string,
      unknown[],
    ];
    expect(query).toContain('VALUES ($1, $2, $3, now(), now())');
    expect(query).not.toContain('WHEN $4');
    expect(query).not.toContain('EXCLUDED.openfoodfacts_backfill_pending');
    expect(params).toEqual(['user-1', true, 'de']);
  });
});
