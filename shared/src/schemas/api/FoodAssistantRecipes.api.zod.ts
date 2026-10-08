import { z } from "zod";
import { changeFoodAssistantTaskSchema } from "./FoodAssistant.api.zod.ts";

export const publishFoodAssistantRecipeSchema = changeFoodAssistantTaskSchema
  .extend({
    meal_id: z.string().uuid().optional(),
    expected_meal_updated_at: z.string().datetime().optional(),
    estimate_source_quote: z.string().min(1).max(2000).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.meal_id && !value.expected_meal_updated_at)
      ctx.addIssue({
        code: "custom",
        path: ["expected_meal_updated_at"],
        message: "Read the current recipe before editing it.",
      });
    if (!value.meal_id && value.expected_meal_updated_at)
      ctx.addIssue({
        code: "custom",
        message: "A recipe version requires its meal ID.",
      });
  });

export const importFoodAssistantProviderFoodSchema =
  changeFoodAssistantTaskSchema
    .extend({
      ingredient_id: z.string().uuid(),
      provider_type: z.enum([
        "fatsecret",
        "usda",
        "openfoodfacts",
        "yazio",
        "swissfood",
        "canadian-nutrient-file",
        "mealie",
        "tandoor",
        "norish",
      ]),
      provider_id: z.string().uuid().optional(),
      external_id: z.string().min(1).max(200),
    })
    .strict();
export type PublishFoodAssistantRecipe = z.infer<
  typeof publishFoodAssistantRecipeSchema
>;
export type ImportFoodAssistantProviderFood = z.infer<
  typeof importFoodAssistantProviderFoodSchema
>;

export const undoFoodAssistantRecipeSchema = changeFoodAssistantTaskSchema
  .extend({
    publication_operation_id: z.string().uuid(),
    source_quote: z.string().min(1).max(2000),
  })
  .strict();
export type UndoFoodAssistantRecipe = z.infer<
  typeof undoFoodAssistantRecipeSchema
>;
