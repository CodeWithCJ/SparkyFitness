import { vi, beforeEach, describe, expect, it } from 'vitest';

const findFoodMatchCandidatesMock = vi.fn();
vi.mock('../models/food.js', () => ({
  findFoodMatchCandidates: (...args: unknown[]) =>
    findFoodMatchCandidatesMock(...(args as [])),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const resolveFoodProviderOrderMock = vi.fn();
const lookupFoodFromProvidersMock = vi.fn();
vi.mock('../services/foodProviderLookupService.js', async () => {
  const actual = await vi.importActual<
    typeof import('../services/foodProviderLookupService.js')
  >('../services/foodProviderLookupService.js');
  return {
    ...actual,
    resolveFoodProviderOrder: (...a: unknown[]) =>
      resolveFoodProviderOrderMock(...(a as [])),
    lookupFoodFromProviders: (...a: unknown[]) =>
      lookupFoodFromProvidersMock(...(a as [])),
  };
});

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

function providerFood(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Chicken Thigh, Raw',
    brand: null,
    provider_external_id: 'off-123',
    variants: [
      {
        serving_size: 100,
        serving_unit: 'g',
        calories: 209,
        protein: 26,
        carbs: 0,
        fat: 11,
        dietary_fiber: 0,
        sugars: 0,
        is_default: true,
      },
    ],
    ...overrides,
  };
}

describe('attachFoodMatches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findFoodMatchCandidatesMock.mockResolvedValue(new Map());
    resolveFoodProviderOrderMock.mockResolvedValue([
      { provider_type: 'openfoodfacts', provider_name: 'OpenFoodFacts' },
    ]);
    lookupFoodFromProvidersMock.mockResolvedValue({
      source: 'ai_estimate',
      food: null,
    });
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

  it('never preselects a match the client cannot gram-scale', async () => {
    // An exact, high-scoring name match measured in cups still has
    // scaled: null, so preselecting it would apply nutrition the client has
    // no way to render.
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
    expect(result.items[0].match!.match_score).toBeGreaterThanOrEqual(0.9);
    expect(result.items[0].match!.gram_convertible).toBe(false);
    expect(result.items[0].preselect_match).toBe(false);
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

  describe('recency is measured in calendar days', () => {
    it('treats an entry_date as a day, not a UTC instant', async () => {
      const today = new Date();
      const iso = today.toISOString().slice(0, 10);
      findFoodMatchCandidatesMock.mockImplementation(
        async (_u, queries) =>
          new Map([
            [
              queries[0].key,
              [candidate({ query_key: queries[0].key, last_used: iso })],
            ],
          ])
      );
      const result = await attachFoodMatches(USER, estimate);
      // Same calendar day must count as recent regardless of the hour the
      // estimate runs; the old millisecond maths flipped this near midnight.
      expect(result.items[0].match!.match_score).toBeGreaterThan(0.9);
    });

    it('ignores a malformed last_used instead of scoring it as ancient', async () => {
      findFoodMatchCandidatesMock.mockImplementation(
        async (_u, queries) =>
          new Map([
            [
              queries[0].key,
              [
                candidate({
                  query_key: queries[0].key,
                  last_used: 'not-a-date',
                }),
              ],
            ],
          ])
      );
      const result = await attachFoodMatches(USER, estimate);
      expect(result.items[0].match).not.toBeNull();
    });
  });
});

describe('provider cascade fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findFoodMatchCandidatesMock.mockResolvedValue(new Map());
    resolveFoodProviderOrderMock.mockResolvedValue([
      { provider_type: 'openfoodfacts', provider_name: 'OpenFoodFacts' },
    ]);
    lookupFoodFromProvidersMock.mockResolvedValue({
      source: 'ai_estimate',
      food: null,
    });
  });

  it('falls back to the provider when the user has no matching food', async () => {
    lookupFoodFromProvidersMock.mockResolvedValue({
      source: 'openfoodfacts',
      food: providerFood(),
    });

    const result = await attachFoodMatches(USER, estimate);
    const match = result.items[0].match!;

    expect(match.match_source).toBe('provider');
    expect(match.provider_type).toBe('openfoodfacts');
    expect(match.provider_external_id).toBe('off-123');
    // No local row exists yet, so there is nothing to log by id.
    expect(match.food_id).toBeUndefined();
    expect(match.variant_id).toBeUndefined();
    // 209 kcal per 100 g scaled to the 200 g the model estimated.
    expect(match.scaled!.calories_kcal).toBeCloseTo(418, 2);
  });

  it('applies verified provider nutrition on open', async () => {
    lookupFoodFromProvidersMock.mockResolvedValue({
      source: 'openfoodfacts',
      food: providerFood(),
    });
    const result = await attachFoodMatches(USER, estimate);
    expect(result.items[0].preselect_match).toBe(true);
  });

  it('leaves the AI numbers untouched even when a provider matches', async () => {
    lookupFoodFromProvidersMock.mockResolvedValue({
      source: 'openfoodfacts',
      food: providerFood(),
    });
    const result = await attachFoodMatches(USER, estimate);
    // Attach, never substitute — an old client keeps reading what it read before.
    expect(result.items[0].calories_kcal).toBe(290);
    expect(result.totals).toEqual(estimate.totals);
  });

  it('does NOT hit a provider when the user already has the food', async () => {
    findFoodMatchCandidatesMock.mockImplementation(
      async (_u, queries) =>
        new Map([[queries[0].key, [candidate({ query_key: queries[0].key })]]])
    );
    await attachFoodMatches(USER, estimate);
    // The user's own food wins; no reason to spend a network call.
    expect(lookupFoodFromProvidersMock).not.toHaveBeenCalled();
  });

  it('skips a provider serving that cannot be gram-scaled', async () => {
    lookupFoodFromProvidersMock.mockResolvedValue({
      source: 'openfoodfacts',
      food: providerFood({
        variants: [
          {
            serving_size: 1,
            serving_unit: 'cup',
            calories: 200,
            protein: 5,
            carbs: 30,
            fat: 2,
            is_default: true,
          },
        ],
      }),
    });
    const result = await attachFoodMatches(USER, estimate);
    // An unscalable number is worse than the AI estimate it would replace.
    expect(result.items[0].match).toBeUndefined();
  });

  it('keeps the estimate when every provider fails', async () => {
    lookupFoodFromProvidersMock.mockRejectedValue(new Error('offline'));
    const result = await attachFoodMatches(USER, estimate);
    expect(result.items[0].calories_kcal).toBe(290);
    expect(result.items[0].match).toBeUndefined();
  });

  it('keeps the estimate when provider order cannot be resolved', async () => {
    resolveFoodProviderOrderMock.mockRejectedValue(new Error('db down'));
    const result = await attachFoodMatches(USER, estimate);
    expect(result.items[0].calories_kcal).toBe(290);
  });

  it('resolves the provider order once for the whole plate', async () => {
    lookupFoodFromProvidersMock.mockResolvedValue({
      source: 'openfoodfacts',
      food: providerFood(),
    });
    await attachFoodMatches(USER, {
      ...estimate,
      items: [
        estimateItem,
        { ...estimateItem, canonical_name: 'rice' },
        { ...estimateItem, canonical_name: 'ghee' },
      ],
    });
    // Preferences would otherwise be re-read once per ingredient.
    expect(resolveFoodProviderOrderMock).toHaveBeenCalledTimes(1);
    expect(lookupFoodFromProvidersMock).toHaveBeenCalledTimes(3);
  });
});
