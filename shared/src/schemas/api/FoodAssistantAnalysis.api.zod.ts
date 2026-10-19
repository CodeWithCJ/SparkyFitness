import { z } from "zod";
import { foodAssistantDateSchema } from "./FoodAssistantPlanDraft.api.zod.ts";
import { FOOD_VARIANT_NUTRIENT_FIELDS } from "../../constants/foodVariantNutrients.ts";
const base = z
  .object({
    start_date: foodAssistantDateSchema,
    end_date: foodAssistantDateSchema,
  })
  .strict();
const range = base.refine(
  (value) => value.end_date >= value.start_date,
  "End date must follow the start date.",
);
export const foodAssistantAnalysisDraftSchema = base
  .extend({
    nutrients: z
      .array(z.enum([...FOOD_VARIANT_NUTRIENT_FIELDS, "water_ml"]))
      .min(1)
      .max(20)
      .refine(
        (values) => new Set(values).size === values.length,
        "Select each nutrient once.",
      )
      .default(["calories", "protein", "carbs", "fat"]),
    compare: range.optional(),
  })
  .strict()
  .refine(
    (value) => value.end_date >= value.start_date,
    "End date must follow the start date.",
  );
export type FoodAssistantAnalysisDraft = z.infer<
  typeof foodAssistantAnalysisDraftSchema
>;
