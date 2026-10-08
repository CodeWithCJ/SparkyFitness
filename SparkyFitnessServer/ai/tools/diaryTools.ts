import { tool } from 'ai';
import { z } from 'zod';
import {
  applyFoodAssistantDiarySchema,
  undoFoodAssistantDiarySchema,
  foodAssistantDiaryScopeSchema,
  importFoodAssistantProviderFoodSchema,
} from '@workspace/shared';
import * as diary from '../../services/foodAssistantDiaryService.js';
import { importProviderIngredient } from '../../services/foodAssistantRecipeService.js';
import { FoodAssistantConflict } from '../../models/foodAssistantRepository.js';
import type { ToolBuildContext } from './index.js';
import { ERRORS, formatZodError } from './errors.js';
const uuid = z.string().uuid();
const schema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('import_provider'),
      task_id: uuid,
      provider_import: importFoodAssistantProviderFoodSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('inspect'),
      scope: foodAssistantDiaryScopeSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('apply'),
      task_id: uuid,
      command: applyFoodAssistantDiarySchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('undo'),
      task_id: uuid,
      undo: undoFoodAssistantDiarySchema,
    })
    .strict(),
]);
export function buildDiaryTools(userId: string, ctx?: ToolBuildContext) {
  return {
    sparky_manage_diary: tool({
      description:
        'Verified diary actions with atomic task history and conflict-safe undo. Inspect exact entries, a logged meal ID, or a calendar date/meal_type_id slot before changing it; show actual food names, quantities and totals. Reuse its fingerprint in apply. Start a diary task with sparky_food_assistant_state and use its current version. log uses accessible saved food IDs and verified variants; import_provider resolves the exact external match with full details before logging: checkpoint each ingredient with its confirmed quantity/unit, then import it using ingredient_id and provider_type/external_id. Use serving_id from full details to choose a particular household reference; preserve sizes such as large slice. Read the returned task version and selected IDs before apply. replace changes exactly one entry and its food ID, variant, portion and snapshot together. scale multiplies a whole meal or selection by an explicit positive factor; resize preserves logged nutrition instead of refreshing the catalog. move/copy preserve every snapshot and linked drink, including grouping and local dates/times; moving one component detaches it from its old group. delete removes only the inspected entries. Bulk or whole-meal deletion requires showing the preview and a later explicit confirmation quote from the current user turn. Never invent that quote. All requests use stable operation_id values; reuse them on retries. Missing source nutrition or incompatible count/weight units stop the write. Only report success from a persisted readback result. undo targets diary_operation_id from the completed task and refuses to overwrite later edits. Use this tool for replacements, copying, moving, deletion and follow-up undo.',
      inputSchema: z.object({
        action: z.enum(['inspect', 'import_provider', 'apply', 'undo']),
        provider_import: importFoodAssistantProviderFoodSchema.optional(),
        scope: foodAssistantDiaryScopeSchema.optional(),
        task_id: uuid.optional(),
        command: applyFoodAssistantDiarySchema.optional(),
        undo: undoFoodAssistantDiarySchema.optional(),
      }),
      execute: async (raw) => {
        const parsed = schema.safeParse(raw);
        if (!parsed.success) return formatZodError(parsed.error);
        const args = parsed.data;
        try {
          switch (args.action) {
            case 'import_provider':
              return JSON.stringify(
                await importProviderIngredient(
                  userId,
                  args.task_id,
                  args.provider_import
                )
              );
            case 'inspect':
              return JSON.stringify(
                await diary.inspectDiary(userId, args.scope)
              );
            case 'apply':
              return JSON.stringify(
                await diary.applyDiary(
                  userId,
                  args.task_id,
                  args.command,
                  ctx?.latestUserText
                )
              );
            case 'undo':
              return JSON.stringify(
                await diary.undoDiary(
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
