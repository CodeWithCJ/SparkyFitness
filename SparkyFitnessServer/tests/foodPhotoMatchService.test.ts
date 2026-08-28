import { vi, beforeEach, describe, expect, it } from 'vitest';

const findFoodMatchCandidatesMock = vi.fn();
vi.mock('../models/food.js', () => ({
  findFoodMatchCandidates: (...args: unknown[]) =>
    findFoodMatchCandidatesMock(...(args as [])),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const { attachFoodMatches, matchItems } =
  await import('../services/foodPhotoMatchService.js');

const USER = 'user-1';

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    query_key: 'k',
    food_id: '11111111-1111-4111-8111-111111111111',
    food_name: 'Chicken Thigh',
    brand: null,
    user_id: USER,
    variant_id: '22222222-2222-4222-8222-222222222222',
    serving_size: 100,
    serving_unit: 'g',
    calories: 199,
    protein: 26,
    carbs: 0,
    fat: 10,
    dietary_fiber: 0,
    sugars: 0,
    last_used: null,
    ...overrides,
  };
}

const estimateItem = {
  name: 'Grilled chicken thigh',
  canonical_name: 'chicken thigh',
  estimated_grams: 200,
  portion_description: '1 thigh',
  preparation: 'grilled',
  calories_kcal: 290,
  protein_g: 38,
  carbs_g: 0,
  fat_g: 14.5,
  fiber_g: 0,
  sugar_g: 0,
  item_confidence: 'high' as const,
  assumptions: [],
};

const estimate = {
  meal_summary: 'Chicken',
  overall_confidence: 'medium' as const,
  confidence_reason: '',
  items: [estimateItem],
  totals: {
    calories_kcal: 290,
    protein_g: 38,
    carbs_g: 0,
    fat_g: 14.5,
    fiber_g: 0,
    sugar_g: 0,
    total_grams: 200,
  },
  user_weight_reconciliation: '',
  clarifying_questions: [],
};

describe('attachFoodMatches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findFoodMatchCandidatesMock.mockResolvedValue(new Map());
  });

  it('never rewrites the AI nutrition or the totals', async () => {
    findFoodMatchCandidatesMock.mockImplementation(async (_u, queries) => {
      const key = queries[0].key;
      return new Map([[key, [candidate({ query_key: key })]]]);
    });

    const result = await attachFoodMatches(USER, estimate);

    expect(result.items[0].calories_kcal).toBe(290);
    expect(result.items[0].protein_g).toBe(38);
    expect(result.totals).toEqual(estimate.totals);
  });

  it('attaches the match with nutrition scaled to the estimated grams', async () => {
    findFoodMatchCandidatesMock.mockImplementation(
      async (_u, queries) =>
        new Map([[queries[0].key, [candidate({ query_key: queries[0].key })]]])
    );

    const result = await attachFoodMatches(USER, estimate);
    const match = result.items[0].match!;

    expect(match.food_name).toBe('Chicken Thigh');
    expect(match.gram_convertible).toBe(true);
    // 199 kcal per 100 g, scaled to the 200 g the AI estimated.
    expect(match.scaled!.calories_kcal).toBeCloseTo(398, 2);
    expect(match.is_own_food).toBe(true);
  });

  it('assigns a stable item_id when the model response has none', async () => {
    const result = await attachFoodMatches(USER, estimate);
    expect(result.items[0].item_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('searches on canonical_name, falling back to the display name', async () => {
    await attachFoodMatches(USER, estimate);
    expect(findFoodMatchCandidatesMock.mock.calls[0][1][0].term).toBe(
      'chicken thigh'
    );

    vi.clearAllMocks();
    findFoodMatchCandidatesMock.mockResolvedValue(new Map());
    await attachFoodMatches(USER, {
      ...estimate,
      items: [{ ...estimateItem, canonical_name: undefined }],
    });
    expect(findFoodMatchCandidatesMock.mock.calls[0][1][0].term).toBe(
      'Grilled chicken thigh'
    );
  });

  it('looks every ingredient up in ONE call', async () => {
    await attachFoodMatches(USER, {
      ...estimate,
      items: [estimateItem, { ...estimateItem, canonical_name: 'rice' }],
    });
    expect(findFoodMatchCandidatesMock).toHaveBeenCalledTimes(1);
    expect(findFoodMatchCandidatesMock.mock.calls[0][1]).toHaveLength(2);
  });

  it('attaches nothing when no candidate clears the threshold', async () => {
    findFoodMatchCandidatesMock.mockImplementation(
      async (_u, queries) =>
        new Map([
          [
            queries[0].key,
            [
              candidate({
                query_key: queries[0].key,
                food_name: 'Chocolate Cake',
              }),
            ],
          ],
        ])
    );
    const result = await attachFoodMatches(USER, estimate);
    expect(result.items[0].match).toBeUndefined();
    expect(result.match_summary?.matched_count).toBe(0);
  });

  it('preselects only a strong exact-name match', async () => {
    findFoodMatchCandidatesMock.mockImplementation(
      async (_u, queries) =>
        new Map([[queries[0].key, [candidate({ query_key: queries[0].key })]]])
    );
    const partial = await attachFoodMatches(USER, estimate);
    // 'chicken thigh' vs 'Chicken Thigh' is exact, so this preselects.
    expect(partial.items[0].preselect_match).toBe(true);

    findFoodMatchCandidatesMock.mockImplementation(
      async (_u, queries) =>
        new Map([
          [
            queries[0].key,
            [
              candidate({
                query_key: queries[0].key,
                food_name: 'Chicken Thigh, Roasted',
              }),
            ],
          ],
        ])
    );
    const loose = await attachFoodMatches(USER, estimate);
    expect(loose.items[0].match).not.toBeNull();
    expect(loose.items[0].preselect_match).toBe(false);
  });

  it('marks a non-weight variant as not gram-convertible with null nutrition', async () => {
    findFoodMatchCandidatesMock.mockImplementation(
      async (_u, queries) =>
        new Map([
          [
            queries[0].key,
            [
              candidate({
                query_key: queries[0].key,
                serving_unit: 'cup',
                serving_size: 1,
              }),
            ],
          ],
        ])
    );
    const result = await attachFoodMatches(USER, estimate);
    expect(result.items[0].match!.gram_convertible).toBe(false);
    expect(result.items[0].match!.scaled).toBeNull();
  });

  it('caps alternates at two and orders everything by score', async () => {
    findFoodMatchCandidatesMock.mockImplementation(
      async (_u, queries) =>
        new Map([
          [
            queries[0].key,
            [
              candidate({
                query_key: queries[0].key,
                food_name: 'Chicken Thigh, Roasted',
              }),
              candidate({
                query_key: queries[0].key,
                food_name: 'Chicken Thigh',
              }),
              candidate({
                query_key: queries[0].key,
                food_name: 'Chicken Thigh, Fried',
              }),
              candidate({
                query_key: queries[0].key,
                food_name: 'Chicken Thigh, Boiled',
              }),
            ],
          ],
        ])
    );
    const result = await attachFoodMatches(USER, estimate);
    expect(result.items[0].match!.food_name).toBe('Chicken Thigh');
    expect(result.items[0].alternates).toHaveLength(2);
    expect(result.items[0].alternates![0].match_score).toBeGreaterThanOrEqual(
      result.items[0].alternates![1].match_score
    );
  });

  it('reports a public food as not the user own', async () => {
    findFoodMatchCandidatesMock.mockImplementation(
      async (_u, queries) =>
        new Map([
          [
            queries[0].key,
            [candidate({ query_key: queries[0].key, user_id: 'someone' })],
          ],
        ])
    );
    const result = await attachFoodMatches(USER, estimate);
    expect(result.items[0].match!.is_own_food).toBe(false);
    expect(result.match_summary?.own_food_count).toBe(0);
  });

  it('degrades to an unmatched estimate when the lookup fails', async () => {
    findFoodMatchCandidatesMock.mockRejectedValue(new Error('pool exhausted'));
    // The user already paid for the AI call; a matching failure must not lose it.
    const result = await attachFoodMatches(USER, estimate);
    expect(result.items[0].calories_kcal).toBe(290);
    expect(result.items[0].match).toBeUndefined();
  });

  it('skips the lookup entirely for an estimate with no items', async () => {
    const result = await attachFoodMatches(USER, { ...estimate, items: [] });
    expect(findFoodMatchCandidatesMock).not.toHaveBeenCalled();
    expect(result).toEqual({ ...estimate, items: [] });
  });

  it('counts matches in the summary', async () => {
    findFoodMatchCandidatesMock.mockImplementation(
      async (_u, queries) =>
        new Map(
          queries.map((q: { key: string }) => [
            q.key,
            [candidate({ query_key: q.key })],
          ])
        )
    );
    const result = await attachFoodMatches(USER, {
      ...estimate,
      items: [estimateItem, estimateItem],
    });
    expect(result.match_summary).toEqual({
      item_count: 2,
      matched_count: 2,
      own_food_count: 2,
    });
  });
});

describe('matchItems', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findFoodMatchCandidatesMock.mockResolvedValue(new Map());
  });

  it('keeps an item_id the caller supplied, for re-matching a renamed row', async () => {
    const result = await matchItems(USER, [
      { item_id: 'given-id', name: 'rice', estimated_grams: 100 },
    ]);
    expect(result.has('given-id')).toBe(true);
  });

  it('returns an empty map for no items', async () => {
    expect((await matchItems(USER, [])).size).toBe(0);
    expect(findFoodMatchCandidatesMock).not.toHaveBeenCalled();
  });
});
