import { tool } from 'ai';
import { z } from 'zod';
import {
  foodAssistantAnalysisDraftSchema,
  changeFoodAssistantTaskSchema,
} from '@workspace/shared';
import * as service from '../../services/foodAssistantAnalysisService.js';
import { FoodAssistantConflict } from '../../models/foodAssistantRepository.js';
import { ERRORS, formatZodError } from './errors.js';
const uuid = z.string().uuid();
const actions = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('analyze'),
      analysis: foodAssistantAnalysisDraftSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('save_analysis'),
      task_id: uuid,
      command: changeFoodAssistantTaskSchema,
    })
    .strict(),
]);
export function buildFoodAnalysisTools(userId: string, tz: string) {
  return {
    sparky_food_analysis: tool({
      description:
        'Analyze actual recorded food nutrition, logging coverage, app goals and comparisons between two calendar date ranges (up to 90 days each). analyze accepts analysis.start_date/end_date, optional compare dates and selected nutrient names (defaults calories/protein/carbs/fat). It reads signed-in owner diary snapshots; current library values cannot rewrite the evidence. Units are converted only from the recorded reference. Results distinguish known totals, missing nutrients, unlogged days, complete-reference days and comparable goal days. Inspect coverage and issues before drawing conclusions. Unlogged days are unknown, never zero; a logged day does not establish complete intake. Use average_per_logged_day only when complete reference data exist, and explain different logging coverage between periods. Goals are the app targets for the corresponding dates; a gap is not proof of a calorie deficit or adequacy. Patterns are descriptive, not causes or diagnoses. Today may be partial. Food water_ml excludes drinking-water logs. For a saved result, start an analysis task with checkpoint.analysis then save_analysis using its current version/operation_id; only the persisted result establishes completion. Read saved analyses with sparky_food_assistant_state, and clearly describe their capture date if the diary has since changed.',
      inputSchema: z.object({
        action: z.enum(['analyze', 'save_analysis']),
        analysis: foodAssistantAnalysisDraftSchema.optional(),
        task_id: uuid.optional(),
        command: changeFoodAssistantTaskSchema.optional(),
      }),
      execute: async (raw) => {
        const parsed = actions.safeParse(raw);
        if (!parsed.success) return formatZodError(parsed.error);
        try {
          const args = parsed.data;
          return JSON.stringify(
            args.action === 'analyze'
              ? await service.analyzeNutrition(userId, tz, args.analysis)
              : await service.saveNutritionAnalysis(
                  userId,
                  tz,
                  args.task_id,
                  args.command
                )
          );
        } catch (error) {
          return error instanceof FoodAssistantConflict
            ? ERRORS.VALIDATION(error.message)
            : ERRORS.DB_ERROR(error);
        }
      },
    }),
  };
}
