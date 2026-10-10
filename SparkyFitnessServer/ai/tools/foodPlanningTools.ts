import { tool } from 'ai';
import { z } from 'zod';
import {
  publishFoodAssistantPlanSchema,
  undoFoodAssistantPlanSchema,
  buildFoodAssistantShoppingSchema,
  changeFoodAssistantShoppingSchema,
  undoFoodAssistantShoppingSchema,
} from '@workspace/shared';
import * as plans from '../../services/foodAssistantPlanService.js';
import * as shopping from '../../services/foodAssistantShoppingService.js';
import { FoodAssistantConflict } from '../../models/foodAssistantRepository.js';
import type { ToolBuildContext } from './index.js';
import { ERRORS, formatZodError } from './errors.js';
const uuid = z.string().uuid();
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('inspect_plan'), plan_id: uuid }).strict(),
  z.object({ action: z.literal('preview_plan'), task_id: uuid }).strict(),
  z
    .object({
      action: z.literal('publish_plan'),
      task_id: uuid,
      publish: publishFoodAssistantPlanSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('undo_plan'),
      task_id: uuid,
      undo: undoFoodAssistantPlanSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('build_shopping_list'),
      task_id: uuid,
      shopping: buildFoodAssistantShoppingSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('change_shopping_list'),
      task_id: uuid,
      change: changeFoodAssistantShoppingSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('undo_shopping_list'),
      task_id: uuid,
      undo_shopping: undoFoodAssistantShoppingSchema,
    })
    .strict(),
]);
export function buildFoodPlanningTools(
  userId: string,
  tz: string,
  ctx?: ToolBuildContext
) {
  return {
    sparky_food_planning: tool({
      description:
        'Author, edit and schedule real meal plans, and save editable shopping lists. Start a meal_plan task with sparky_food_assistant_state. checkpoint.plan holds name, start/end calendar dates and EVERY day_of_week assignment (Sunday=0). A food assignment references ingredient_id in the checkpoint with confirmed quantity/unit and verified food/variant IDs. A recipe assignment references meal_id, confirmed quantity/unit and expected_recipe_updated_at from get_recipe. Preserve unresolved ingredients; research before publishing. preview_plan returns actual daily nutrition, current goals, preferences and any issues. Honor explicit preferences/allergies and current-request overrides; use confirmed leftovers/pantry quantities, never invent them. Compare the preview against the requested goals and explain material gaps before saving. publish_plan saves a normal app template; schedule=true also logs the exact future occurrences atomically. It never rewrites historical diary entries. Editing plan_id requires inspect_plan fingerprint; replacing existing future entries requires showing that bulk preview and a later current-user confirmation quote. A failed publication saves nothing. Schedule windows are limited to 90 days/1,500 food entries. Reuse operation_id on retries. undo_plan refuses to overwrite newer work. Shopping: start a shopping task, then build_shopping_list from one completed plan_task_id (its captured quantities) or a saved plan_id; optional start/end dates filter it. Explicit items can create a standalone list or add extras. Pantry subtraction uses only supplied food IDs and compatible units; slice sizes stay distinct and count-to-weight conversions are never guessed. The result persists checked items across chats. change_shopping_list marks, adds or removes an item; removal requires its exact current user quote. undo_shopping_list uses the latest shopping operation ID and refuses newer edits. Only report completion after the persisted result. Read lists and operations with sparky_food_assistant_state.',
      inputSchema: z.object({
        action: z.enum([
          'inspect_plan',
          'preview_plan',
          'publish_plan',
          'undo_plan',
          'build_shopping_list',
          'change_shopping_list',
          'undo_shopping_list',
        ]),
        plan_id: uuid.optional(),
        task_id: uuid.optional(),
        publish: publishFoodAssistantPlanSchema.optional(),
        undo: undoFoodAssistantPlanSchema.optional(),
        shopping: buildFoodAssistantShoppingSchema.optional(),
        change: changeFoodAssistantShoppingSchema.optional(),
        undo_shopping: undoFoodAssistantShoppingSchema.optional(),
      }),
      execute: async (raw) => {
        const parsed = schema.safeParse(raw);
        if (!parsed.success) return formatZodError(parsed.error);
        const args = parsed.data;
        try {
          switch (args.action) {
            case 'inspect_plan':
              return JSON.stringify(
                await plans.inspectPlan(userId, args.plan_id)
              );
            case 'preview_plan':
              return JSON.stringify(
                await plans.previewPlan(userId, args.task_id)
              );
            case 'publish_plan':
              return JSON.stringify(
                await plans.publishPlan(
                  userId,
                  tz,
                  args.task_id,
                  args.publish,
                  ctx?.latestUserText
                )
              );
            case 'undo_plan':
              return JSON.stringify(
                await plans.undoPlan(
                  userId,
                  args.task_id,
                  args.undo,
                  ctx?.latestUserText
                )
              );
            case 'build_shopping_list':
              return JSON.stringify(
                await shopping.buildShopping(
                  userId,
                  args.task_id,
                  args.shopping
                )
              );
            case 'change_shopping_list':
              return JSON.stringify(
                await shopping.changeShopping(
                  userId,
                  args.task_id,
                  args.change,
                  ctx?.latestUserText
                )
              );
            case 'undo_shopping_list':
              return JSON.stringify(
                await shopping.undoShopping(
                  userId,
                  args.task_id,
                  args.undo_shopping,
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
