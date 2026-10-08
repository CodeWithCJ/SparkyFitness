import { z } from "zod";
import { changeFoodAssistantTaskSchema } from "./FoodAssistant.api.zod.ts";
const uuid = z.string().uuid();
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T12:00:00Z`);
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "Use a valid calendar date.");
const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/)
  .nullable();
export const foodAssistantDiaryScopeSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("entries"),
      ids: z
        .array(uuid)
        .min(1)
        .max(100)
        .refine((ids) => new Set(ids).size === ids.length),
    })
    .strict(),
  z.object({ type: z.literal("logged_meal"), id: uuid }).strict(),
  z.object({ type: z.literal("meal_slot"), date, meal_type_id: uuid }).strict(),
]);
const portion = z
  .object({
    quantity: z.number().positive().finite(),
    unit: z.string().trim().min(1).max(100),
  })
  .strict();
const selectedFood = portion
  .extend({ food_id: uuid, variant_id: uuid.optional() })
  .strict();
const destination = z
  .object({ date, meal_type_id: uuid, time: time.optional() })
  .strict();
const observed = {
  scope: foodAssistantDiaryScopeSchema,
  expected_fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
};
export const foodAssistantDiaryActionSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("log"),
      foods: z.array(selectedFood).min(1).max(100),
      destination,
      meal_name: z.string().trim().min(1).max(200).optional(),
    })
    .strict(),
  z
    .object({ type: z.literal("replace"), ...observed, food: selectedFood })
    .strict(),
  z
    .object({
      type: z.literal("scale"),
      ...observed,
      factor: z.number().positive().finite().max(1000),
    })
    .strict(),
  z.object({ type: z.literal("resize"), ...observed, portion }).strict(),
  z.object({ type: z.literal("move"), ...observed, destination }).strict(),
  z.object({ type: z.literal("copy"), ...observed, destination }).strict(),
  z
    .object({
      type: z.literal("delete"),
      ...observed,
      confirmation_quote: z.string().min(1).max(2000).optional(),
    })
    .strict(),
]);
export const applyFoodAssistantDiarySchema = changeFoodAssistantTaskSchema
  .extend({
    action: foodAssistantDiaryActionSchema,
    estimate_source_quote: z.string().min(1).max(2000).optional(),
  })
  .strict();
export const undoFoodAssistantDiarySchema = changeFoodAssistantTaskSchema
  .extend({
    diary_operation_id: uuid,
    source_quote: z.string().min(1).max(2000),
  })
  .strict();
export type FoodAssistantDiaryScope = z.infer<
  typeof foodAssistantDiaryScopeSchema
>;
export type FoodAssistantDiaryAction = z.infer<
  typeof foodAssistantDiaryActionSchema
>;
export type ApplyFoodAssistantDiary = z.infer<
  typeof applyFoodAssistantDiarySchema
>;
