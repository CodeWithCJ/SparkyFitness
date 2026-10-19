import { z } from "zod";
const uuid = z.string().uuid();
export const foodAssistantDateSchema = z.iso.date();
const portion = {
  quantity: z.number().positive().finite(),
  unit: z.string().trim().min(1).max(100),
};
export const foodAssistantPlanAssignmentSchema = z.discriminatedUnion(
  "item_type",
  [
    z
      .object({
        id: uuid,
        day_of_week: z.number().int().min(0).max(6),
        meal_type_id: uuid,
        item_type: z.literal("food"),
        ingredient_id: uuid,
      })
      .strict(),
    z
      .object({
        id: uuid,
        day_of_week: z.number().int().min(0).max(6),
        meal_type_id: uuid,
        item_type: z.literal("meal"),
        meal_id: uuid,
        expected_recipe_updated_at: z.string().datetime(),
        ...portion,
      })
      .strict(),
  ],
);
export const foodAssistantPlanDraftSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().max(2000).optional(),
    start_date: foodAssistantDateSchema,
    end_date: foodAssistantDateSchema,
    assignments: z
      .array(foodAssistantPlanAssignmentSchema)
      .min(1)
      .max(100)
      .refine(
        (rows) => new Set(rows.map((row) => row.id)).size === rows.length,
      ),
  })
  .strict()
  .refine(
    (plan) => plan.end_date >= plan.start_date,
    "End date must follow the start date.",
  );
export type FoodAssistantPlanDraft = z.infer<
  typeof foodAssistantPlanDraftSchema
>;
