import { z } from "zod";
import { changeFoodAssistantTaskSchema } from "./FoodAssistant.api.zod.ts";
import { foodAssistantDateSchema } from "./FoodAssistantPlanDraft.api.zod.ts";
const uuid = z.string().uuid();
export const publishFoodAssistantPlanSchema = changeFoodAssistantTaskSchema
  .extend({
    plan_id: uuid.optional(),
    expected_fingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    schedule: z.boolean(),
    confirmation_quote: z.string().min(1).max(2000).optional(),
    estimate_source_quote: z.string().min(1).max(2000).optional(),
  })
  .strict()
  .refine(
    (value) => !value.plan_id || !!value.expected_fingerprint,
    "Inspect the plan before editing.",
  );
export const undoFoodAssistantPlanSchema = changeFoodAssistantTaskSchema
  .extend({
    publication_operation_id: uuid,
    source_quote: z.string().min(1).max(2000),
  })
  .strict();
export const buildFoodAssistantShoppingSchema = changeFoodAssistantTaskSchema
  .extend({
    plan_task_id: uuid.optional(),
    plan_id: uuid.optional(),
    start_date: foodAssistantDateSchema.optional(),
    end_date: foodAssistantDateSchema.optional(),
    pantry: z
      .array(
        z
          .object({
            food_id: uuid,
            quantity: z.number().positive().finite(),
            unit: z.string().trim().min(1).max(100),
          })
          .strict(),
      )
      .max(100)
      .default([]),
    items: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(200),
            food_id: uuid.optional(),
            quantity: z.number().positive().finite(),
            unit: z.string().trim().min(1).max(100),
          })
          .strict(),
      )
      .max(100)
      .default([]),
  })
  .strict()
  .refine(
    (value) =>
      Number(!!value.plan_task_id) + Number(!!value.plan_id) <= 1 &&
      (!!value.plan_task_id || !!value.plan_id || value.items.length > 0),
    "Select one plan source or supply explicit shopping items.",
  )
  .refine(
    (value) =>
      !value.start_date ||
      !value.end_date ||
      value.end_date >= value.start_date,
    "End date must follow the start date.",
  );
export const foodAssistantShoppingItemSchema = z
  .object({
    id: uuid,
    food_id: uuid.nullable(),
    name: z.string(),
    quantity: z.number().nonnegative().finite(),
    unit: z.string(),
    required_quantity: z.number().positive().finite(),
    pantry_quantity: z.number().nonnegative().finite(),
    purchased: z.boolean(),
  })
  .strict();
export const foodAssistantShoppingResultSchema = z
  .object({
    kind: z.literal("shopping"),
    publication_operation_id: uuid,
    plan_id: uuid.nullable(),
    plan_task_id: uuid.nullable(),
    items: z.array(foodAssistantShoppingItemSchema).max(500),
  })
  .strict();
export const changeFoodAssistantShoppingSchema = changeFoodAssistantTaskSchema
  .extend({
    change: z.discriminatedUnion("type", [
      z
        .object({
          type: z.literal("mark"),
          item_id: uuid,
          purchased: z.boolean(),
        })
        .strict(),
      z
        .object({
          type: z.literal("add"),
          name: z.string().trim().min(1).max(200),
          quantity: z.number().positive().finite(),
          unit: z.string().trim().min(1).max(100),
          food_id: uuid.optional(),
        })
        .strict(),
      z
        .object({
          type: z.literal("remove"),
          item_id: uuid,
          source_quote: z.string().min(1).max(2000),
        })
        .strict(),
    ]),
  })
  .strict();
export const undoFoodAssistantShoppingSchema = changeFoodAssistantTaskSchema
  .extend({
    shopping_operation_id: uuid,
    source_quote: z.string().min(1).max(2000),
  })
  .strict();
