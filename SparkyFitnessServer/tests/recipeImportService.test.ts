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
    m.mappings.mockResolvedValue([
      {
        source_food_key: 'rice|g',
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
    m.mappings.mockResolvedValue([
      {
        source_food_key: 'rice|g',
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
