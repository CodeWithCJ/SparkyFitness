import { z } from "zod";
import { foodAssistantPlanDraftSchema } from "./FoodAssistantPlanDraft.api.zod.ts";

const uuid = z.string().uuid();
const text = z.string().trim().min(1).max(2000);
export const foodAssistantTaskOriginSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("user_draft") }).strict(),
  z
    .object({
      type: z.literal("recipe_url"),
      url: z.string().url(),
      card_index: z.number().int().min(0).max(9),
    })
    .strict(),
  z
    .object({
      type: z.literal("recipe_image"),
      image_hash: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
  z.object({ type: z.literal("saved_recipe"), meal_id: uuid }).strict(),
]);
export const foodAssistantTaskStatusSchema = z.enum([
  "draft",
  "running",
  "awaiting_input",
  "complete",
  "cancelled",
  "failed",
]);
export const foodAssistantEvidenceSchema = z
  .object({
    source: z.enum(["saved_food", "provider", "label", "recipe", "web"]),
    title: text,
    url: z
      .string()
      .url()
      .refine((value) => /^https?:\/\//i.test(value))
      .optional(),
    provider: z.string().max(100).optional(),
    external_id: z.string().max(200).optional(),
    serving_id: z.string().max(200).optional(),
    food_id: uuid.optional(),
    variant_id: uuid.optional(),
  })
  .strict();

// An unresolved ingredient remains a first-class draft row. It is never
// interpreted as a zero-nutrition ingredient or silently dropped on resume.
export const foodAssistantIngredientSchema = z
  .object({
    id: uuid,
    description: text,
    quantity: z.number().positive().finite().nullable().default(null),
    unit: z.string().trim().min(1).max(100).nullable().default(null),
    food_id: uuid.optional(),
    variant_id: uuid.optional(),
    status: z.enum(["unresolved", "selected", "verified"]),
    issue: text.optional(),
    evidence: z.array(foodAssistantEvidenceSchema).max(10).default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.status !== "unresolved" &&
      (value.quantity === null || value.unit === null)
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "A selected ingredient requires an explicit quantity and unit.",
      });
    }
    if (value.status !== "unresolved" && !value.food_id) {
      ctx.addIssue({
        code: "custom",
        path: ["food_id"],
        message: "A selected ingredient requires a saved food ID.",
      });
    }
  });

export const foodAssistantCheckpointSchema = z
  .object({
    summary: text,
    next_step: text.optional(),
    ingredients: z
      .array(foodAssistantIngredientSchema)
      .max(100)
      .refine(
        (rows) => new Set(rows.map((row) => row.id)).size === rows.length,
        "Ingredient IDs must be unique.",
      )
      .default([]),
    evidence: z.array(foodAssistantEvidenceSchema).max(100).default([]),
    selected_ids: z.array(uuid).max(200).default([]),
    plan: foodAssistantPlanDraftSchema.optional(),
    recipe: z
      .object({
        name: text,
        servings: z.number().positive().finite().nullable().default(null),
        source_yield: z.string().max(1000).optional(),
        instructions: z.string().max(20000).optional(),
        source_url: z
          .string()
          .url()
          .refine((value) => /^https?:\/\//i.test(value))
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const createFoodAssistantTaskSchema = z
  .object({
    origin: foodAssistantTaskOriginSchema.default({ type: "user_draft" }),
    id: uuid.describe(
      "Stable request ID. Reuse it when retrying the same task creation.",
    ),
    kind: z.enum(["recipe", "meal_plan", "diary", "shopping", "analysis"]),
    title: z.string().trim().min(1).max(200),
    checkpoint: foodAssistantCheckpointSchema,
  })
  .strict();
export const checkpointFoodAssistantTaskSchema = z
  .object({
    removal_source_quote: text.optional(),
    operation_id: uuid,
    expected_version: z.number().int().positive(),
    status: z.enum(["draft", "running", "awaiting_input", "failed"]),
    checkpoint: foodAssistantCheckpointSchema,
  })
  .strict();
export const changeFoodAssistantTaskSchema = z
  .object({
    operation_id: uuid,
    expected_version: z.number().int().positive(),
  })
  .strict();
export const rememberFoodAssistantPreferenceSchema = z
  .object({
    key: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[a-z][a-z0-9_]*$/),
    value: text,
    source_quote: text,
    expected_version: z.number().int().nonnegative().default(0),
  })
  .strict();
export const editFoodAssistantPreferenceSchema =
  rememberFoodAssistantPreferenceSchema.omit({ source_quote: true });
export type FoodAssistantCheckpoint = z.infer<
  typeof foodAssistantCheckpointSchema
>;
export type CreateFoodAssistantTask = z.infer<
  typeof createFoodAssistantTaskSchema
>;
export type CheckpointFoodAssistantTask = z.infer<
  typeof checkpointFoodAssistantTaskSchema
>;
export type RememberFoodAssistantPreference = z.infer<
  typeof rememberFoodAssistantPreferenceSchema
>;
