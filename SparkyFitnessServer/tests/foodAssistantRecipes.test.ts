import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  foodAssistantCheckpointSchema,
  foodAssistantTaskSchema,
  type FoodAssistantTask,
} from '@workspace/shared';
import type { PoolClient } from 'pg';
import * as recipes from '../services/foodAssistantRecipeService.js';
import * as tasks from '../models/foodAssistantRepository.js';
import foodRepository from '../models/foodRepository.js';
import mealRepository from '../models/mealRepository.js';
import mealService from '../services/mealService.js';
import { fetchProviderFoodDetails } from '../services/foodProviderDetailService.js';
import { mapFatSecretFood } from '../integrations/fatsecret/fatsecretService.js';
import * as library from '../models/foodAssistantLibraryRepository.js';
vi.mock('../models/foodAssistantLibraryRepository.js', async (original) => ({
  ...(await original<
    typeof import('../models/foodAssistantLibraryRepository.js')
  >()),
  readFoodLibrary: vi.fn(),
}));

vi.mock('../models/foodRepository.js', () => ({
  default: {
    getFoodById: vi.fn(),
    findFoodByProviderExternalId: vi.fn(),
    createFoodWithClient: vi.fn(),
    createFoodVariant: vi.fn(),
  },
}));
vi.mock('../models/mealRepository.js', () => ({
  default: {
    getMealById: vi.fn(),
    updateMeal: vi.fn(),
    deleteMeal: vi.fn(),
    recipeHasDependants: vi.fn(),
  },
}));
vi.mock('../services/mealService.js', () => ({
  default: { createMeal: vi.fn() },
}));
vi.mock('../services/foodProviderDetailService.js', () => ({
  fetchProviderFoodDetails: vi.fn(),
}));
vi.mock('../models/foodAssistantRepository.js', async (original) => ({
  ...(await original<typeof import('../models/foodAssistantRepository.js')>()),
  getTask: vi.fn(),
  createTask: vi.fn(),
  mutateTask: vi.fn(),
  replayTaskMutation: vi.fn(),
}));
const userId = randomUUID(),
  taskId = randomUUID(),
  ingredientId = randomUUID();
const foodId = randomUUID(),
  variantId = randomUUID(),
  mealId = randomUUID();
const operationId = randomUUID();
const query = vi.fn();
const client = { query } as unknown as PoolClient;
const variant = {
  id: variantId,
  serving_size: 1,
  serving_unit: 'slice',
  calories: 80,
  protein: 3,
  carbs: 15,
  fat: 1,
  source: 'imported',
  is_default: true,
};
const food = { id: foodId, name: 'White bread', variants: [variant] };
const ingredient = {
  id: ingredientId,
  description: '2 slices white bread',
  quantity: 2,
  unit: 'slice',
  food_id: foodId,
  variant_id: variantId,
  status: 'verified',
  evidence: [],
};
function checkpoint(rows: unknown[] = [ingredient]) {
  return foodAssistantCheckpointSchema.parse({
    summary: 'Test recipe',
    ingredients: rows,
    recipe: { name: 'Bread meal', servings: 2 },
  });
}
function task(state = checkpoint()) {
  return foodAssistantTaskSchema.parse({
    id: taskId,
    user_id: userId,
    kind: 'recipe',
    title: 'Bread meal',
    status: 'draft',
    checkpoint: state,
    creation_hash: 'test',
    version: 1,
    result: null,
    created_at: new Date(),
    updated_at: new Date(),
  });
}
const command = { operation_id: operationId, expected_version: 1 };
const providerCommand = {
  ...command,
  ingredient_id: ingredientId,
  provider_type: 'fatsecret',
  external_id: 'selected-123',
};
const savedRecipe = {
  id: mealId,
  user_id: userId,
  name: 'Bread meal',
  serving_size: 1,
  serving_unit: 'serving',
  total_servings: 2,
  updated_at: new Date(),
  foods: [
    {
      ...variant,
      id: randomUUID(),
      food_id: foodId,
      variant_id: variantId,
      food_name: food.name,
      quantity: 2,
      unit: 'slice',
    },
  ],
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(tasks.getTask).mockResolvedValue(task());
  vi.mocked(tasks.replayTaskMutation).mockResolvedValue(null);
  vi.mocked(foodRepository.getFoodById).mockResolvedValue(food);
  vi.mocked(foodRepository.findFoodByProviderExternalId).mockResolvedValue(
    null
  );
  vi.mocked(foodRepository.createFoodWithClient).mockResolvedValue({
    id: foodId,
    name: food.name,
    default_variant: variant,
  });
  vi.mocked(fetchProviderFoodDetails).mockResolvedValue({
    name: food.name,
    provider_external_id: 'selected-123',
    variants: [variant],
    default_variant: variant,
  });
  vi.mocked(mealService.createMeal).mockResolvedValue({ id: mealId });
  vi.mocked(mealRepository.getMealById).mockResolvedValue(savedRecipe);
});
async function invokeMutation() {
  const callback = vi.mocked(tasks.mutateTask).mock.calls.at(-1)![2];
  return callback((await tasks.getTask(userId, taskId))!, client);
}
describe('exact provider library import', () => {
  it('completes a single-food task with the verified source receipt and reversible full snapshots', async () => {
    const current = { ...task(), kind: 'food' as const };
    vi.mocked(tasks.getTask).mockResolvedValue(current);
    const after = {
      food: {
        id: foodId,
        user_id: userId,
        name: food.name,
        shared_with_public: false,
      },
      variants: [{ ...variant, food_id: foodId }],
    };
    vi.mocked(library.readFoodLibrary).mockResolvedValue(after);
    await recipes.importProviderIngredient(userId, taskId, providerCommand);
    const result = await invokeMutation();
    expect(result.status).toBe('complete');
    expect(result.result).toMatchObject({
      kind: 'food_import',
      publication_operation_id: operationId,
      food_id: foodId,
      before: null,
      after,
      source: { provider: 'fatsecret', external_id: 'selected-123' },
      selected_variant_id: variantId,
    });
    expect(result.checkpoint.ingredients[0]).toMatchObject({
      quantity: 2,
      unit: 'slice',
      food_id: foodId,
      variant_id: variantId,
      status: 'verified',
    });
  });
  it('captures and locks existing owned variants before importing an additional source serving', async () => {
    vi.mocked(tasks.getTask).mockResolvedValue({ ...task(), kind: 'food' });
    vi.mocked(foodRepository.findFoodByProviderExternalId).mockResolvedValue({
      id: foodId,
    });
    const before = {
      food: { id: foodId, user_id: userId, name: food.name },
      variants: [variant],
    };
    vi.mocked(library.readFoodLibrary).mockResolvedValue(before);
    await recipes.importProviderIngredient(userId, taskId, providerCommand);
    const result = await invokeMutation();
    expect(library.readFoodLibrary).toHaveBeenCalledWith(
      userId,
      foodId,
      client,
      true
    );
    expect(result.result).toMatchObject({ before });
  });
  it('refuses incomplete multi-food library tasks and failed persisted readback', async () => {
    vi.mocked(tasks.getTask).mockResolvedValue({
      ...task(checkpoint([ingredient, { ...ingredient, id: randomUUID() }])),
      kind: 'food',
    });
    await expect(
      recipes.importProviderIngredient(userId, taskId, providerCommand)
    ).rejects.toThrow(/exactly one/);
    expect(fetchProviderFoodDetails).not.toHaveBeenCalled();
    vi.mocked(tasks.getTask).mockResolvedValue({ ...task(), kind: 'food' });
    vi.mocked(library.readFoodLibrary).mockResolvedValue(null);
    await recipes.importProviderIngredient(userId, taskId, providerCommand);
    await expect(invokeMutation()).rejects.toThrow(/readback/);
  });
});
describe('recipe calculation and publication', () => {
  it('uses the verified slice reference for two slices and divides the batch by the confirmed yield', async () => {
    const result = await recipes.resolveRecipeCheckpoint(userId, checkpoint());
    expect(result.issues).toEqual([]);
    expect(result.nutrition.batch.calories).toBe(160);
    expect(result.nutrition.per_serving.calories).toBe(80);
    expect(result.nutrition.batch.sodium).toBeNull();
    expect(result.ingredients[0]).toMatchObject({
      quantity: 2,
      serving_size: 1,
      serving_unit: 'slice',
    });
  });
  it('preserves unresolved ingredients and shows only a partial subtotal, never a complete total', async () => {
    const unknown = {
      id: randomUUID(),
      description: 'Water as needed',
      status: 'unresolved',
    };
    const result = await recipes.resolveRecipeCheckpoint(
      userId,
      checkpoint([ingredient, unknown])
    );
    expect(result.nutrition.incomplete).toBe(true);
    expect(result.nutrition.batch.calories).toBeNull();
    expect(result.nutrition.known_subtotal.calories).toBe(160);
    expect(result.issues[0].description).toBe('Water as needed');
  });
  it('does not guess a count-to-gram conversion or use a variant owned by another food', async () => {
    vi.mocked(foodRepository.getFoodById).mockResolvedValue({
      ...food,
      variants: [{ ...variant, serving_size: 100, serving_unit: 'g' }],
    });
    expect(
      (await recipes.resolveRecipeCheckpoint(userId, checkpoint())).issues[0]
        .message
    ).toContain('Cannot safely convert');
    expect(
      (
        await recipes.resolveRecipeCheckpoint(
          userId,
          checkpoint([{ ...ingredient, variant_id: randomUUID() }])
        )
      ).issues[0].message
    ).toContain('does not belong');
  });
  it('blocks impossible energy and missing core nutrients instead of writing zeros', async () => {
    vi.mocked(foodRepository.getFoodById).mockResolvedValue({
      ...food,
      variants: [{ ...variant, calories: 2, carbs: 70 }],
    });
    expect(
      (await recipes.resolveRecipeCheckpoint(userId, checkpoint())).issues[0]
        .message
    ).toContain('disagree');
    vi.mocked(foodRepository.getFoodById).mockResolvedValue({
      ...food,
      variants: [{ ...variant, protein: null }],
    });
    expect(
      (await recipes.resolveRecipeCheckpoint(userId, checkpoint())).issues[0]
        .message
    ).toContain('incomplete');
  });
  it('writes and reads back every ingredient snapshot using the same transaction client', async () => {
    await recipes.publishRecipe(userId, taskId, command);
    const after = await invokeMutation();
    expect(after.status).toBe('complete');
    expect(after.result).toMatchObject({
      meal_id: mealId,
      nutrition: { batch: { calories: 160 } },
    });
    expect(mealService.createMeal).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({
        is_public: false,
        foods: [
          expect.objectContaining({
            calories: 80,
            quantity: 2,
            variant_id: variantId,
          }),
        ],
      }),
      client
    );
    expect(foodRepository.getFoodById).toHaveBeenCalledWith(
      foodId,
      userId,
      client,
      true
    );
    expect(mealRepository.getMealById).toHaveBeenCalledWith(
      mealId,
      userId,
      client
    );
  });
  it('fails readback if an ingredient ID, portion or nutrient differs', async () => {
    for (const changed of [
      { calories: 5 },
      { quantity: 0.02 },
      { variant_id: randomUUID() },
    ]) {
      vi.mocked(mealRepository.getMealById).mockResolvedValue({
        ...savedRecipe,
        foods: [{ ...savedRecipe.foods[0], ...changed }],
      });
      await recipes.publishRecipe(userId, taskId, command);
      await expect(invokeMutation()).rejects.toThrow('readback did not match');
    }
  });
  it('does not publish unresolved drafts or update a stale or foreign recipe', async () => {
    vi.mocked(tasks.getTask).mockResolvedValue(
      task(
        checkpoint([
          {
            id: ingredientId,
            description: 'Unresolved bread',
            status: 'unresolved',
          },
        ])
      )
    );
    await recipes.publishRecipe(userId, taskId, command);
    await expect(invokeMutation()).rejects.toThrow('Nothing was published');
    expect(mealService.createMeal).not.toHaveBeenCalled();
    vi.mocked(tasks.getTask).mockResolvedValue(task());
    await recipes.publishRecipe(userId, taskId, {
      ...command,
      meal_id: mealId,
      expected_meal_updated_at: '2000-01-01T00:00:00.000Z',
    });
    await expect(invokeMutation()).rejects.toThrow('changed or belongs');
    expect(mealRepository.updateMeal).not.toHaveBeenCalled();
  });
  it('preserves an existing recipe portion unit while changing its ingredients', async () => {
    const weighedRecipe = {
      ...savedRecipe,
      serving_size: 100,
      serving_unit: 'g',
    };
    vi.mocked(mealRepository.getMealById).mockResolvedValue(weighedRecipe);
    vi.mocked(mealRepository.updateMeal).mockResolvedValue({ id: mealId });
    await recipes.publishRecipe(userId, taskId, {
      ...command,
      meal_id: mealId,
      expected_meal_updated_at: savedRecipe.updated_at.toISOString(),
    });
    expect((await invokeMutation()).status).toBe('complete');
    expect(mealRepository.updateMeal).toHaveBeenCalledWith(
      mealId,
      userId,
      expect.objectContaining({ serving_size: 100, serving_unit: 'g' }),
      client
    );
  });
  it('requires the current user to explicitly accept estimated ingredients', async () => {
    vi.mocked(foodRepository.getFoodById).mockResolvedValue({
      ...food,
      variants: [{ ...variant, source: 'ai_estimate' }],
    });
    await recipes.publishRecipe(
      userId,
      taskId,
      { ...command, estimate_source_quote: 'Use estimates' },
      'Save recipe'
    );
    await expect(invokeMutation()).rejects.toThrow('estimates are acceptable');
    await recipes.publishRecipe(
      userId,
      taskId,
      { ...command, estimate_source_quote: 'Use estimates' },
      'Use estimates'
    );
    expect((await invokeMutation()).status).toBe('complete');
  });
  it('retains every source line and original yield with unknown quantities in a resumable draft', async () => {
    await recipes.draftFromSource(
      userId,
      {
        name: 'Bread',
        ingredients: ['250 g flour', 'Water as needed'],
        yield: '2 loaves',
        instructions: 'Mix and bake',
      },
      'https://example.com/original',
      taskId,
      'https://example.com/start',
      0
    );
    const created = vi.mocked(tasks.createTask).mock.calls[0][1];
    expect(created.checkpoint.ingredients).toHaveLength(2);
    expect(created.checkpoint.ingredients[1]).toMatchObject({
      description: 'Water as needed',
      quantity: null,
      unit: null,
    });
    expect(created.checkpoint.recipe).toMatchObject({
      servings: null,
      source_yield: '2 loaves',
    });
    expect(created.origin).toEqual({
      type: 'recipe_url',
      url: 'https://example.com/start',
      card_index: 0,
    });
  });
});
describe('conflict-safe recipe undo', () => {
  const undoCommand = {
    ...command,
    publication_operation_id: randomUUID(),
    source_quote: 'Undo that recipe',
  };
  function completedRecipe(before: typeof savedRecipe | null = null) {
    return foodAssistantTaskSchema.parse({
      ...task(),
      status: 'complete',
      result: JSON.parse(
        JSON.stringify({
          kind: 'recipe',
          publication_operation_id: undoCommand.publication_operation_id,
          before,
          after: savedRecipe,
        })
      ),
    });
  }
  it('deletes an unused creation only after a global dependency check and verifies its absence', async () => {
    vi.mocked(tasks.getTask).mockResolvedValue(completedRecipe());
    vi.mocked(mealRepository.recipeHasDependants).mockResolvedValue(false);
    vi.mocked(mealRepository.deleteMeal).mockResolvedValue(true);
    vi.mocked(mealRepository.getMealById)
      .mockResolvedValueOnce(savedRecipe)
      .mockResolvedValueOnce(undefined);
    await recipes.undoRecipe(userId, taskId, undoCommand, 'Undo that recipe');
    const result = await invokeMutation();
    expect(result.result).toMatchObject({ kind: 'recipe_undo', after: null });
    expect(mealRepository.recipeHasDependants).toHaveBeenCalledWith(
      client,
      mealId
    );
    expect(mealRepository.deleteMeal).toHaveBeenCalledWith(
      mealId,
      userId,
      client
    );
  });
  it('blocks creation undo when a diary, plan, recipe or favorite now uses the recipe', async () => {
    vi.mocked(tasks.getTask).mockResolvedValue(completedRecipe());
    vi.mocked(mealRepository.recipeHasDependants).mockResolvedValue(true);
    await recipes.undoRecipe(userId, taskId, undoCommand, 'Undo that recipe');
    await expect(invokeMutation()).rejects.toThrow('now used');
    expect(mealRepository.deleteMeal).not.toHaveBeenCalled();
  });
  it('blocks changed ingredient snapshots even if the recipe timestamp was unchanged', async () => {
    vi.mocked(tasks.getTask).mockResolvedValue(completedRecipe());
    vi.mocked(mealRepository.getMealById).mockResolvedValue({
      ...savedRecipe,
      foods: [{ ...savedRecipe.foods[0], calories: 5 }],
    });
    await recipes.undoRecipe(userId, taskId, undoCommand, 'Undo that recipe');
    await expect(invokeMutation()).rejects.toThrow('overwrite newer work');
    expect(mealRepository.recipeHasDependants).not.toHaveBeenCalled();
    expect(mealRepository.deleteMeal).not.toHaveBeenCalled();
  });
  it('restores an edited recipe and every previous snapshot on the transaction client', async () => {
    const before = {
      ...savedRecipe,
      name: 'Previous recipe',
      total_servings: 4,
    };
    vi.mocked(tasks.getTask).mockResolvedValue(completedRecipe(before));
    vi.mocked(mealRepository.getMealById)
      .mockResolvedValueOnce(savedRecipe)
      .mockResolvedValueOnce(before);
    await recipes.undoRecipe(userId, taskId, undoCommand, 'Undo that recipe');
    expect((await invokeMutation()).result).toMatchObject({
      kind: 'recipe_undo',
      after: { name: 'Previous recipe', total_servings: 4 },
    });
    expect(mealRepository.updateMeal).toHaveBeenCalledWith(
      mealId,
      userId,
      expect.objectContaining({
        name: 'Previous recipe',
        foods: [
          expect.objectContaining({
            calories: 80,
            quantity: 2,
            variant_id: variantId,
          }),
        ],
      }),
      client
    );
  });
  it('requires the requested publication and an explicit current user undo instruction', async () => {
    await recipes.undoRecipe(userId, taskId, undoCommand, 'Save recipe');
    await expect(invokeMutation()).rejects.toThrow('explicit request');
    expect(mealRepository.deleteMeal).not.toHaveBeenCalled();
    vi.mocked(tasks.getTask).mockResolvedValue(completedRecipe());
    await recipes.undoRecipe(
      userId,
      taskId,
      { ...undoCommand, publication_operation_id: randomUUID() },
      'Undo that recipe'
    );
    await expect(invokeMutation()).rejects.toThrow('current completed');
    expect(mealRepository.updateMeal).not.toHaveBeenCalled();
  });
  it('returns a committed undo on retry without requiring a fresh authorization quote', async () => {
    const replay = { id: operationId } as Awaited<
      ReturnType<typeof tasks.mutateTask>
    >;
    vi.mocked(tasks.mutateTask).mockResolvedValue(replay);
    expect(
      await recipes.undoRecipe(userId, taskId, undoCommand, 'What happened?')
    ).toBe(replay);
    expect(mealRepository.deleteMeal).not.toHaveBeenCalled();
  });
});

describe('exact provider ingredient imports', () => {
  it('imports two large slices using the actual FatSecret mapper and retains its serving ID', async () => {
    const source = mapFatSecretFood({
      food: {
        food_id: 'selected-123',
        food_name: 'White bread',
        servings: {
          serving: {
            serving_id: '38632',
            serving_description: '1 large slice',
            measurement_description: 'slice large',
            number_of_units: '1',
            metric_serving_amount: '30',
            metric_serving_unit: 'g',
            calories: '80',
            protein: '3',
            carbohydrate: '15',
            fat: '1',
            is_default: '1',
          },
        },
      },
    });
    if (!source) throw new Error('Expected full FatSecret details');
    vi.mocked(fetchProviderFoodDetails).mockResolvedValue(source);
    vi.mocked(tasks.getTask).mockResolvedValue(
      task(checkpoint([{ ...ingredient, unit: 'large slices' }]))
    );
    vi.mocked(foodRepository.getFoodById).mockResolvedValue({
      ...food,
      variants: [{ ...variant, serving_unit: 'slice large' }],
    });
    await recipes.importProviderIngredient(userId, taskId, {
      ...providerCommand,
      serving_id: '38632',
    });
    const after = await invokeMutation();
    expect(after.checkpoint.ingredients[0]).toMatchObject({
      quantity: 2,
      unit: 'slice large',
      evidence: [
        expect.objectContaining({
          serving_id: '38632',
          external_id: 'selected-123',
        }),
      ],
    });
    expect(foodRepository.createFoodWithClient).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        serving_size: 1,
        serving_unit: 'slice large',
        calories: 80,
      })
    );
  });
  it('rejects an unavailable serving ID before any library or checkpoint write', async () => {
    await expect(
      recipes.importProviderIngredient(userId, taskId, {
        ...providerCommand,
        serving_id: 'missing',
      })
    ).rejects.toThrow('serving is no longer available');
    expect(tasks.mutateTask).not.toHaveBeenCalled();
    expect(foodRepository.createFoodWithClient).not.toHaveBeenCalled();
  });
  it('replays committed work without contacting the provider or repeating a library write', async () => {
    const replay = { id: operationId } as Awaited<
      ReturnType<typeof tasks.mutateTask>
    >;
    vi.mocked(tasks.replayTaskMutation).mockResolvedValue(replay);
    vi.mocked(fetchProviderFoodDetails).mockRejectedValue(new Error('offline'));
    expect(
      await recipes.importProviderIngredient(userId, taskId, providerCommand)
    ).toBe(replay);
    expect(fetchProviderFoodDetails).not.toHaveBeenCalled();
    expect(tasks.mutateTask).not.toHaveBeenCalled();
  });
  it('pins the exact ID and provider credentials, saves the source reference and checkpoints it atomically', async () => {
    const providerId = randomUUID();
    await recipes.importProviderIngredient(userId, taskId, {
      ...providerCommand,
      provider_id: providerId,
    });
    expect(fetchProviderFoodDetails).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialUserId: userId,
        dataUserId: userId,
        externalId: 'selected-123',
        providerId,
      })
    );
    const after = await invokeMutation();
    expect(after.status).toBe('draft');
    expect(after.checkpoint.ingredients[0]).toMatchObject({
      quantity: 2,
      unit: 'slice',
      food_id: foodId,
      variant_id: variantId,
      status: 'verified',
      evidence: [
        expect.objectContaining({
          external_id: 'selected-123',
          source: 'provider',
        }),
      ],
    });
    expect(foodRepository.createFoodWithClient).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        serving_size: 1,
        calories: 80,
        sodium: null,
        shared_with_public: false,
      })
    );
  });
  it('carries custom nutrients and allergy metadata from the source without replacing the user-edited default', async () => {
    const enriched = {
      ...variant,
      custom_nutrients: { 'Vitamin B12': 2 },
      allergens: ['wheat'],
      traces: ['milk'],
      glycemic_index: 'High',
    };
    vi.mocked(fetchProviderFoodDetails).mockResolvedValue({
      name: food.name,
      provider_external_id: 'selected-123',
      variants: [enriched],
    });
    vi.mocked(foodRepository.getFoodById).mockResolvedValue({
      ...food,
      variants: [enriched],
    });
    await recipes.importProviderIngredient(userId, taskId, providerCommand);
    await invokeMutation();
    expect(foodRepository.createFoodWithClient).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        custom_nutrients: { 'Vitamin B12': 2 },
        allergens: ['wheat'],
        traces: ['milk'],
        glycemic_index: 'High',
      })
    );
  });
  it('rejects substituted provider IDs, incompatible portions and incomplete nutrition before any write', async () => {
    vi.mocked(fetchProviderFoodDetails).mockResolvedValue({
      name: food.name,
      provider_external_id: 'other',
      variants: [variant],
    });
    await expect(
      recipes.importProviderIngredient(userId, taskId, providerCommand)
    ).rejects.toThrow('exact provider');
    vi.mocked(fetchProviderFoodDetails).mockResolvedValue({
      name: food.name,
      provider_external_id: 'selected-123',
      variants: [{ ...variant, serving_unit: 'g', serving_size: 100 }],
    });
    await expect(
      recipes.importProviderIngredient(userId, taskId, providerCommand)
    ).rejects.toThrow('Cannot safely convert');
    vi.mocked(fetchProviderFoodDetails).mockResolvedValue({
      name: food.name,
      provider_external_id: 'selected-123',
      variants: [{ ...variant, calories: null }],
    });
    await expect(
      recipes.importProviderIngredient(userId, taskId, providerCommand)
    ).rejects.toThrow('incomplete');
    expect(tasks.mutateTask).not.toHaveBeenCalled();
  });
  it('requires a confirmed quantity before source I/O', async () => {
    vi.mocked(tasks.getTask).mockResolvedValue(
      task(
        checkpoint([
          { id: ingredientId, description: 'Bread', status: 'unresolved' },
        ])
      )
    );
    await expect(
      recipes.importProviderIngredient(userId, taskId, providerCommand)
    ).rejects.toThrow('quantity and unit');
    expect(fetchProviderFoodDetails).not.toHaveBeenCalled();
  });
  it('reuses an identical imported variant without changing a user-edited default', async () => {
    vi.mocked(foodRepository.findFoodByProviderExternalId).mockResolvedValue({
      id: foodId,
    });
    await recipes.importProviderIngredient(userId, taskId, providerCommand);
    const after: FoodAssistantTask = await invokeMutation();
    expect(after.checkpoint.ingredients[0].variant_id).toBe(variantId);
    expect(foodRepository.createFoodWithClient).not.toHaveBeenCalled();
    expect(foodRepository.createFoodVariant).not.toHaveBeenCalled();
  });
});
