import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getFoodById, searchFoods } from '../models/food.js';
import { getRecentFoods, getTopFoods } from '../models/foodMisc.js';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));

describe('preferred default variant queries', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockClient: any;
  const userId = 'user-123';

  beforeEach(() => {
    mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn(),
    };
    // @ts-expect-error mocked in test
    getClient.mockResolvedValue(mockClient);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('searchFoods prefers a single viewer-specific default variant via lateral join', async () => {
    await searchFoods('yogurt', userId, false, true, false, 10);

    const queryStr = mockClient.query.mock.calls[0][0];
    expect(queryStr).toContain('LEFT JOIN LATERAL');
    expect(queryStr).toContain(
      'WHEN candidate_fv.user_id = current_user_id() THEN 0'
    );
    expect(queryStr).toContain('WHEN candidate_fv.user_id = f.user_id THEN 1');
    expect(queryStr).not.toContain(
      'LEFT JOIN food_variants fv ON f.id = fv.food_id AND fv.is_default = TRUE'
    );
  });

  it('getFoodById also uses the preferred default lateral join', async () => {
    await getFoodById('food-123', userId);

    const queryStr = mockClient.query.mock.calls[0][0];
    expect(queryStr).toContain('LEFT JOIN LATERAL');
    expect(queryStr).toContain('LIMIT 1');
  });

  it('recent foods include AI provenance on the selected default variant', async () => {
    await getRecentFoods(userId, 10, undefined);

    const queryStr = mockClient.query.mock.calls[0][0];
    expect(queryStr).toContain("'source', fv.source");
    expect(queryStr).toContain("'ai_confidence', fv.ai_confidence");
    expect(queryStr).toContain("'ai_reasoning', fv.ai_reasoning");
    expect(queryStr).toContain('LEFT JOIN LATERAL');
  });

  it('top foods include AI provenance on the selected default variant', async () => {
    await getTopFoods(userId, 10, undefined);

    const queryStr = mockClient.query.mock.calls[0][0];
    expect(queryStr).toContain("'source', fv.source");
    expect(queryStr).toContain("'ai_confidence', fv.ai_confidence");
    expect(queryStr).toContain("'ai_reasoning', fv.ai_reasoning");
    expect(queryStr).toContain('LEFT JOIN LATERAL');
  });
});
