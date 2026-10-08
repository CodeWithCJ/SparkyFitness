import { tool } from 'ai';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  changeFoodAssistantTaskSchema,
  createFoodAssistantTaskSchema,
  publishFoodAssistantRecipeSchema,
  importFoodAssistantProviderFoodSchema,
  undoFoodAssistantRecipeSchema,
} from '@workspace/shared';
import * as recipeService from '../../services/foodAssistantRecipeService.js';
import * as taskRepository from '../../models/foodAssistantRepository.js';
import { FoodAssistantConflict } from '../../models/foodAssistantRepository.js';
import {
  RecipeSourceError,
  readRecipeSource,
} from '../../utils/recipeSource.js';
import { readRecipeImage } from '../../services/recipeImageService.js';
import { v5 as uuidv5 } from 'uuid';
import type { ToolBuildContext } from './index.js';
import { ERRORS, formatZodError } from './errors.js';

const actions = [
  'get_recipe',
  'draft_from_recipe',
  'import_recipe_url',
  'import_recipe_image',
  'preview_recipe',
  'publish_recipe',
  'import_provider_ingredient',
  'remove_recipe_ingredient',
  'undo_recipe',
] as const;
const uuid = z.string().uuid();
const url = z
  .string()
  .url()
  .refine((value) => /^https?:\/\//i.test(value));
const schema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('undo_recipe'),
      task_id: uuid,
      undo: undoFoodAssistantRecipeSchema,
    })
    .strict(),
  z.object({ action: z.literal('get_recipe'), meal_id: uuid }).strict(),
  z
    .object({
      action: z.literal('draft_from_recipe'),
      meal_id: uuid,
      request_id: uuid,
    })
    .strict(),
  z
    .object({
      action: z.literal('import_recipe_url'),
      url,
      request_id: uuid,
      card_index: z.number().int().nonnegative().max(9).optional(),
    })
    .strict(),
  z
    .object({ action: z.literal('import_recipe_image'), request_id: uuid })
    .strict(),
  z.object({ action: z.literal('preview_recipe'), task_id: uuid }).strict(),
  z
    .object({
      action: z.literal('import_provider_ingredient'),
      task_id: uuid,
      provider_import: importFoodAssistantProviderFoodSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('publish_recipe'),
      task_id: uuid,
      command: publishFoodAssistantRecipeSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('remove_recipe_ingredient'),
      task_id: uuid,
      ingredient_id: uuid,
      source_quote: z.string().min(1).max(2000),
      command: changeFoodAssistantTaskSchema,
    })
    .strict(),
]);

export function buildRecipeTools(userId: string, ctx?: ToolBuildContext) {
  return {
    sparky_manage_recipes: tool({
      description:
        'Create and edit saved recipes using persisted ingredient drafts. get_recipe reads an accessible recipe and its updated_at version. draft_from_recipe copies EVERY ingredient into a new task for substitutions, resizing or yield changes. import_recipe_url reads the original page and saves an unresolved draft; when several recipe cards exist, inspect their names and choose card_index. import_recipe_image transcribes the image actually attached to this turn and saves all ingredient lines, including unreadable placeholders. Reuse request_id when retrying an import. Pasted recipes can be saved with sparky_food_assistant_state start_task. Resolve saved-food ingredients through lookup and checkpoint their IDs. For provider ingredients, first checkpoint the confirmed quantity/unit then use import_provider_ingredient with the exact provider ID: it verifies full details and atomically saves the library food, portion and draft row without logging anything. Use serving_id from the full provider details when choosing a particular household reference. Preserve qualifiers such as large slice; ask which serving when matching references disagree. Reuse operation_id for a retry. Never guess a per-item weight or turn an unresolved ingredient into zero. Do not remove ingredients unless requested: remove_recipe_ingredient requires the exact current user quote. preview_recipe recalculates batch/per-serving nutrition and reports missing fields; known_subtotal is only the resolved portion. publish_recipe creates a private saved recipe, or updates meal_id with expected_meal_updated_at. It publishes nothing when ingredients, portions or yield remain unresolved. undo_recipe reverts the publication_operation_id only on an explicit current user undo request and only when the recipe has not changed since publication. Undoing creation is blocked if anyone uses the recipe in a diary, plan, another recipe or favorite. Existing diary snapshots keep their logged nutrition. Only say a recipe was saved after the publication result includes persisted readback. This tool does not log the recipe to the diary; use log_meal only when requested.',
      inputSchema: z.object({
        action: z.enum(actions),
        meal_id: uuid.optional(),
        request_id: uuid.optional(),
        task_id: uuid.optional(),
        url: url.optional(),
        card_index: z.number().optional(),
        ingredient_id: uuid.optional(),
        source_quote: z.string().optional(),
        provider_import: importFoodAssistantProviderFoodSchema.optional(),
        undo: undoFoodAssistantRecipeSchema.optional(),
        command: publishFoodAssistantRecipeSchema.optional(),
      }),
      execute: async (raw) => {
        const parsed = schema.safeParse(raw);
        if (!parsed.success) return formatZodError(parsed.error);
        const args = parsed.data;
        try {
          switch (args.action) {
            case 'undo_recipe':
              return JSON.stringify(
                await recipeService.undoRecipe(
                  userId,
                  args.task_id,
                  args.undo,
                  ctx?.latestUserText
                )
              );
            case 'get_recipe':
              return JSON.stringify(
                await recipeService.getRecipe(userId, args.meal_id)
              );
            case 'draft_from_recipe': {
              const existing = await taskRepository.getTask(
                userId,
                args.request_id
              );
              if (existing) {
                if (
                  existing.origin.type !== 'saved_recipe' ||
                  existing.origin.meal_id !== args.meal_id
                )
                  throw new FoodAssistantConflict(
                    'This request ID belongs to different work.'
                  );
                return JSON.stringify(existing);
              }
              return JSON.stringify(
                await recipeService.draftFromRecipe(
                  userId,
                  args.meal_id,
                  args.request_id
                )
              );
            }
            case 'import_recipe_url': {
              const existing = await taskRepository.getTask(
                userId,
                args.request_id
              );
              if (existing) {
                if (
                  existing.origin.type !== 'recipe_url' ||
                  existing.origin.url !== args.url ||
                  (args.card_index !== undefined &&
                    existing.origin.card_index !== args.card_index)
                )
                  throw new FoodAssistantConflict(
                    'This request ID belongs to a different source recipe.'
                  );
                return JSON.stringify(existing);
              }
              const source = await readRecipeSource(args.url);
              if (source.cards.length > 1 && args.card_index === undefined)
                return JSON.stringify({
                  needs_selection: true,
                  source_url: source.source_url,
                  cards: source.cards.map((card, index) => ({
                    card_index: index,
                    name: card.name,
                    yield: card.yield,
                  })),
                });
              const card = source.cards[args.card_index ?? 0];
              if (!card)
                return ERRORS.VALIDATION(
                  'That recipe card does not exist. Inspect the source cards again.'
                );
              return JSON.stringify(
                await recipeService.draftFromSource(
                  userId,
                  card,
                  source.source_url,
                  args.request_id,
                  args.url,
                  args.card_index ?? 0
                )
              );
            }
            case 'import_recipe_image': {
              const existing = await taskRepository.getTask(
                userId,
                args.request_id
              );
              const imageHash = createHash('sha256')
                .update(ctx?.latestImageDataUrl ?? '')
                .digest('hex');
              if (existing) {
                if (
                  existing.origin.type !== 'recipe_image' ||
                  existing.origin.image_hash !== imageHash
                )
                  throw new FoodAssistantConflict(
                    'This request ID belongs to a different image. Read the saved task to resume it.'
                  );
                return JSON.stringify(existing);
              }
              const source = await readRecipeImage(
                userId,
                ctx?.latestImageDataUrl,
                ctx?.serviceConfigId
              );
              const input = createFoodAssistantTaskSchema.parse({
                id: args.request_id,
                kind: 'recipe',
                title: source.name ?? 'Recipe image draft',
                checkpoint: {
                  summary: source.issues.length
                    ? `Image transcription needs clarification: ${source.issues.join('; ')}`
                    : 'Recipe image transcribed. Nutrition and portions still need verification.',
                  ingredients: source.ingredients.map((description, index) => ({
                    id: uuidv5(`${index}:${description}`, args.request_id),
                    description,
                    status: 'unresolved',
                  })),
                  recipe: {
                    name: source.name ?? 'Recipe image draft',
                    servings: null,
                    source_yield: source.yield ?? undefined,
                    instructions: source.instructions ?? undefined,
                  },
                  next_step:
                    'Verify every ingredient, any unreadable lines, and the stated yield before publishing.',
                },
                origin: { type: 'recipe_image', image_hash: imageHash },
              });
              return JSON.stringify(
                await taskRepository.createTask(userId, input)
              );
            }
            case 'preview_recipe':
              return JSON.stringify(
                await recipeService.previewRecipe(userId, args.task_id)
              );
            case 'import_provider_ingredient':
              return JSON.stringify(
                await recipeService.importProviderIngredient(
                  userId,
                  args.task_id,
                  args.provider_import
                )
              );
            case 'publish_recipe':
              return JSON.stringify(
                await recipeService.publishRecipe(
                  userId,
                  args.task_id,
                  args.command,
                  ctx?.latestUserText
                )
              );
            case 'remove_recipe_ingredient': {
              if (
                !ctx?.latestUserText?.includes(args.source_quote) ||
                !/\b(remove|delete|without|omit|leave out)\b/i.test(
                  args.source_quote
                )
              )
                return ERRORS.VALIDATION(
                  'Ingredient removal needs an explicit request in the current user message.'
                );
              const operation = await taskRepository.mutateTask(
                userId,
                {
                  taskId: args.task_id,
                  operationId: args.command.operation_id,
                  expectedVersion: args.command.expected_version,
                  kind: 'remove_recipe_ingredient',
                  request: args,
                },
                async (task) => {
                  if (
                    task.kind !== 'recipe' ||
                    !task.checkpoint.ingredients.some(
                      (ingredient) => ingredient.id === args.ingredient_id
                    )
                  )
                    throw new FoodAssistantConflict(
                      'Recipe ingredient not found.'
                    );
                  return {
                    ...task,
                    status: 'draft',
                    checkpoint: {
                      ...task.checkpoint,
                      ingredients: task.checkpoint.ingredients.filter(
                        (ingredient) => ingredient.id !== args.ingredient_id
                      ),
                    },
                  };
                }
              );
              return JSON.stringify(operation);
            }
          }
        } catch (error) {
          return error instanceof FoodAssistantConflict ||
            error instanceof RecipeSourceError
            ? ERRORS.VALIDATION(error.message)
            : ERRORS.DB_ERROR(error);
        }
      },
    }),
  };
}
