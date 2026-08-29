import { z } from "zod";

import { MEAL_SERVING_UNIT_DEFAULT } from "../../constants/mealServing.ts";

/**
 * Contract for logging a reviewed food-photo estimate to the diary.
 *
 * One endpoint serves both modes so the client's toggle changes only the
 * payload, not the call site:
 *
 *  - `grouped`  — an ad-hoc `food_entry_meals` parent plus one component
 *                 `food_entries` row per ingredient. The diary shows one
 *                 collapsible row that expands to the ingredients, and the
 *                 existing logged-meal edit/delete flows work on it unchanged.
 *  - `combined` — the original behaviour: a single food, a single entry, no
 *                 parent meal.
 *
 * Everything is created inside one transaction, so a failure part-way through
 * leaves no orphaned foods behind.
 */

const dayStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "entry_date must be YYYY-MM-DD");

/**
 * A food to create for an ingredient that matched nothing in the user's
 * database.
 *
 * Nutrition here is ALWAYS per 100 g (`serving_size: 100`, `serving_unit: 'g'`),
 * never per-portion — the amount actually eaten travels on the item's
 * `quantity`. Callers must go through `toPer100g()` in
 * `shared/src/utils/foodPhotoEstimateMath.ts`, whose branded return type makes
 * passing per-portion numbers here a compile error.
 *
 * Note what is deliberately ABSENT: `is_quick_food`, `provider_type` and
 * `shared_with_public`. The server owns all three, so a client cannot publish a
 * food to other users or hide one from the matcher.
 *
 * Ingredients are created as normal, reusable foods. They are not quick foods:
 * a hidden food is invisible to `findFoodMatchCandidates`, so the next photo of
 * the same dish could never reuse it.
 */
export const foodPhotoLogNewFoodSchema = z
  .object({
    name: z.string().min(1).max(200),
    brand: z.string().max(200).nullable().default(null),
    serving_size: z.number().positive(),
    serving_unit: z.string().min(1),

    calories: z.number().nonnegative(),
    protein: z.number().nonnegative(),
    carbs: z.number().nonnegative(),
    fat: z.number().nonnegative(),

    dietary_fiber: z.number().nonnegative().optional(),
    sugars: z.number().nonnegative().optional(),
    saturated_fat: z.number().nonnegative().optional(),
    trans_fat: z.number().nonnegative().optional(),
    cholesterol: z.number().nonnegative().optional(),
    sodium: z.number().nonnegative().optional(),
    potassium: z.number().nonnegative().optional(),
    calcium: z.number().nonnegative().optional(),
    iron: z.number().nonnegative().optional(),
    vitamin_a: z.number().nonnegative().optional(),
    vitamin_c: z.number().nonnegative().optional(),

    /**
     * The model's confidence in this ingredient, stored on the created variant.
     * Both clients already surface `source: 'ai_estimate'` + `ai_confidence` as
     * an "AI estimate" marker, so passing it makes a guessed food visibly
     * distinguishable from a barcode-scanned or provider-sourced one.
     */
    ai_confidence: z.enum(["high", "medium", "low"]).optional(),
  })
  .strict();

/**
 * One row of the reviewed estimate.
 *
 * `existing` — the user accepted a database match, so reuse that food and
 *              variant and log the amount against it. Nothing new is created.
 * `new`      — no match (or the user rejected it), so create a hidden quick
 *              food from the reviewed numbers.
 */
export const foodPhotoLogItemSchema = z.discriminatedUnion("source", [
  z
    .object({
      source: z.literal("existing"),
      food_id: z.string().uuid(),
      variant_id: z.string().uuid(),
      quantity: z.number().positive(),
      unit: z.string().min(1),
    })
    .strict(),
  z
    .object({
      source: z.literal("new"),
      food: foodPhotoLogNewFoodSchema,
      quantity: z.number().positive(),
      unit: z.string().min(1),
    })
    .strict(),
]);

/** Matches the server-side cap; also bounds the transaction length. */
export const FOOD_PHOTO_LOG_MAX_ITEMS = 25;

export const foodPhotoLogRequestSchema = z
  .object({
    mode: z.enum(["grouped", "combined"]),
    /**
     * Log on behalf of another user (family/friends diary sharing). Omitted
     * for the normal self-logging case. The server still checks `diary`
     * permission for the pair — this only names the target.
     */
    user_id: z.string().uuid().optional(),
    entry_date: dayStringSchema,
    entry_time: z.string().nullable().default(null),
    meal_type: z.string().min(1),
    meal_type_id: z.string().uuid().nullable().default(null),
    name: z.string().min(1).max(200),
    description: z.string().max(1000).nullable().default(null),
    items: z.array(foodPhotoLogItemSchema).min(1).max(FOOD_PHOTO_LOG_MAX_ITEMS),

    /**
     * How the dish divides into portions, and how much of it goes in the diary.
     *
     * `items` always describes the WHOLE dish. The server logs
     * `consumed_quantity / (serving_size * total_servings)` of it — the same
     * uniform multiplier a template-backed meal uses — and keeps the full dish
     * in the reusable meal, so re-logging one serving from the Meals library
     * later reproduces the portion that was logged here.
     *
     * For `serving_unit: 'serving'` the client states `total_servings` directly
     * and `serving_size` is 1. For any other unit the client asks for a total
     * amount and a serving size, and sends the derived yield.
     *
     * Note these describe the dish, not its nutrition: the amount decides how
     * the ingredients' fixed nutrition is divided, so stating that a soup makes
     * 2000 ml adds portions, never calories.
     *
     * All four default to the previous behaviour — the plate as shown is one
     * serving and all of it was eaten. Grouped mode only; in combined mode the
     * single food's own serving size already expresses the portion.
     */
    serving_size: z.number().positive().default(1),
    serving_unit: z.string().min(1).default(MEAL_SERVING_UNIT_DEFAULT),
    total_servings: z.number().positive().default(1),
    consumed_quantity: z.number().positive().default(1),

    /**
     * Also save this plate as a reusable meal template, so it can be re-logged
     * from the Meals library without another photo. Grouped mode only — there
     * are no components to combine in combined mode.
     */
    save_as_meal: z
      .object({
        name: z.string().min(1).max(200),
      })
      .optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.save_as_meal && data.mode !== "grouped") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "save_as_meal requires grouped mode.",
        path: ["save_as_meal"],
      });
    }

    // `serving_unit: 'serving'` implies `serving_size: 1` — one serving is
    // tautologically one serving, and `mealService.normalizeServingFields`
    // rewrites it to 1 on create regardless. Accepting any other size here
    // lets the route fold it into `quantityScale` against a template that
    // does not record it, so re-logging one serving returns the wrong amount.
    if (
      data.serving_unit === MEAL_SERVING_UNIT_DEFAULT &&
      data.serving_size !== 1
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "serving_size must be 1 when serving_unit is 'serving'; state the yield in total_servings.",
        path: ["serving_size"],
      });
    }

    if (data.mode !== "combined") return;

    if (
      data.total_servings !== 1 ||
      data.consumed_quantity !== 1 ||
      data.serving_size !== 1 ||
      data.serving_unit !== MEAL_SERVING_UNIT_DEFAULT
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "combined mode cannot split servings; scale the single food's serving size instead.",
        path: ["total_servings"],
      });
    }

    // Combined mode is "one food for the whole plate". More than one item, or
    // an item pointing at an existing food, means the client built a grouped
    // payload and mislabelled it — reject rather than silently log the first
    // row and drop the rest.
    if (data.items.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "combined mode requires exactly one item.",
        path: ["items"],
      });
      return;
    }
    const only = data.items[0];
    if (!only || only.source !== "new") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "combined mode requires a new-food item.",
        path: ["items", 0, "source"],
      });
    }
  });

export const foodPhotoLogResponseSchema = z.object({
  mode: z.enum(["grouped", "combined"]),
  /** Null in combined mode — there is no parent meal. */
  food_entry_meal_id: z.string().uuid().nullable(),
  /**
   * The reusable template, when `save_as_meal` was requested. Null when it was
   * not asked for, or when the diary rows saved but the template did not —
   * the log is the source of truth and is never rolled back for it.
   */
  meal_template_id: z.string().uuid().nullable().default(null),
  food_entry_ids: z.array(z.string().uuid()),
  /** Only the foods this request created; matched foods are not listed. */
  created_food_ids: z.array(z.string().uuid()),
});

export const foodPhotoLogErrorCodeSchema = z.enum([
  "INVALID_REQUEST",
  "FOOD_NOT_FOUND",
  "VARIANT_NOT_FOUND",
  "INVALID_MEAL_TYPE",
  "FORBIDDEN",
]);

export const foodPhotoLogErrorResponseSchema = z.object({
  error: z.string(),
  code: foodPhotoLogErrorCodeSchema,
});

export type FoodPhotoLogNewFood = z.infer<typeof foodPhotoLogNewFoodSchema>;
export type FoodPhotoLogItem = z.infer<typeof foodPhotoLogItemSchema>;
export type FoodPhotoLogRequest = z.infer<typeof foodPhotoLogRequestSchema>;
export type FoodPhotoLogResponse = z.infer<typeof foodPhotoLogResponseSchema>;
export type FoodPhotoLogErrorCode = z.infer<typeof foodPhotoLogErrorCodeSchema>;
export type FoodPhotoLogErrorResponse = z.infer<
  typeof foodPhotoLogErrorResponseSchema
>;
