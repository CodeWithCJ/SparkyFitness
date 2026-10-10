import { beforeEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { foodAssistantTaskSchema } from '@workspace/shared';
import { buildRecipeTools } from '../ai/tools/recipeTools.js';
import * as repository from '../models/foodAssistantRepository.js';
import * as source from '../utils/recipeSource.js';
import * as image from '../services/recipeImageService.js';
import * as recipes from '../services/foodAssistantRecipeService.js';
import { toolOpts } from './helpers/toolExecutionOptions.js';

vi.mock('../models/foodAssistantRepository.js', async (original) => ({
  ...(await original<typeof import('../models/foodAssistantRepository.js')>()),
  getTask: vi.fn(),
  createTask: vi.fn(),
  mutateTask: vi.fn(),
}));
vi.mock('../utils/recipeSource.js', async (original) => ({
  ...(await original<typeof import('../utils/recipeSource.js')>()),
  readRecipeSource: vi.fn(),
}));
vi.mock('../services/recipeImageService.js', () => ({
  readRecipeImage: vi.fn(),
}));
vi.mock('../services/foodAssistantRecipeService.js', () => ({
  getRecipe: vi.fn(),
  draftFromRecipe: vi.fn(),
  draftFromSource: vi.fn(),
  previewRecipe: vi.fn(),
  publishRecipe: vi.fn(),
  importProviderIngredient: vi.fn(),
  undoRecipe: vi.fn(),
}));
const requestId = randomUUID(),
  owner = randomUUID();
function existingTask() {
  return foodAssistantTaskSchema.parse({
    id: requestId,
    user_id: owner,
    kind: 'recipe',
    title: 'Source recipe',
    status: 'draft',
    version: 2,
    creation_hash: 'test',
    result: null,
    checkpoint: { summary: 'Resumed draft' },
    created_at: new Date(),
    updated_at: new Date(),
    origin: {
      type: 'recipe_url',
      url: 'https://example.com/recipe',
      card_index: 0,
    },
  });
}
beforeEach(() => vi.resetAllMocks());
it('reports a saved-recipe schema failure as validation rather than a database failure', async () => {
  const parsed = z
    .object({ quantity: z.number().nonnegative() })
    .safeParse({ quantity: -1 });
  if (parsed.success) throw new Error('Expected an invalid fixture');
  vi.mocked(recipes.getRecipe).mockRejectedValue(parsed.error);
  const result = await buildRecipeTools(owner).sparky_manage_recipes.execute!(
    { action: 'get_recipe', meal_id: requestId },
    toolOpts
  );
  expect(String(result)).toContain('Error [VALIDATION]');
  expect(String(result)).toContain('quantity');
  expect(String(result)).not.toContain('DB_ERROR');
  expect(repository.createTask).not.toHaveBeenCalled();
});
it('returns the persisted URL draft on retry without another page fetch, even after checkpoint edits', async () => {
  vi.mocked(repository.getTask).mockResolvedValue(existingTask());
  const tool = buildRecipeTools(owner).sparky_manage_recipes;
  const result = await tool.execute!(
    {
      action: 'import_recipe_url',
      request_id: requestId,
      url: 'https://example.com/recipe',
    },
    toolOpts
  );
  expect(String(result)).toContain('Resumed draft');
  expect(source.readRecipeSource).not.toHaveBeenCalled();
  const other = await tool.execute!(
    {
      action: 'import_recipe_url',
      request_id: requestId,
      url: 'https://example.com/other',
    },
    toolOpts
  );
  expect(String(other)).toContain('different source recipe');
  expect(source.readRecipeSource).not.toHaveBeenCalled();
});
it('asks the model to select among multiple source cards before creating any draft', async () => {
  vi.mocked(repository.getTask).mockResolvedValue(null);
  const card = {
    name: 'Recipe A',
    ingredients: ['Flour'],
    yield: '1 loaf',
    instructions: 'Mix',
  };
  vi.mocked(source.readRecipeSource).mockResolvedValue({
    source_url: 'https://example.com/recipe',
    cards: [card, { ...card, name: 'Recipe B' }],
  });
  const result = await buildRecipeTools(owner).sparky_manage_recipes.execute!(
    {
      action: 'import_recipe_url',
      request_id: requestId,
      url: 'https://example.com/recipe',
    },
    toolOpts
  );
  expect(String(result)).toContain('needs_selection');
  expect(String(result)).toContain('Recipe B');
  expect(recipes.draftFromSource).not.toHaveBeenCalled();
});
it('uses the current attached image, retains unreadable lines, and stores its digest without image bytes', async () => {
  vi.mocked(repository.getTask).mockResolvedValue(null);
  vi.mocked(image.readRecipeImage).mockResolvedValue({
    name: 'Recipe',
    yield: '2 loaves',
    ingredients: ['250 g flour', '[Unreadable line]'],
    instructions: null,
    issues: ['Clarify line 2'],
  });
  const dataUrl = 'data:image/png;base64,aGVsbG8=';
  await buildRecipeTools(owner, {
    latestImageDataUrl: dataUrl,
    serviceConfigId: 'vision',
  }).sparky_manage_recipes.execute!(
    {
      action: 'import_recipe_image',
      request_id: requestId,
    },
    toolOpts
  );
  expect(image.readRecipeImage).toHaveBeenCalledWith(owner, dataUrl, 'vision');
  const task = vi.mocked(repository.createTask).mock.calls[0][1];
  expect(task.checkpoint.ingredients).toHaveLength(2);
  expect(task.checkpoint.ingredients[1].description).toBe('[Unreadable line]');
  expect(task.checkpoint.recipe).toMatchObject({
    source_yield: '2 loaves',
    servings: null,
  });
  expect(task.origin).toMatchObject({
    type: 'recipe_image',
    image_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
  });
  expect(JSON.stringify(task)).not.toContain(dataUrl);
});
it('requires a current explicit ingredient-removal request and rejects malformed commands without throwing', async () => {
  const tool = buildRecipeTools(owner, {
    latestUserText: 'Save the recipe',
  }).sparky_manage_recipes;
  const result = await tool.execute!(
    {
      action: 'remove_recipe_ingredient',
      task_id: requestId,
      ingredient_id: randomUUID(),
      source_quote: 'Remove butter',
      command: { operation_id: randomUUID(), expected_version: 2 },
    },
    toolOpts
  );
  expect(String(result)).toContain('explicit request');
  expect(repository.mutateTask).not.toHaveBeenCalled();
  expect(
    String(await tool.execute!({ action: 'publish_recipe' }, toolOpts))
  ).toContain('VALIDATION');
});
