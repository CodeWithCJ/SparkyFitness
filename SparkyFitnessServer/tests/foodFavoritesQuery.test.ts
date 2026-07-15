import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getFavoriteFoods } from '../models/foodMisc.js';
import { v4 as uuidv4 } from 'uuid';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
}));

describe('getFavoriteFoods query', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockClient: any;
  const userId = uuidv4();

  beforeEach(() => {
    mockClient = { query: vi.fn(), release: vi.fn() };
    // @ts-expect-error mocked function
    getClient.mockResolvedValue(mockClient);
    mockClient.query.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Regression: a food deleted via the app is soft-deleted (is_quick_food = true),
  // not physically removed, so the food_favorites FK never cascades. Without this
  // filter a deleted food stays visible and re-selectable in the Favorites section.
  it('excludes quick (soft-deleted) foods, matching the recent/top queries', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });

    await getFavoriteFoods(userId);

    const queryStr = mockClient.query.mock.calls[0][0];
    expect(queryStr).toContain('f.is_quick_food = FALSE');
  });

  // Regression: recent/top include provider_verified and both row renderers
  // consume it; dedupe pulls a favorited food out of recent/top, so omitting the
  // column drops the verified badge for that food only in Favorites.
  it('selects provider_verified so the verified badge survives in Favorites', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });

    await getFavoriteFoods(userId);

    const queryStr = mockClient.query.mock.calls[0][0];
    expect(queryStr).toContain('f.provider_verified');
  });
});
