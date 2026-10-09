import { z } from "zod";
import { changeFoodAssistantTaskSchema } from "./FoodAssistant.api.zod.ts";
export const publishFoodAssistantFoodSchema = changeFoodAssistantTaskSchema
  .extend({
    food_id: z.string().uuid().optional(),
    expected_fingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    source_quote: z.string().min(1).max(2000).optional(),
    estimate_source_quote: z.string().min(1).max(2000).optional(),
  })
  .strict()
  .refine(
    (value) => !value.food_id || !!value.expected_fingerprint,
    "Inspect the food and all serving variants before editing.",
  );
export const undoFoodAssistantFoodSchema = changeFoodAssistantTaskSchema
  .extend({
    publication_operation_id: z.string().uuid(),
    source_quote: z.string().min(1).max(2000),
  })
  .strict();
