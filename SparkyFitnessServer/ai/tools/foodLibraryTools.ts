import { tool } from 'ai';
import { z } from 'zod';
import {
  publishFoodAssistantFoodSchema,
  undoFoodAssistantFoodSchema,
  importFoodAssistantProviderFoodSchema,
} from '@workspace/shared';
import * as library from '../../services/foodAssistantLibraryService.js';
import { FoodAssistantConflict } from '../../models/foodAssistantRepository.js';
import type { ToolBuildContext } from './index.js';
import { ERRORS, formatZodError } from './errors.js';
const uuid = z.string().uuid();
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('inspect_food'), food_id: uuid }).strict(),
  z
    .object({
      action: z.literal('preview_food'),
      task_id: uuid,
      food_id: uuid.optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('publish_food'),
      task_id: uuid,
      publish: publishFoodAssistantFoodSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('import_provider_food'),
      task_id: uuid,
      import: importFoodAssistantProviderFoodSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('undo_food'),
      task_id: uuid,
      undo: undoFoodAssistantFoodSchema,
    })
    .strict(),
]);
export function buildFoodLibraryTools(userId: string, ctx?: ToolBuildContext) {
  return {
    sparky_food_library: tool({
      description:
        'Create and edit library foods and serving variants with verified portions, atomic publication/readback and undo. Start a food task using sparky_food_assistant_state. For label/user/web nutrition, checkpoint.food holds name, optional brand/barcode/notes/images/is_quick_food, variants and optional default_variant_index. Each NEW variant needs serving_size/unit and complete calories/protein/carbs/fat; retain missing micronutrients as null. To EDIT, inspect_food first; checkpoint.food.variants contains only the requested changes, with variant_id for existing servings (omitted variants stay unchanged). Changing serving units does not prove a new slice weight. Use actual labels or original-source evidence; publish_food needs current source_quote for user-supplied nutrition, or recorded label/web evidence. Never set imported/verified source flags yourself. AI estimates require explicit current estimate_source_quote acceptance. preview_food returns the exact serving values and preserved variants; resolve issues before publication. Editing food_id requires its inspect fingerprint. is_quick_food hides the item from the regular library. Historical diary snapshots are preserved. For an exact provider import, start a food task with ONE checkpoint ingredient, confirmed quantity/unit, and use import_provider_food with exact external_id and optional serving_id from full details; the backend copies verified provider nutrition and completes the task. Publication retries reuse operation_id. undo_food requires the completed publication_operation_id and current user undo quote; it refuses newer changes or deleting foods/variants that are now used. Read the task result before reporting completion.',
      inputSchema: z.object({
        action: z.enum([
          'inspect_food',
          'preview_food',
          'publish_food',
          'import_provider_food',
          'undo_food',
        ]),
        food_id: uuid.optional(),
        task_id: uuid.optional(),
        publish: publishFoodAssistantFoodSchema.optional(),
        import: importFoodAssistantProviderFoodSchema.optional(),
        undo: undoFoodAssistantFoodSchema.optional(),
      }),
      execute: async (raw) => {
        const parsed = schema.safeParse(raw);
        if (!parsed.success) return formatZodError(parsed.error);
        const args = parsed.data;
        try {
          switch (args.action) {
            case 'inspect_food':
              return JSON.stringify(
                await library.inspectFood(userId, args.food_id)
              );
            case 'preview_food':
              return JSON.stringify(
                await library.previewFood(userId, args.task_id, args.food_id)
              );
            case 'publish_food':
              return JSON.stringify(
                await library.publishFood(
                  userId,
                  args.task_id,
                  args.publish,
                  ctx?.latestUserText
                )
              );
            case 'import_provider_food':
              return JSON.stringify(
                await library.importLibraryFood(
                  userId,
                  args.task_id,
                  args.import
                )
              );
            case 'undo_food':
              return JSON.stringify(
                await library.undoFood(
                  userId,
                  args.task_id,
                  args.undo,
                  ctx?.latestUserText
                )
              );
          }
        } catch (error) {
          return error instanceof FoodAssistantConflict
            ? ERRORS.VALIDATION(error.message)
            : ERRORS.DB_ERROR(error);
        }
      },
    }),
  };
}
