import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  provider: vi.fn(),
  recipe: vi.fn(),
  patch: vi.fn(),
  mappings: vi.fn(),
  source: vi.fn(),
  save: vi.fn(),
  meal: vi.fn(),
  food: vi.fn(),
  variant: vi.fn(),
  markSynced: vi.fn(),
  local: vi.fn(),
  targets: vi.fn(),
  lookup: vi.fn(),
  pick: vi.fn(),
  activeAi: vi.fn(),
  aiConfig: vi.fn(),
  dispatch: vi.fn(),
}));
vi.mock('../services/externalProviderService.js', () => ({
  default: { getExternalDataProviderDetails: m.provider },
}));
vi.mock('../integrations/mealie/mealieService.js', () => ({
  default: class {
    readIngredientRecipe = m.recipe;
    patchRecipeNutrition = m.patch;
  },
}));
vi.mock('../models/recipeImportRepository.js', () => ({
  default: {
    getMappings: m.mappings,
    getSource: m.source,
    save: m.save,
    markSynced: m.markSynced,
  },
}));
vi.mock('../models/mealRepository.js', () => ({
  default: { getMealById: m.meal },
}));
vi.mock('../models/foodRepository.js', () => ({
  default: { getFoodById: m.food, getFoodVariantById: m.variant },
}));
vi.mock('../models/food.js', () => ({ findFoodMatchCandidates: m.local }));
vi.mock('../services/foodProviderLookupService.js', () => ({
  resolveFoodProviderOrder: m.targets,
  lookupFoodFromProviders: m.lookup,
  pickBestVariant: m.pick,
}));
vi.mock('../models/chatRepository.js', () => ({
  default: {
    getActiveAiServiceSetting: m.activeAi,
    getAiServiceSettingForBackend: m.aiConfig,
  },
}));
vi.mock('../ai/providerDispatch.js', () => ({ dispatchAiRequest: m.dispatch }));
vi.mock('../utils/adminCheck.js', () => ({
  resolveIsAdminByUserId: vi.fn().mockResolvedValue(false),
}));
vi.mock('../utils/outboundUrlPolicy.js', () => ({
  resolveFoodProviderNetworkPolicy: vi
    .fn()
    .mockResolvedValue({ allowPrivateNetwork: false }),
  resolveAiNetworkPolicy: vi.fn(),
}));
import service from '../services/recipeImportService.js';
import { recipeFingerprint } from '../services/recipeImportMath.js';
import { mealFingerprint } from '../services/recipeImportMealSnapshot.js';
import { recipeImportSourceSchema } from '@workspace/shared';
const recipe = {
  id: 'recipe',
  slug: 'rice',
  name: 'Rice',
  recipeServings: 4,
  recipeIngredient: [
    {
      referenceId: 'i',
      quantity: 600,
      unit: { name: 'g' },
      food: { id: 'rice', name: 'rice' },
    },
  ],
};
const mapping = {
  ingredientId: 'i',
  foodId: 'food',
  variantId: 'variant',
  quantity: 600,
  unit: 'g',
  confirmed: true as const,
};
const variant = {
  id: 'variant',
  food_id: 'food',
  serving_size: 100,
  serving_unit: 'g',
  calories: 400,
  protein: 10,
  carbs: 60,
  fat: 10,
};
beforeEach(() => {
  vi.clearAllMocks();
  m.provider.mockResolvedValue({
    id: 'p',
    user_id: 'u',
    provider_type: 'mealie',
    is_active: true,
    base_url: 'https://recipes.example',
    app_key: 'fixture',
  });
  m.recipe.mockResolvedValue(recipe);
  m.mappings.mockResolvedValue([]);
  m.food.mockResolvedValue({ id: 'food' });
  m.variant.mockResolvedValue(variant);
  m.save.mockResolvedValue({ mealId: 'meal' });
  m.local.mockResolvedValue(new Map());
  m.targets.mockResolvedValue([]);
  m.lookup.mockResolvedValue({ source: 'not_found', food: null });
  m.markSynced.mockResolvedValue(undefined);
});
describe('source row identity and safe mapping reuse', () => {
  it('gives duplicate, missing, reserved, colliding and oversized references deterministic bounded unique IDs', async () => {
    const references = [
      'i',
      'i',
      '',
      'ingredient-2',
      'ingredient:4',
      'x'.repeat(1000),
    ];
    m.recipe.mockResolvedValue({
      ...recipe,
      recipeIngredient: references.map((referenceId) => ({
        ...recipe.recipeIngredient[0],
        referenceId,
      })),
    });
    const first = await service.preview('u', 'u', {
      providerId: 'p',
      recipeSlug: 'rice',
    });
    const second = await service.preview('u', 'u', {
      providerId: 'p',
      recipeSlug: 'rice',
    });
    const ids = first.ingredients.map((row) => row.ingredientId);
    expect(new Set(ids).size).toBe(references.length);
    expect(ids.every((id) => id.length > 0 && id.length <= 300)).toBe(true);
    expect(second.ingredients.map((row) => row.ingredientId)).toEqual(ids);
  });
  it.each(['i', 'other-reference'])(
    'saves distinct foods for repeated rows but never learns their ambiguous context (%s)',
    async (secondReference) => {
      const repeated = {
        ...recipe,
        recipeIngredient: [
          recipe.recipeIngredient[0],
          { ...recipe.recipeIngredient[0], referenceId: secondReference },
        ],
      };
      m.recipe.mockResolvedValue(repeated);
      const first = await service.preview('u', 'u', {
        providerId: 'p',
        recipeSlug: 'rice',
      });
      m.variant.mockImplementation(async (id: string) => ({
        ...variant,
        id,
        food_id: id === 'variant' ? 'food' : 'other',
      }));
      m.save.mockImplementation(async (_user, meal, source, remembered) => {
        // Model the actual repository's last-upsert-wins unique context behavior.
        const byKey = new Map(
          remembered.map((row: { source_food_key: string }) => [
            row.source_food_key,
            row,
          ])
        );
        m.mappings.mockResolvedValue([...byKey.values()]);
        return {
          ...source,
          mealId: 'meal',
          mealFingerprint: mealFingerprint(meal),
          lastSyncedAt: null,
        };
      });
      await service.save('u', 'u', {
        providerId: 'p',
        recipeSlug: 'rice',
        sourceFingerprint: first.sourceFingerprint,
        mappings: first.ingredients.map((row, index) => ({
          ...mapping,
          ingredientId: row.ingredientId,
          foodId: index ? 'other' : 'food',
          variantId: index ? 'other-variant' : 'variant',
        })),
      });
      expect(
        m.save.mock.calls[0][1].foods.map(
          (row: { food_id: string }) => row.food_id
        )
      ).toEqual(['food', 'other']);
      expect(m.save.mock.calls[0][3]).toEqual([]);
      // Even a prior remembered mapping for this context must not be reused.
      m.mappings.mockResolvedValue([
        {
          source_food_key: first.ingredients[0].sourceFoodKey,
          food_id: 'other',
          variant_id: 'other-variant',
          quantity_per_source_unit: 1,
          unit: 'g',
        },
      ]);
      const later = await service.preview('u', 'u', {
        providerId: 'p',
        recipeSlug: 'rice',
      });
      expect(later.ingredients.map((row) => row.mapping)).toEqual([null, null]);
    }
  );
  it('refuses previously learned last-upsert-wins choices for an ambiguous repeated context', async () => {
    const first = await service.preview('u', 'u', {
      providerId: 'p',
      recipeSlug: 'rice',
    });
    m.mappings.mockResolvedValue([
      {
        source_food_key: first.ingredients[0].sourceFoodKey,
        food_id: 'food',
        variant_id: 'variant',
        quantity_per_source_unit: 1,
        unit: 'g',
      },
    ]);
    m.recipe.mockResolvedValue({
      ...recipe,
      recipeIngredient: [
        recipe.recipeIngredient[0],
        { ...recipe.recipeIngredient[0], referenceId: 'other-reference' },
      ],
    });
    const preview = await service.preview('u', 'u', {
      providerId: 'p',
      recipeSlug: 'rice',
    });
    expect(preview.ingredients.map((row) => row.mapping)).toEqual([null, null]);
  });
  it('rejects duplicate mapping IDs before creating a meal', async () => {
    const source = {
      ...recipe,
      recipeIngredient: [
        recipe.recipeIngredient[0],
        { ...recipe.recipeIngredient[0], referenceId: 'other' },
      ],
    };
    m.recipe.mockResolvedValue(source);
    await expect(
      service.save('u', 'u', {
        providerId: 'p',
        recipeSlug: 'rice',
        sourceFingerprint: recipeFingerprint(source),
        mappings: [mapping, mapping],
      })
    ).rejects.toMatchObject({ code: 'INCOMPLETE_MAPPING' });
    expect(m.save).not.toHaveBeenCalled();
  });
  it.each(['calories', 'protein', 'carbs', 'fat'])(
    'does not save a meal with unknown core %s',
    async (nutrient) => {
      m.variant.mockResolvedValue({ ...variant, [nutrient]: null });
      await expect(
        service.save('u', 'u', {
          providerId: 'p',
          recipeSlug: 'rice',
          sourceFingerprint: recipeFingerprint(recipe),
          mappings: [mapping],
        })
      ).rejects.toMatchObject({ code: 'INCOMPLETE_NUTRITION' });
      expect(m.save).not.toHaveBeenCalled();
    }
  );
  it('rejects an unrelated extra mapping instead of duplicating the first repeated food', async () => {
    const repeated = {
      ...recipe,
      recipeIngredient: [
        recipe.recipeIngredient[0],
        recipe.recipeIngredient[0],
      ],
    };
    m.recipe.mockResolvedValue(repeated);
    await expect(
      service.save('u', 'u', {
        providerId: 'p',
        recipeSlug: 'rice',
        sourceFingerprint: recipeFingerprint(repeated),
        mappings: [mapping, { ...mapping, ingredientId: 'unrelated' }],
      })
    ).rejects.toMatchObject({ code: 'INCOMPLETE_MAPPING' });
    expect(m.save).not.toHaveBeenCalled();
  });
  it('requires fresh confirmation for original preparation text and legacy context-v1 keys', async () => {
    const cooked = {
      ...recipe,
      recipeIngredient: [
        { ...recipe.recipeIngredient[0], originalText: 'Cooked rice' },
      ],
    };
    m.recipe.mockResolvedValue(cooked);
    const first = await service.preview('u', 'u', {
      providerId: 'p',
      recipeSlug: 'rice',
    });
    const remembered = {
      source_food_key: first.ingredients[0].sourceFoodKey,
      food_id: 'food',
      variant_id: 'variant',
      quantity_per_source_unit: 1,
      unit: 'g',
    };
    m.mappings.mockResolvedValue([remembered]);
    m.recipe.mockResolvedValue({
      ...cooked,
      recipeIngredient: [
        {
          ...cooked.recipeIngredient[0],
          originalText: '  COOKED   rice ',
          quantity: 900,
        },
      ],
    });
    expect(
      (await service.preview('u', 'u', { providerId: 'p', recipeSlug: 'rice' }))
        .ingredients[0].mapping?.quantity
    ).toBe(900);
    m.recipe.mockResolvedValue({
      ...cooked,
      recipeIngredient: [
        { ...cooked.recipeIngredient[0], originalText: 'Dry rice' },
      ],
    });
    expect(
      (await service.preview('u', 'u', { providerId: 'p', recipeSlug: 'rice' }))
        .ingredients[0].mapping
    ).toBeNull();
    m.recipe.mockResolvedValue(recipe);
    m.mappings.mockResolvedValue([
      {
        ...remembered,
        source_food_key:
          'context-v1:' +
          recipeFingerprint({
            foodId: 'rice',
            foodName: 'rice',
            unit: 'g',
            preparation: '',
          }),
      },
    ]);
    expect(
      (await service.preview('u', 'u', { providerId: 'p', recipeSlug: 'rice' }))
        .ingredients[0].mapping
    ).toBeNull();
  });
  it.each([0.5, Number.MIN_VALUE])(
    'rejects derived serving size outside response bounds before writing (%s servings)',
    async (servings) => {
      await expect(
        service.save('u', 'u', {
          providerId: 'p',
          recipeSlug: 'rice',
          sourceFingerprint: recipeFingerprint(recipe),
          mappings: [mapping],
          servings,
          finishedWeightGrams: 1e9,
        })
      ).rejects.toMatchObject({ status: 422, code: 'INCOMPLETE_MAPPING' });
      expect(m.save).not.toHaveBeenCalled();
    }
  );
  it('accepts the supported derived serving boundary', async () => {
    const saved = await service.save('u', 'u', {
      providerId: 'p',
      recipeSlug: 'rice',
      sourceFingerprint: recipeFingerprint(recipe),
      mappings: [mapping],
      servings: 1,
      finishedWeightGrams: 1e9,
    });
    expect(saved.servingSize).toBe(1e9);
    expect(m.save).toHaveBeenCalledOnce();
  });
});
describe('owner-only ingredient imports', () => {
  it('rejects switched actors before accessing provider credentials', async () => {
    await expect(
      service.preview('u', 'delegate', { providerId: 'p', recipeSlug: 'rice' })
    ).rejects.toMatchObject({ status: 403 });
    expect(m.provider).not.toHaveBeenCalled();
  });
  it('rejects another owner provider even if existing provider access allows it', async () => {
    m.provider.mockResolvedValue({
      user_id: 'other',
      provider_type: 'mealie',
      is_active: true,
    });
    await expect(
      service.preview('u', 'u', { providerId: 'p', recipeSlug: 'rice' })
    ).rejects.toMatchObject({ status: 403 });
  });
  it('reuses a saved mapping scaled to the source quantity', async () => {
    const originalPreview = await service.preview('u', 'u', {
      providerId: 'p',
      recipeSlug: 'rice',
    });
    m.mappings.mockResolvedValue([
      {
        source_food_key: originalPreview.ingredients[0].sourceFoodKey,
        food_id: 'food',
        variant_id: 'variant',
        quantity_per_source_unit: 1,
        unit: 'g',
      },
    ]);
    const preview = await service.preview('u', 'u', {
      providerId: 'p',
      recipeSlug: 'rice',
    });
    expect(preview.ingredients[0].mapping).toMatchObject({
      foodId: 'food',
      quantity: 600,
      confirmed: true,
    });
    expect(m.save).not.toHaveBeenCalled();
  });
  it('reports linked recipes and missing amounts rather than zeroing them', async () => {
    m.recipe.mockResolvedValue({
      ...recipe,
      recipeIngredient: [
        {
          referenceId: 'i',
          quantity: null,
          note: 'to taste',
          referencedRecipe: { id: 'linked' },
        },
      ],
    });
    const preview = await service.preview('u', 'u', {
      providerId: 'p',
      recipeSlug: 'rice',
    });
    expect(preview.ingredients[0].quantity).toBeNull();
    expect(preview.ingredients[0].issues).toContain('linked_recipe');
    expect(preview.ingredients[0].issues).toContain('missing_quantity');
  });
  it('rejects stale source fingerprints on save', async () => {
    await expect(
      service.save('u', 'u', {
        providerId: 'p',
        recipeSlug: 'rice',
        sourceFingerprint: 'old',
        mappings: [mapping],
      })
    ).rejects.toMatchObject({ status: 409, code: 'REMOTE_CHANGED' });
    expect(m.save).not.toHaveBeenCalled();
  });
  it('rejects a mismatched food variant without saving', async () => {
    m.variant.mockResolvedValue({ ...variant, food_id: 'other' });
    await expect(
      service.save('u', 'u', {
        providerId: 'p',
        recipeSlug: 'rice',
        sourceFingerprint: recipeFingerprint(recipe),
        mappings: [mapping],
      })
    ).rejects.toMatchObject({ status: 422 });
    expect(m.save).not.toHaveBeenCalled();
  });
  it('normalizes a kg mapping to persisted grams before existing meal calculations', async () => {
    const kgRecipe = {
      ...recipe,
      recipeIngredient: [
        { ...recipe.recipeIngredient[0], quantity: 1, unit: { name: 'kg' } },
      ],
    };
    m.recipe.mockResolvedValue(kgRecipe);
    m.save.mockImplementation(async (_user, meal, source) => ({
      ...source,
      mealId: 'meal',
      mealFingerprint: mealFingerprint(meal),
      lastSyncedAt: null,
    }));
    const result = await service.save('u', 'u', {
      providerId: 'p',
      recipeSlug: 'rice',
      sourceFingerprint: recipeFingerprint(kgRecipe),
      mappings: [{ ...mapping, quantity: 1, unit: 'kg' }],
      finishedWeightGrams: 1800,
    });
    expect(result.nutrition.calories).toBe(4000);
    expect(m.save.mock.calls[0][1].foods[0]).toMatchObject({
      quantity: 1000,
      unit: 'g',
      serving_size: 100,
      calories: 400,
    });
    expect(result.servingSize).toBe(450);
  });
  it('leaves a custom 250ml cup unresolved instead of assuming the standard US cup', async () => {
    m.recipe.mockResolvedValue({
      ...recipe,
      recipeIngredient: [
        {
          ...recipe.recipeIngredient[0],
          quantity: 1,
          unit: {
            name: 'cup',
            standardUnit: 'milliliter',
            standardQuantity: 250,
          },
        },
      ],
    });
    const result = await service.preview('u', 'u', {
      providerId: 'p',
      recipeSlug: 'rice',
    });
    expect(result.ingredients[0].originalUnit).toBe('cup');
    expect(result.ingredients[0].unit).toBeNull();
    expect(result.ingredients[0].issues).toContain('missing_unit');
  });
  it('invalidates a saved food mapping when source food identity changes', async () => {
    const originalPreview = await service.preview('u', 'u', {
      providerId: 'p',
      recipeSlug: 'rice',
    });
    m.mappings.mockResolvedValue([
      {
        source_food_key: originalPreview.ingredients[0].sourceFoodKey,
        food_id: 'food',
        variant_id: 'variant',
        quantity_per_source_unit: 1,
        unit: 'g',
      },
    ]);
    m.recipe.mockResolvedValue({
      ...recipe,
      recipeIngredient: [
        {
          ...recipe.recipeIngredient[0],
          food: { id: 'potato', name: 'potato' },
        },
      ],
    });
    const result = await service.preview('u', 'u', {
      providerId: 'p',
      recipeSlug: 'rice',
    });
    expect(result.ingredients[0].mapping).toBeNull();
  });
});
describe('confirmed ingredient mapping context', () => {
  async function saveDryRiceMapping() {
    const dry = {
      ...recipe,
      recipeIngredient: [{ ...recipe.recipeIngredient[0], note: 'dry' }],
    };
    m.recipe.mockResolvedValue(dry);
    const initial = await service.preview('u', 'u', {
      providerId: 'p',
      recipeSlug: 'rice',
    });
    m.save.mockImplementation(async (_user, meal, source, remembered) => {
      m.mappings.mockResolvedValue(remembered);
      return {
        ...source,
        mealId: 'meal',
        mealFingerprint: mealFingerprint(meal),
        lastSyncedAt: null,
      };
    });
    await service.save('u', 'u', {
      providerId: 'p',
      recipeSlug: 'rice',
      sourceFingerprint: initial.sourceFingerprint,
      mappings: [mapping],
    });
    return dry;
  }
  it('requires fresh food review when a saved dry-rice ingredient becomes cooked', async () => {
    const dry = await saveDryRiceMapping();
    m.recipe.mockResolvedValue({
      ...dry,
      recipeIngredient: [{ ...dry.recipeIngredient[0], note: 'cooked' }],
    });
    const current = await service.preview('u', 'u', {
      providerId: 'p',
      recipeSlug: 'rice',
    });
    expect(current.ingredients[0].mapping).toBeNull();
    expect(current.ingredients[0].mappingOrigin).toBeNull();
    const suggestions = await service.suggest('u', 'u', {
      providerId: 'p',
      recipeSlug: 'rice',
      sourceFingerprint: current.sourceFingerprint,
      confirmedIngredientIds: [],
      useAi: false,
    });
    expect(suggestions.ingredients.map((row) => row.ingredientId)).toEqual([
      'i',
    ]);
  });
  it('requires fresh review when food text changes despite the same canonical food ID', async () => {
    const dry = await saveDryRiceMapping();
    m.recipe.mockResolvedValue({
      ...dry,
      recipeIngredient: [
        {
          ...dry.recipeIngredient[0],
          food: { id: 'rice', name: 'rice, cooked' },
        },
      ],
    });
    const current = await service.preview('u', 'u', {
      providerId: 'p',
      recipeSlug: 'rice',
    });
    expect(current.ingredients[0].mapping).toBeNull();
  });
  it('rescales a saved mapping after quantity-only changes with normalized unchanged context', async () => {
    const dry = await saveDryRiceMapping();
    m.recipe.mockResolvedValue({
      ...dry,
      recipeIngredient: [
        {
          ...dry.recipeIngredient[0],
          quantity: 900,
          note: '  DRY  ',
          food: { id: 'rice', name: '  Rice  ' },
        },
      ],
    });
    const current = await service.preview('u', 'u', {
      providerId: 'p',
      recipeSlug: 'rice',
    });
    expect(current.ingredients[0]).toMatchObject({
      mappingOrigin: 'saved',
      mapping: {
        foodId: 'food',
        variantId: 'variant',
        quantity: 900,
        unit: 'g',
        confirmed: true,
      },
    });
  });
  it('does not silently confirm a legacy context-free mapping', async () => {
    m.mappings.mockResolvedValue([
      {
        source_food_key: 'rice|g',
        food_id: 'food',
        variant_id: 'variant',
        quantity_per_source_unit: 1,
        unit: 'g',
      },
    ]);
    const current = await service.preview('u', 'u', {
      providerId: 'p',
      recipeSlug: 'rice',
    });
    expect(current.ingredients[0].mapping).toBeNull();
  });
});
describe('explicit safe nutrition sync', () => {
  const foods = [
    {
      variant_id: 'variant',
      item_type: 'food',
      quantity: 600,
      unit: 'g',
      ...variant,
    },
  ];
  beforeEach(() => {
    m.meal.mockResolvedValue({
      id: 'meal',
      user_id: 'u',
      foods,
      serving_size: 450,
      serving_unit: 'g',
      total_servings: 4,
    });
    m.source.mockResolvedValue({
      mealId: 'meal',
      providerId: 'p',
      recipeSlug: 'rice',
      sourceFingerprint: recipeFingerprint(recipe),
      recipeServings: 4,
      ingredients: [{ ingredientId: 'i', quantity: 600, unit: 'g' }],
      mappings: [mapping],
      mealFingerprint: mealFingerprint({ foods }),
      syncEligible: true,
      lastSyncedAt: null,
    });
  });
  it('reports current local eligibility without blessing the stored baseline or contacting Mealie', async () => {
    const baseline = await m.source();
    const unchanged = await service.getSource('u', 'u', 'meal');
    expect(unchanged.syncEligible).toBe(true);
    m.meal.mockResolvedValue({
      user_id: 'u',
      foods: [{ ...foods[0], quantity: 300 }],
    });
    const changed = await service.getSource('u', 'u', 'meal');
    expect(changed.syncEligible).toBe(false);
    expect(changed.mealFingerprint).toBe(baseline.mealFingerprint);
    expect(baseline.syncEligible).toBe(true);
    expect(m.provider).not.toHaveBeenCalled();
    expect(m.recipe).not.toHaveBeenCalled();
    expect(m.save).not.toHaveBeenCalled();
    expect(m.markSynced).not.toHaveBeenCalled();
    await expect(service.syncNutrition('u', 'u', 'meal')).rejects.toMatchObject(
      { status: 409, code: 'LOCAL_CHANGED' }
    );
    expect(m.patch).not.toHaveBeenCalled();
  });
  it('refuses sync for an unchanged legacy meal snapshot with unknown core nutrition', async () => {
    const incomplete = {
      user_id: 'u',
      foods: [{ ...foods[0], protein: null }],
    };
    const source = await m.source();
    m.meal.mockResolvedValue(incomplete);
    m.source.mockResolvedValue({
      ...source,
      mealFingerprint: mealFingerprint(incomplete),
    });
    await expect(service.syncNutrition('u', 'u', 'meal')).rejects.toMatchObject(
      { code: 'INCOMPLETE_NUTRITION' }
    );
    expect(m.patch).not.toHaveBeenCalled();
  });
  it('preserves an originally ineligible baseline even for an unchanged or renamed meal', async () => {
    const baseline = await m.source();
    m.source.mockResolvedValue({ ...baseline, syncEligible: false });
    m.meal.mockResolvedValue({ user_id: 'u', name: 'Renamed batch', foods });
    expect((await service.getSource('u', 'u', 'meal')).syncEligible).toBe(
      false
    );
    m.source.mockResolvedValue(baseline);
    expect((await service.getSource('u', 'u', 'meal')).syncEligible).toBe(true);
  });
  it('rejects remote source changes without sending nutrition', async () => {
    m.recipe.mockResolvedValue({ ...recipe, name: 'Changed' });
    await expect(service.syncNutrition('u', 'u', 'meal')).rejects.toMatchObject(
      { status: 409, code: 'REMOTE_CHANGED' }
    );
    expect(m.patch).not.toHaveBeenCalled();
  });
  it('syncs totals per original serving, never per cooked gram, and preserves source nutrient fields', async () => {
    m.patch.mockResolvedValue({
      ...recipe,
      nutrition: {
        calories: '600',
        proteinContent: '15',
        carbohydrateContent: '90',
        fatContent: '15',
      },
    });
    const result = await service.syncNutrition('u', 'u', 'meal');
    expect(result.status).toBe('synced');
    expect(m.patch).toHaveBeenCalledWith(
      'rice',
      {
        calories: '600',
        proteinContent: '15',
        carbohydrateContent: '90',
        fatContent: '15',
      },
      {}
    );
    expect(m.markSynced).toHaveBeenCalledOnce();
  });
  it.each([
    {
      change: 'ingredient quantity',
      returned: {
        ...recipe,
        recipeIngredient: [{ ...recipe.recipeIngredient[0], quantity: 700 }],
      },
    },
    { change: 'original servings', returned: { ...recipe, recipeServings: 8 } },
    {
      change: 'source identity',
      returned: { ...recipe, id: 'another-recipe' },
    },
  ])(
    'refuses to adopt changed $change returned after nutrition PATCH',
    async ({ returned }) => {
      const source = await m.source();
      m.patch.mockResolvedValue({
        ...returned,
        nutrition: {
          calories: '600',
          proteinContent: '15',
          carbohydrateContent: '90',
          fatContent: '15',
        },
      });
      await expect(
        service.syncNutrition('u', 'u', 'meal')
      ).rejects.toMatchObject({
        status: 409,
        code: 'REMOTE_CHANGED',
        message: expect.stringMatching(/write may already have occurred/i),
      });
      expect(m.markSynced).not.toHaveBeenCalled();
      expect(source.sourceFingerprint).toBe(recipeFingerprint(recipe));
      expect(source.lastSyncedAt).toBeNull();
    }
  );
  it('accepts unchanged returned recipe content with refreshed timestamps and regenerated instruction IDs', async () => {
    const preflight = {
      ...recipe,
      updatedAt: '2026-11-03T10:00:00Z',
      dateUpdated: '2026-11-03T10:00:00Z',
      recipeInstructions: [
        { id: 'old-step-id', title: 'Cook', text: 'Cook the rice.' },
      ],
    };
    const source = await m.source();
    m.source.mockResolvedValue({
      ...source,
      sourceFingerprint: recipeFingerprint(preflight),
    });
    m.recipe.mockResolvedValue(preflight);
    const returned = {
      ...preflight,
      updatedAt: '2026-11-03T11:00:00Z',
      dateUpdated: '2026-11-03T11:00:00Z',
      recipeInstructions: [
        { id: 'new-step-id', title: 'Cook', text: 'Cook the rice.' },
      ],
      nutrition: {
        calories: '600',
        proteinContent: '15',
        carbohydrateContent: '90',
        fatContent: '15',
      },
    };
    m.patch.mockResolvedValue(returned);
    const result = await service.syncNutrition('u', 'u', 'meal');
    expect(result.status).toBe('synced');
    expect(m.markSynced).toHaveBeenCalledOnce();
    expect(result.source.sourceFingerprint).toBe(recipeFingerprint(returned));
  });
  it('does not claim success when Mealie returns different nutrition', async () => {
    m.patch.mockResolvedValue({
      ...recipe,
      nutrition: {
        calories: '0',
        proteinContent: '15',
        carbohydrateContent: '90',
        fatContent: '15',
      },
    });
    await expect(service.syncNutrition('u', 'u', 'meal')).rejects.toMatchObject(
      { status: 502, code: 'PROVIDER_UNAVAILABLE' }
    );
    expect(m.markSynced).not.toHaveBeenCalled();
  });
  it.each(['', '   '])(
    'does not mistake a blank returned nutrient for confirmed zero (%j)',
    async (blank) => {
      const zeroMeal = {
        user_id: 'u',
        foods: [{ ...foods[0], calories: 0, protein: 0, carbs: 0, fat: 0 }],
      };
      m.meal.mockResolvedValue(zeroMeal);
      m.source.mockResolvedValue({
        ...(await m.source()),
        mealFingerprint: mealFingerprint(zeroMeal),
      });
      m.patch.mockResolvedValue({
        ...recipe,
        nutrition: {
          calories: blank,
          proteinContent: '0',
          carbohydrateContent: '0',
          fatContent: '0',
        },
      });
      await expect(
        service.syncNutrition('u', 'u', 'meal')
      ).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
      expect(m.markSynced).not.toHaveBeenCalled();
    }
  );
  it('rejects unknown original quantities even when a complete manual tracking meal exists', async () => {
    const source = await m.source();
    m.source.mockResolvedValue({ ...source, syncEligible: false });
    await expect(service.syncNutrition('u', 'u', 'meal')).rejects.toMatchObject(
      { status: 422, code: 'SYNC_UNAVAILABLE' }
    );
    expect(m.patch).not.toHaveBeenCalled();
  });
  it('rejects local ingredient quantity edits without sending nutrition', async () => {
    m.meal.mockResolvedValue({
      id: 'meal',
      user_id: 'u',
      foods: [{ ...foods[0], quantity: 700 }],
    });
    await expect(service.syncNutrition('u', 'u', 'meal')).rejects.toMatchObject(
      { status: 409, code: 'LOCAL_CHANGED' }
    );
    expect(m.patch).not.toHaveBeenCalled();
  });
});

describe('private sync baselines and strict public compatibility', () => {
  const id = '00000000-0000-4000-a000-000000000001';
  const initial = {
    ...recipe,
    nutrition: { calories: '1', sodiumContent: '12', fiberContent: null },
    recipeInstructions: [
      {
        id: 'step',
        title: 'Cook',
        text: 'Cook rice',
        ingredientReferences: ['i'],
      },
    ],
  };
  async function imported() {
    m.recipe.mockResolvedValue(initial);
    m.variant.mockResolvedValue({ ...variant, id, food_id: id });
    m.save.mockImplementation(async (_user, meal, source) => {
      m.meal.mockResolvedValue({ ...meal, user_id: 'u' });
      const stored = {
        ...source,
        mealId: id,
        mealFingerprint: mealFingerprint(meal),
        lastSyncedAt: null,
      };
      m.source.mockResolvedValue(stored);
      return stored;
    });
    m.markSynced.mockImplementation(async (_user, source) => {
      m.source.mockResolvedValue(source);
    });
    m.patch.mockImplementation(async (_slug, patch, nutrition) => {
      const updated = { ...initial, nutrition: { ...nutrition, ...patch } };
      m.recipe.mockResolvedValue(updated);
      return updated;
    });
    return service.save('u', 'u', {
      providerId: id,
      recipeSlug: 'rice',
      sourceFingerprint: recipeFingerprint(initial),
      mappings: [{ ...mapping, foodId: id, variantId: id }],
    });
  }
  it('accepts comments and timestamps, refreshes the successful baseline, and hides it from every strict public response', async () => {
    const saved = await imported();
    expect(recipeImportSourceSchema.safeParse(saved.source).success).toBe(true);
    expect(saved.source).not.toHaveProperty('syncBaseline');
    expect(await m.source()).toHaveProperty('syncBaseline.version', 1);
    m.recipe.mockResolvedValue({
      ...initial,
      comments: [{ text: 'Nice recipe' }],
      updatedAt: 'later',
      dateUpdated: 'later',
    });
    const read = await service.getSource('u', 'u', id);
    expect(recipeImportSourceSchema.safeParse(read).success).toBe(true);
    expect(read).not.toHaveProperty('syncBaseline');
    const first = await service.syncNutrition('u', 'u', id);
    expect(recipeImportSourceSchema.safeParse(first.source).success).toBe(true);
    expect(first.source).not.toHaveProperty('syncBaseline');
    const second = await service.syncNutrition('u', 'u', id);
    expect(second.status).toBe('synced');
    expect(m.patch).toHaveBeenCalledTimes(2);
    expect(m.markSynced).toHaveBeenCalledTimes(2);
    m.source.mockResolvedValue({ ...(await m.source()), syncEligible: false });
    expect(await service.getSource('u', 'u', id)).not.toHaveProperty(
      'syncBaseline'
    );
  });
  it.each([
    { name: 'identity', change: { id: 'other' } },
    { name: 'servings', change: { recipeServings: 8 } },
    {
      name: 'ingredient amount',
      change: {
        recipeIngredient: [{ ...recipe.recipeIngredient[0], quantity: 700 }],
      },
    },
    {
      name: 'preparation',
      change: {
        recipeIngredient: [
          { ...recipe.recipeIngredient[0], originalText: 'dry' },
        ],
      },
    },
    {
      name: 'instruction',
      change: { recipeInstructions: [{ text: 'Different preparation' }] },
    },
    {
      name: 'instruction references',
      change: {
        recipeInstructions: [
          { ...initial.recipeInstructions[0], ingredientReferences: ['other'] },
        ],
      },
    },
    {
      name: 'core nutrition',
      change: { nutrition: { ...initial.nutrition, calories: '2' } },
    },
    {
      name: 'preserved optional nutrition',
      change: { nutrition: { ...initial.nutrition, sodiumContent: '99' } },
    },
  ])('rejects $name edits before writing', async ({ change }) => {
    await imported();
    m.recipe.mockResolvedValue({ ...initial, ...change });
    await expect(service.syncNutrition('u', 'u', id)).rejects.toMatchObject({
      code: 'REMOTE_CHANGED',
    });
    expect(m.patch).not.toHaveBeenCalled();
  });
  it('retains safe raw-fingerprint fallback for old provenance without reconstructing unknown content', async () => {
    await imported();
    const { syncBaseline: _baseline, ...legacy } = await m.source();
    m.source.mockResolvedValue(legacy);
    expect(
      recipeImportSourceSchema.safeParse(await service.getSource('u', 'u', id))
        .success
    ).toBe(true);
    m.recipe.mockResolvedValue({ ...initial, comments: ['new'] });
    await expect(service.syncNutrition('u', 'u', id)).rejects.toMatchObject({
      code: 'REMOTE_CHANGED',
    });
    expect(m.patch).not.toHaveBeenCalled();
    m.recipe.mockResolvedValue(initial);
    expect((await service.syncNutrition('u', 'u', id)).status).toBe('synced');
  });
  it('reports a confirmed remote write with failed local persistence safely and refuses a blind repeat', async () => {
    await imported();
    m.markSynced.mockRejectedValue(
      new Error('private database connection details')
    );
    await expect(service.syncNutrition('u', 'u', id)).rejects.toMatchObject({
      status: 502,
      code: 'SYNC_RECORD_FAILED',
      message:
        'Mealie confirmed the nutrition update, but SparkyFitness could not record it. Check Mealie and import its current unchanged recipe as a new base meal before syncing again.',
    });
    expect((await m.recipe()).nutrition.calories).toBe('600');
    await expect(service.syncNutrition('u', 'u', id)).rejects.toMatchObject({
      code: 'REMOTE_CHANGED',
    });
    expect(m.patch).toHaveBeenCalledOnce();
  });
  it('refuses a returned change to optional nutrition that the sync should preserve', async () => {
    await imported();
    m.patch.mockImplementation(async (_slug, patch) => ({
      ...initial,
      nutrition: { ...initial.nutrition, ...patch, sodiumContent: '99' },
    }));
    await expect(service.syncNutrition('u', 'u', id)).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    });
    expect(m.markSynced).not.toHaveBeenCalled();
  });
});

describe('candidate-only optional AI', () => {
  beforeEach(() => {
    m.local.mockResolvedValue(
      new Map([
        [
          'i',
          [
            {
              variant_id: 'variant',
              food_name: 'Rice',
              brand: null,
              ...variant,
            },
          ],
        ],
      ])
    );
    m.activeAi.mockResolvedValue({ id: 'ai' });
    m.aiConfig.mockResolvedValue({
      service_type: 'openai',
      api_key: 'fixture',
    });
  });
  it('returns retrieved candidates but drops invented AI identities and nutrients', async () => {
    m.dispatch.mockResolvedValue({
      ok: true,
      json: {
        choices: [
          { ingredientId: 'i', candidateId: 'invented', calories: 999999 },
        ],
      },
    });
    const result = await service.suggest('u', 'u', {
      providerId: 'p',
      recipeSlug: 'rice',
      sourceFingerprint: recipeFingerprint(recipe),
      confirmedIngredientIds: [],
      useAi: true,
    });
    expect(result.ingredients[0].candidates[0].nutrition.calories).toBe(400);
    expect(result.ingredients[0].suggestedCandidateId).toBeNull();
    expect(m.save).not.toHaveBeenCalled();
  });
  it('suggests only an actual candidate ID without changing nutrient values', async () => {
    m.dispatch.mockResolvedValue({
      ok: true,
      json: {
        choices: [
          {
            ingredientId: 'i',
            candidateId: 'local:food:variant',
            calories: 999999,
          },
        ],
      },
    });
    const result = await service.suggest('u', 'u', {
      providerId: 'p',
      recipeSlug: 'rice',
      sourceFingerprint: recipeFingerprint(recipe),
      confirmedIngredientIds: [],
      useAi: true,
    });
    expect(result.ingredients[0].suggestedCandidateId).toBe(
      'local:food:variant'
    );
    expect(result.ingredients[0].candidates[0].nutrition.calories).toBe(400);
  });
  it('does not offer replacements for client-confirmed ingredients', async () => {
    const result = await service.suggest('u', 'u', {
      providerId: 'p',
      recipeSlug: 'rice',
      sourceFingerprint: recipeFingerprint(recipe),
      confirmedIngredientIds: ['i'],
      useAi: true,
    });
    expect(result.ingredients).toEqual([]);
    expect(m.dispatch).not.toHaveBeenCalled();
  });
});
